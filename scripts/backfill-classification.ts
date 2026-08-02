/**
 * Brings a live database up to date with the two curated classification files:
 *
 *   1. vocab-classification.tsv  — which glyphs are bound `component` forms
 *   2. script-classification.tsv — which script each glyph belongs to
 *
 * Unlike classify-vocab.ts this is ADDITIVE and idempotent, which is what makes
 * it safe to run against a database the admin UI has been editing:
 *
 *   - a glyph the file calls a component is promoted from `character`
 *   - a component is NEVER demoted back to `character`, so a decision an admin
 *     made in the UI but nobody has written into the file yet survives
 *   - `disabled` is not touched at all. Hiding a glyph purges the deck links and
 *     study progress pointing at it, which is destructive and a separate job
 *   - a reading is only ever added, never wiped. A phonetic component missing
 *     its reading gets it back from the dictionary; a stale reading on any other
 *     component is left alone, because `phonetic` — not the presence of a
 *     pinyin — is what decides whether it is ever served
 *
 * Two things it will overwrite, because both are derived rather than judged and
 * the files are genuinely authoritative for them: `script`, from Unihan, and
 * `phonetic`, from the scoring in build-vocab-classification.mjs. Clearing
 * `phonetic` cannot lose data — the reading stays in the column, just unserved.
 *
 * Run with:  doppler run --project hanzimind --config <cfg> -- \
 *              ./node_modules/.bin/tsx scripts/backfill-classification.ts --dry-run
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pino } from "pino";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { getDatabase } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import { loadVocabClassification } from "@/server/database/seed/vocab-classification";
import {
  classifyScript,
  loadScriptClassification,
} from "@/server/database/seed/script-classification";
import { ScriptEnum, type Script } from "@/definitions/definitions";

const dryRun = process.argv.includes("--dry-run");

/** Postgres caps a statement at 65535 bound parameters; stay well clear. */
const ID_BATCH = 2000;

/** glyph -> first dictionary reading, the same source the seed pulls from. */
const loadDictionary = () =>
  new Map<string, string>(
    readFileSync(
      join(process.cwd(), "src/server/database/seed/dictionary.txt"),
      "utf-8",
    )
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as { character: string; pinyin?: string[] })
      .map((entry) => [entry.character, entry.pinyin?.[0] ?? ""] as const),
  );

