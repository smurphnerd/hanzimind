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
