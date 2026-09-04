import { sql } from "drizzle-orm";

import { createCachedProbe } from "@/server/health";
import { container } from "@/server/initialization";

/**
 * Liveness and readiness in one answer, for an orchestrator or an uptime check.
 *
 * Shallow: that this handler ran at all. The process is up, the server is
 * listening and the app's module graph loaded — which is exactly what a 200
 * already means, so it needs no separate check.
 *
 * Deep: one `select 1`. Every screen in the app reads the database, so an
 * instance that cannot reach Postgres has nothing to serve, and a health check
 * that stayed green through that would keep traffic pointed at it.
 *
 * The deep check is cached and single-flighted (see src/server/health.ts), so
 * this route takes no auth without becoming a way to aim a request loop at the
 * database.
 *
 * The body says only what a caller needs to route traffic. No version, no
 * uptime, no error text: this answers to anyone, and the detail belongs in the
 * log line the failure writes.
 *
 * One thing this check is NOT: insulated from the app it reports on. Every route
 * entry shares one container and therefore one pg pool, so the probe competes
 * for the same ten connections as every RPC call — verified by driving three
 * routes in sequence and watching the probe run on the backend the RPC route had
 * opened. Under saturation this can report a degraded database when the database
 * is fine and the pool is merely full. A private connection would separate the
 * two, at the cost of a connection held open for a check that runs twice a
 * second at most; sharing is the right trade until an incident says otherwise,
 * but read a 503 here as "this instance cannot reach Postgres", not as "Postgres
 * is down".
 */
export const dynamic = "force-dynamic";

const DATABASE_PROBE_TTL_MS = 2_000;
/**
 * Shorter than the window, and `createCachedProbe` refuses the pair if it is
 * not: an answer that arrives at the moment it expires is never cached, so a
 * database that has stopped answering is re-probed by every caller. A healthy
 * `select 1` comes back in about a millisecond, so this is only ever reached by
 * one that is not going to.
 */
const DATABASE_PROBE_TIMEOUT_MS = 750;

const databaseProbe = createCachedProbe({
  ttlMs: DATABASE_PROBE_TTL_MS,
  timeoutMs: DATABASE_PROBE_TIMEOUT_MS,
  check: () => container.cradle.database.execute(sql`select 1`),
  // At most one line per window, so a database that stays down does not also
  // fill the log.
  onFailure: (error) =>
    container.cradle.logger.error({ err: error }, "Health check failed"),
});

export async function GET() {
  const database = await databaseProbe();

  return Response.json(
    {
      status: database.healthy ? "ok" : "degraded",
      checks: {
        database: { status: database.healthy ? "ok" : "error" },
      },
    },
    {
      status: database.healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
