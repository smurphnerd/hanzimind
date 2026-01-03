import { pino } from "pino";
import pinoPretty from "pino-pretty";
import { updateRadicalFlags } from "./update-radicals";
import { getDatabase } from "../database";
import { envSchema } from "@/env-utils";

async function main() {
  // Use environment variables directly
  console.log("Loading environment variables...");
  const env = envSchema.parse({
    ...process.env,
    NODE_ENV: process.env.NODE_ENV,
  });

  console.log("Creating logger...");
  // Create logger
  const logger = pino(
    {
      level: env.LOG_LEVEL ?? "info",
    },
    env.NODE_ENV === "development" ? pinoPretty() : undefined,
  ).child({
    GIT_SHA: env.GIT_SHA,
  });
  console.log("Logger created");

  try {
    logger.info("Starting radical flags update");

    // Create database connection
    logger.info("Creating database connection...");
    const database = getDatabase(logger, env.DATABASE_URL);

    // Create a minimal cradle for updating
    const updateCradle = {
      logger,
      database,
    };

    logger.info("Updating radical flags...");
    await updateRadicalFlags(updateCradle);
    logger.info("Radical flags update completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error(
      {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Radical flags update failed",
    );
    console.error(error);
    process.exit(1);
  }
}

await main();
