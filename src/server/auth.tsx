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

import { EmailVerificationEmail } from "@/email/EmailVerificationEmail";
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
export const buildAuthOptions = (deps: Cradle, options: AuthOptions) =>
  ({
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
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        // Awaited, so better-auth reports a failed send to the caller instead
        // of resolving as though the mail went out.
        await deps.email.sendEmail({
          from: options.systemEmailFrom,
          to: user.email,
          body: <EmailVerificationEmail link={url} username={user.name} />,
          subject: "Verify your email - Hanzimind",
        });
      },
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
  }) satisfies BetterAuthOptions;

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
