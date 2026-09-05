import "server-only";

import type { Cradle } from "@/server/initialization";

/**
 * Loads the semantic grading model before a learner is waiting on it.
 *
 * It takes a cradle rather than reaching for the container, because WHERE this
 * is called from is the whole point, and the reason is narrower than it looks.
 *
 * Turbopack gives every entry one shared runtime — all four require the same
 * `chunks/[turbopack]_runtime.js`, so there is one module registry per process,
 * keyed by numeric module id, and a factory is installed only for an id the
 * registry has not seen. The app's route entries share those ids: the chunk
 * carrying this app's services is emitted three times, for `/api/rpc`,
 * `/api/auth` and `/api/health`, byte-identical apart from its sourcemap
 * comment and all registering id 984019. They therefore share ONE container and
 * one pg pool, and warming from any of them warms the checker all of them use.
 *
 * `instrumentation.ts` is the exception, and it is compiled with its own ids —
 * `src/env.ts` alone appears twice, as 844880 for the app and 686648 for
 * instrumentation. Nothing dedupes across that, so resolving the container
 * there built a second one: two ~90 MB models per process, and the copy that
 * graded answers was never the copy that was warmed. Four production boots each
 * logged the load twice and the first wrong answer took 3.85 s.
 *
 * So this is called from the RPC route. Any app route entry would reach the
 * same container, but grading arrives over `study/*` — that is where a reader
 * looks for it, and that entry is loaded by the first RPC call, which is a page
 * load, long before anyone has answered a card.
 */
export function warmGradingModel(cradle: Cradle): void {
  // A dev server restarts constantly and grades in well under a second cold.
  if (process.env.NODE_ENV !== "production") return;
  // Route modules are evaluated during `next build` to collect page data. No CI
  // runner should pull 90 MB for that.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const startedAt = Date.now();

  // Deliberately not awaited: nothing else needs the model, and the first
  // request must not queue behind it.
  void cradle.translationChecker
    .warmUp?.()
    .then(() =>
      cradle.logger.info(
        { ms: Date.now() - startedAt },
        "Warmed the semantic grading model",
      ),
    )
    .catch((error: unknown) =>
      cradle.logger.warn(
        { err: error },
        "Could not warm the semantic grading model",
      ),
    );
}
