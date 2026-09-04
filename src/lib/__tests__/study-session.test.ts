import { describe, expect, it } from "vitest";

import type {
  StudyType,
  UserVocabItemDto,
  VocabItemStudyDto,
} from "@/definitions/definitions";
import {
  initialStudySession,
  levelFor,
  studySessionReducer,
  type StudySessionAction,
  type StudySessionState,
  type SubmitAnswerResult,
} from "@/lib/study-session";

function readingCard(id = "card-1"): VocabItemStudyDto {
  return {
    id,
    vocabItem: "女",
    vocabType: "character",
    studyType: "reading",
  };
}

function introCard(id = "intro-1"): VocabItemStudyDto {
  return {
    ...answeredItem(id),
    studyType: "new",
  };
}

function answeredItem(id = "card-1"): UserVocabItemDto {
  return {
    id,
    vocabItem: "女",
    translation: "woman",
    pinyin: "nǚ",
    vocabType: "character",
    script: "both",
    audioUrl: "audio/5973.mp3",
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
    userId: "learner",
    username: "learner",
    seen: true,
    readingLevel: 3,
    listeningLevel: 2,
    understandingLevel: 1,
    writingLevel: 0,
    memoryAidId: null,
    memoryAid: null,
    readingNextAt: null,
    listeningNextAt: null,
    understandingNextAt: null,
    writingNextAt: null,
    constituents: [],
  };
}

function response(
  overrides: Partial<SubmitAnswerResult> = {},
): SubmitAnswerResult {
  return {
    correct: true,
    userVocabItem: answeredItem(),
    nextVocabItem: readingCard("card-2"),
    ...overrides,
  };
}

/** The one transition out of `loading`, which is how the page boots. */
function opened(vocabItem: VocabItemStudyDto | null): StudySessionState {
  return studySessionReducer(initialStudySession, {
    type: "loaded",
    vocabItem,
  });
}

