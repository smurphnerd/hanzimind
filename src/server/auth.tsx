import "server-only";

import {
  betterAuth,
  type BetterAuthOptions,
  type Logger as BetterAuthLogger,
} from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  createEmailVerificationToken,
} from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import {
  clearAccountData,
  decksStudiedByOthers,
} from "@/server/account-deletion";

import { admin } from "better-auth/plugins";
import { nanoid } from "nanoid";
import type { Logger } from "pino";
import type { ReactElement } from "react";

import { AUTH_FIELD_LIMITS, type AuthField } from "@/definitions/definitions";
import { ChangeEmailEmail } from "@/email/ChangeEmailEmail";
import { DeleteAccountEmail } from "@/email/DeleteAccountEmail";
import { EmailVerificationEmail } from "@/email/EmailVerificationEmail";
import { ExistingAccountEmail } from "@/email/ExistingAccountEmail";
import { PasswordResetEmail } from "@/email/PasswordResetEmail";
import { AUTH_BASE_PATH, SIGN_UP_PATH } from "@/server/auth-timing";
import type { Cradle } from "@/server/initialization";

import { schema } from "./database/schema";

export type AuthOptions = {
  authSecret: string;
  baseUrl: string;
  rateLimit?: boolean;
  systemEmailFrom: string;
};

const DAY = 60 * 60 * 24;

/**
 * The role a new account gets, in one place because two things have to agree
 * on it: the admin plugin, which stamps it on the row at insert time, and the
 * synthetic user sign-up invents for an address that already has an account.
 * If they drift, the difference between the two responses is the oracle again.
 */
export const DEFAULT_ROLE = "user";

/** Where the learner lands after clicking a verification link. */
const VERIFIED_CALLBACK = "/verified";

/**
 * The first field in the body that is longer than it is allowed to be, or null.
 *
 * Runs against every auth route rather than only the levelled ones, because
 * what these limits protect is not just the request that carries them. A
 * sign-up for a taken address renders the account's **stored** name into an
 * email; the only thing keeping that path's cost close to the free path's is
 * that whatever wrote the name was bounded by the same number.
 */
export const overlongAuthField = (body: unknown): AuthField | null => {
  if (typeof body !== "object" || body === null) return null;
  const fields = body as Record<string, unknown>;
  for (const [field, limit] of Object.entries(AUTH_FIELD_LIMITS)) {
    const value = fields[field];
    if (typeof value === "string" && value.length > limit) {
      return field as AuthField;
    }
  }
  return null;
};

/**
 * A stored name as an email may render it.
 *
 * `AUTH_FIELD_LIMITS.name` bounds what a sign-up may submit, but a row written
 * before that bound existed — production has some — would put an unbounded
 * amount of rendering on whichever path reads it, which is the asymmetry all
 * over again. Clamping at the point of render makes the two paths symmetric by
 * construction instead of by a promise about the data.
 */
const displayName = (name: string) => name.slice(0, AUTH_FIELD_LIMITS.name);

/**
 * Every option better-auth runs on, as data, so a test can read them without
 * standing up an instance.
 */
