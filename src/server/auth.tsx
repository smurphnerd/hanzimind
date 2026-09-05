import "server-only";

import {
  betterAuth,
  type BetterAuthOptions,
  type Logger as BetterAuthLogger,
} from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import {
  clearAccountData,
  decksStudiedByOthers,
} from "@/server/account-deletion";

import { admin } from "better-auth/plugins";
import { nanoid } from "nanoid";
import type { Logger } from "pino";
import type { ReactElement } from "react";

import { ChangeEmailEmail } from "@/email/ChangeEmailEmail";
import { DeleteAccountEmail } from "@/email/DeleteAccountEmail";
import { EmailVerificationEmail } from "@/email/EmailVerificationEmail";
import { PasswordResetEmail } from "@/email/PasswordResetEmail";
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
          <PasswordResetEmail link={url} username={user.name} />,
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
              username={user.name}
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
              username={user.name}
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
          <EmailVerificationEmail link={url} username={user.name} />,
          "verify-email",
        ),
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
