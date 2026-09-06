import { pino } from "pino";
import pinoPretty from "pino-pretty";

import { envSchema } from "@/env-utils";
import { getDatabase } from "@/server/database/database";

export function bootstrap(options: { level?: string } = {}) {
  const env = envSchema.parse({
    ...process.env,
    NODE_ENV: process.env.NODE_ENV,
  });
  const logger = pino(
    { level: options.level ?? env.LOG_LEVEL ?? "info" },
    env.NODE_ENV === "development" ? pinoPretty() : undefined,
  ).child({ GIT_SHA: env.GIT_SHA });
  const database = getDatabase(logger, env.DATABASE_URL);
  return { env, logger, database };
}
