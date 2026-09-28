/**
 * Applies src/server/database/seed/vocab-overrides.tsv to a live database.
 *
 * For each overridden field it compares the row with what a fresh seed would
 * have stored WITHOUT the override (dictionary.txt through applyClassification,
 * or the HSK 1 list for words):
 *
 *   - already the override value  -> nothing to do
 *   - still the upstream value     -> write the override
 *   - anything else                -> an admin edited it; leave it and report it
 *
 * So it is idempotent and never clobbers a hand correction. Only the fields an
 * override sets are ever considered.
 *
 * Run with:  doppler run --project hanzimind --config <cfg> -- \
 *              ./node_modules/.bin/tsx scripts/backfill-overrides.ts --dry-run
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, inArray } from "drizzle-orm";

import { bootstrap } from "./bootstrap";
import { schema } from "@/server/database/schema";
import {
  applyClassification,
  loadVocabClassification,
} from "@/server/database/seed/vocab-classification";
import {
  applyOverride,
  loadVocabOverrides,
} from "@/server/database/seed/vocab-overrides";

const dryRun = process.argv.includes("--dry-run");

type Upstream = { pinyin: string; translation: string | null };

function loadUpstream(): Map<string, Upstream> {
  const classification = loadVocabClassification();
  const upstream = new Map<string, Upstream>();
  for (const line of readFileSync(
    join(process.cwd(), "src/server/database/seed/dictionary.txt"),
    "utf-8",
  ).split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as {
      character: string;
      definition?: string;
      pinyin?: string[];
    };
    const { pinyin, translation } = applyClassification(
      classification.get(entry.character),
      {
        pinyin: entry.pinyin?.[0] ?? "",
        audioUrl: "",
        translation: entry.definition ?? null,
      },
    );
    upstream.set(entry.character, { pinyin, translation });
  }
  for (const line of readFileSync(
    join(process.cwd(), "scripts/data/hsk1-vocabulary.txt"),
    "utf-8",
  ).split("\n")) {
    if (!line.trim()) continue;
    const [word, pinyin, translation] = line.split("|");
    if (word && !upstream.has(word)) {
      upstream.set(word, {
        pinyin: pinyin ?? "",
        translation: translation ?? null,
      });
    }
  }
  return upstream;
}

const { logger, database } = bootstrap();
const overrides = loadVocabOverrides();
const upstream = loadUpstream();

const rows = await database
  .select({
    id: schema.vocabItems.id,
    vocabItem: schema.vocabItems.vocabItem,
    pinyin: schema.vocabItems.pinyin,
    translation: schema.vocabItems.translation,
  })
  .from(schema.vocabItems)
  .where(inArray(schema.vocabItems.vocabItem, [...overrides.keys()]));

const writes: { id: string; vocabItem: string; set: Partial<Upstream> }[] = [];
const edited: { vocabItem: string; field: string; current: string | null }[] =
  [];
let alreadyApplied = 0;

for (const row of rows) {
  const override = overrides.get(row.vocabItem)!;
  const base = upstream.get(row.vocabItem) ?? {
    pinyin: row.pinyin,
    translation: row.translation,
  };
  const target = applyOverride(base, override);
  const set: Partial<Upstream> = {};
  for (const field of ["pinyin", "translation"] as const) {
    if (!override[field]) continue;
    if (row[field] === target[field]) alreadyApplied++;
    else if (row[field] === base[field])
      Object.assign(set, { [field]: target[field] });
    else edited.push({ vocabItem: row.vocabItem, field, current: row[field] });
  }
  if (Object.keys(set).length > 0) {
    writes.push({ id: row.id, vocabItem: row.vocabItem, set });
  }
}

const absent = [...overrides.keys()].filter(
  (glyph) => !rows.some((row) => row.vocabItem === glyph),
);

logger.info(
  {
    overrides: overrides.size,
    rowsFound: rows.length,
    toWrite: writes.length,
    fieldsAlreadyApplied: alreadyApplied,
    leftAloneBecauseEdited: edited,
    absentFromDatabase: absent,
    dryRun,
  },
  "vocab override backfill plan",
);

if (!dryRun && writes.length > 0) {
  await database.transaction(async (tx) => {
    for (const write of writes) {
      await tx
        .update(schema.vocabItems)
        .set(write.set)
        .where(eq(schema.vocabItems.id, write.id));
    }
  });
  logger.info({ written: writes.length }, "vocab overrides applied");
}
process.exit(0);
