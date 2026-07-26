import { describe, it, expect } from "vitest";
import { JaccardTranslationChecker } from "../TranslationChecker";

describe("JaccardTranslationChecker", () => {
  const checker = new JaccardTranslationChecker();
  const checkerWithFillerFiltering = new JaccardTranslationChecker({
    filterFillerWords: true,
  });

  describe("getSimilarityScore", () => {
    it("should return 1.0 for identical strings", () => {
      const score = checker.getSimilarityScore("hello world", "hello world");
      expect(score).toBe(1.0);
    });

    it("should return 1.0 for identical strings with different casing", () => {
      const score = checker.getSimilarityScore("Hello World", "hello world");
      expect(score).toBe(1.0);
    });

    it("should return 0.0 for completely different strings", () => {
      const score = checker.getSimilarityScore("hello", "goodbye");
      expect(score).toBe(0.0);
    });

    it("should return partial similarity for overlapping words", () => {
      const score = checker.getSimilarityScore("hello world", "hello there");
      // hello is common, world/there are different
      // intersection: {hello} = 1
      // union: {hello, world, there} = 3
      // similarity: 1/3 ≈ 0.333
      expect(score).toBeCloseTo(0.333, 2);
    });

    it("should handle semicolon-separated definitions", () => {
      const userAnswer = "to eat; to consume";
      const groundTruth = "to eat; to drink";
      const score = checker.getSimilarityScore(userAnswer, groundTruth);
      // Best match: "to eat" vs "to eat" = 1.0
      expect(score).toBe(1.0);
    });

    it("should find best match among multiple semicolon parts", () => {
      const userAnswer = "happy; joyful";
      const groundTruth = "joyful; cheerful; delighted";
      const score = checker.getSimilarityScore(userAnswer, groundTruth);
      // Best match: "joyful" vs "joyful" = 1.0
      expect(score).toBe(1.0);
    });

    it("should handle partial matches in semicolon parts", () => {
      const userAnswer = "to run fast";
      const groundTruth = "to run; to jog";
      const score = checker.getSimilarityScore(userAnswer, groundTruth);
      // Best match: "to run fast" vs "to run"
      // intersection: {to, run} = 2
      // union: {to, run, fast} = 3
      // similarity: 2/3 ≈ 0.667
      expect(score).toBeCloseTo(0.667, 2);
    });

    it("should ignore extra whitespace", () => {
      const score = checker.getSimilarityScore(
        "hello   world",
        "  hello world  ",
      );
      expect(score).toBe(1.0);
    });

    it("should return 1.0 for two empty strings", () => {
      const score = checker.getSimilarityScore("", "");
      expect(score).toBe(1.0);
    });
  });

  describe("checkSimilarity", () => {
    it("should return true when similarity exceeds threshold", () => {
      const result = checker.checkSimilarity(
        "hello world",
        "hello world",
        0.8,
      );
      expect(result).toBe(true);
    });

    it("should return false when similarity is below threshold", () => {
      const result = checker.checkSimilarity("hello", "world", 0.5);
      expect(result).toBe(false);
    });

    it("should use default threshold of 0.2", () => {
      // "hello there" vs "hello world" = 1/3 ≈ 0.333 > 0.2
      const result = checker.checkSimilarity("hello there", "hello world");
      expect(result).toBe(true);

      // But should fail for completely different words
      const resultDifferent = checker.checkSimilarity("hello", "goodbye");
      expect(resultDifferent).toBe(false);
    });

    it("should return true for close matches with default threshold", () => {
      // "to eat food" vs "to eat meals"
      // intersection: {to, eat} = 2
      // union: {to, eat, food, meals} = 4
      // similarity: 2/4 = 0.5 > 0.2
      const result = checker.checkSimilarity("to eat food", "to eat meals");
      expect(result).toBe(true);

      // Should still work with higher threshold
      const resultWithHigherThreshold = checker.checkSimilarity(
        "to eat food",
        "to eat meals",
        0.6,
      );
      expect(resultWithHigherThreshold).toBe(false);
    });

    it("should handle semicolon-separated definitions correctly", () => {
      const result = checker.checkSimilarity(
        "to eat; to consume",
        "to eat; to drink; to have a meal",
        0.8,
      );
      // Best match is "to eat" vs "to eat" = 1.0 > 0.8
      expect(result).toBe(true);
    });
  });

  describe("real world Chinese translation examples", () => {
    it("should accept close translations", () => {
      const userAnswer = "to eat";
      const groundTruth = "to eat; to consume; to have a meal";
      const result = checker.checkSimilarity(userAnswer, groundTruth, 0.6);
      expect(result).toBe(true);
    });

    it("should accept synonym variations", () => {
      const userAnswer = "happy";
      const groundTruth = "joyful; happy; cheerful";
      const result = checker.checkSimilarity(userAnswer, groundTruth, 0.6);
      expect(result).toBe(true);
    });

    it("should reject very different meanings", () => {
      const userAnswer = "to run";
      const groundTruth = "to eat; to consume";
      const result = checker.checkSimilarity(userAnswer, groundTruth, 0.6);
      expect(result).toBe(false);
    });

    it("should handle multi-word phrases", () => {
      const userAnswer = "to give birth to";
      const groundTruth = "to give birth to; to bear";
      const result = checker.checkSimilarity(userAnswer, groundTruth, 0.6);
      expect(result).toBe(true);
    });

    it("should handle partial phrase matches", () => {
      const userAnswer = "give birth";
      const groundTruth = "to give birth to; to bear";
      const result = checker.checkSimilarity(userAnswer, groundTruth, 0.6);
      // "give birth" vs "to give birth to"
      // intersection: {give, birth} = 2
      // union: {give, birth, to} = 3
      // similarity: 2/3 ≈ 0.667 > 0.6
      expect(result).toBe(true);
    });
  });

  describe("filler word filtering", () => {
    it("should NOT filter filler words by default", () => {
      const userAnswer = "to eat";
      const groundTruth = "eat";
      const score = checker.getSimilarityScore(userAnswer, groundTruth);
      // Without filtering: {to, eat} vs {eat}
      // intersection: {eat} = 1
      // union: {to, eat} = 2
      // similarity: 1/2 = 0.5
      expect(score).toBe(0.5);
    });

    it("should filter filler words when enabled", () => {
      const userAnswer = "to eat";
      const groundTruth = "eat";
      const score =
        checkerWithFillerFiltering.getSimilarityScore(userAnswer, groundTruth);
      // With filtering: "to" is removed
      // {eat} vs {eat}
      // similarity: 1.0
      expect(score).toBe(1.0);
    });

    it("should handle when all words are filler words", () => {
      const userAnswer = "to the";
      const groundTruth = "a an";
      const score =
        checkerWithFillerFiltering.getSimilarityScore(userAnswer, groundTruth);
      // Both become empty sets after filtering (all articles/infinitive marker)
      // Empty sets should return 1.0
      expect(score).toBe(1.0);
    });

    it("should improve similarity for translations with articles", () => {
      const userAnswer = "apple";
      const groundTruth = "an apple";

      const scoreWithFilter =
        checkerWithFillerFiltering.getSimilarityScore(userAnswer, groundTruth);
      // "an" is filtered out
      expect(scoreWithFilter).toBe(1.0);
    });

    it("should handle mixed articles", () => {
      const userAnswer = "the dog";
      const groundTruth = "a dog";

      // Without filtering: different articles count as different words
      const scoreWithoutFilter = checker.getSimilarityScore(
        userAnswer,
        groundTruth,
      );
      // {the, dog} vs {a, dog}
      // intersection: {dog} = 1
      // union: {the, a, dog} = 3
      expect(scoreWithoutFilter).toBeCloseTo(0.333, 2);

      // With filtering: articles removed, only content words remain
      const scoreWithFilter =
        checkerWithFillerFiltering.getSimilarityScore(userAnswer, groundTruth);
      // {dog} vs {dog}
      expect(scoreWithFilter).toBe(1.0);
    });

    it("should preserve important words like prepositions", () => {
      const userAnswer = "look at someone";
      const groundTruth = "look for someone";

      // "at" and "for" are NOT in filler words, so they're preserved
      const scoreWithFilter =
        checkerWithFillerFiltering.getSimilarityScore(userAnswer, groundTruth);
      // {look, at, someone} vs {look, for, someone}
      // intersection: {look, someone} = 2
      // union: {look, at, for, someone} = 4
      expect(scoreWithFilter).toBe(0.5);
    });

    it("should still differentiate completely different content words", () => {
      const userAnswer = "eat food";
      const groundTruth = "drink water";

      const scoreWithFilter =
        checkerWithFillerFiltering.getSimilarityScore(userAnswer, groundTruth);
      // No common words after filtering
      expect(scoreWithFilter).toBe(0.0);
    });

    it("should work with semicolon-separated definitions", () => {
      const userAnswer = "eat";
      const groundTruth = "to eat; to consume; to have a meal";

      const result = checkerWithFillerFiltering.checkSimilarity(
        userAnswer,
        groundTruth,
        0.6,
      );
      // Best match: "eat" vs "to eat" -> after filtering "to": "eat" vs "eat" = 1.0
      expect(result).toBe(true);
    });

    it("should help with infinitive verb forms", () => {
      const userAnswer = "run";
      const groundTruth = "to run";

      // Without filtering
      const scoreWithoutFilter = checker.getSimilarityScore(
        userAnswer,
        groundTruth,
      );
      expect(scoreWithoutFilter).toBe(0.5); // {run} vs {to, run}

      // With filtering: "to" is removed
      const scoreWithFilter =
        checkerWithFillerFiltering.getSimilarityScore(userAnswer, groundTruth);
      expect(scoreWithFilter).toBe(1.0); // {run} vs {run}
    });

    it("should handle multiple articles in phrase", () => {
      const userAnswer = "use the product";
      const groundTruth = "use a product";

      // With filtering: "the" and "a" removed
      const scoreWithFilter =
        checkerWithFillerFiltering.getSimilarityScore(userAnswer, groundTruth);
      // {use, product} vs {use, product}
      expect(scoreWithFilter).toBe(1.0);
    });
  });
  describe("comma-separated dictionary definitions", () => {
    // Real makemeahanzi definitions list synonyms with commas as well as
    // semicolons; any single listed meaning is a correct answer.
    const checker = new JaccardTranslationChecker({ filterFillerWords: true });

    it("should accept a synonym that is followed by a comma", () => {
      // Regression: tokenising "woman, girl" produced "woman," (comma
      // attached), so a typed "woman" scored 0 and was marked wrong.
      expect(checker.checkSimilarity("woman", "woman, girl; female")).toBe(
        true,
      );
    });

    it("should accept a synonym that follows a comma", () => {
      expect(checker.checkSimilarity("girl", "woman, girl; female")).toBe(true);
    });

    it("should accept a synonym after a semicolon", () => {
      expect(checker.checkSimilarity("female", "woman, girl; female")).toBe(
        true,
      );
    });

    it("should accept any listed meaning of a longer definition", () => {
      const truth = "good, excellent, fine; proper, suitable; well";
      for (const answer of ["good", "excellent", "fine", "suitable", "well"]) {
        expect(checker.checkSimilarity(answer, truth)).toBe(true);
      }
    });

    it("should ignore case and trailing punctuation", () => {
      expect(checker.checkSimilarity("Woman.", "woman, girl; female")).toBe(
        true,
      );
    });

    it("should accept a verb without its infinitive 'to'", () => {
      expect(checker.checkSimilarity("sell", "to sell; to betray")).toBe(true);
    });

    it("should still reject an unrelated answer", () => {
      expect(checker.checkSimilarity("dog", "woman, girl; female")).toBe(false);
    });

    it("should still reject an empty answer", () => {
      expect(checker.checkSimilarity("", "woman, girl; female")).toBe(false);
    });
  });
  describe("typo tolerance and stemming", () => {
    const checker = new JaccardTranslationChecker({ filterFillerWords: true });

    it("should accept a single-character typo", () => {
      expect(checker.checkSimilarity("womsn", "woman, girl; female")).toBe(true);
    });

    it("should accept an adjacent transposition", () => {
      // "woamn" swaps m/a — one edit under Damerau-Levenshtein.
      expect(checker.checkSimilarity("woamn", "woman, girl; female")).toBe(true);
    });

    it("should reject a two-edit scramble of a short word", () => {
      // "wonam" swaps non-adjacent letters (2 edits). Allowing that much
      // slack on a 5-letter word would start accepting different answers.
      expect(checker.checkSimilarity("wonam", "woman, girl; female")).toBe(
        false,
      );
    });

    it("should accept a missing letter in a longer word", () => {
      expect(checker.checkSimilarity("excelent", "good, excellent, fine")).toBe(
        true,
      );
    });

    it("should accept a plural for a singular meaning", () => {
      expect(checker.checkSimilarity("mountains", "mountain; hill")).toBe(true);
    });

    it("should accept an -ing form for an infinitive", () => {
      expect(checker.checkSimilarity("selling", "to sell; to betray")).toBe(
        true,
      );
    });

    it("should accept an irregular plural", () => {
      expect(checker.checkSimilarity("people", "man, person")).toBe(true);
    });

    it("should NOT treat a short lookalike as a typo", () => {
      // "cat"/"car" are different answers, not a misspelling.
      expect(checker.checkSimilarity("car", "cat")).toBe(false);
    });

    it("should still reject a genuinely different word", () => {
      expect(checker.checkSimilarity("horse", "woman, girl; female")).toBe(
        false,
      );
    });
  });
});
