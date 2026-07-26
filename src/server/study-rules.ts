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
 * Whether this item can produce an answerable card of the given type.
 *
 * Components are meaning-only. A bound form has no pronunciation of its own —
 * the dictionary gives 亻 the same "rén" as 人 — so reading and listening cards
 * are unanswerable, and you cannot type 亻 on a pinyin IME, so writing is out
 * too. What is left is recognising the shape and knowing what it means.
 */
export function canStudy(item: QuizzableItem, type: StudyType): boolean {
  if (item.vocabType === "component") {
    return type === "understanding" && hasTranslation(item);
  }

  switch (type) {
    case "reading":
      return hasPinyin(item);
    case "listening":
      return hasPinyin(item) && !!item.audioUrl;
    case "understanding":
      return hasTranslation(item);
    case "writing":
      // You type the characters, which every non-component item has.
      return true;
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
 * instead is what caused the deadlock: a component can never be served for
 * reading, so its readingLevel is pinned at 0, and a gate reading that minimum
 * never opens no matter how much the learner studies.
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
 * Components have none — the database stores them blank — but blanking here too
 * means a row that predates the backfill, or one added by hand, still cannot
 * leak a borrowed pronunciation to the client.
 */
export function readingOf(item: QuizzableItem): {
  pinyin: string;
  audioUrl: string;
} {
  if (item.vocabType === "component") return { pinyin: "", audioUrl: "" };

  return { pinyin: item.pinyin, audioUrl: item.audioUrl };
}

/**
 * Narrows an item's type for a card that depends on pronunciation or writing.
 *
 * canStudy already restricts components to `understanding`, so reaching here
 * with one means the selection logic regressed. Throwing makes that loud instead
 * of shipping an unanswerable card, and it gives the DTOs the narrower type they
 * now require.
 */
export function pronounceableType(
  item: QuizzableItem,
  studyType: StudyType | "new",
): Exclude<VocabType, "component"> {
  if (item.vocabType === "component") {
    throw new Error(
      `A ${studyType} card was selected for component ${item.vocabItem}, which has no reading`,
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
