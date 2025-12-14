import "server-only";

import { betterAuth, type Logger as BetterAuthLogger } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nanoid } from "nanoid";
import type { Logger } from "pino";

import { EmailVerificationEmail } from "@/email/EmailVerificationEmail";
import type { Cradle } from "@/server/initialization";

import { schema } from "./database/schema";

export const getAuth = (
  deps: Cradle,
  options: {
    authSecret: string;
    baseUrl: string;
    rateLimit?: boolean;
    systemEmailFrom: string;
  },
) =>
  betterAuth({
    trustedOrigins: [options.baseUrl],
    database: drizzleAdapter(deps.database, {
      provider: "pg",
      schema: schema,
      usePlural: true,
    }),
    rateLimit: {
      enabled: options.rateLimit ?? true,
      storage: "database",
    },
    advanced: {
      database: {
        generateId: () => nanoid(),
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        void deps.email.sendEmail({
          from: options.systemEmailFrom,
          to: user.email,
          body: <EmailVerificationEmail link={url} username={user.name} />,
          subject: "Verify your email - Hanzimind",
        });
      },
    },
    secret: options.authSecret,
    logger: getLogger(deps.logger),
  });

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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      methodMap[level].bind(childLogger)(message, ...args);
    },
  };
}

export type Auth = ReturnType<typeof getAuth>;
export type AuthUser = Auth["$Infer"]["Session"]["user"];
export type Session = Auth["$Infer"]["Session"];

