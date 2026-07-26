/**
 * Creates the "HSK 1" deck from the official 150-word vocabulary list.
 *
 * Words missing from vocab_items (the multi-character ones — the dictionary
 * seed only covers single characters) are created with pinyin/definition from
 * the HSK list and audio from TTS.
 *
 * Constituents are added as deck items too, so the prerequisite gating has
 * something to gate on: each word's characters, then those characters'
 * decomposition components, recursively, stopping at radicals (radicals are
 * the atomic level and are never broken down further).
 *
 * Idempotent — safe to re-run.
 *
 * Run with:  doppler run --project hanzimind --config <cfg> -- \
 *              ./node_modules/.bin/tsx scripts/seed-hsk1-deck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pino } from "pino";
import { eq } from "drizzle-orm";

import { getDatabase } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import { S3StorageAdapter } from "@/server/services/S3StorageAdapter";
import { TTSService } from "@/server/services/TTSService";
import { GoogleTTSAPIProvider } from "@/server/services/tts/GoogleTTSAPIProvider";
import { envSchema } from "@/env-utils";

const DECK_ID = "deck-hsk1";
const DECK_NAME = "HSK 1";
const DECK_DESCRIPTION =
  "The official HSK 1 vocabulary — 150 words covering everyday Chinese, plus the characters and components they're built from.";

interface DictionaryEntry {
  character: string;
  definition?: string;
  pinyin?: string[];
  decomposition?: string;
  radical?: string;
}

const isIdc = (c: string) => {
  const cp = c.codePointAt(0) ?? 0;
  return cp >= 0x2ff0 && cp <= 0x2fff;
};

async function main() {
  // Validate only what this script uses. Parsing the whole app schema would
  // demand unrelated runtime settings (BASE_URL, auth, email) that a
  // maintenance task has no business requiring.
  const env = envSchema
    .pick({ DATABASE_URL: true, S3_OPTIONS: true })
    .parse(process.env);
  const logger = pino({ level: "warn" });
  const database = getDatabase(logger, env.DATABASE_URL);
  const storage = new S3StorageAdapter(env.S3_OPTIONS);
  const tts = new TTSService(
    { logger, storage, ttsProvider: new GoogleTTSAPIProvider(logger) },
    {
      publicUrl:
        env.S3_OPTIONS.cloudfrontDistributionUrl ??
        `${env.S3_OPTIONS.endpoint}/${env.S3_OPTIONS.bucketName}`,
    },
  );

  // ---- Source data -----------------------------------------------------
  const seedDir = join(process.cwd(), "src/server/database/seed");
  const dict = new Map<string, DictionaryEntry>();
  const radicals = new Set<string>();
  for (const line of readFileSync(
    join(seedDir, "dictionary.txt"),
    "utf-8",
  ).split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as DictionaryEntry;
      if (!dict.has(entry.character)) dict.set(entry.character, entry);
      if (entry.radical) radicals.add(entry.radical);
    } catch {
      // Malformed line — the dictionary seed reports these already.
    }
  }

  const words = readFileSync(
    join(process.cwd(), "scripts/data/hsk1-vocabulary.txt"),
    "utf-8",
  )
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [word, pinyin, translation] = line.split("|");
      return { word: word!, pinyin: pinyin!, translation: translation! };
    });

  console.log(`HSK 1 list: ${words.length} words`);

  // ---- Work out the constituents ---------------------------------------
  const componentsOf = (item: string): string[] => {
    if (item.length > 1) return Array.from(item); // a word breaks into characters
    return Array.from(dict.get(item)?.decomposition ?? "").filter(
      (c) => c !== item && c !== "？" && c !== "?" && !isIdc(c),
    );
  };

  // Only include something teachable: a definition to quiz and a real reading.
  const isTeachable = (char: string) => {
    const entry = dict.get(char);
    return !!entry?.definition && !!entry?.pinyin?.length;
  };

  const base = new Set(words.map((w) => w.word));
  const constituents = new Set<string>();
  const queue = [...base];

  while (queue.length > 0) {
    const item = queue.shift() as string;
    for (const part of componentsOf(item)) {
      if (base.has(part) || constituents.has(part)) continue;
      if (!isTeachable(part)) continue;
      constituents.add(part);
      // Radicals are atomic — everything else keeps decomposing.
      if (!radicals.has(part)) queue.push(part);
    }
  }

  console.log(`Constituents pulled in: ${constituents.size}`);

  // ---- Make sure every item exists in vocab_items -----------------------
  const existingRows = await database
    .select({
      id: schema.vocabItems.id,
      vocabItem: schema.vocabItems.vocabItem,
    })
    .from(schema.vocabItems);
  const idByItem = new Map(existingRows.map((r) => [r.vocabItem, r.id]));

  const missingWords = words.filter((w) => !idByItem.has(w.word));
  console.log(`Words to create (not in dictionary): ${missingWords.length}`);

  for (const { word, pinyin, translation } of missingWords) {
    let audioUrl = "";
    try {
      audioUrl = await tts.getVocabAudio(word);
    } catch {
      console.warn(`  audio failed for ${word}`);
    }

    const [row] = await database
      .insert(schema.vocabItems)
      .values({
        vocabItem: word,
        translation,
        pinyin,
        vocabType: word.length > 1 ? "compound" : "character",
        audioUrl,
        decomposition: null,
        etymologyHint: null,
        etymologyType: null,
        radical: null,
        strokes: null,
        strokeMedians: null,
        strokeMatches: null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.vocabItems.id });

    if (row) idByItem.set(word, row.id);
  }

  // Anything still unresolved can't be added to the deck.
  const resolve = (item: string) => idByItem.get(item);
  const missingConstituents = [...constituents].filter((c) => !resolve(c));
  if (missingConstituents.length > 0) {
    console.warn(
      `  ${missingConstituents.length} constituents not in the database, skipping: ${missingConstituents.slice(0, 10).join(" ")}`,
    );
  }

  // ---- Deck ------------------------------------------------------------
  const [owner] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .limit(1);
  if (!owner) throw new Error("No users exist — cannot assign a deck owner");

  await database
    .insert(schema.decks)
    .values({
      id: DECK_ID,
      deckName: DECK_NAME,
      description: DECK_DESCRIPTION,
      createdById: owner.id,
    })
    .onConflictDoNothing();

  const deckRows = [
    ...words
      .map((w) => resolve(w.word))
      .filter((id): id is string => !!id)
      .map((vocabItemId) => ({
        deckId: DECK_ID,
        vocabItemId,
        isConstituent: false,
      })),
    ...[...constituents]
      .map((c) => resolve(c))
      .filter((id): id is string => !!id)
      .map((vocabItemId) => ({
        deckId: DECK_ID,
        vocabItemId,
        isConstituent: true,
      })),
  ];

  // Rebuild membership so re-runs reflect the current list exactly.
  await database
    .delete(schema.deckVocabItems)
    .where(eq(schema.deckVocabItems.deckId, DECK_ID));
  await database
    .insert(schema.deckVocabItems)
    .values(deckRows)
    .onConflictDoNothing();

  console.log(
    `Deck "${DECK_NAME}": ${deckRows.filter((r) => !r.isConstituent).length} words + ${deckRows.filter((r) => r.isConstituent).length} components = ${deckRows.length} items`,
  );

  console.log(
    "\nDone. Users can add it from Decks — that creates their progress rows.",
  );
  process.exit(0);
}

await main();
