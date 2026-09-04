import type {
  StudyType,
  UserVocabItemDto,
  VocabItemStudyDto,
} from "@/definitions/definitions";

/**
 * The study session as a state machine.
 *
 * The page used to hold ten independent `useState` values — the current card,
 * `showingResult`, `isCorrect`, `newLevel`, `userVocabItem`, `isCompleted`,
 * `lastAnswer`, `lastStudyType` — and every combination of them was
 * representable. Nothing stopped a result screen rendering with
 * `userVocabItem` still null (a graded answer for a card that never arrived),
 * or with `lastStudyType` from the card before it. The union below makes each
 * of those unspellable: the data a phase needs lives *inside* that phase and
 * nowhere else, so a `result` without its answered item does not type-check.
 *
 * Illegal transitions throw rather than returning the state unchanged. A
 * silent no-op here is how a session wedges: `next` arriving while a card is
 * showing would leave the learner staring at a card whose Next button does
 * nothing, with no trace of why.
 */
export type StudySessionState =
  | { phase: "loading" }
  /** The deck had nothing due when the session opened. Terminal. */
  | { phase: "empty" }
  | { phase: "card"; card: VocabItemStudyDto }
  | {
      phase: "result";
      graded: GradedAnswer;
      /**
       * Fetched with the grade, in the same round trip, and held here until
       * the learner presses Next. Keeping it inside the result is what makes
       * "showing a result" and "which card comes after it" one decision
       * instead of two states that can disagree.
       */
      next: VocabItemStudyDto | null;
    }
  /** Every card in the session is answered. Terminal. */
  | { phase: "complete" };

/**
 * A graded answer, as the result screen needs it.
 *
 * `studyType` is `StudyType`, never `"new"`: an intro card is not graded, so
 * it can never reach this shape. That is the second illegal state the machine
 * rules out — the old page carried `StudyType | "new" | null` into the result
 * card and branched on it there.
 */
export interface GradedAnswer {
  studyType: StudyType;
  /** What the learner typed. Empty when they gave up. */
  answer: string;
  surrendered: boolean;
  correct: boolean;
  /** The level this study type sits at after the answer. */
  level: number;
  item: UserVocabItemDto;
}

/** The `study.submitAnswer` response, as the reducer consumes it. */
export interface SubmitAnswerResult {
  correct: boolean;
  userVocabItem: UserVocabItemDto;
  nextVocabItem: VocabItemStudyDto | null;
}

export type StudySessionAction =
  /** The session's first card, or null when the deck has nothing due. */
  | { type: "loaded"; vocabItem: VocabItemStudyDto | null }
  | { type: "answered"; answer: string; result: SubmitAnswerResult }
  | { type: "gaveUp"; result: SubmitAnswerResult }
  /** Leave the result screen for whatever the server sent with it. */
  | { type: "next" };

export const initialStudySession: StudySessionState = { phase: "loading" };

const LEVEL_FIELD = {
  reading: "readingLevel",
  listening: "listeningLevel",
  understanding: "understandingLevel",
  writing: "writingLevel",
} as const satisfies Record<StudyType, keyof UserVocabItemDto>;

/** The level `studyType` sits at on `item`, which is the only one worth showing. */
export function levelFor(studyType: StudyType, item: UserVocabItemDto): number {
  return item[LEVEL_FIELD[studyType]] ?? 0;
}

function advance(next: VocabItemStudyDto | null): StudySessionState {
  return next === null ? { phase: "complete" } : { phase: "card", card: next };
}

function illegal(state: StudySessionState, action: StudySessionAction): never {
  throw new Error(
    `study session: "${action.type}" is not legal while "${state.phase}"`,
  );
}

export function studySessionReducer(
  state: StudySessionState,
  action: StudySessionAction,
): StudySessionState {
  switch (action.type) {
    case "loaded": {
      if (state.phase !== "loading") illegal(state, action);
      // A deck with nothing due and a deck the learner just finished are
      // different things and say different things to the learner. Splitting
      // them by where they were reached from is what keeps them apart.
      return action.vocabItem === null
        ? { phase: "empty" }
        : { phase: "card", card: action.vocabItem };
    }

    case "answered":
    case "gaveUp": {
      if (state.phase !== "card") illegal(state, action);
      const { card } = state;

      // An intro card has nothing to be right or wrong about and no level to
      // move, so it goes straight on. This rule lives here and only here —
      // when it lived in the mutation callback, every consumer of the result
      // had to carry a `"new"` case it could never actually receive.
      if (card.studyType === "new") return advance(action.result.nextVocabItem);

      return {
        phase: "result",
        graded: {
          studyType: card.studyType,
          answer: action.type === "gaveUp" ? "" : action.answer,
          surrendered: action.type === "gaveUp",
          correct: action.result.correct,
          level: levelFor(card.studyType, action.result.userVocabItem),
          item: action.result.userVocabItem,
        },
        next: action.result.nextVocabItem,
      };
    }

    case "next": {
      if (state.phase !== "result") illegal(state, action);
      return advance(state.next);
    }
  }
}
