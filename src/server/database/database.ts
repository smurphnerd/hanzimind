import { type Logger as DrizzleLogger } from "drizzle-orm/logger";
import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type Pool } from "pg";
import type { Logger } from "pino";

import { schema } from "./schema";

export const getDatabase = (logger: Logger, client: string | Pool) =>
  drizzle(typeof client === "string" ? createPool(logger, client) : client, {
    schema,
    casing: "snake_case",
    logger: new PinoDrizzleLogger(logger),
  });

/**
 * Build the connection pool explicitly rather than letting Drizzle create one
 * from the URL, so that:
 *
 *  - An 'error' listener is attached. A managed Postgres (Neon, RDS, …) closes
 *    idle connections, which emits 'error' on the pool — and an unhandled one
 *    takes the whole process down.
 *  - Idle sockets are dropped before the server does it for us.
 *  - SSL is negotiated for hosted databases, which require it. `sslmode` in the
 *    connection string still wins if it's set explicitly.
 */
function createPool(logger: Logger, connectionString: string): Pool {
  const isLocal = /@(localhost|127\.0\.0\.1|postgres)[:/]/.test(
    connectionString,
  );
  const hasExplicitSslMode = /[?&]sslmode=/.test(connectionString);

  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    ...(isLocal || hasExplicitSslMode ? {} : { ssl: { rejectUnauthorized: true } }),
  });

  pool.on("error", (error) => {
    // Never rethrow: a dropped idle connection is routine, and the pool will
    // simply open a new one on the next query.
    logger.warn({ error }, "Idle Postgres client error");
  });

  return pool;
}

class PinoDrizzleLogger implements DrizzleLogger {
  constructor(private logger: Logger) {}

  logQuery(query: string) {
    this.logger.trace({ query }, "Executed query");
  }
}

export type Drizzle = ReturnType<typeof getDatabase>;
export type Transaction = Parameters<Parameters<Drizzle["transaction"]>[0]>[0];
