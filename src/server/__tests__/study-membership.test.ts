import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

import type { UserVocabItemDto } from "@/definitions/definitions";
import type { Cradle } from "@/server/initialization";
import { studyRouter } from "@/server/endpoints/studyRouter";

const DECK_ID = "deck-hsk1";
const ITEM_ID = "item-in-the-deck";

const userVocabItem: UserVocabItemDto = {
  id: ITEM_ID,
  vocabItem: "人",
  translation: "man, person; people",
  pinyin: "rén",
  vocabType: "character",
  script: "both",
  audioUrl: "",
  phonetic: false,
  decomposition: null,
  etymologyHint: null,
  etymologyType: null,
  etymologyPhonetic: null,
  etymologySemantic: null,
  radical: null,
  strokes: null,
  strokeMedians: null,
  strokeMatches: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  userId: "learner-1",
  username: "learner",
  seen: true,
  readingLevel: 1,
  listeningLevel: 0,
  understandingLevel: 0,
  writingLevel: 0,
  memoryAidId: null,
  memoryAid: null,
  readingNextAt: null,
  listeningNextAt: null,
  understandingNextAt: null,
  writingNextAt: null,
  constituents: [],
};

function lane(offeredToThisLearner: boolean) {
  const studyService = {
    isStudyingItemInDeck: vi.fn(async () => offeredToThisLearner),
    // The router calls answerAndAdvance, which owns the order the three reads
    // used to run in. The guard still has to refuse before it.
    answerAndAdvance: vi.fn(async () => ({
      correct: true,
      userVocabItem,
      nextVocabItem: null,
    })),
    addSynonym: vi.fn(async () => undefined),
  };

  const context = {
    headers: new Headers(),
    requestId: "test-request-id",
    cradle: {
      logger: { error: vi.fn(), warn: vi.fn() },
      auth: {
        api: {
          getSession: async () => ({
            user: { id: "learner-1" },
            session: { id: "session-1" },
          }),
        },
      },
      studyService,
    } as unknown as Cradle,
  };

  return { studyService, context };
}

const answer = {
  deckId: DECK_ID,
  answer: {
    vocabItemId: ITEM_ID,
    studyType: "understanding",
    answer: "person",
  },
} as const;

describe("study writes are confined to a deck the learner studies", () => {
  describe("submitAnswer", () => {
    it("should reject an item the learner is not studying in that deck", async () => {
      const { studyService, context } = lane(false);

      await expect(
        call(studyRouter.submitAnswer, answer, { context }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(studyService.isStudyingItemInDeck).toHaveBeenCalledWith(
        "learner-1",
        DECK_ID,
        ITEM_ID,
      );
    });

    it("should not reach the service for an item the learner is not studying in that deck", async () => {
      const { studyService, context } = lane(false);

      await call(studyRouter.submitAnswer, answer, { context }).catch(
        () => undefined,
      );

      expect(studyService.answerAndAdvance).not.toHaveBeenCalled();
    });

    it("should grade an item the learner is studying in that deck", async () => {
      const { studyService, context } = lane(true);

      const result = await call(studyRouter.submitAnswer, answer, { context });

      expect(result.correct).toBe(true);
      expect(studyService.answerAndAdvance).toHaveBeenCalledOnce();
    });
  });

  describe("addSynonym", () => {
    const synonym = {
      deckId: DECK_ID,
      vocabItemId: ITEM_ID,
      synonym: "human",
    };

    it("should reject an item the learner is not studying in that deck", async () => {
      const { context } = lane(false);

      await expect(
        call(studyRouter.addSynonym, synonym, { context }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("should not store a synonym for an item outside the learner deck", async () => {
      const { studyService, context } = lane(false);

      await call(studyRouter.addSynonym, synonym, { context }).catch(
        () => undefined,
      );

      expect(studyService.addSynonym).not.toHaveBeenCalled();
    });

    it("should store a synonym for an item the learner is studying in that deck", async () => {
      const { studyService, context } = lane(true);

      await call(studyRouter.addSynonym, synonym, { context });

      expect(studyService.addSynonym).toHaveBeenCalledWith({
        userId: "learner-1",
        vocabItemId: ITEM_ID,
        synonym: "human",
      });
    });
  });
});

describe("StudyAnswerDto", () => {
  it("should ignore a userId a caller puts on the wire", async () => {
    const { studyService, context } = lane(true);

    const stale = {
      ...answer,
      answer: { ...answer.answer, userId: "someone-else" },
    } as unknown as typeof answer;

    await call(studyRouter.submitAnswer, stale, { context });

    expect(studyService.answerAndAdvance).toHaveBeenCalledWith({
      userId: "learner-1",
      deckId: DECK_ID,
      answer: {
        vocabItemId: ITEM_ID,
        studyType: "understanding",
        answer: "person",
      },
    });
  });
});
