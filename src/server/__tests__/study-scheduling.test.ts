import { describe, expect, it, vi } from "vitest";

import type { StudyType } from "@/definitions/definitions";
import type { ITranslationChecker } from "@/server/services/TranslationChecker";
import {
  INCORRECT_INTERVAL,
  LEVEL_INTERVALS,
  MAX_LEVEL,
} from "@/server/constants";
import { NO_SYNONYMS, gradeAnswer, nextReviewAt } from "../study-scheduling";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const offset = (schedule: { nextAt: Date }) =>
  schedule.nextAt.getTime() - NOW.getTime();

const CARD = {
  id: "item-1",
  vocabItem: "人",
  pinyin: "rén",
  translation: "man, person; people",
};

function checkerReturning(result: boolean) {
  return {
    checkSimilarity: vi.fn(() => result),
    getSimilarityScore: vi.fn(() => 0),
  } satisfies ITranslationChecker;
}

describe("nextReviewAt", () => {
  it("should advance a correct answer to the next level", () => {
    expect(nextReviewAt(3, true, NOW).nextLevel).toBe(4);
  });

  it("should schedule a correct answer by the level it is leaving", () => {
    expect(offset(nextReviewAt(3, true, NOW))).toBe(LEVEL_INTERVALS[3]);
  });

  it("should reset a wrong answer to level 0", () => {
    expect(nextReviewAt(2, false, NOW).nextLevel).toBe(0);
  });

  it("should schedule a wrong answer by the incorrect interval", () => {
    expect(offset(nextReviewAt(2, false, NOW))).toBe(INCORRECT_INTERVAL);
  });

  it("should hold at the ceiling rather than advancing past it", () => {
    expect(nextReviewAt(MAX_LEVEL, true, NOW).nextLevel).toBe(MAX_LEVEL);
  });

  it("should schedule the ceiling by the longest interval", () => {
    expect(offset(nextReviewAt(MAX_LEVEL, true, NOW))).toBe(
      LEVEL_INTERVALS[MAX_LEVEL],
    );
  });

  // The six-case switch this replaces sent every out-of-range level through
  // `case 5: default:`. A clamp would send a negative to the ten-minute
  // interval instead, which the switch never did.
  it("should send a level below the floor to the ceiling, as the old switch did", () => {
    expect(nextReviewAt(-1, true, NOW)).toEqual({
      nextLevel: MAX_LEVEL,
      nextAt: new Date(NOW.getTime() + LEVEL_INTERVALS[MAX_LEVEL]),
    });
  });

  it("should send a level above the ceiling to the ceiling", () => {
    expect(nextReviewAt(99, true, NOW).nextLevel).toBe(MAX_LEVEL);
  });
});

describe("gradeAnswer", () => {
  const grade = (
    studyType: StudyType,
    answer: string,
    extra: Partial<Parameters<typeof gradeAnswer>[0]> = {},
  ) =>
    gradeAnswer({
      card: CARD,
      studyType,
      answer,
      synonyms: NO_SYNONYMS,
      checker: checkerReturning(false),
      ...extra,
    });

  it("should accept a reading written with a tone number", async () => {
    expect(await grade("reading", "ren2")).toBe(true);
  });

  it("should accept the pinyin v notation for ü", async () => {
    const card = { ...CARD, vocabItem: "女", pinyin: "nǚ" };
    expect(await grade("reading", "nv3", { card })).toBe(true);
  });

  it("should accept the glyph itself on a listening card", async () => {
    expect(await grade("listening", "人")).toBe(true);
  });

  it("should accept the exact characters on a writing card", async () => {
    expect(await grade("writing", " 人 ")).toBe(true);
  });

  it("should reject the wrong character on a writing card", async () => {
    expect(await grade("writing", "入")).toBe(false);
  });

  it("should accept a stored synonym", async () => {
    const synonyms = new Set(["human being"]);
    expect(await grade("understanding", "Human Being", { synonyms })).toBe(
      true,
    );
  });

  it("should not consult the checker when a synonym already matched", async () => {
    const checker = checkerReturning(false);
    await grade("understanding", "human being", {
      synonyms: new Set(["human being"]),
      checker,
    });

    expect(checker.checkSimilarity).not.toHaveBeenCalled();
  });

  it("should fall through to the checker when no synonym matches", async () => {
    const checker = checkerReturning(true);
    expect(await grade("understanding", "a person", { checker })).toBe(true);
    expect(checker.checkSimilarity).toHaveBeenCalledOnce();
  });

  // The checker owns its own normalisation, and the two are not the same.
  it("should hand the checker the raw answer, not the normalised one", async () => {
    const checker = checkerReturning(true);
    await grade("understanding", "  A Person  ", { checker });

    expect(checker.checkSimilarity).toHaveBeenCalledWith(
      "  A Person  ",
      CARD.translation,
    );
  });

  it("should throw when an understanding card has no translation to check", async () => {
    await expect(
      grade("understanding", "anything", {
        card: { ...CARD, translation: null },
      }),
    ).rejects.toThrow(CARD.id);
  });
});
