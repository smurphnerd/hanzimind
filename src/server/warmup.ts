import "server-only";

import type { Cradle } from "@/server/initialization";

/**
 * Loads the semantic grading model before a learner is waiting on it.
 *
 * It takes a cradle rather than reaching for the container, because WHERE this
 * is called from is the whole point. Next builds `instrumentation.ts` as its own
 * entry with a disjoint chunk graph, so the container it resolves is not the one
 * a request resolves. Warming from there loaded a second ~90 MB copy of the
 * model and left the copy that grades answers cold: four production boots each
 * logged the model loading twice from one pid, and the first wrong answer still
 * took 3.85 s — slower than dev, where nothing was warmed at all.
 *
 * So it is called from the module graph that grades, which is the RPC route:
 * `study/*` is the only path that reaches the checker. That is a little later
 * than boot — the chunk loads on the first RPC call — but it is the earliest
 * moment the right instance exists, and the first call is a page load, long
 * before anyone has answered a card.
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
