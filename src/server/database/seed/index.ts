import { seedDictionary } from "./seed-dictionary";
import { seedTestUsers } from "./seed-test-users";
import { TranslatorService } from "../../services/TranslatorService";
import { TTSService } from "../../services/TTSService";
import { S3StorageAdapter } from "../../services/S3StorageAdapter";
import { bootstrap } from "../../../../scripts/bootstrap";

async function main() {
  const { env, logger, database } = bootstrap();

  try {
    logger.info("Starting database seeding");

    // Manually create dependencies for seeding
    logger.info("Creating S3 storage adapter...");
    const storage = new S3StorageAdapter(env.S3_OPTIONS);

    logger.info("Creating translator service...");
    const translator = new TranslatorService(
      { logger },
      { deeplApiKey: env.DEEPL_API_KEY },
    );

    logger.info("Creating TTS service...");
    const { GoogleTTSAPIProvider } =
      await import("@/server/services/tts/GoogleTTSAPIProvider");
    const ttsProvider = new GoogleTTSAPIProvider(logger);
    const tts = new TTSService(
      { logger, storage, ttsProvider },
      {
        publicUrl:
          env.S3_OPTIONS.cloudfrontDistributionUrl ??
          `${env.S3_OPTIONS.endpoint}/${env.S3_OPTIONS.bucketName}`,
      },
    );

    // Create a minimal cradle for seeding
    const seedCradle = {
      logger,
      database,
      storage,
      translator,
      tts,
    };

    logger.info("Starting dictionary seeding...");
    await seedDictionary(seedCradle);
    const testUsers = await seedTestUsers(database, {
      SEED_TEST_USER: process.env.SEED_TEST_USER,
      NODE_ENV: env.NODE_ENV,
    });
    logger.info({ testUsers }, "Seeded test users");
    logger.info("Database seeding completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error(
      {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Database seeding failed",
    );
    console.error(error);
    process.exit(1);
  }
}

await main();
