import "server-only";

import { type Level, type Logger, pino } from "pino";
import pinoPretty from "pino-pretty";

/**
 * The logger, separate from the container that usually holds it.
 *
 * `instrumentation.ts` needs one and must not reach into
 * `@/server/initialization` to get it. Turbopack compiles instrumentation with
 * its own module ids — `src/env.ts` alone is emitted twice, under one id for
 * the app and another for instrumentation — and the shared module registry
 * dedupes by id, so nothing there is ever the app's instance. Resolving the
 * container from instrumentation builds a SECOND one, holding second copies of
 * every singleton in it: that is how a warm-up there came to load a second
 * 90 MB model and leave the one that grades answers cold.
 *
 * A logger is the one thing that survives being duplicated, because it holds no
 * state worth sharing: two pino instances write the same lines to the same
 * stdout. So instrumentation gets its own from here, and the rule above stays
 * simple — instrumentation never touches the container.
 */
export function createLogger(options: {
  level?: Level;
  pretty: boolean;
  gitSha: string;
}): Logger {
  return pino(
    { level: options.level ?? "info" },
    options.pretty ? pinoPretty() : undefined,
  ).child({ GIT_SHA: options.gitSha });
}
