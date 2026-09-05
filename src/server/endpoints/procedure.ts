import { ORPCError } from "@orpc/client";
import { os, ValidationError } from "@orpc/server";

import { toORPCError, withRequestId } from "./errors";
import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";

import type { Cradle } from "@/server/initialization";

const baseProcedure = os
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    TOO_MANY_REQUESTS: {},
  })
  .$context<
    {
      headers: Headers;
      cradle: Cradle;
      /** Minted per request by the RPC route; see src/lib/request-id.ts. */
      requestId: string;
    } & ResponseHeadersPluginContext
  >();

/**
 * The one place a service error becomes a wire error, so that no procedure can
 * forget to map one, and the one place the request id is stamped onto it.
 *
 * It no longer logs. The handler's `onError` interceptor in the RPC route does,
 * once, with the same id — which also catches the failures that never reach a
 * procedure at all, such as a malformed body.
 */
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
        throw withRequestId(
          new ORPCError("OUTPUT_VALIDATION_FAILED", { cause: error.cause }),
          context.requestId,
        );
      }
      throw withRequestId(toORPCError(error), context.requestId);
    }
  },
);

const authMiddleware = baseProcedure.middleware(
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
 * Admin rights are the session user's `role`, set by the Better Auth admin
 * plugin — nothing the request body carries can change it. Built on
 * authProcedure, so an anonymous caller gets UNAUTHORIZED before this ever runs.
 */
export const adminProcedure = authProcedure.use(
  async ({ context, next, errors }) => {
    if (context.user?.role !== "admin") {
      context.cradle.logger.warn(
        { userId: context.user?.id },
        "Non-admin attempted to reach an admin endpoint",
      );
      throw errors.FORBIDDEN();
    }

    return next({ context });
  },
);
