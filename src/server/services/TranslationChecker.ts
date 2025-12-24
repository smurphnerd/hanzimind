import "server-only";

import {
  TRANSLATION_SIMILARITY_THRESHOLDS,
  FILLER_WORDS,
} from "@/server/constants";

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
  ): boolean;

  /**
   * Get the raw similarity score between two texts.
   * @param text1 - First text
   * @param text2 - Second text
   * @returns Similarity score between 0 and 1
   */
  getSimilarityScore(text1: string, text2: string): number;
}

/**
 * Jaccard similarity-based translation checker.
 * Computes word-level Jaccard similarity, handling semicolon-separated definitions.
 */
export class JaccardTranslationChecker implements ITranslationChecker {
  private readonly defaultThreshold =
    TRANSLATION_SIMILARITY_THRESHOLDS.JACCARD;

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
   * Normalize text by converting to lowercase and removing extra whitespace
   */
  private normalize(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, " ");
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
   * Calculate Jaccard similarity between two sets
   * Jaccard = |A ∩ B| / |A ∪ B|
   */
  private jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 && set2.size === 0) {
      return 1.0;
    }

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
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

    // Split both answers by semicolon to handle multiple definitions
    const userParts = userAnswer.split(";").map((part) => part.trim());
    const truthParts = groundTruth.split(";").map((part) => part.trim());

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
