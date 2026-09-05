/**
 * Response-time levelling for the auth routes that answer a question about one
 * email address without a session.
 *
 * Blinding a body is only half a fix. Measured on a verification lane against
 * `origin/hygiene` b5f5da5, n=50 interleaved pairs per route:
 *
 * | route                     | free address | taken address | gap   |
 * | ------------------------- | ------------ | ------------- | ----- |
 * | `/sign-up/email`          | 131 ms       | 107 ms        | 22.4% |
 * | `/request-password-reset` | 16 ms        | 26 ms         | 62.5% |
 * | `/send-verification-email`| 520 ms       | 521 ms        | 0.2%  |
 * | `/sign-in/email`          | 110 ms       | 110 ms        | 0.0%  |
 *
 * Sign-up leaks because a free address is inserted, linked and mailed while a
 * taken one is only looked up. Password reset leaks worse in relative terms on
 * a body better-auth already blinds: 10 ms on a 16 ms baseline is a clean
 * signal, and no amount of care in the body closes it. Both are enough to
 * enumerate a user base with a stopwatch.
 *
 * `/send-verification-email` is flat because better-auth holds it to a 500 ms
 * floor of its own when there is no session. That is the technique; this module
 * is the same technique applied at the HTTP boundary, where it covers the whole
 * request rather than one branch inside one handler.
 *
 * The levelling is a backstop, not the fix. `auth.tsx` makes the two sign-up
 * paths do the same work — one password hash and one email send each — so the
 * true costs are already close, and a quantum only has to absorb what is left.
 * A floor over paths whose real costs diverge would be a promise the first slow
 * SMTP round trip breaks.
 */

/** Where `src/app/api/auth/[...all]/route.ts` mounts better-auth. */
export const AUTH_BASE_PATH = "/api/auth";

/**
 * The routes that take an email address with no session, and so answer — in a
 * body, a status, or a duration — "does this address have an account".
 *
 * `/sign-in/email` is deliberately absent. better-auth already hashes the
 * supplied password on the no-such-user branch so both answers pay for one
 * scrypt, the two 401s are byte-identical, and the measurement above puts the
 * medians 0 ms apart. Levelling it would buy nothing and would put three
 * quarters of a second on the one auth route a learner uses more than once.
 */
export const LEVELLED_AUTH_ROUTES = [
  "/sign-up/email",
  "/request-password-reset",
  "/send-verification-email",
] as const;

/**
 * The bucket every levelled route answers in.
 *
 * It has to clear the slowest of them with room to spare, or the overrun is
 * itself the signal. The slowest measured is `/send-verification-email` at 533
 * ms p95, which already carries better-auth's own 500 ms floor; the rest sit
 * under 150 ms locally and will grow by whatever a real SMTP round trip costs
 * in production, where these lanes talk to Mailpit on loopback. 750 ms clears
 * the measured worst case by about 200 ms and leaves the others most of a
 * second of headroom.
 *
 * Nothing here is a hot path: an account is created once, a password is
 * forgotten rarely, and a verification email is resent rarely. Each of the
 * three submits behind a pending button.
 */
export const RESPONSE_QUANTUM_MS = 750;

/** Whether a request path is one of the routes levelled above. */
export const isLevelledAuthRoute = (pathname: string): boolean => {
  if (!pathname.startsWith(AUTH_BASE_PATH)) return false;
  const route = pathname.slice(AUTH_BASE_PATH.length);
  return (LEVELLED_AUTH_ROUTES as readonly string[]).includes(route);
};

/**
 * How much longer to hold a response that has taken `elapsedMs`, so that it
 * leaves at a multiple of the quantum.
 *
 * Rounding up to the next bucket rather than padding to a fixed floor is the
 * difference between a request that overruns telling an attacker its exact cost
 * and telling them only which bucket it fell in. A run that fits the first
 * bucket — which every measured path does, by a wide margin — is
 * indistinguishable from every other run that fits it.
 */
export const padToQuantumMs = (
  elapsedMs: number,
  quantumMs: number = RESPONSE_QUANTUM_MS,
): number => {
  const buckets = Math.max(1, Math.ceil(elapsedMs / quantumMs));
  return buckets * quantumMs - elapsedMs;
};

/**
 * Hold a levelled route's response until its bucket boundary. Any other path
 * returns immediately, so this is safe to call on every auth request.
 */
export const levelResponseTime = async (
  pathname: string,
  elapsedMs: number,
): Promise<void> => {
  if (!isLevelledAuthRoute(pathname)) return;
  const wait = padToQuantumMs(elapsedMs);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
};
