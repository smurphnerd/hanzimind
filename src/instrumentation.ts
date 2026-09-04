import type { Instrumentation } from "next";
import type { Logger } from "pino";

import { digestOf, requestIdOf } from "@/lib/request-id";

/**
 * Nothing in this file may touch `@/server/initialization`.
 *
 * Next builds instrumentation as its own entry with a disjoint chunk graph, so
 * the container it would resolve is a SECOND container, holding second copies
 * of every singleton in it. That is not a subtlety: warming the grading model
 * here loaded a second ~90 MB copy and left the one that grades answers cold.
 * The warm-up now lives in `@/server/warmup`, called from the RPC route.
 *
 * A logger is the one dependency safe to duplicate — two pino instances write
 * the same lines to the same stdout — so this builds its own from
 * `@/server/logger` rather than borrowing the container's.
 */
let logger: Logger | undefined;

async function instrumentationLogger(): Promise<Logger> {
  if (!logger) {
    const { env } = await import("@/env");
    const { createLogger } = await import("@/server/logger");
    logger = createLogger({
      level: env.LOG_LEVEL,
      pretty: env.NODE_ENV === "development",
      gitSha: env.GIT_SHA,
    });
  }
  return logger;
}

/**
 * Runs once per server instance, before the first request.
 *
 * Sentry is all that is left here, and it initialises wherever a DSN is set,
 * including a lane, so error reporting can be proved outside production. It is
 * process-global state rather than a container singleton, which is why this is
 * the right place for it and was the wrong place for the model.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { env } = await import("@/env");
  if (!env.SENTRY_DSN) return;

  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Every log line already carries GIT_SHA; an event that names a different
    // build than the logs around it is worse than one with no release at all.
    release: env.GIT_SHA,
    // Errors only. Tracing is a separate decision with its own cost, and
    // turning it on by default would sample every request in production.
    tracesSampleRate: 0,
  });
}

/**
 * Everything the RPC handler's own error interceptor cannot see: a server
 * component or route handler that threw while rendering.
 *
 * Both ids are logged because the page shows whichever it has. An oRPC failure
 * during SSR still carries the id this app minted, so the two log lines agree;
 * for anything else Next assigns a digest and redacts the message before the
 * client sees it, leaving the digest as the only thing a learner can quote.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const log = await instrumentationLogger();
  log.error(
    {
      err: error,
      requestId: requestIdOf(error),
      digest: digestOf(error),
      path: request.path,
      method: request.method,
      routeType: context.routeType,
    },
    "Request failed while rendering",
  );

  const Sentry = await import("@sentry/nextjs");
  Sentry.withScope((scope) => {
    // The tag is what makes an event findable from the id on the page a
    // learner is reading it off.
    const requestId = requestIdOf(error);
    if (requestId) scope.setTag("request_id", requestId);
    Sentry.captureRequestError(error, request, context);
  });
};
