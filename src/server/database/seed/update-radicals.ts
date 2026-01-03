import type { Logger } from "pino";
import type { Drizzle } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import { ALL_RADICALS } from "@/server/services/AllRadicals";
import { eq } from "drizzle-orm";

interface UpdateCradle {
  logger: Logger;
  database: Drizzle;
}

export async function updateRadicalFlags(cradle: UpdateCradle): Promise<void> {
  const logger = cradle.logger.child({ module: "update-radicals" });
  logger.info("Starting radical flags update");

  let updatedCount = 0;
  let errorCount = 0;

  // Get all vocab items
  const allVocabItems = await cradle.database.query.vocabItems.findMany({
    columns: {
      id: true,
      vocabItem: true,
      isRadical: true,
    },
  });

  logger.info(`Found ${allVocabItems.length} vocab items to check`);

  // Update each vocab item if needed
  for (const item of allVocabItems) {
    try {
      const shouldBeRadical = ALL_RADICALS.has(item.vocabItem);

      // Only update if the flag is different from what it should be
      if (item.isRadical !== shouldBeRadical) {
        await cradle.database
          .update(schema.vocabItems)
          .set({ isRadical: shouldBeRadical })
          .where(eq(schema.vocabItems.id, item.id));

        updatedCount++;

        if (updatedCount % 100 === 0) {
          logger.info(`Progress: ${updatedCount} items updated`);
        }
      }
    } catch (error) {
      errorCount++;
      logger.error({ error, vocabItem: item.vocabItem }, "Failed to update vocab item");
    }
  }

  logger.info(
    {
      updated: updatedCount,
      errors: errorCount,
      total: allVocabItems.length,
    },
    "Radical flags update completed",
  );
}
