/**
 * ONE-TIME MIGRATION — ALREADY RUN. Prefer the admin UI at /admin/vocab.
 *
 * Applies src/server/database/seed/vocab-classification.tsv to an existing
 * database: marks bound radical forms as `component`, hides `disabled` glyphs,
 * and purges the deck links and study progress that pointed at them.
 *
 * The database is now the source of truth for classification, edited through the
 * admin UI. This script still assumes the TSV is, so re-running it OVERWRITES
 * every admin decision — a glyph an admin marked a component is reverted unless
 * it also happens to be in the file, and one they removed is put back. That is
 * why it now refuses to run without --force.
 *
 * The TSV itself is not dead: seed-dictionary.ts still reads it to classify rows
 * on a fresh database. That is safe, because the seed only inserts rows that do
 * not exist yet (onConflictDoNothing) and so never touches an admin's work.
 *
 * Run with:  doppler run --project hanzimind --config <cfg> -- \
 *              ./node_modules/.bin/tsx scripts/classify-vocab.ts --dry-run
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pino } from "pino";
import { and, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";

import { getDatabase } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import { loadVocabClassification } from "@/server/database/seed/vocab-classification";
import { envSchema } from "@/env-utils";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

interface DictionaryEntry {
  character: string;
  definition?: string;
  pinyin?: string[];
}

async function main() {
  const logger = pino({ transport: { target: "pino-pretty" } });

  if (!dryRun && !force) {
    logger.error(
      "This migration has already run, and the admin UI is now the source of " +
        "truth for classification. Re-running would overwrite every admin " +
        "decision. Use --dry-run to inspect, or --force if you genuinely mean " +
        "to reset the whole classification back to the TSV.",
    );
    process.exit(1);
  }

  const env = envSchema.pick({ DATABASE_URL: true }).parse(process.env);
  const database = getDatabase(logger, env.DATABASE_URL);

  const classification = loadVocabClassification();
  const components = [...classification]
    .filter(([, entry]) => entry.decision === "component")
    .map(([glyph]) => glyph);
  const disabled = [...classification]
    .filter(([, entry]) => entry.decision === "disabled")
    .map(([glyph]) => glyph);

  logger.info(
    { components: components.length, disabled: disabled.length, dryRun },
    "Loaded classification",
  );

  if (dryRun) {
    const affected = await database
      .select({
        vocabItem: schema.vocabItems.vocabItem,
        vocabType: schema.vocabItems.vocabType,
        disabled: schema.vocabItems.disabled,
      })
      .from(schema.vocabItems)
      .where(inArray(schema.vocabItems.vocabItem, [...components, ...disabled]));

    const toComponent = affected.filter(
      (row) => classification.get(row.vocabItem)?.decision === "component",
    );
    const toDisable = affected.filter(
      (row) => classification.get(row.vocabItem)?.decision === "disabled",
    );
    const missing =
      components.length +
      disabled.length -
      affected.length;

    logger.info(
      {
        wouldBecomeComponent: toComponent.length,
        alreadyComponent: toComponent.filter((r) => r.vocabType === "component")
          .length,
        wouldBeDisabled: toDisable.length,
        alreadyDisabled: toDisable.filter((r) => r.disabled).length,
        notPresentInDatabase: missing,
      },
      "Dry run — no changes written",
    );
    return;
  }

  // Restore anything the TSV no longer lists. Without this, deleting a line from
  // the file would silently leave the old classification in place.
  const restoredType = await database
    .update(schema.vocabItems)
    .set({ vocabType: "character" })
    .where(
      and(
        eq(schema.vocabItems.vocabType, "component"),
        components.length > 0
          ? notInArray(schema.vocabItems.vocabItem, components)
          : sql`true`,
      ),
    )
    .returning({ vocabItem: schema.vocabItems.vocabItem });

  const restoredEnabled = await database
    .update(schema.vocabItems)
    .set({ disabled: false })
    .where(
      and(
        eq(schema.vocabItems.disabled, true),
        disabled.length > 0
          ? notInArray(schema.vocabItems.vocabItem, disabled)
          : sql`true`,
      ),
    )
    .returning({ vocabItem: schema.vocabItems.vocabItem });

  // Demoting a glyph to `component` blanked its pinyin, audio and gloss, so
  // promoting it back has to put them there again — read them from the same
  // dictionary the seed uses, since the database no longer holds them.
  if (restoredType.length > 0) {
    const dictionary = new Map(
      readFileSync(
        join(process.cwd(), "src/server/database/seed/dictionary.txt"),
        "utf-8",
      )
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as DictionaryEntry)
        .map((entry) => [entry.character, entry]),
    );

    for (const { vocabItem } of restoredType) {
      const entry = dictionary.get(vocabItem);
      if (!entry) {
        logger.warn(
          { vocabItem },
          "Restored to character but absent from dictionary.txt — pinyin left blank",
        );
        continue;
      }
      await database
        .update(schema.vocabItems)
        .set({
          pinyin: entry.pinyin?.[0] ?? "",
          translation: entry.definition ?? null,
        })
        .where(eq(schema.vocabItems.vocabItem, vocabItem));
    }

    logger.warn(
      { count: restoredType.length },
      "Restored pinyin/gloss from the dictionary — re-run the audio generation script to restore audio",
    );
  }

  if (restoredType.length > 0 || restoredEnabled.length > 0) {
    logger.info(
      {
        backToCharacter: restoredType.map((r) => r.vocabItem),
        reEnabled: restoredEnabled.map((r) => r.vocabItem),
      },
      "Restored items no longer listed in the classification",
    );
  }

  if (components.length > 0) {
    const updated = await database
      .update(schema.vocabItems)
      .set({ vocabType: "component" })
      .where(inArray(schema.vocabItems.vocabItem, components))
      .returning({ vocabItem: schema.vocabItems.vocabItem });
    logger.info({ count: updated.length }, "Marked components");

    // A component carries no reading and no audio — the dictionary's values are
    // borrowed from its parent (亻 gets 人's "rén"), which is worse than nothing.
    // Same transform the seed applies, so the two states match exactly.
    const cleared = await database
      .update(schema.vocabItems)
      .set({ pinyin: "", audioUrl: "" })
      .where(
        and(
          eq(schema.vocabItems.vocabType, "component"),
          or(
            ne(schema.vocabItems.pinyin, ""),
            ne(schema.vocabItems.audioUrl, ""),
          ),
        ),
      )
      .returning({ vocabItem: schema.vocabItems.vocabItem });
    logger.info({ count: cleared.length }, "Cleared component pinyin and audio");

    // Components are quizzed on meaning alone, so one with no gloss could never
    // be served. Where the dictionary has none, the TSV supplies it.
    for (const [glyph, entry] of classification) {
      if (entry.decision !== "component" || !entry.gloss) continue;
      await database
        .update(schema.vocabItems)
        .set({ translation: entry.gloss })
        .where(eq(schema.vocabItems.vocabItem, glyph));
    }

    // Levels for study types a component can no longer be served for would
    // otherwise sit in the scheduler forever. Reset them and their due dates.
    const reset = await database
      .update(schema.userVocabItems)
      .set({
        readingLevel: 0,
        listeningLevel: 0,
        writingLevel: 0,
        readingNextAt: null,
        listeningNextAt: null,
        writingNextAt: null,
      })
      .from(schema.vocabItems)
      .where(
        and(
          eq(schema.userVocabItems.vocabItemId, schema.vocabItems.id),
          eq(schema.vocabItems.vocabType, "component"),
        ),
      )
      .returning({ userId: schema.userVocabItems.userId });
    if (reset.length > 0) {
      logger.info(
        { count: reset.length },
        "Reset non-understanding progress on components",
      );
    }
  }

  if (disabled.length > 0) {
    const hidden = await database
      .update(schema.vocabItems)
      .set({ disabled: true })
      .where(inArray(schema.vocabItems.vocabItem, disabled))
      .returning({ id: schema.vocabItems.id, vocabItem: schema.vocabItems.vocabItem });
    logger.info({ count: hidden.length }, "Disabled items");

    // A disabled item is meant to behave as if deleted, so the rows that would
    // still surface it — deck membership and study progress — go too.
    if (hidden.length > 0) {
      const ids = hidden.map((row) => row.id);

      const removedFromDecks = await database
        .delete(schema.deckVocabItems)
        .where(inArray(schema.deckVocabItems.vocabItemId, ids))
        .returning({ deckId: schema.deckVocabItems.deckId });

      const removedProgress = await database
        .delete(schema.userVocabItems)
        .where(inArray(schema.userVocabItems.vocabItemId, ids))
        .returning({ userId: schema.userVocabItems.userId });

      logger.warn(
        {
          deckLinksDeleted: removedFromDecks.length,
          progressRowsDeleted: removedProgress.length,
        },
        "Purged deck links and study progress for disabled items",
      );
    }
  }

  logger.info("Classification applied");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
