import { type Logger as DrizzleLogger } from "drizzle-orm/logger";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Logger } from "pino";

import { schema } from "./schema";

export const getDatabase = (logger: Logger, databaseUrl: string) => {
  // Create a connection pool with proper configuration
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
  });

  // Log pool errors
  pool.on("error", (err) => {
    logger.error({ err }, "Unexpected database pool error");
  });

  return drizzle(pool, {
    schema,
    casing: "snake_case",
    logger: new PinoDrizzleLogger(logger),
  });
};

class PinoDrizzleLogger implements DrizzleLogger {
  constructor(private logger: Logger) {}

  logQuery(query: string) {
    this.logger.trace({ query }, "Executed query");
  }
}

export type Drizzle = ReturnType<typeof getDatabase>;
export type Transaction = Parameters<Parameters<Drizzle["transaction"]>[0]>[0];
