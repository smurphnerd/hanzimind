import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "pino";
import type { Drizzle } from "@/server/database/database";
import type { TranslatorService } from "@/server/services/TranslatorService";
import type { TTSService } from "@/server/services/TTSService";
import { schema } from "@/server/database/schema";
import { VocabTypeEnum } from "@/lib/enums";

interface SeedCradle {
  logger: Logger;
  database: Drizzle;
  translator: TranslatorService;
  tts: TTSService;
}

interface DictionaryEntry {
  character: string;
  definition?: string;
  pinyin?: string[];
  decomposition?: string;
  etymology?: {
    type: string;
    hint: string;
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
  const graphicsLines = graphicsContent.split("\n").filter((line) => line.trim());

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
  let skippedCount = 0;
  let errorCount = 0;

  // Process each dictionary entry
  for (const line of dictionaryLines) {
    try {
      const entry = JSON.parse(line) as DictionaryEntry;

      // Skip if no definition (optional characters)
      if (!entry.definition) {
        skippedCount++;
        continue;
      }

      // Check if entry already exists in database
      const existingEntry = await cradle.database.query.vocabItems.findFirst({
        where: (vocabItems, { eq }) => eq(vocabItems.vocabItem, entry.character),
      });

      if (existingEntry) {
        skippedCount++;
        continue;
      }

      const graphics = graphicsMap.get(entry.character);

      // Get pinyin - try dictionary first, fall back to translator
      let pinyin = "";
      if (entry.pinyin && entry.pinyin.length > 0) {
        pinyin = entry.pinyin[0]; // Use first pinyin if multiple
      } else {
        pinyin = cradle.translator.getPinyin(entry.character);
      }

      // Generate audio URL if we have pinyin
      let audioUrl = "";
      if (pinyin) {
        try {
          audioUrl = await cradle.tts.getVocabAudio(entry.character);
        } catch (error) {
          logger.warn(
            {
              error,
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              character: entry.character,
            },
            "Failed to generate audio, continuing without it",
          );
        }
      }

      // Insert vocab item into database
      await cradle.database
        .insert(schema.vocabItems)
        .values({
          vocabItem: entry.character,
          translation: entry.definition,
          pinyin: pinyin || "",
          vocabType: VocabTypeEnum.enum.character,
          audioUrl: audioUrl || "",
          decomposition: entry.decomposition || null,
          etymologyHint: entry.etymology?.hint || null,
          etymologyType: entry.etymology?.type
            ? (entry.etymology.type as any)
            : null,
          radical: entry.radical || null,
          strokes: graphics?.strokes ? (graphics.strokes as any) : null,
          strokeMedians: graphics?.medians ? (graphics.medians as any) : null,
          strokeMatches: entry.matches ? (entry.matches as any) : null,
        });

      processedCount++;

      // Log progress every 500 entries
      if (processedCount % 500 === 0) {
        logger.info(
          `Progress: ${processedCount}/${dictionaryLines.length} entries processed`,
        );
      }
    } catch (error) {
      errorCount++;
      logger.error({ error, line }, "Failed to process dictionary entry");
    }
  }

  logger.info({
    processed: processedCount,
    skipped: skippedCount,
    errors: errorCount,
    total: dictionaryLines.length,
  }, "Dictionary seeding completed");
}
