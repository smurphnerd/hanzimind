import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";

import { newRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";
import { accountForFailure } from "@/server/endpoints/rpc-failure";
import { appRouter } from "@/server/endpoints/router";
import { container } from "@/server/initialization";
import { warmGradingModel } from "@/server/warmup";

const handler = new RPCHandler(appRouter, {
  plugins: [new ResponseHeadersPlugin()],
  interceptors: [
    async (options) => {
      try {
        return await options.next();
      } catch (error) {
        throw accountForFailure(error, {
          logger: options.context.cradle.logger,
          requestId: options.context.requestId,
          path: options.request.url.pathname,
          // A no-op until instrumentation.ts has initialised the SDK, which it
          // only does when SENTRY_DSN is set.
          report: (failure) =>
            Sentry.withScope((scope) => {
              scope.setTag("request_id", options.context.requestId);
              Sentry.captureException(failure);
            }),
        });
      }
    },
  ],
});

async function handleRequest(request: Request) {
  const requestHeaders = await headers();
  const requestId = newRequestId();

  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: {
      headers: requestHeaders,
      cradle: container.cradle,
      requestId,
    },
  });

  if (!response) {
    // An unmatched path returns rather than throwing, so the interceptor never
    // runs and nothing else would write a line for it — leaving an id in the
    // header that matches nothing in the log, which is the decoration this
    // whole mechanism exists to avoid.
    container.cradle.logger.warn(
      { requestId, path: new URL(request.url).pathname },
      "No RPC procedure matched",
    );
  }

  const result = response ?? new Response("Not found", { status: 404 });
  // Set here rather than through the response-headers plugin, because this is
  // the only point every response passes.
  result.headers.set(REQUEST_ID_HEADER, requestId);
  return result;
}

// Called from an app route entry rather than from instrumentation.ts, which is
// compiled with its own module ids and so resolves a second container — see
// warmup.ts for the evidence. This entry rather than another because grading
// arrives over `study/*`; the app's route entries share one container, so any
// of them would warm the same checker.
warmGradingModel(container.cradle);

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
