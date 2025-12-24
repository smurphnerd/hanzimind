import "server-only";

/**
 * Minimal English filler words that can be filtered out
 * when computing translation similarity metrics.
 *
 * IMPORTANT: This is a very conservative list containing ONLY words that
 * truly don't affect the core meaning of translations. Most grammatical
 * words (pronouns, negations, quantifiers, etc.) are intentionally excluded
 * because they carry important semantic information.
 *
 * Only includes:
 * - Articles (a, an, the) - often optional in translations
 * - Infinitive marker "to" - often omitted in definitions
 *
 * Usage: Filter these out before tokenizing text for similarity comparison.
 */
export const FILLER_WORDS = new Set(["a", "an", "the", "to"]);

/**
 * Translation similarity thresholds for different checker implementations.
 * Values range from 0 to 1, where 1 is a perfect match.
 */
export const TRANSLATION_SIMILARITY_THRESHOLDS = {
  /**
   * Threshold for Jaccard similarity-based translation checker.
   * Uses word-level similarity with semicolon-separated definition support.
   *
   * 0.6 (60% similarity) allows for:
   * - Minor word differences (e.g., "to eat" vs "to consume")
   * - Partial phrase matches (e.g., "give birth" vs "to give birth to")
   * - Synonym variations while rejecting completely different meanings
   */
  JACCARD: 0.2,

  /**
   * Threshold for semantic/transformer-based checkers (future implementation).
   * Semantic models can be more lenient since they understand meaning beyond exact words.
   *
   * Example: 0.7-0.8 for models like sentence-transformers or xenova/transformers
   */
  SEMANTIC: 0.75,
} as const;

/**
 * Spaced repetition intervals in milliseconds.
 * Based on Anki-style spaced repetition system.
 */
export const SPACED_REPETITION_INTERVALS = {
  /** Incorrect answer: review in 1 minute */
  INCORRECT: 1 * 60 * 1000,

  /** Level 0 correct: review in 10 minutes */
  LEVEL_0: 10 * 60 * 1000,

  /** Level 1 correct: review in 1 day */
  LEVEL_1: 1 * 24 * 60 * 60 * 1000,

  /** Level 2 correct: review in 3 days */
  LEVEL_2: 3 * 24 * 60 * 60 * 1000,

  /** Level 3 correct: review in 1 week */
  LEVEL_3: 7 * 24 * 60 * 60 * 1000,

  /** Level 4 correct: review in 18 days */
  LEVEL_4: 18 * 24 * 60 * 60 * 1000,

  /** Level 5 correct: review in 1 month */
  LEVEL_5: 30 * 24 * 60 * 60 * 1000,
} as const;
