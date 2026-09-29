import type { StudyType } from "@/definitions/definitions";
import type { ITranslationChecker } from "@/server/services/TranslationChecker";
import {
  INCORRECT_INTERVAL,
  LEVEL_INTERVALS,
  MAX_LEVEL,
  REQUIRE_PINYIN_TONES,
} from "@/server/constants";
import { pinyinMatches } from "@/lib/pinyin";

/** Where one answer leaves the item. */
export interface Schedule {
  nextLevel: number;
  nextAt: Date;
}

/**
 * The columns grading reads, and nothing else. `id` is here only so the
 * missing-translation error names the same id it always did.
 */
export interface GradableCard {
  id: string;
  vocabItem: string;
  pinyin: string;
  /** Also accepted on reading and listening cards; see the schema column. */
  otherReadings: string[];
  translation: string | null;
}

/** No stored synonyms, allocated once rather than per answer. */
export const NO_SYNONYMS: ReadonlySet<string> = new Set();

/**
 * Whether two translations say exactly the same thing, word for word: the same
 * set of comma/semicolon alternatives, ignoring case, spacing and their order.
 *
 * Deliberately exact. A writing card shows one item's whole translation, and
 * another deck item is an equally right answer only when nothing in that prompt
 * could tell the two apart — 苹 and 苹果 are both "apple". Sharing a single
 * alternative is not enough: 衣 includes "clothes", but 衣服's prompt asks for
 * the word, and accepting a part for the whole would teach the wrong answer.
 */
export function sameMeaning(a: string | null, b: string | null): boolean {
  const alternatives = (text: string | null) =>
    new Set(
      (text ?? "")
        .split(/[;,]/)
        .map((part) => part.replace(/\s+/g, " ").trim().toLowerCase())
        .filter(Boolean),
    );
  const left = alternatives(a);
  const right = alternatives(b);
  return (
    left.size > 0 &&
    left.size === right.size &&
    [...left].every((part) => right.has(part))
  );
}

/**
 * Where one answer leaves the item.
 *
 * The level and the interval are returned together because the interval is
 * indexed by the level held BEFORE the answer. Split into two functions, a
 * caller would compose `nextReviewAt(nextLevel(l))` and push every schedule one
 * step further out, with no type to catch it.
 *
 * A level outside 0 to 5 lands on the ceiling, which is what the six-case
 * switch this replaces did through `case 5:` falling into `default:`. Clamping
 * instead would send a negative level to the ten-minute interval, which the
 * switch never did. Unreachable either way: the column is a non-null integer
 * defaulting to 0 and only this rule's caller writes it.
 */
export function nextReviewAt(
  currentLevel: number,
  correct: boolean,
  now: Date,
): Schedule {
  if (!correct) {
    return {
      nextLevel: 0,
      nextAt: new Date(now.getTime() + INCORRECT_INTERVAL),
    };
  }

  const inRange =
    Number.isInteger(currentLevel) &&
    currentLevel >= 0 &&
    currentLevel < MAX_LEVEL;
  const level = inRange ? currentLevel : MAX_LEVEL;

  return {
    nextLevel: inRange ? level + 1 : MAX_LEVEL,
    nextAt: new Date(now.getTime() + LEVEL_INTERVALS[level]),
  };
}

/**
 * Whether the answer is right.
 *
 * Async but not impure: it reads no database, no clock and no module state
 * beyond REQUIRE_PINYIN_TONES. The checker is a parameter because the semantic
 * one runs an embedding model, and because injecting it is what makes "a stored
 * synonym is accepted before the checker is consulted" observable.
 *
 * Assumes `canStudy(item, studyType)` has already passed, and deliberately
 * cannot re-derive it: `GradableCard` carries no `phonetic` and no `vocabType`.
 * The reading and listening branches compare against the raw `pinyin` column,
 * which for most components holds a reading borrowed from the character they
 * abbreviate, so the caller's guard is what keeps those out. See the caller.
 */
export async function gradeAnswer(args: {
  card: GradableCard;
  studyType: StudyType;
  answer: string;
  synonyms: ReadonlySet<string>;
  /**
   * Other items in the same deck whose translation is word for word this
   * card's (see sameMeaning). A writing card is right for any of them, because
   * its prompt cannot tell them apart.
   */
  equivalentWritings: ReadonlySet<string>;
  checker: ITranslationChecker;
}): Promise<boolean> {
  const { card, studyType, answer, synonyms, equivalentWritings, checker } =
    args;
  // Any standard reading of the character is right: the card shows it alone.
  const matchesAReading = () =>
    [card.pinyin, ...card.otherReadings].some((reading) =>
      pinyinMatches(answer, reading, { requireTones: REQUIRE_PINYIN_TONES }),
    );

  switch (studyType) {
    case "reading":
      return matchesAReading();

    case "listening":
      return matchesAReading() || answer.trim() === card.vocabItem.trim();

    case "understanding": {
      // Only the answer is normalised. `addSynonym` already stores the trimmed
      // lowercase form, and the query this replaces compared the stored column
      // raw, so normalising both sides would start matching rows that predate
      // that rule.
      const normalized = answer.trim().toLowerCase();
      if (normalized && synonyms.has(normalized)) return true;

      if (!card.translation) {
        throw new Error(
          `Vocab item ${card.id} has no translation to check against`,
        );
      }
      // The raw answer, not the normalised one: the checker owns its own
      // normalisation and the two are not the same. No threshold either, so
      // the checker keeps applying its own default.
      return checker.checkSimilarity(answer, card.translation);
    }

    case "writing":
      return (
        answer.trim() === card.vocabItem.trim() ||
        equivalentWritings.has(answer.trim())
      );
  }
}
