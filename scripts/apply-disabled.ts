/**
 * Hides the glyphs vocab-classification.tsv marks `disabled` on a live database.
 *
 * backfill-classification.ts deliberately never touches `disabled`, because
 * hiding a glyph a learner has studied or a deck contains means purging that
 * data. This is the separate, narrow step for the case where nothing points at
 * the glyph yet: it refuses — and names the references — if any deck link,
 * progress row, memory aid or suggestion still points at one, rather than
 * deleting anything. It never re-enables a glyph.
 *
 * Run with:  doppler run --project hanzimind --config <cfg> -- \
 *              ./node_modules/.bin/tsx scripts/apply-disabled.ts --dry-run
 */
import { and, eq, inArray } from "drizzle-orm";

import { bootstrap } from "./bootstrap";
import { schema } from "@/server/database/schema";
import { loadVocabClassification } from "@/server/database/seed/vocab-classification";

const dryRun = process.argv.includes("--dry-run");
const { logger, database } = bootstrap();

const glyphs = [...loadVocabClassification()]
  .filter(([, entry]) => entry.decision === "disabled")
  .map(([glyph]) => glyph);

const targets = await database
  .select({ id: schema.vocabItems.id, vocabItem: schema.vocabItems.vocabItem })
  .from(schema.vocabItems)
  .where(
    and(
      inArray(schema.vocabItems.vocabItem, glyphs),
      eq(schema.vocabItems.disabled, false),
    ),
  );
const ids = targets.map((row) => row.id);

const referenced =
  ids.length === 0
    ? []
    : (
        await Promise.all([
          database
            .selectDistinct({ id: schema.deckVocabItems.vocabItemId })
            .from(schema.deckVocabItems)
            .where(inArray(schema.deckVocabItems.vocabItemId, ids)),
          database
            .selectDistinct({ id: schema.userVocabItems.vocabItemId })
            .from(schema.userVocabItems)
            .where(inArray(schema.userVocabItems.vocabItemId, ids)),
          database
            .selectDistinct({ id: schema.userStudyProgress.vocabItemId })
            .from(schema.userStudyProgress)
            .where(inArray(schema.userStudyProgress.vocabItemId, ids)),
          database
            .selectDistinct({ id: schema.memoryAids.vocabItemId })
            .from(schema.memoryAids)
            .where(inArray(schema.memoryAids.vocabItemId, ids)),
          database
            .selectDistinct({ id: schema.suggestions.vocabItemId })
            .from(schema.suggestions)
            .where(inArray(schema.suggestions.vocabItemId, ids)),
        ])
      ).flat();

const referencedGlyphs = [
  ...new Set(
    referenced.map(
      (ref) => targets.find((row) => row.id === ref.id)?.vocabItem,
    ),
  ),
];

logger.info(
  {
    disabledInFile: glyphs.length,
    toDisable: targets.map((row) => row.vocabItem),
    referenced: referencedGlyphs,
    dryRun,
  },
  "apply-disabled plan",
);

if (referencedGlyphs.length > 0) {
  logger.error(
    { referenced: referencedGlyphs },
    "Refusing: data still points at these glyphs. Resolve it by hand first.",
  );
  process.exit(1);
}

if (!dryRun && ids.length > 0) {
  await database
    .update(schema.vocabItems)
    .set({ disabled: true })
    .where(inArray(schema.vocabItems.id, ids));
  logger.info({ disabled: ids.length }, "glyphs disabled");
}
process.exit(0);