describe("studySessionReducer", () => {
  describe("loaded", () => {
    it("should show the first card when the deck has one due", () => {
      expect(opened(readingCard())).toEqual({
        phase: "card",
        card: readingCard(),
      });
    });

    it("should go to empty, not complete, when the deck has nothing due", () => {
      expect(opened(null)).toEqual({ phase: "empty" });
    });

    it("should throw when the session has already loaded", () => {
      expect(() =>
        studySessionReducer(opened(readingCard()), {
          type: "loaded",
          vocabItem: readingCard("card-2"),
        }),
      ).toThrow(/"loaded" is not legal while "card"/);
    });
  });

  describe("answered", () => {
    it("should show the result for a graded card", () => {
      const state = studySessionReducer(opened(readingCard()), {
        type: "answered",
        answer: "nv3",
        result: response({ correct: false }),
      });

      expect(state).toEqual({
        phase: "result",
        graded: {
          studyType: "reading",
          answer: "nv3",
          surrendered: false,
          correct: false,
          level: 3,
          item: answeredItem(),
        },
        next: readingCard("card-2"),
      });
    });

    it("should read the level of the study type that was answered", () => {
      const writingCard: VocabItemStudyDto = {
        id: "card-1",
        translation: "woman",
        vocabType: "character",
        studyType: "writing",
      };

      const state = studySessionReducer(
        { phase: "card", card: writingCard },
        { type: "answered", answer: "女", result: response() },
      );

      expect(state).toMatchObject({ graded: { level: 0 } });
    });

    it("should skip the result screen for an intro card", () => {
      const state = studySessionReducer(opened(introCard()), {
        type: "answered",
        answer: "",
        result: response(),
      });

      expect(state).toEqual({ phase: "card", card: readingCard("card-2") });
    });

    it("should complete when an intro card was the last one", () => {
      const state = studySessionReducer(opened(introCard()), {
        type: "answered",
        answer: "",
        result: response({ nextVocabItem: null }),
      });

      expect(state).toEqual({ phase: "complete" });
    });

    it("should throw while a result is already showing", () => {
      const showing = studySessionReducer(opened(readingCard()), {
        type: "answered",
        answer: "nv3",
        result: response(),
      });

      expect(() =>
        studySessionReducer(showing, {
          type: "answered",
          answer: "nv3",
          result: response(),
        }),
      ).toThrow(/"answered" is not legal while "result"/);
    });
  });

  describe("gaveUp", () => {
    it("should show the answer with no typed answer to accept", () => {
      const state = studySessionReducer(opened(readingCard()), {
        type: "gaveUp",
        result: response({ correct: false }),
      });

      expect(state).toMatchObject({
        phase: "result",
        graded: { surrendered: true, answer: "", correct: false },
      });
    });

    it("should skip the result screen for an intro card, like answered", () => {
      const state = studySessionReducer(opened(introCard()), {
        type: "gaveUp",
        result: response(),
      });

      expect(state).toEqual({ phase: "card", card: readingCard("card-2") });
    });

    it("should throw when no card is showing", () => {
      expect(() =>
        studySessionReducer(opened(null), {
          type: "gaveUp",
          result: response(),
        }),
      ).toThrow(/"gaveUp" is not legal while "empty"/);
    });
  });

  describe("next", () => {
    it("should show the card the grade arrived with", () => {
      const showing = studySessionReducer(opened(readingCard()), {
        type: "answered",
        answer: "nv3",
        result: response(),
      });

      expect(studySessionReducer(showing, { type: "next" })).toEqual({
        phase: "card",
        card: readingCard("card-2"),
      });
    });

    it("should complete when the grade arrived with no next card", () => {
      const showing = studySessionReducer(opened(readingCard()), {
        type: "answered",
        answer: "nv3",
        result: response({ nextVocabItem: null }),
      });

      expect(studySessionReducer(showing, { type: "next" })).toEqual({
        phase: "complete",
      });
    });

    it("should throw while a card is showing", () => {
      expect(() =>
        studySessionReducer(opened(readingCard()), { type: "next" }),
      ).toThrow(/"next" is not legal while "card"/);
    });

    it("should throw once the session is complete", () => {
      const complete = studySessionReducer(
        studySessionReducer(opened(readingCard()), {
          type: "answered",
          answer: "nv3",
          result: response({ nextVocabItem: null }),
        }),
        { type: "next" },
      );

      expect(() => studySessionReducer(complete, { type: "next" })).toThrow(
        /"next" is not legal while "complete"/,
      );
    });
  });

  describe("every phase rejects what it cannot do", () => {
    const phases: StudySessionState[] = [
      initialStudySession,
      opened(null),
      opened(readingCard()),
      studySessionReducer(opened(readingCard()), {
        type: "answered",
        answer: "nv3",
        result: response(),
      }),
      studySessionReducer(opened(introCard()), {
        type: "answered",
        answer: "",
        result: response({ nextVocabItem: null }),
      }),
    ];

    const legal: Record<
      StudySessionState["phase"],
      StudySessionAction["type"][]
    > = {
      loading: ["loaded"],
      empty: [],
      card: ["answered", "gaveUp"],
      result: ["next"],
      complete: [],
    };

    const actions: StudySessionAction[] = [
      { type: "loaded", vocabItem: readingCard() },
      { type: "answered", answer: "nv3", result: response() },
      { type: "gaveUp", result: response() },
      { type: "next" },
    ];

    for (const state of phases) {
      for (const action of actions) {
        const allowed = legal[state.phase].includes(action.type);
        it(`should ${allowed ? "accept" : "throw on"} ${action.type} while ${state.phase}`, () => {
          const run = () => studySessionReducer(state, action);
          if (allowed) expect(run).not.toThrow();
          else expect(run).toThrow(/study session/);
        });
      }
    }
  });
});

describe("levelFor", () => {
  const cases: [StudyType, number][] = [
    ["reading", 3],
    ["listening", 2],
    ["understanding", 1],
    ["writing", 0],
  ];

  for (const [studyType, level] of cases) {
    it(`should read ${studyType} off its own column`, () => {
      expect(levelFor(studyType, answeredItem())).toBe(level);
    });
  }
});
