import { ORPCError } from "@orpc/client";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";

import {
  acceptRequestId,
  newRequestId,
  REQUEST_ID_HEADER,
} from "@/lib/request-id";
import { appRouter } from "@/server/endpoints/router";
import { container } from "@/server/initialization";
import { warmGradingModel } from "@/server/warmup";

/**
 * Every procedure in the router is built on `commonProcedure`, so by the time an
 * error reaches the interceptor loggingMiddleware has already mapped it to an
 * ORPCError with a status. Anything still raw here failed before a procedure ran
 * — a body the codec could not decode — which is a caller's mistake and, from a
 * scanner, an unbounded one. Reporting it would let anyone fill the error
 * budget from outside; the log line is enough.
 */
function isServerFault(error: unknown): boolean {
  return error instanceof ORPCError && error.status >= 500;
}

const handler = new RPCHandler(appRouter, {
  plugins: [new ResponseHeadersPlugin()],
  // The single log site for a failed call. oRPC converts a thrown error into a
  // response OUTSIDE this interceptor, so everything the handler can fail on
  // passes through here: a procedure's error after loggingMiddleware has mapped
  // it, and also the ones that never reach a procedure, such as a body it
  // cannot decode. Logging in the middleware instead would miss the second kind
  // and, now that both would run, would log the first kind twice.
  interceptors: [
    onError((error, { context, request }) => {
      context.cradle.logger.error(
        {
          err: error,
          requestId: context.requestId,
          path: request.url.pathname,
        },
        "RPC call failed",
      );

      // No-op until instrumentation.ts has initialised the SDK, which it only
      // does when SENTRY_DSN is set. 4xx is the API answering correctly — a
      // missing deck or an expired session is not something to page anyone
      // about — so only a fault gets reported.
      if (isServerFault(error)) {
        Sentry.withScope((scope) => {
          scope.setTag("request_id", context.requestId);
          Sentry.captureException(error);
        });
      }
    }),
  ],
});

async function handleRequest(request: Request) {
  const requestHeaders = await headers();
  // Reuse a proxy's id when there is one, so a single request reads as one
  // event across hops rather than as two unrelated ones.
  const requestId =
    acceptRequestId(requestHeaders.get(REQUEST_ID_HEADER)) ?? newRequestId();

  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: {
      headers: requestHeaders,
      cradle: container.cradle,
      requestId,
    },
  });

  const result = response ?? new Response("Not found", { status: 404 });
  // Set here rather than through the response-headers plugin, because this is
  // the only point every response passes: an unmatched path and a malformed
  // body never reach a procedure, and those are exactly the failures a caller
  // has nothing else to quote.
  result.headers.set(REQUEST_ID_HEADER, requestId);
  return result;
}

// Called from here, and only here, because this is the module graph that grades
// answers: `study/*` is the one path that reaches the semantic checker, and the
// checker that matters is the one THIS graph's container holds. See warmup.ts.
warmGradingModel(container.cradle);

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
