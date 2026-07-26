import "server-only";

import type { Logger } from "pino";

import { TRANSLATION_SIMILARITY_THRESHOLDS } from "@/server/constants";
import type { ITranslationChecker } from "./TranslationChecker";

/**
 * Semantic fallback for meaning answers, using a small local sentence-embedding
 * model (all-MiniLM-L6-v2) via transformers.js.
 *
 * Design notes:
 * - It runs LOCALLY, so there's no per-answer API cost or network round trip
 *   in the tightest loop of the app.
 * - It is a FALLBACK only (see CompositeTranslationChecker): the deterministic
 *   lexical check answers the vast majority of cards, and this only sees the
 *   ones it rejected. That keeps the fast path fast and limits how much
 *   grading depends on a fuzzy score.
 * - The threshold is deliberately conservative. A false positive is the
 *   expensive error here: silently accepting a wrong meaning means the SRS
 *   stops correcting a real misunderstanding. Embeddings notoriously place
 *   antonyms close together ("good"/"bad"), so this errs strict.
 * - If the model cannot be loaded for any reason, every check returns false
 *   and grading degrades to lexical-only rather than breaking.
 */
export class SemanticTranslationChecker implements ITranslationChecker {
  private readonly defaultThreshold =
    TRANSLATION_SIMILARITY_THRESHOLDS.SEMANTIC;

  private extractor: unknown = null;
  private loading: Promise<unknown> | null = null;
  private unavailable = false;

  constructor(
    private deps: { logger: Logger },
    private options: { modelId?: string } = {},
  ) {}

  private async getExtractor() {
    if (this.unavailable) return null;
    if (this.extractor) return this.extractor;

    // Load once, and let concurrent callers share the same promise.
    this.loading ??= (async () => {
      const modelId = this.options.modelId ?? "Xenova/all-MiniLM-L6-v2";
      const { pipeline } = await import("@huggingface/transformers");
      this.deps.logger.info({ modelId }, "Loading semantic similarity model");
      return pipeline("feature-extraction", modelId);
    })();

    try {
      this.extractor = await this.loading;
      return this.extractor;
    } catch (error) {
      // Offline, unsupported platform, corrupt cache — grading must not break.
      this.deps.logger.warn(
        { error },
        "Semantic model unavailable; falling back to lexical matching only",
      );
      this.unavailable = true;
      this.loading = null;
      return null;
    }
  }

  private async embed(text: string): Promise<Float32Array | null> {
    const extractor = (await this.getExtractor()) as
      | ((
          text: string,
          opts: { pooling: "mean"; normalize: boolean },
        ) => Promise<{ data: Float32Array }>)
      | null;
    if (!extractor) return null;

    const output = await extractor(text, { pooling: "mean", normalize: true });
    return output.data;
  }

  /** Cosine similarity; vectors are already L2-normalised, so this is a dot product. */
  private cosine(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    for (let i = 0; i < a.length && i < b.length; i++) dot += a[i] * b[i];
    return dot;
  }

  async getSimilarityScore(
    userAnswer: string,
    groundTruth: string,
  ): Promise<number> {
    const answer = userAnswer.trim();
    if (!answer || !groundTruth.trim()) return 0;

    try {
      const [answerVec, truthVecs] = await Promise.all([
        this.embed(answer),
        // Score against each listed meaning separately and take the best —
        // matching one sense of a word is enough.
        Promise.all(
          groundTruth
            .split(/[;,/]/)
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => this.embed(part)),
        ),
      ]);

      if (!answerVec) return 0;

      let best = 0;
      for (const truthVec of truthVecs) {
        if (!truthVec) continue;
        best = Math.max(best, this.cosine(answerVec, truthVec));
      }
      return best;
    } catch (error) {
      this.deps.logger.warn({ error }, "Semantic similarity check failed");
      return 0;
    }
  }

  async checkSimilarity(
    userAnswer: string,
    groundTruth: string,
    threshold: number = this.defaultThreshold,
  ): Promise<boolean> {
    const score = await this.getSimilarityScore(userAnswer, groundTruth);
    return score >= threshold;
  }
}

/**
 * Runs the cheap deterministic check first and only consults the expensive
 * fuzzy one when it fails, so the common case never pays for the model.
 */
export class CompositeTranslationChecker implements ITranslationChecker {
  constructor(
    private primary: ITranslationChecker,
    private fallback: ITranslationChecker,
  ) {}

  async getSimilarityScore(
    userAnswer: string,
    groundTruth: string,
  ): Promise<number> {
    const primaryScore = await this.primary.getSimilarityScore(
      userAnswer,
      groundTruth,
    );
    const fallbackScore = await this.fallback.getSimilarityScore(
      userAnswer,
      groundTruth,
    );
    return Math.max(primaryScore, fallbackScore);
  }

  async checkSimilarity(
    userAnswer: string,
    groundTruth: string,
    threshold?: number,
  ): Promise<boolean> {
    if (await this.primary.checkSimilarity(userAnswer, groundTruth, threshold)) {
      return true;
    }
    return this.fallback.checkSimilarity(userAnswer, groundTruth);
  }
}
