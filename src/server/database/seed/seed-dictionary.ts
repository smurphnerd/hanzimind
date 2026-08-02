import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "pino";
import type { Drizzle } from "@/server/database/database";
import type { TranslatorService } from "@/server/services/TranslatorService";
import type { TTSService } from "@/server/services/TTSService";
import { schema } from "@/server/database/schema";
import {
  applyClassification,
  loadVocabClassification,
  suppressesAudio,
} from "@/server/database/seed/vocab-classification";
import {
  classifyScript,
  loadScriptClassification,
} from "@/server/database/seed/script-classification";
import { VocabTypeEnum, type EtymologyType } from "@/definitions/definitions";

interface SeedCradle {
  logger: Logger;
  database: Drizzle;
  translator: TranslatorService;
  tts: TTSService;
}

/**
 * How many entries to build (and TTS) concurrently before inserting.
 * Audio generation is ~325ms per character, so this is the main lever on
 * total runtime; keep it modest to stay friendly to the TTS endpoint.
 */
const SEED_BATCH_SIZE = 12;

interface DictionaryEntry {
  character: string;
  definition?: string;
  pinyin?: string[];
  decomposition?: string;
  etymology?: {
    type: string;
    hint: string;
    /** Only on `pictophonetic`, and either may be absent. */
    phonetic?: string;
    semantic?: string;
  };
  radical?: string;
  matches?: (number[] | null)[];
}

interface GraphicsEntry {
  character: string;
  strokes?: string[];
  medians?: number[][][];
}

export async function seedDictionary(cradle: SeedCradle): Promise<void> {
  const logger = cradle.logger.child({ module: "seed-dictionary" });
  logger.info("Starting dictionary seeding");

  // Read and parse dictionary.txt
  const dictionaryPath = join(
    process.cwd(),
    "src/server/database/seed/dictionary.txt",
  );
  const dictionaryContent = readFileSync(dictionaryPath, "utf-8");
  const dictionaryLines = dictionaryContent
    .split("\n")
    .filter((line) => line.trim());

  logger.info(`Found ${dictionaryLines.length} dictionary entries`);

  // Read and parse graphics.txt
  const graphicsPath = join(
    process.cwd(),
    "src/server/database/seed/graphics.txt",
  );
  const graphicsContent = readFileSync(graphicsPath, "utf-8");
  const graphicsLines = graphicsContent
    .split("\n")
    .filter((line) => line.trim());

  logger.info(`Found ${graphicsLines.length} graphics entries`);

  // Build a map of character -> graphics for quick lookup
  const graphicsMap = new Map<string, GraphicsEntry>();
  for (const line of graphicsLines) {
    try {
      const entry = JSON.parse(line) as GraphicsEntry;
      graphicsMap.set(entry.character, entry);
    } catch (error) {
      logger.error({ error, line }, "Failed to parse graphics line");
    }
  }

  let processedCount = 0;
  let errorCount = 0;
  let audioFailures = 0;

  // Load the existing characters once. Querying per entry meant ~9.5k
  // round trips, which dominated the run on a remote database.
  const existingRows = await cradle.database
    .select({ vocabItem: schema.vocabItems.vocabItem })
    .from(schema.vocabItems);
  const existing = new Set(existingRows.map((row) => row.vocabItem));

  const pending: DictionaryEntry[] = [];
  for (const line of dictionaryLines) {
    try {
      const entry = JSON.parse(line) as DictionaryEntry;
      if (!existing.has(entry.character)) pending.push(entry);
    } catch (error) {
      errorCount++;
      logger.error({ error, line }, "Failed to parse dictionary entry");
    }
  }

  const skippedCount = dictionaryLines.length - pending.length - errorCount;
  logger.info(
    { toInsert: pending.length, alreadyPresent: skippedCount },
    "Prepared dictionary entries",
  );

  // Bound radical forms and too-basic/unstudiable glyphs are classified up front
  // so a fresh seed lands in the same state the backfill produces — re-seeding
  // must not reintroduce a disabled glyph as a studiable character.
  const classification = loadVocabClassification();
  // Same reasoning for the script: derived from a reviewable file rather than the
  // column default, so a fresh seed and the backfill agree on all three values.
  const scriptClassification = loadScriptClassification();

  const buildRow = async (entry: DictionaryEntry) => {
    const graphics = graphicsMap.get(entry.character);
    const classified = classification.get(entry.character);

    // Prefer the dictionary's own reading, fall back to the translator.
    const rawPinyin =
      entry.pinyin && entry.pinyin.length > 0
        ? entry.pinyin[0]
        : cradle.translator.getPinyin(entry.character);

    // A meaning-only component is never pronounced in the app and a disabled
    // glyph is hidden everywhere, so skip the TTS round-trip for them entirely —
    // ~150 fewer network calls per seed, and it stops a fresh seed reintroducing
    // audio the app hides. A phonetic component is pronounced, so it goes ahead.
    let audioUrl = "";
    if (rawPinyin && !suppressesAudio(classified)) {
      try {
        audioUrl = await cradle.tts.getVocabAudio(entry.character);
      } catch (error) {
        audioFailures++;
        logger.warn(
          { error, character: entry.character },
          "Failed to generate audio, continuing without it",
        );
      }
    }

    const stored = applyClassification(classified, {
      pinyin: rawPinyin || "",
      audioUrl,
      translation: entry.definition ?? null,
    });

    return {
      vocabItem: entry.character,
      translation: stored.translation,
      pinyin: stored.pinyin,
      vocabType:
        classified?.decision === "component"
          ? VocabTypeEnum.enum.component
          : VocabTypeEnum.enum.character,
      phonetic: stored.phonetic,
      script: classifyScript(entry.character, scriptClassification),
      disabled: classified?.decision === "disabled",
      audioUrl: stored.audioUrl,
      decomposition: entry.decomposition || null,
      etymologyHint: entry.etymology?.hint || null,
      etymologyType: entry.etymology?.type
        ? (entry.etymology.type as EtymologyType)
        : null,
      etymologyPhonetic: entry.etymology?.phonetic || null,
      etymologySemantic: entry.etymology?.semantic || null,
      radical: entry.radical || null,
      strokes: graphics?.strokes ?? null,
      strokeMedians: (graphics?.medians as [number, number][][] | null) ?? null,
      strokeMatches: entry.matches ?? null,
    };
  };

  // Audio generation is a network call per character and dominates the run,
  // so build rows in parallel batches and insert each batch in one statement.
  // onConflictDoNothing keeps the whole thing safely re-runnable.
  for (let i = 0; i < pending.length; i += SEED_BATCH_SIZE) {
    const batch = pending.slice(i, i + SEED_BATCH_SIZE);

    const rows = await Promise.all(
      batch.map(async (entry) => {
        try {
          return await buildRow(entry);
        } catch (error) {
          errorCount++;
          logger.error(
            { error, character: entry.character },
            "Failed to build dictionary entry",
          );
          return null;
        }
      }),
    );

    const insertable = rows.filter((row) => row !== null);
    if (insertable.length > 0) {
      await cradle.database
        .insert(schema.vocabItems)
        .values(insertable)
        .onConflictDoNothing();
      processedCount += insertable.length;
    }

    logger.info(
      `Progress: ${Math.min(i + SEED_BATCH_SIZE, pending.length)}/${pending.length} entries`,
    );
  }

  logger.info(
    {
      processed: processedCount,
      skipped: skippedCount,
      errors: errorCount,
      audioFailures,
      total: dictionaryLines.length,
    },
    "Dictionary seeding completed",
  );
}