export const buildAuthOptions = (deps: Cradle, options: AuthOptions) => {
  /**
   * better-auth runs every sender through `runInBackgroundOrAwait` and catches
   * what it throws, so the endpoint still answers 200 when the mail fails. The
   * rethrow is for callers that do surface it; the log line is what an operator
   * reads, and the resend button on the sign-up card is the learner's way back.
   */
  const send = async (
    to: string,
    subject: string,
    body: ReactElement,
    kind: string,
  ) => {
    try {
      await deps.email.sendEmail({
        from: options.systemEmailFrom,
        to,
        subject,
        body,
      });
    } catch (error) {
      deps.logger.error({ error, to, kind }, "Failed to send an auth email");
      throw error;
    }
  };

  return {
    trustedOrigins: [options.baseUrl],
    database: drizzleAdapter(deps.database, {
      provider: "pg",
      schema: schema,
      usePlural: true,
    }),
    rateLimit: {
      enabled: options.rateLimit ?? true,
      storage: "database",
      // The endpoints an attacker guesses against. Five a minute is generous
      // for a person and useless for a script.
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        // The route better-auth actually serves. Its own built-in rule for
        // this path is three a minute, which is tight enough that a learner
        // mistyping an address hits it.
        "/request-password-reset": { window: 60, max: 5 },
      },
    },
    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
      // The cache trades a database read per request for staleness: a session
      // revoked by a password reset keeps working until the cached copy
      // expires. A minute is short enough that the reset is still a remedy and
      // long enough to spare the lookup on a burst of requests.
      cookieCache: { enabled: true, maxAge: 60 },
    },
    advanced: {
      database: {
        generateId: () => nanoid(),
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      // A reset is what a learner reaches for when they think the account is
      // compromised, so it has to evict whoever else is holding a cookie.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        send(
          user.email,
          "Reset your password - Hanzimind",
          <PasswordResetEmail link={url} username={displayName(user.name)} />,
          "reset-password",
        ),
      /**
       * The fake user sign-up answers with when the address is already taken.
       *
       * better-auth builds one of these itself, from the schema's declared
       * defaults, and the admin plugin's `role` has none — it is stamped on the
       * row at insert time — so the synthetic user came back with `"role":
       * null` while a real one came back `"role": "user"`. That single field
       * was finding 32: two 200s, no session needed, and any address on the
       * internet could be tested for an account here. `banned` needs no help
       * (its schema field does carry a default) but is spelled out anyway, so
       * that a reader can check this against the plugin's four columns without
       * knowing which of them happen to have defaults.
       */
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
        ...coreFields,
        role: DEFAULT_ROLE,
        banned: false,
        banReason: null,
        banExpires: null,
        ...additionalFields,
        id,
      }),
      /**
       * What a taken address costs, and what its owner gets told.
       *
       * Matching the body is not enough on its own: a free address is inserted,
       * linked and mailed while a taken one was only looked up, and on trunk
       * that showed up as 107 ms against 131 ms — a 22% gap, measurable by
       * anyone willing to time it. better-auth already hashes the password here
       * to cover its own share; this hook covers the rest by sending exactly
       * one email, through the same adapter, on this path too. Both answers now
       * pay for one hash and one send, and `auth-timing.ts` rounds away what is
       * left.
       *
       * The email is not padding. Someone signing up with an address they
       * already registered is usually a person who forgot, and the response
       * cannot tell them so without telling everyone. Their inbox can: an
       * unverified account gets the verification link it never used, and a
       * verified one gets a note saying it already exists, with a way to sign
       * in and a way to reset the password.
       */
      onExistingUserSignUp: async ({ user }) => {
        deps.logger.info(
          { email: user.email, userId: user.id, verified: user.emailVerified },
          "Sign-up: the address already has an account, answered as if new",
        );
        if (user.emailVerified) {
          await send(
            user.email,
            "You already have a Hanzimind account",
            <ExistingAccountEmail
              signInLink={`${options.baseUrl}/signin`}
              resetLink={`${options.baseUrl}/forgot-password`}
              username={displayName(user.name)}
            />,
            "existing-account",
          );
          return;
        }
        // An account that was never verified is a sign-up that did not finish,
        // so finish it: the same link the first attempt mailed. The callback is
        // the sign-up page's own default rather than this attempt's, which
        // costs a `redirectUrl` on a re-attempt and saves reading a cloned
        // request body on the one path where cost has to stay predictable.
        const token = await createEmailVerificationToken(
          options.authSecret,
          user.email,
        );
        await send(
          user.email,
          "Verify your email - Hanzimind",
          <EmailVerificationEmail
            link={`${options.baseUrl}${AUTH_BASE_PATH}/verify-email?token=${token}&callbackURL=${encodeURIComponent(VERIFIED_CALLBACK)}`}
            username={displayName(user.name)}
          />,
          "verify-email",
        );
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        // Sent to the address on file, so losing the new one cannot lock an
        // account out and taking the new one cannot steal it.
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) =>
          send(
            user.email,
            "Confirm your new email - Hanzimind",
            <ChangeEmailEmail
              link={url}
              username={displayName(user.name)}
              newEmail={newEmail}
            />,
            "change-email",
          ),
      },
      deleteUser: {
        enabled: true,
        /**
         * Only `sessions` and `accounts` cascade from `users`, so Postgres
         * refuses to delete a learner who has studied anything and the flow
         * answers 500 with nothing removed. Clear the learner's own state
         * first, in one transaction with the delete that follows it.
         *
         * A deck the learner authored is not their own state: another learner
         * may have it on their study list, and destroying that to satisfy
         * someone else's deletion is worse than a refusal. P4-INDEX encodes
         * the same rule in the schema as `onDelete: "restrict"`, after which
         * this hook is the friendlier half of the same guard.
         */
        beforeDelete: async (user) => {
          // Only a deck someone else is studying blocks the deletion. A deck
          // nobody has saved is the author's own state and goes with them;
          // refusing there would protect nothing and deny a real request.
          const studied = await decksStudiedByOthers(deps.database)(user.id);
          if (studied.length > 0) {
            const names = studied.map((deck) => `"${deck.name}"`).join(", ");
            deps.logger.warn(
              { userId: user.id, decks: studied.map((deck) => deck.name) },
              "Refused an account deletion: other learners study this account's decks",
            );
            throw new APIError("BAD_REQUEST", {
              message: `Other learners are studying ${studied.length === 1 ? "a deck" : "decks"} this account published, ${names}, so it cannot be deleted. Ask us to transfer or retire ${studied.length === 1 ? "it" : "them"} first.`,
            });
          }

          // Clearing the learner's own state, and then asking Postgres
          // whether the account can actually be deleted by deleting it on a
          // savepoint and rolling that back. A refusal rolls the whole thing
          // back, so better-auth never reaches the sessions and credentials it
          // removes next and the learner keeps both their data and their way
          // in.
          //
          // Because the trial is a real delete, a delete trigger on `users` or
          // on a cascading child fires twice per deletion; see the warning on
          // assertAccountDeletable before adding one.
          //
          // KNOWN LIMITATION. better-auth deletes sessions, the credential
          // account and the users row in its own transactions after this one
          // commits, and they are not even one transaction between themselves.
          // So this proves the state at commit, not a lock held across both. A
          // schema change landing in that window — a new foreign key, trigger
          // or rule reaching the users row — is still a lockout, because the
          // credentials are gone by the time the users delete fails. Closing it
          // needs the users row deleted inside this transaction, which better-
          // auth's flow does not allow. The window is milliseconds and needs a
          // migration to land inside it.
          try {
            await deps.database.transaction((tx) =>
              clearAccountData(tx, user.id),
            );
          } catch (error) {
            // Named `err`, because pino only serialises an Error under that
            // key and `{ error }` reached the log as `{}` — which threw away
            // the one sentence saying which reference survived, on a refusal
            // the learner is deliberately told nothing specific about. The
            // message is repeated as a plain string so it cannot vanish again
            // behind a serialiser setting.
            deps.logger.error(
              {
                err: error,
                reason: error instanceof Error ? error.message : String(error),
                userId: user.id,
              },
              "Rolled back an account deletion: the account was not fully released",
            );
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message:
                "We could not finish deleting this account, so nothing has been removed.",
            });
          }
          deps.logger.info(
            { userId: user.id },
            "Cleared a learner's own state before deleting the account",
          );
        },
        // Point the email at our own page rather than better-auth's callback,
        // which answers JSON: a refusal has to reach the learner as a page.
        sendDeleteAccountVerification: async ({ user, token }) =>
          send(
            user.email,
            "Confirm account deletion - Hanzimind",
            <DeleteAccountEmail
              link={`${options.baseUrl}/delete-account?token=${encodeURIComponent(token)}`}
              username={displayName(user.name)}
            />,
            "delete-account",
          ),
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        send(
          user.email,
          "Verify your email - Hanzimind",
          <EmailVerificationEmail
            link={url}
            username={displayName(user.name)}
          />,
          "verify-email",
        ),
    },
    /**
     * Refuse an overlong field before the endpoint runs, which on the levelled
     * routes means before anything looks the address up. The refusal reads the
     * submitted value only, so it is identical whether or not the address has
     * an account, and the route levels it like any other answer.
     */
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const field = overlongAuthField(ctx.body);
        if (!field) return;
        throw new APIError("BAD_REQUEST", {
          code: "FIELD_TOO_LONG",
          message: `${field} must be at most ${AUTH_FIELD_LIMITS[field]} characters.`,
        });
      }),
    },
    /**
     * Only the response is blinded. An operator answering a support ticket
     * still has to know which of the two happened, and a log line is not
     * reachable by anyone enumerating from the outside — so both outcomes say
     * so, in the same words up to the outcome, and `grep 'Sign-up: '` on the
     * server log finds either.
     */
    databaseHooks: {
      user: {
        create: {
          // Keyed on the endpoint, because this hook fires for any user the
          // adapter writes — the admin plugin serves a create-user route too —
          // and a log line an operator is meant to trust must not call that a
          // sign-up. It is also what keeps `grep 'Sign-up: '` exact.
          after: async (user, context) => {
            if (context?.path !== SIGN_UP_PATH) return;
            deps.logger.info(
              { email: user.email, userId: user.id },
              "Sign-up: the address was free, created an account",
            );
          },
        },
      },
    },
    plugins: [
      // Puts `role` on the session user so admin status travels with the session
      // — no extra round trip to learn it. New accounts default to "user";
      // "admin" is the only elevated role.
      admin({
        defaultRole: DEFAULT_ROLE,
        adminRoles: ["admin"],
      }),
    ],
    secret: options.authSecret,
    logger: getLogger(deps.logger),
  } satisfies BetterAuthOptions;
};

export const getAuth = (deps: Cradle, options: AuthOptions) =>
  betterAuth(buildAuthOptions(deps, options));

function getLogger(pino: Logger): BetterAuthLogger {
  const childLogger = pino.child({ service: "auth" });
  const methodMap = {
    debug: childLogger.debug,
    info: childLogger.info,
    warn: childLogger.warn,
    error: childLogger.error,
  };
  return {
    log: (level, message, ...args) => {
      methodMap[level].bind(childLogger)(message, ...args);
    },
  };
}

export type Auth = ReturnType<typeof getAuth>;
export type AuthUser = Auth["$Infer"]["Session"]["user"];
export type Session = Auth["$Infer"]["Session"];
