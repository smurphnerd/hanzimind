/**
 * The third way sign-up told a stranger whether an address had an account, and
 * the one neither `auth-timing.ts` nor `AUTH_FIELD_LIMITS` could reach: a
 * status code.
 *
 * better-auth's `/sign-up/email` runs `findUserByEmail` and then `createUser`,
 * and the two are not atomic. Fire two sign-ups at one address at the same
 * moment and:
 *
 * - a FREE address has both pass the lookup, both attempt the insert, and the
 *   unique email index reject one, which better-auth turns into a 422
 *   `FAILED_TO_CREATE_USER`;
 * - a TAKEN address takes the synthetic branch every time, never inserts, and
 *   so cannot 422.
 *
 * One-sided and exact. A 422 anywhere in a burst proves the address was free,
 * with no statistics and no clock — twelve of twelve free bursts detected,
 * zero of eight taken. Levelling equalises the clock and the bounds equalise
 * the body size; neither has anything to say about a status.
 *
 * ## Why replay rather than rewrite
 *
 * A unique violation on that insert means something created the account between
 * this request's lookup and its insert, so the address IS taken by the time we
 * answer. Postgres makes that certain rather than likely: an insert conflicting
 * with an *uncommitted* index entry blocks until the other transaction settles,
 * so an error means the winner committed.
 *
 * The honest answer is therefore the one the taken path gives, and the only way
 * to be sure it is byte-identical is to let the taken path produce it. Replay
 * the sign-up: the second attempt finds the row, returns the synthetic user,
 * and sends the email that path sends. Rewriting the response here instead
 * would put a second copy of that shape in the codebase, free to drift out of
 * step with the first — which is exactly how the original `role` leak happened.
 *
 * The replay must not go back through the HTTP handler. better-auth's rate
 * limiter lives in the router's `onRequest`, so a replay through it would spend
 * a second slot, and a burst against a free address would start collecting 429s
 * that a burst against a taken one never sees: the same oracle wearing a
 * different status code. `auth.api.signUpEmail` dispatches the endpoint without
 * the router, and a lane confirms both kinds of burst leave the counter at
 * exactly the same number.
 */

export const FAILED_TO_CREATE_USER = "FAILED_TO_CREATE_USER";

type Replay = (body: Record<string, unknown>) => Promise<Response>;

type Logger = {
  info: (data: object, message: string) => void;
  error: (data: object, message: string) => void;
};

/**
 * The body as an object, for either encoding better-auth accepts.
 *
 * Form encoding is handled rather than skipped because a convergence that only
 * covered JSON would leave the whole channel open to anyone who changed one
 * header.
 */
export const parseAuthBody = (
  body: string,
  contentType: string | null,
): Record<string, unknown> | null => {
  try {
    if (contentType?.includes("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(body));
    }
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

/**
 * Turn a sign-up that lost the insert race into the answer the taken path
 * gives. Anything else is returned untouched.
 *
 * A replay that also fails means the insert did not fail because of a
 * duplicate, so the original 422 stands. That case is not attacker-triggerable
 * — nobody can make an insert fail on demand — and hiding a real database
 * failure behind a cheerful 200 would cost a learner their account with no sign
 * that anything went wrong, which is worse than the narrow leak of admitting
 * it.
 */
export const convergeLostSignUpRace = async ({
  response,
  isSignUp,
  body,
  contentType,
  replay,
  logger,
}: {
  response: Response;
  isSignUp: boolean;
  body: string;
  contentType: string | null;
  replay: Replay;
  logger: Logger;
}): Promise<Response> => {
  if (!isSignUp || response.status !== 422) return response;
  if (!(await response.clone().text()).includes(FAILED_TO_CREATE_USER)) {
    return response;
  }
  const parsed = parseAuthBody(body, contentType);
  if (!parsed) return response;

  const settled = await replay(parsed);
  if (settled.status !== 200) {
    logger.error(
      { status: settled.status },
      "Sign-up: the insert failed and replaying it did not settle, so the address is genuinely unusable",
    );
    return response;
  }
  logger.info(
    {},
    "Sign-up: lost a race to create the address, answered as the taken path does",
  );
  return settled;
};
