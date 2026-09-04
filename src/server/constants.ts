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
   * The pairs this admits and rejects are pinned by TranslationChecker.test.ts.
   */
  JACCARD: 0.2,

  /**
   * Threshold for the semantic (embedding) fallback checker.
   *
   * Cosine similarity on all-MiniLM-L6-v2. Set high on purpose: embeddings
   * place related-but-wrong words (notably antonyms) fairly close, and a false
   * positive here silently stops the SRS correcting a real misunderstanding.
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

/**
 * How well a constituent character must be known before the words and
 * sentences built from it unlock.
 *
 * Levels are 0–5; 2 is "Sprout" (answered correctly twice, ~1 day retention).
 * Set to 0 to disable prerequisite gating entirely.
 */
export const CONSTITUENT_GATE_LEVEL = 2;

/**
 * Whether pinyin answers must carry the right tone.
 *
 * Tones are part of the reading, so this is on. Notation is always flexible
 * (nv3 / nü3 / nǚ all match) — this only governs whether a *toneless* answer
 * such as "nv" counts for "nǚ".
 */
export const REQUIRE_PINYIN_TONES = true;
