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
/**
 * Milliseconds until the next review, indexed by the level the item held
 * BEFORE the answer. Answering correctly at level 3 schedules
 * `LEVEL_INTERVALS[3]` out and lands the item at level 4.
 *
 * Index 5 is the ceiling: a correct answer there reschedules at 5 rather than
 * advancing. `GROWTH_STAGES` in `src/lib/growth.ts` encodes the same six levels
 * independently, so the two must stay the same length.
 */
export const LEVEL_INTERVALS = [
  /** 10 minutes. */
  10 * 60 * 1000,
  /** 1 day. */
  1 * 24 * 60 * 60 * 1000,
  /** 3 days. */
  3 * 24 * 60 * 60 * 1000,
  /** 1 week. */
  7 * 24 * 60 * 60 * 1000,
  /** 18 days. */
  18 * 24 * 60 * 60 * 1000,
  /** 1 month, and the ceiling. */
  30 * 24 * 60 * 60 * 1000,
] as const;

/** Wrong answer: back to level 0, seen again in a minute. */
export const INCORRECT_INTERVAL = 1 * 60 * 1000;

export const MAX_LEVEL = LEVEL_INTERVALS.length - 1;

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
