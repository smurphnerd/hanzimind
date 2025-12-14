import { type Logger as DrizzleLogger } from "drizzle-orm/logger";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type { Logger } from "pino";

import { schema } from "./schema";

export const getDatabase = (logger: Logger, client: string | Pool) =>
  drizzle(client, {
    schema,
    casing: "snake_case",
    logger: new PinoDrizzleLogger(logger),
  });

class PinoDrizzleLogger implements DrizzleLogger {
  constructor(private logger: Logger) {}

  logQuery(query: string) {
    this.logger.trace({ query }, "Executed query");
  }
}

export type Drizzle = ReturnType<typeof getDatabase>;
export type Transaction = Parameters<Parameters<Drizzle["transaction"]>[0]>[0];
