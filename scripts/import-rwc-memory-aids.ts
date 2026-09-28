/**
 * Brings a live database's memory aids in line with
 * src/server/database/seed/rwc-memory-aids.jsonl — our own wording of the notes
 * in *Reading and Writing Chinese*, credited on every aid.
 *
 * Idempotent: it updates each glyph's RWC aid in place (a learner's pin
 * survives), inserts the missing ones, removes RWC aids the file has dropped,
 * and stars an RWC aid only where the glyph's default is unset or private. It
 * never replaces a public default and never touches anyone else's aid beyond
 * clearing a private default that could not be served anyway. The rules live
 * in planRwcImport; see seed-rwc-memory-aids.ts.
 *
 * Run with:  doppler run --project hanzimind --config <cfg> -- \
 *              ./node_modules/.bin/tsx scripts/import-rwc-memory-aids.ts --dry-run
 * Push the schema first (`pnpm db:push`): it writes memory_aids.source.
 */
import { bootstrap } from "./bootstrap";
import { importRwcMemoryAids } from "@/server/database/seed/seed-rwc-memory-aids";

const dryRun = process.argv.includes("--dry-run");

const { logger, database } = bootstrap();
try {
  await importRwcMemoryAids(database, logger, { dryRun });
  process.exit(0);
} catch (error) {
  logger.error({ err: error }, "RWC memory aid import failed");
  process.exit(1);
}
