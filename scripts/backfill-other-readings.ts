/**
 * Sets vocab_items.other_readings from src/server/database/seed/other-readings.tsv.
 *
 * The file is generated (scripts/build-other-readings.mjs) and nothing in the
 * app edits the column, so the file is authoritative: every row whose value
 * differs is set to the file's, and a glyph the file omits gets `{}`. Idempotent.
 *
 * Run with:  doppler run --project hanzimind --config <cfg> -- \
 *              ./node_modules/.bin/tsx scripts/backfill-other-readings.ts --dry-run
 */
import { eq } from "drizzle-orm";

import { bootstrap } from "./bootstrap";
import { schema } from "@/server/database/schema";
import { loadOtherReadings } from "@/server/database/seed/other-readings";

const dryRun = process.argv.includes("--dry-run");
const { logger, database } = bootstrap();
const readings = loadOtherReadings();

const rows = await database
  .select({
    id: schema.vocabItems.id,
    vocabItem: schema.vocabItems.vocabItem,
    otherReadings: schema.vocabItems.otherReadings,
  })
  .from(schema.vocabItems);

const writes = rows
  .map((row) => ({ ...row, target: readings.get(row.vocabItem) ?? [] }))
  .filter((row) => row.target.join(",") !== row.otherReadings.join(","));

logger.info(
  {
    inFile: readings.size,
    toWrite: writes.length,
    sample: writes.slice(0, 5).map((row) => `${row.vocabItem}:${row.target}`),
    dryRun,
  },
  "other readings backfill plan",
);

if (!dryRun && writes.length > 0) {
  await database.transaction(async (tx) => {
    for (const row of writes) {
      await tx
        .update(schema.vocabItems)
        .set({ otherReadings: row.target })
        .where(eq(schema.vocabItems.id, row.id));
    }
  });
  logger.info({ written: writes.length }, "other readings applied");
}
process.exit(0);
