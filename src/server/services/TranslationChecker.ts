import "server-only";

import {
  TRANSLATION_SIMILARITY_THRESHOLDS,
  FILLER_WORDS,
} from "@/server/constants";
import { isTypoOf, stem } from "@/lib/text-match";

/**
 * Interface for translation similarity checking.
 * Allows for different implementations (Jaccard, semantic models, etc.)
 */
export interface ITranslationChecker {
  /**
   * Check if a user's answer is similar enough to the ground truth translation.
   * @param userAnswer - The user's translation answer
   * @param groundTruth - The correct translation
   * @param threshold - Minimum similarity score (0-1) to consider correct
   * @returns true if the answer is close enough to the ground truth
   */
  checkSimilarity(
    userAnswer: string,
    groundTruth: string,
    threshold?: number,
  ): boolean | Promise<boolean>;

  /**
   * Get the raw similarity score between two texts.
   * @param text1 - First text
   * @param text2 - Second text
   * @returns Similarity score between 0 and 1
   */
  getSimilarityScore(text1: string, text2: string): number | Promise<number>;

  /**
   * Load whatever this checker needs before a learner is waiting on it.
   *
   * Optional because most checkers need nothing: only the semantic one pays a
   * five-second model load, and only on the first answer it is asked to grade.
   * Called at boot from instrumentation.ts.
   */
  warmUp?(): Promise<void>;
}

/**
 * Jaccard similarity-based translation checker.
 * Computes word-level Jaccard similarity, handling semicolon-separated definitions.
 */
export class JaccardTranslationChecker implements ITranslationChecker {
  private readonly defaultThreshold = TRANSLATION_SIMILARITY_THRESHOLDS.JACCARD;

  /**
   * @param options.filterFillerWords - Whether to filter out common filler words (stop words)
   *   when computing similarity. Default: false to preserve exact matching behavior.
   */
  constructor(
    private options: {
      filterFillerWords?: boolean;
    } = {},
  ) {}

  /**
   * Normalize text: lowercase, strip punctuation, collapse whitespace.
   *
   * Stripping punctuation matters — without it "woman," (from "woman, girl")
   * never matches a typed "woman".
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[.,;:!?"'()[\]{}]/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  /**
   * Dictionary definitions list alternatives with both semicolons and commas
   * ("woman, girl; female"), and any one of them is a correct answer, so both
   * separate candidates. Slashes are used the same way.
   */
  private splitAlternatives(text: string): string[] {
    return text
      .split(/[;,/]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  /**
   * Split text into words, filtering out empty strings and optionally filler words
   */
  private tokenize(text: string): Set<string> {
    const words = this.normalize(text)
      .split(/\s+/)
      .filter((word) => word.length > 0);

    // Optionally filter out filler words for better semantic matching
    if (this.options.filterFillerWords) {
      return new Set(words.filter((word) => !FILLER_WORDS.has(word)));
    }

    return new Set(words);
  }

  /**
   * Calculate Jaccard similarity between two sets.
   * Jaccard = |A ∩ B| / |A ∪ B|
   *
   * Tokens count as shared when they stem to the same root ("selling" ≈
   * "sell") or differ only by a plausible typo ("womsn" ≈ "woman"), so a
   * near-miss spelling doesn't reset an item's SRS progress.
   */
  private jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 && set2.size === 0) {
      return 1.0;
    }

    const matchesLoosely = (a: string, b: string) =>
      a === b ||
      stem(a) === stem(b) ||
      isTypoOf(a, b) ||
      isTypoOf(stem(a), stem(b));

    const unmatched = new Set(set2);
    let shared = 0;

    for (const token of set1) {
      const hit = [...unmatched].find((other) => matchesLoosely(token, other));
      if (hit !== undefined) {
        shared++;
        unmatched.delete(hit);
      }
    }

    // |A ∪ B| = |A| + |B| − |A ∩ B|
    const union = set1.size + set2.size - shared;
    return union === 0 ? 1.0 : shared / union;
  }

  /**
   * Get similarity score between two texts.
   * Handles semicolon-separated definitions by computing similarity for each part
   * and returning the maximum similarity score.
   */
  getSimilarityScore(userAnswer: string, groundTruth: string): number {
    // Handle edge case where both strings are empty
    if (userAnswer.trim() === "" && groundTruth.trim() === "") {
      return 1.0;
    }

    // Split both sides into individual candidate meanings
    const userParts = this.splitAlternatives(userAnswer);
    const truthParts = this.splitAlternatives(groundTruth);

    let maxSimilarity = 0;

    // For each user answer part, find the best matching ground truth part
    for (const userPart of userParts) {
      if (userPart.length === 0) continue;

      const userTokens = this.tokenize(userPart);

      for (const truthPart of truthParts) {
        if (truthPart.length === 0) continue;

        const truthTokens = this.tokenize(truthPart);
        const similarity = this.jaccardSimilarity(userTokens, truthTokens);

        maxSimilarity = Math.max(maxSimilarity, similarity);
      }
    }

    return maxSimilarity;
  }

  /**
   * Check if user answer is similar enough to ground truth.
   * Returns true if any part of the user's answer matches any part of the ground truth
   * above the threshold.
   */
  checkSimilarity(
    userAnswer: string,
    groundTruth: string,
    threshold: number = this.defaultThreshold,
  ): boolean {
    const similarity = this.getSimilarityScore(userAnswer, groundTruth);
    return similarity >= threshold;
  }
}
