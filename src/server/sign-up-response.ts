import { SignUpWireInput } from "@/definitions/definitions";

/**
 * What sign-up answers, and why it carries nothing.
 *
 * Six rounds of attack found six ways for this endpoint to say whether an
 * address already had an account, and every one of them came from the same
 * root: the response was ASSEMBLED DIFFERENTLY on the two paths. A free address
 * echoed the row the database returned; a taken one echoed a synthetic user
 * built from the request. Everything observable about those two answers — the
 * `role` field, the status code, the bytes of a round-tripped surrogate, the
 * millisecond `createdAt` was sampled at, the time each path took, the cost of a
 * burst — had to be equalised separately, and each fix closed one channel while
 * exposing or creating another.
 *
 * The two sibling endpoints never leaked through their bodies across all six
 * rounds, and they are exactly the two that already answer with a fixed shape:
 * `/request-password-reset` returns `{status, message}` and
 * `/send-verification-email` returns `{status}`. Neither has anything to differ.
 *
 * So sign-up now answers the same way. This object is a constant. It is built
 * from no row, no request field and no clock, it is emitted before any lookup
 * or insert happens, and it is byte-identical for every caller on every path.
 * The body channels close by construction rather than by equalisation: there is
 * no `role` to match, no `createdAt` to align, no surrogate to round-trip, and
 * no 422 to converge, because none of that reaches the caller.
 *
 * Nothing reads the old payload. `signup/page.client.tsx` discards it and takes
 * the address from what the learner typed, and no session is created here
 * because `requireEmailVerification` is on — both re-confirmed against the head.
 */
export const SIGN_UP_ACKNOWLEDGEMENT = {
  status: true,
  message: "If that address can be used, an email is on its way to it.",
} as const;

/**
 * The one thing sign-up still decides synchronously.
 *
 * Deferring the account work means a failure after the response cannot be
 * reported, so a rule the learner could have fixed would become a silent dead
 * end — a nine-character password answering 200 and no email ever arriving.
 * Everything checked here is a property of the submitted value alone, so it can
 * be answered inline without saying anything about the address: the same
 * refusal reaches a caller whether or not the account exists, and it is decided
 * before anything looks.
 *
 * The rules live in `definitions.ts` beside the ones the form uses, so a
 * learner with a working client never reaches this and a learner without one
 * still gets a usable error rather than silence.
 */
export const signUpRejection = (body: unknown): string | null => {
  const parsed = SignUpWireInput.safeParse(body);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "That sign-up could not be read.";
};

type DeferredLogger = {
  info: (data: object, message: string) => void;
  warn: (data: object, message: string) => void;
  error: (data: object, message: string) => void;
};

/**
 * Do the sign-up, through better-auth's ROUTER, after the caller has been
 * acknowledged.
 *
 * The router is not an implementation detail to be routed around, and this
 * function exists to make that hard to undo. The first version of the redesign
 * called `auth.api.signUpEmail(...)` instead, and everything the router does
 * silently went with it:
 *
 * - **The rate limiter.** It lives in the router's `onRequest`, so sign-up
 *   stopped being limited at all. Twelve sequential and thirty-two concurrent
 *   sign-ups from one IP all returned 200 with no rows in `rateLimits`, while
 *   sign-in on the same head limited correctly. `customRules["/sign-up/email"]`
 *   became dead configuration, and the config test kept passing because it
 *   asserts the rule EXISTS and names a real route — neither of which is
 *   enforcement.
 * - **The origin and CSRF checks.** Both middlewares begin `if (!ctx.request)
 *   return`, and the API path has no request, so a `callbackURL` pointing at
 *   another origin was accepted and mailed into a verification link that could
 *   never work.
 *
 * The comment that hid this said "everything that already governs it still
 *applies". It was true of the handler and false of the API, and it was written in
 * the same commit that made it false.
 *
 * Limiting now bounds the WORK rather than the request count: the caller is
 * acknowledged before the limiter runs, so a refused request still answers 200
 * and simply does nothing. That is the right way round — the 200 carries no
 * information either way, and the accounts, the inserts and the mail are what
 * needed bounding.
 */
export const runSignUpThroughRouter = async (
  deps: {
    handler: (request: Request) => Promise<Response>;
    logger: DeferredLogger;
  },
  request: Request,
  body: string,
): Promise<void> => {
  const email = String(
    (parseSignUpBody(body, request.headers.get("content-type")) ?? {}).email ??
      "",
  );
  try {
    const settled = await deps.handler(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body,
      }),
    );
    if (settled.status === 429) {
      deps.logger.warn(
        { email },
        "Sign-up: rate limited, so the deferred work did nothing",
      );
      return;
    }
    if (settled.status !== 200) {
      // The caller was told nothing and cannot be told now. This line is the
      // only record that the account did not appear.
      deps.logger.error(
        { status: settled.status, email },
        "Sign-up: the deferred work failed after the caller was acknowledged",
      );
      return;
    }
    deps.logger.info({ email }, "Sign-up: the deferred work completed");
  } catch (error) {
    deps.logger.error(
      { err: error, email },
      "Sign-up: the deferred work threw after the caller was acknowledged",
    );
  }
};

/** The body as an object, for either encoding this route accepts. */
export const parseSignUpBody = (
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
