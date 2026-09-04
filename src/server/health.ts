/**
 * A health check with two failure modes to avoid, pulling in opposite
 * directions.
 *
 * Answering "healthy" while the database is unreachable is worse than having no
 * endpoint: the thing an orchestrator does with a green check is keep sending
 * traffic to an instance that can serve nothing. So the check has to be deep
 * enough to touch Postgres.
 *
 * Touching Postgres on every call is worse still: `/api/health` takes no auth,
 * by design, so anything an anonymous caller can trigger in a loop is an
 * amplifier — and it points at the one resource that is already struggling when
 * the check starts failing.
 *
 * Both are avoided by decoupling the answer's freshness from the request rate.
 * The probe is cached for a short window and single-flighted, so a thousand
 * callers a second cost one query per window, and a caller can be at most one
 * window behind the truth.
 */

export type ProbeResult = {
  healthy: boolean;
  /** When the underlying check last ran, not when this caller asked. */
  checkedAt: number;
};

export type CachedProbeOptions = {
  check: () => Promise<unknown>;
  /** How stale an answer may be. Bounds the query rate at 1 per window. */
  ttlMs: number;
  /** A hung database must not hold the response open; the check itself runs on. */
  timeoutMs: number;
  onFailure?: (error: unknown) => void;
  now?: () => number;
};

export function createCachedProbe(
  options: CachedProbeOptions,
): () => Promise<ProbeResult> {
  const now = options.now ?? Date.now;

  let cached: ProbeResult | undefined;
  let inFlight: Promise<ProbeResult> | undefined;

  const run = async (): Promise<ProbeResult> => {
    const startedAt = now();
    let healthy = true;
    try {
      await withTimeout(options.check(), options.timeoutMs);
    } catch (error) {
      healthy = false;
      options.onFailure?.(error);
    }
    // Failures are cached for the same window as successes. Hammering a
    // database that just failed a check is the last thing this should do, and a
    // recovery is visible one window later either way.
    cached = { healthy, checkedAt: startedAt };
    return cached;
  };

  return () => {
    const fresh = cached;
    if (fresh && now() - fresh.checkedAt < options.ttlMs) {
      return Promise.resolve(fresh);
    }

    inFlight ??= run().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };
}

function withTimeout(work: Promise<unknown>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`health check timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  // Race attaches a handler to `work`, so a rejection arriving after the
  // timeout is already handled and never surfaces as an unhandled rejection.
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}
