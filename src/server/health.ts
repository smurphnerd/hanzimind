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
 *
 * The subtle case is a database that has stopped answering rather than refused.
 * The timeout releases the CALLER; it cannot cancel the query, which goes on
 * holding a backend. So the in-flight check, not the caller's wait, is what is
 * single-flighted: while a `select 1` has not come back, no second one is
 * opened, however long that takes and however often the endpoint is polled.
 * Bounding the caller's wait without bounding the query is what turns a hung
 * Postgres into one abandoned backend per poll.
 */

export type ProbeResult = {
  healthy: boolean;
  /** When the answer was learned, which is what makes it stale N ms later. */
  checkedAt: number;
};

export type CachedProbeOptions = {
  check: () => Promise<unknown>;
  /** How stale an answer may be. Bounds the query rate at 1 per window. */
  ttlMs: number;
  /** How long a caller waits. Must be shorter than the window; see below. */
  timeoutMs: number;
  onFailure?: (error: unknown) => void;
  now?: () => number;
};

export function createCachedProbe(
  options: CachedProbeOptions,
): () => Promise<ProbeResult> {
  // A timeout at or past the window makes every timed-out answer stale the
  // moment it is stored, so a hung database is re-probed by every caller and
  // each of them waits the full timeout for the same non-answer. Both values
  // are constants at the call site, so this is a wiring mistake, not a runtime
  // condition — and the shipped pair was exactly the one combination the tests
  // did not cover, which is why it is checked here rather than only in a test.
  if (options.timeoutMs >= options.ttlMs) {
    throw new Error(
      `health probe timeout (${options.timeoutMs}ms) must be shorter than its cache window (${options.ttlMs}ms)`,
    );
  }

  const now = options.now ?? Date.now;

  let cached: ProbeResult | undefined;
  let running: Promise<boolean> | undefined;

  const record = (healthy: boolean): ProbeResult => {
    cached = { healthy, checkedAt: now() };
    return cached;
  };

  const check = (): Promise<boolean> => {
    running ??= options
      .check()
      .then(() => true)
      .catch((error: unknown) => {
        options.onFailure?.(error);
        return false;
      })
      // Recording here as well as on the timeout path is what makes a recovery
      // visible: a check that comes back after its caller gave up still
      // refreshes the answer for whoever asks next.
      .then((healthy) => record(healthy))
      .then((result) => result.healthy)
      .finally(() => {
        running = undefined;
      });
    return running;
  };

  return async () => {
    const fresh = cached;
    if (fresh && now() - fresh.checkedAt < options.ttlMs) return fresh;

    const settled = await raceTimeout(check(), options.timeoutMs);

    if (settled === TIMED_OUT) {
      options.onFailure?.(
        new Error(`health check did not answer in ${options.timeoutMs}ms`),
      );
      // Cached like any other failure. A database that just failed to answer is
      // the last thing to ask again on the next request, and the check that is
      // still running will refresh this as soon as it comes back.
      return record(false);
    }

    return cached ?? record(settled);
  };
}

const TIMED_OUT = Symbol("timed out");

function raceTimeout(
  work: Promise<boolean>,
  timeoutMs: number,
): Promise<boolean | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}
