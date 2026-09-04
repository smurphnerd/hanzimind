import type { Instrumentation } from "next";

import { digestOf, requestIdOf } from "@/lib/request-id";

/**
 * Runs once per server instance, before the first request.
 *
 * Two guards cover both jobs: `NEXT_RUNTIME`, because the edge runtime has
 * neither the container nor the model, and `NEXT_PHASE`, because a build must
 * not pull a 90 MB model onto a CI runner.
 *
 * Sentry then initialises wherever a DSN is set, including a lane, so error
 * reporting can be proved outside production. The model warm-up is production
 * only: a dev server restarts constantly, and the load is only worth paying
 * where the process is long-lived.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { env } = await import("@/env");

  if (env.SENTRY_DSN) {
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

  if (env.NODE_ENV !== "production") return;

  const { container } = await import("@/server/initialization");
  const logger = container.cradle.logger;
  const startedAt = Date.now();

  // Deliberately not awaited. The model takes about five seconds to load, and
  // nothing else in the app needs it: blocking readiness on it would delay
  // every request to buy a head start on the first graded answer, which is
  // never the first thing a learner does.
  void container.cradle.translationChecker
    .warmUp?.()
    .then(() =>
      logger.info(
        { ms: Date.now() - startedAt },
        "Warmed the semantic grading model",
      ),
    )
    .catch((error: unknown) =>
      logger.warn({ err: error }, "Could not warm the semantic grading model"),
    );
}

/**
 * Everything the RPC handler's own `onError` cannot see: a server component or
 * route handler that threw while rendering.
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

  const { container } = await import("@/server/initialization");
  container.cradle.logger.error(
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
