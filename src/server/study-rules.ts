import type { StudyType, VocabType } from "@/definitions/definitions";
import { filterDecomposition } from "@/lib/decomposition";

/**
 * The pure decision logic behind card selection: what can be quizzed, what
 * counts as mastered, and what unlocks what.
 *
 * These were closures inside getNextVocabItem, which made them impossible to
 * test in isolation — and a gating bug that permanently locked items went
 * unnoticed as a result. Keep them pure and keep them covered.
 */

/**
 * What it takes to decide whether a card can be produced at all — no per-learner
 * state, so a plain vocabItems row satisfies it.
 */
export interface QuizzableItem {
  vocabItem: string;
  vocabType: VocabType;
  pinyin: string;
  translation: string | null;
  audioUrl: string;
  /**
   * Only meaningful on a component: whether its reading is its own and worth
   * teaching. See the column comment in schema.ts for why this is a flag rather
   * than "the pinyin is non-empty".
   */
  phonetic: boolean;
}

/** Adds the decomposition and per-learner progress that the gating rules read. */
export interface StudiableItem extends QuizzableItem {
  decomposition: string | null;
  /** Null when the learner has no progress row yet — the deck query left-joins it. */
  seen: boolean | null;
  readingLevel: number | null;
  listeningLevel: number | null;
  understandingLevel: number | null;
  writingLevel: number | null;
}

const hasPinyin = (item: QuizzableItem) =>
  // pinyin-pro hands the glyph straight back when it has no romanisation, which
  // would render a card whose answer is the prompt.
  !!item.pinyin && item.pinyin !== item.vocabItem;

const hasTranslation = (item: QuizzableItem) =>
  !!item.translation && item.translation.trim().length > 0;

/**
 * Whether a component's reading is one the learner should be taught.
 *
 * Most bound forms are semantic determinatives whose dictionary pinyin is
 * borrowed from the full character they abbreviate — 亻 is given 人's "rén" — and
 * plenty of rows still carry one, so the reading being present proves nothing.
 * Only the classification file's verdict does.
 */
const hasOwnReading = (item: QuizzableItem) =>
  item.vocabType !== "component" || item.phonetic;

/**
 * Whether this item can produce an answerable card of the given type.
 *
 * A phonetic component (艮 gěn behind 很, 跟, 根, 恨) is quizzed on reading and
 * listening like any character, because knowing its sound is the clue to the
 * whole series. Every other component is meaning-only.
 *
 * Writing is out for every component either way: no component can be produced
 * on a pinyin IME. It also needs a gloss, because the gloss *is* the prompt —
 * a writing card shows the English and asks for the characters, so a row
 * without one renders an empty question. 53 characters in the corpus have no
 * translation; none is in a deck today, which is the only reason this has never
 * been seen.
 */
export function canStudy(item: QuizzableItem, type: StudyType): boolean {
  switch (type) {
    case "reading":
      return hasOwnReading(item) && hasPinyin(item);
    case "listening":
      return hasOwnReading(item) && hasPinyin(item) && !!item.audioUrl;
    case "understanding":
      return hasTranslation(item);
    case "writing":
      // The answer is typed on a pinyin IME, which cannot produce a bound form.
      return item.vocabType !== "component" && hasTranslation(item);
  }
}

/** The enabled study types that this item can actually be quizzed on. */
export function servableStudyTypes(
  item: QuizzableItem,
  enabledStudyTypes: readonly StudyType[],
): StudyType[] {
  return enabledStudyTypes.filter((type) => canStudy(item, type));
}

/**
 * The item's weakest level across the types it can actually be quizzed on.
 *
 * Only servable types count. Taking the minimum over every *enabled* type
 * instead is what caused the deadlock: a meaning-only component can never be
 * served for reading, so its readingLevel is pinned at 0, and a gate reading
 * that minimum never opens no matter how much the learner studies.
 *
 * An item with nothing servable returns Infinity — it cannot be studied, so it
 * must never hold anything back. Callers should generally reject such items
 * before they reach a gate; see isUnlocked.
 */
export function weakestServableLevel(
  item: StudiableItem,
  enabledStudyTypes: readonly StudyType[],
): number {
  const servable = servableStudyTypes(item, enabledStudyTypes);
  if (servable.length === 0) return Infinity;

  return Math.min(...servable.map((type) => item[`${type}Level`] ?? 0));
}

/** The parts this item is built from, one level down. */
export function constituentsOf(
  item: Pick<StudiableItem, "vocabItem" | "vocabType" | "decomposition">,
): string[] {
  switch (item.vocabType) {
    // A component is the floor of the hierarchy — nothing gates it, so it is
    // always available and paces everything built on top of it.
    case "component":
      return [];
    case "character":
      // Disabled parts are filtered out of the deck query, so they are absent
      // from the dependency map and un-gate themselves below.
      return filterDecomposition(item.decomposition);
    default:
      // Compounds and sentences are gated on their characters.
      return Array.from(item.vocabItem);
  }
}

/**
 * Whether every prerequisite of this item is known well enough to introduce it.
 *
 * A dependency only gates when it is genuinely learnable here: it must be in
 * this deck, and it must have at least one servable study type. Anything else
 * would be an unclearable blocker.
 */
export function isUnlocked(
  item: StudiableItem,
  deps: ReadonlyMap<string, StudiableItem>,
  enabledStudyTypes: readonly StudyType[],
  gateLevel: number,
): boolean {
  return constituentsOf(item)
    .filter((part) => part !== item.vocabItem)
    .every((part) => {
      const dep = deps.get(part);

      // A part that isn't in this deck can't be learned here, so it can't gate.
      if (!dep) return true;

      // A part that can never be served can never be advanced past the gate.
      // Letting it gate would lock every dependant permanently.
      if (servableStudyTypes(dep, enabledStudyTypes).length === 0) return true;

      // No progress row yet counts as unseen.
      if (!dep.seen) return false;

      return weakestServableLevel(dep, enabledStudyTypes) >= gateLevel;
    });
}

/**
 * The reading to expose for an item.
 *
 * A component that is not phonetic has no reading of its own, but plenty of rows
 * still store one — the dictionary's, borrowed from the full character the form
 * abbreviates. Blanking here means such a row cannot leak 人's "rén" onto 亻
 * through a card, a deck preview or the dictionary, whatever is in the column.
 *
 * This is the counterpart of gating `canStudy` on the flag rather than on the
 * pinyin being present: the flag decides, and everything downstream sees a value
 * consistent with that decision.
 */
export function readingOf(item: QuizzableItem): {
  pinyin: string;
  audioUrl: string;
} {
  if (!hasOwnReading(item)) return { pinyin: "", audioUrl: "" };

  return { pinyin: item.pinyin, audioUrl: item.audioUrl };
}

/**
 * Narrows an item's type for a card the learner answers by typing the glyphs.
 *
 * canStudy already refuses `writing` for a component — a pinyin IME cannot
 * produce 亻 — so reaching here with one means the selection logic regressed.
 * Throwing makes that loud instead of shipping an unanswerable card, and it
 * gives the writing DTO the narrower type it requires.
 */
export function writableType(
  item: QuizzableItem,
  studyType: StudyType | "new",
): Exclude<VocabType, "component"> {
  if (item.vocabType === "component") {
    throw new Error(
      `A ${studyType} card was selected for component ${item.vocabItem}, which cannot be typed`,
    );
  }

  return item.vocabType;
}

/** Smallest first, so parts are always introduced before the things built from them. */
export const VOCAB_TYPE_PRIORITY: Record<VocabType, number> = {
  component: 0,
  character: 1,
  compound: 2,
  sentence: 3,
};
