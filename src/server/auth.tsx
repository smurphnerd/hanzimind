import "server-only";

import {
  betterAuth,
  type BetterAuthOptions,
  type Logger as BetterAuthLogger,
} from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
 * Every option better-auth runs on, as data, so a test can read them without
 * standing up an instance.
 */
export const buildAuthOptions = (deps: Cradle, options: AuthOptions) => {
  /**
   * better-auth swallows nothing: a rejected send propagates to the caller, so
   * the endpoint answers 500 rather than pretending the mail went out. The log
   * line is what an operator reads afterwards.
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
        "/forget-password": { window: 60, max: 5 },
      },
    },
    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
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
      sendResetPassword: async ({ user, url }) =>
        send(
          user.email,
          "Reset your password - Hanzimind",
          <PasswordResetEmail link={url} username={user.name} />,
          "reset-password",
        ),
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
        sendDeleteAccountVerification: async ({ user, url }) =>
          send(
            user.email,
            "Confirm account deletion - Hanzimind",
            <DeleteAccountEmail link={url} username={user.name} />,
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
        defaultRole: "user",
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