async function main() {
  const logger = pino({ transport: { target: "pino-pretty" } });
  const env = { DATABASE_URL: process.env["DATABASE_URL"] };
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const database = getDatabase(logger, env.DATABASE_URL);

  const vocabClassification = loadVocabClassification();
  const scriptClassification = loadScriptClassification();
  const componentGlyphs = [...vocabClassification]
    .filter(([, entry]) => entry.decision === "component")
    .map(([glyph]) => glyph);

  const rows = await database
    .select({
      id: schema.vocabItems.id,
      vocabItem: schema.vocabItems.vocabItem,
      vocabType: schema.vocabItems.vocabType,
      translation: schema.vocabItems.translation,
      pinyin: schema.vocabItems.pinyin,
      phonetic: schema.vocabItems.phonetic,
      script: schema.vocabItems.script,
    })
    .from(schema.vocabItems);

  logger.info(
    {
      rows: rows.length,
      componentsInFile: componentGlyphs.length,
      scriptExceptionsInFile: scriptClassification.size,
      dryRun,
    },
    "Loaded classification files and current rows",
  );

  // --- 1. component promotions ------------------------------------------------
  const promote = rows.filter(
    (row) =>
      row.vocabType === "character" &&
      vocabClassification.get(row.vocabItem)?.decision === "component",
  );

  // Every component is quizzed on meaning, so one with no gloss can never be
  // served. The file carries a gloss for exactly those the dictionary leaves
  // blank; apply it to any component missing one, promoted now or already there.
  const reglossed = rows
    .filter((row) => {
      const entry = vocabClassification.get(row.vocabItem);
      if (entry?.decision !== "component" || !entry.gloss) return false;
      return !row.translation?.trim();
    })
    .map((row) => ({ ...row, gloss: vocabClassification.get(row.vocabItem)!.gloss }));

  // Authoritative, in both directions. Production still holds a borrowed reading
  // on 97 components from before the component work — 阝 has 邑's "yì" — and
  // canStudy would serve every one of them if this flag were left to drift.
  const reflagged = rows.filter((row) => {
    const entry = vocabClassification.get(row.vocabItem);
    const wanted = entry?.decision === "component" && entry.phonetic;
    return wanted !== row.phonetic;
  });

  // A phonetic component is served for reading, so a blank pinyin — left by the
  // original classification run, which stripped every component's — makes it
  // unstudiable on the one type that motivates keeping it. Restore from the same
  // dictionary the seed reads. Audio is regenerate-audio.ts's job.
  const dictionary = loadDictionary();
  const reread = rows
    .filter((row) => {
      const entry = vocabClassification.get(row.vocabItem);
      return entry?.decision === "component" && entry.phonetic && !row.pinyin;
    })
    .map((row) => ({ ...row, reading: dictionary.get(row.vocabItem) ?? "" }))
    .filter((row) => {
      if (row.reading) return true;
      logger.warn(
        { glyph: row.vocabItem },
        "Phonetic component has no dictionary reading — left blank",
      );
      return false;
    });

  // --- 2. script backfill -----------------------------------------------------
  const rescripted = new Map<Script, string[]>(
    ScriptEnum.options.map((script) => [script, []]),
  );
  for (const row of rows) {
    const script = classifyScript(row.vocabItem, scriptClassification);
    if (script !== row.script) rescripted.get(script)!.push(row.id);
  }

  logger.info(
    {
      promoteToComponent: promote.length,
      glossBackfill: reglossed.length,
      readingBackfill: reread.length,
      phoneticFlagChanges: reflagged.length,
      scriptChanges: Object.fromEntries(
        [...rescripted].map(([script, ids]) => [script, ids.length]),
      ),
    },
    dryRun ? "Dry run — no changes written" : "Applying",
  );

  if (promote.length > 0) {
    logger.info(
      { glyphs: promote.map((row) => row.vocabItem).join(" ") },
      "Glyphs becoming components",
    );
  }
  if (reglossed.length > 0) {
    logger.info(
      { glosses: reglossed.map((row) => `${row.vocabItem}=${row.gloss}`) },
      "Components receiving a gloss",
    );
  }
  if (reread.length > 0) {
    logger.info(
      { readings: reread.map((row) => `${row.vocabItem}=${row.reading}`) },
      "Phonetic components receiving a reading",
    );
  }
  if (reflagged.length > 0) {
    logger.info(
      {
        on: reflagged.filter((r) => !r.phonetic).map((r) => r.vocabItem),
        off: reflagged.filter((r) => r.phonetic).map((r) => r.vocabItem).length,
      },
      "Phonetic flag changes (off = stops being served for reading)",
    );
  }

  if (dryRun) return;

  // Promote in one statement per batch. Guarded on the current type so a
  // concurrent admin edit cannot be clobbered between the read and the write.
  let promoted = 0;
  for (let i = 0; i < promote.length; i += ID_BATCH) {
    const ids = promote.slice(i, i + ID_BATCH).map((row) => row.id);
    const updated = await database
      .update(schema.vocabItems)
      .set({ vocabType: "component" })
      .where(
        and(
          inArray(schema.vocabItems.id, ids),
          eq(schema.vocabItems.vocabType, "character"),
        ),
      )
      .returning({ id: schema.vocabItems.id });
    promoted += updated.length;
  }

  for (const row of reglossed) {
    await database
      .update(schema.vocabItems)
      .set({ translation: row.gloss })
      .where(eq(schema.vocabItems.id, row.id));
  }

  for (const row of reread) {
    await database
      .update(schema.vocabItems)
      .set({ pinyin: row.reading })
      .where(
        and(
          eq(schema.vocabItems.id, row.id),
          eq(schema.vocabItems.pinyin, ""),
        ),
      );
  }

  // Both directions in two statements, guarded on the current value so a
  // concurrent admin toggle between the read and the write is not clobbered.
  let flagged = 0;
  for (const wanted of [true, false]) {
    const ids = reflagged.filter((r) => r.phonetic !== wanted).map((r) => r.id);
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      const batch = ids.slice(i, i + ID_BATCH);
      const updated = await database
        .update(schema.vocabItems)
        .set({ phonetic: wanted })
        .where(
          and(
            inArray(schema.vocabItems.id, batch),
            eq(schema.vocabItems.phonetic, !wanted),
          ),
        )
        .returning({ id: schema.vocabItems.id });
      flagged += updated.length;
    }
  }

  let rescriptedCount = 0;
  for (const [script, ids] of rescripted) {
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      const batch = ids.slice(i, i + ID_BATCH);
      const updated = await database
        .update(schema.vocabItems)
        .set({ script })
        .where(
          and(
            inArray(schema.vocabItems.id, batch),
            ne(schema.vocabItems.script, script),
          ),
        )
        .returning({ id: schema.vocabItems.id });
      rescriptedCount += updated.length;
    }
  }

  const [{ counts }] = await database
    .select({
      counts: sql<
        Record<string, number>
      >`jsonb_object_agg(t.key, t.count)`.as("counts"),
    })
    .from(
      sql`(select ${schema.vocabItems.vocabType} || '/' || ${schema.vocabItems.script} as key,
                  count(*)::int as count
             from ${schema.vocabItems}
            group by 1) as t(key, count)`,
    );

  logger.info(
    {
      promoted,
      reglossed: reglossed.length,
      reread: reread.length,
      flagged,
      rescripted: rescriptedCount,
      counts,
    },
    "Backfill complete",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
