/**
 * Fills vocab_items.etymology_phonetic / etymology_semantic from dictionary.txt.
 *
 * These two columns landed after the dictionary had already been seeded, so
 * every existing row has them null. They record which part of a pictophonetic
 * character supplied its sound and which supplied its meaning — 沐 is 氵 (water)
 * plus 木 mù — which is what the dictionary view labels its decomposition with.
 *
 * The role belongs to the (character, part) pair, not to the part: 山 is the
 * meaning in 峰 and the sound in 仙 xiān. So it can only be stored per character,
 * and only makemeahanzi's own labels can supply it — there is nothing to derive.
 *
 * Safe to re-run: it only writes rows whose stored value differs, and it never
 * clears a value the file has no opinion on, so a hand correction in the admin
 * UI survives unless the file positively disagrees.
 *
 * Run with:  doppler run --project hanzimind --config <cfg> -- \
 *              ./node_modules/.bin/tsx scripts/backfill-etymology-roles.ts --dry-run
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pino } from "pino";
import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/server/database/database";
import { schema } from "@/server/database/schema";

const dryRun = process.argv.includes("--dry-run");

interface DictionaryEntry {
  character: string;
  etymology?: { type: string; phonetic?: string; semantic?: string };
}

async function main() {
  const logger = pino({ transport: { target: "pino-pretty" } });
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const database = getDatabase(logger, databaseUrl);

  const roles = new Map<
    string,
    { phonetic: string | null; semantic: string | null }
  >();
  for (const line of readFileSync(
    join(process.cwd(), "src/server/database/seed/dictionary.txt"),
    "utf-8",
  ).split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as DictionaryEntry;
    // Only a pictophonetic character has the two roles; anything else has no
    // sound part by construction, and writing nulls over it would be a no-op.
    if (entry.etymology?.type !== "pictophonetic") continue;
    roles.set(entry.character, {
      phonetic: entry.etymology.phonetic || null,
      semantic: entry.etymology.semantic || null,
    });
  }

  const rows = await database
    .select({
      id: schema.vocabItems.id,
      vocabItem: schema.vocabItems.vocabItem,
      phonetic: schema.vocabItems.etymologyPhonetic,
      semantic: schema.vocabItems.etymologySemantic,
    })
    .from(schema.vocabItems);

  const stale = rows.flatMap((row) => {
    const wanted = roles.get(row.vocabItem);
    if (!wanted) return [];
    const phonetic = wanted.phonetic ?? row.phonetic;
    const semantic = wanted.semantic ?? row.semantic;
    if (phonetic === row.phonetic && semantic === row.semantic) return [];
    return [{ id: row.id, vocabItem: row.vocabItem, phonetic, semantic }];
  });

  logger.info(
    {
      rows: rows.length,
      pictophoneticInFile: roles.size,
      toUpdate: stale.length,
      dryRun,
    },
    dryRun ? "Dry run — no changes written" : "Applying",
  );

  if (dryRun) {
    logger.info(
      {
        sample: stale
          .slice(0, 12)
          .map(
            (r) => `${r.vocabItem}=${r.semantic ?? "?"}+${r.phonetic ?? "?"}`,
          ),
      },
      "First few",
    );
    return;
  }

  // One statement per distinct (phonetic, semantic) pair would be no fewer
  // round trips than one per row, so group by pair and update in batches.
  const byPair = new Map<string, string[]>();
  for (const row of stale) {
    const key = `${row.phonetic ?? ""}\t${row.semantic ?? ""}`;
    byPair.set(key, [...(byPair.get(key) ?? []), row.id]);
  }

  let updated = 0;
  for (const [key, ids] of byPair) {
    const [phonetic, semantic] = key.split("\t");
    const written = await database
      .update(schema.vocabItems)
      .set({
        etymologyPhonetic: phonetic || null,
        etymologySemantic: semantic || null,
      })
      .where(
        ids.length === 1
          ? eq(schema.vocabItems.id, ids[0])
          : inArray(schema.vocabItems.id, ids),
      )
      .returning({ id: schema.vocabItems.id });
    updated += written.length;
  }

  logger.info(
    { updated, pairs: byPair.size },
    "Etymology role backfill complete",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
