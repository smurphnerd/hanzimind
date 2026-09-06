import "server-only";

import { ORPCError } from "@orpc/client";
import type { Logger } from "pino";

import { withRequestId } from "./errors";

/**
 * The single place a failed RPC call is turned into something a person can act
 * on: one log line, one wire error, and one decision about whether anyone
 * should be woken up.
 *
 * oRPC converts a thrown error into a response OUTSIDE the handler's
 * interceptors, so everything the handler can fail on passes through here — a
 * procedure's error, already mapped and stamped by `loggingMiddleware`, and the
 * ones that never reach a procedure. Logging in the middleware instead would
 * miss the second kind, and doing both would log the first kind twice.
 *
 * Reporting is a callback rather than a Sentry call so the rule below can be
 * tested without the SDK.
 */
export function accountForFailure(
  error: unknown,
  deps: {
    logger: Logger;
    requestId: string;
    path: string;
    report: (failure: ORPCError<string, unknown>) => void;
  },
): ORPCError<string, unknown> {
  // Every procedure in the router is built on commonProcedure, so an error
  // still raw here failed before any procedure ran — a body the codec could not
  // decode. Left alone, oRPC turns that into a 400 whose body this app never
  // touches, so the id reaches the header and nowhere a client could render it.
  const failure =
    error instanceof ORPCError
      ? error
      : withRequestId(
          new ORPCError("BAD_REQUEST", {
            message:
              "Malformed request. Check the request body and the Content-Type header.",
            cause: error,
          }),
          deps.requestId,
        );

  const line = {
    requestId: deps.requestId,
    path: deps.path,
    code: failure.code,
    status: failure.status,
  };

  if (failure.status >= 500) {
    deps.logger.error({ ...line, err: failure }, "RPC call failed");
    deps.report(failure);
  } else {
    // 4xx is the API answering correctly. A missing deck or an expired session
    // is ordinary traffic, and logging it at error with a full stack makes
    // every signed-out page load read as a fault — and reporting it would let
    // anyone fill the error budget from outside.
    deps.logger.warn(line, "RPC call rejected");
  }

  return failure;
}
