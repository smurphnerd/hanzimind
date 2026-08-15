import { ORPCError } from "@orpc/client";
import { os, ValidationError } from "@orpc/server";
import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";

import { env } from "@/env";
import { isAdminEmail, parseAdminEmails } from "@/server/admin-access";
import type { Cradle } from "@/server/initialization";

const baseProcedure = os
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    TOO_MANY_REQUESTS: {},
  })
  .$context<
    { headers: Headers; cradle: Cradle } & ResponseHeadersPluginContext
  >();

const loggingMiddleware = baseProcedure.middleware(
  async ({ context, next }) => {
    try {
      return await next();
    } catch (error) {
      if (
        error instanceof ORPCError &&
        error.code === "INTERNAL_SERVER_ERROR" &&
        error.cause instanceof ValidationError
      ) {
        context.cradle.logger.error(error.cause);
        throw new ORPCError("OUTPUT_VALIDATION_FAILED", {
          cause: error.cause,
        });
      }
      context.cradle.logger.error(error);
      throw error;
    }
  },
);

export const authMiddleware = baseProcedure.middleware(
  async ({ context, next, errors }) => {
    const authState = await context.cradle.auth.api.getSession({
      headers: context.headers,
    });

    if (!authState) {
      throw errors.UNAUTHORIZED();
    }
    const response = await next({
      context: { ...context, ...authState },
    });
    response.context.resHeaders?.set(
      "Cache-Control",
      "no-store,private,must-revalidate",
    );
    return response;
  },
);

export const commonProcedure = baseProcedure.use(loggingMiddleware);

export const authProcedure = commonProcedure.use(authMiddleware);

/**
 * Admin rights come from ADMIN_EMAILS, not from anything the request carries, so
 * there is nothing a client can send to become an admin. Built on authProcedure,
 * so an anonymous caller gets UNAUTHORIZED before this ever runs.
 */
export const adminProcedure = authProcedure.use(
  async ({ context, next, errors }) => {
    if (
      !isAdminEmail(context.user?.email, parseAdminEmails(env.ADMIN_EMAILS))
    ) {
      context.cradle.logger.warn(
        { userId: context.user?.id },
        "Non-admin attempted to reach an admin endpoint",
      );
      throw errors.FORBIDDEN();
    }

    return next({ context });
  },
);
