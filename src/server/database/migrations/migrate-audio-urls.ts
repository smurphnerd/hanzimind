import { pino } from "pino";
import pinoPretty from "pino-pretty";
import { like, sql } from "drizzle-orm";
import { getDatabase } from "../database";
import { schema } from "../schema";
import { envSchema } from "@/env-utils";

async function main() {
  console.log("Loading environment variables...");
  const env = envSchema.parse({
    ...process.env,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!env.S3_OPTIONS.cloudfrontDistributionUrl) {
    console.error(
      "Error: cloudfrontDistributionUrl is not configured in S3_OPTIONS",
    );
    console.error(
      "Please add it to your environment: S3_OPTIONS={...,'cloudfrontDistributionUrl':'https://your-distribution.cloudfront.net'}",
    );
    process.exit(1);
  }

  const logger = pino(
    {
      level: env.LOG_LEVEL ?? "info",
    },
    env.NODE_ENV === "development" ? pinoPretty() : undefined,
  );

  try {
    logger.info("Starting audio URL migration");

    const database = getDatabase(logger, env.DATABASE_URL);

    // Build the old S3 URL pattern to find
    const oldUrlBase = `${env.S3_OPTIONS.endpoint}/${env.S3_OPTIONS.bucketName}`;
    const newUrlBase = env.S3_OPTIONS.cloudfrontDistributionUrl;

    logger.info({ oldUrlBase, newUrlBase }, "Migrating audio URLs");

    // Find all vocab items with the old S3 URL pattern
    const itemsToUpdate = await database.query.vocabItems.findMany({
      where: like(schema.vocabItems.audioUrl, `${oldUrlBase}%`),
      columns: {
        id: true,
        vocabItem: true,
        audioUrl: true,
      },
    });

    logger.info(
      { count: itemsToUpdate.length },
      "Found vocab items to migrate",
    );

    if (itemsToUpdate.length === 0) {
      logger.info("No items need migration");
      process.exit(0);
    }

    // Update each item
    let updatedCount = 0;
    let errorCount = 0;

    for (const item of itemsToUpdate) {
      try {
        const newAudioUrl = item.audioUrl.replace(oldUrlBase, newUrlBase);

        await database
          .update(schema.vocabItems)
          .set({ audioUrl: newAudioUrl })
          .where(sql`${schema.vocabItems.id} = ${item.id}`);

        updatedCount++;

        if (updatedCount % 500 === 0) {
          logger.info(
            { progress: `${updatedCount}/${itemsToUpdate.length}` },
            "Migration progress",
          );
        }
      } catch (error) {
        errorCount++;
        logger.error(
          { error, vocabItem: item.vocabItem },
          "Failed to update item",
        );
      }
    }

    logger.info(
      {
        updated: updatedCount,
        errors: errorCount,
        total: itemsToUpdate.length,
      },
      "Audio URL migration completed",
    );

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    logger.error(
      {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Migration failed",
    );
    console.error(error);
    process.exit(1);
  }
}

await main();
