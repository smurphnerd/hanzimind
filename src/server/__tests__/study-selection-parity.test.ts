import { describe, expect, it } from "vitest";

import type { StudyType } from "@/definitions/definitions";
import { CONSTITUENT_GATE_LEVEL } from "@/server/constants";
import {
  VOCAB_TYPE_PRIORITY,
  canStudy,
  isUnlocked,
  selectNextCard,
  servableStudyTypes,
  type ScorableItem,
} from "../study-rules";

/**
 * A differential test, not a golden one.
 *
 * A recorded sequence generated from the new code proves the new code is
 * stable, which is not the question this refactor has to answer. So trunk's
 * candidate builder and sort are copied in below, verbatim from
 * `StudyService.getNextVocabItem` at 113805e, and both implementations run over
 * the same deck with the same seeded tiebreak. If the extraction changed the
 * served order, these disagree.
 *
 * The recorded unit is `glyph:studyType`, not the glyph. The type pick walks
 * `enabledStudyTypes` in order with a strict `<`, so reordering that array
 * would change which card a learner sees while leaving every glyph identical.
 */

/** Deterministic, so both sides draw the same tiebreaks in the same order. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Trunk's selection, copied without edits apart from the indentation and the
 * `Math.random()` calls, which are the seeded draw here so the two sides are
 * comparable at all. Do not tidy this: its value is that it is not this PR's
 * code.
 */
function selectAsTrunkDid<T extends ScorableItem>(
  vocabItems: readonly T[],
  enabledStudyTypes: readonly StudyType[],
  now: Date,
  random: () => number,
): { item: T; studyType: StudyType | "new" } | null {
  const byVocabItem = new Map(vocabItems.map((i) => [i.vocabItem, i]));

  // Filter and score vocab items for each enabled study type
  const candidates = vocabItems
    .map((item) => {
      // Calculate shared scoring metrics
      const vocabTypePriority = VOCAB_TYPE_PRIORITY[item.vocabType];

      const decompositionLength =
        item.vocabType === "character" && item.decomposition
          ? item.decomposition.length
          : 999;

      // Unseen items are introductions — only offer them once their
      // constituents are known well enough.
      if (!item.seen) {
        if (
          !isUnlocked(
            item,
            byVocabItem,
            enabledStudyTypes,
            CONSTITUENT_GATE_LEVEL,
          )
        ) {
          return null;
        }
        // An intro card is pointless if nothing about it can be quizzed.
        if (servableStudyTypes(item, enabledStudyTypes).length === 0) {
          return null;
        }
        return {
          ...item,
          selectedStudyType: "new" as const,
          isNew: true,
          minLevel: -1,
          vocabTypePriority,
          decompositionLength,
          randomTiebreaker: random(),
        };
      }

      // For seen items, find the study type with lowest level that's due
      let selectedStudyType: StudyType | null = null;
      let minLevel = Infinity;

      for (const studyType of enabledStudyTypes) {
        if (!canStudy(item, studyType)) continue;

        const level = item[`${studyType}Level`] ?? 0;
        const nextAt = item[`${studyType}NextAt`];
        const isDue = nextAt === null || nextAt <= now;

        if (isDue && level < minLevel) {
          minLevel = level;
          selectedStudyType = studyType;
        }
      }

      // Skip items with no due study types
      if (selectedStudyType === null) return null;

      return {
        ...item,
        selectedStudyType,
        isNew: false,
        minLevel,
        vocabTypePriority,
        decompositionLength,
        randomTiebreaker: random(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (candidates.length === 0) {
    // Nothing due — the caller renders the session-complete screen.
    return null;
  }

  // Sort by:
  // 1. Due reviews before brand-new items, so a big deck doesn't front-load
  //    every introduction before you review anything (Anki's
  //    "show new cards after reviews").
  // 2. Minimum level (ascending - lower level first)
  // 3. Vocab type priority (ascending - components first, then characters)
  // 4. Decomposition length (ascending - shorter first for characters)
  // 5. Random tiebreaker
  candidates.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? 1 : -1;
    if (a.minLevel !== b.minLevel) return a.minLevel - b.minLevel;
    if (a.vocabTypePriority !== b.vocabTypePriority)
      return a.vocabTypePriority - b.vocabTypePriority;
    if (a.decompositionLength !== b.decompositionLength)
      return a.decompositionLength - b.decompositionLength;
    return a.randomTiebreaker - b.randomTiebreaker;
  });

  if (candidates.length === 0) return null;
  const selected = candidates[0];
  return {
    item: selected as unknown as T,
    studyType: selected.selectedStudyType,
  };
}

const ALL_TYPES: StudyType[] = [
  "reading",
  "listening",
  "understanding",
  "writing",
];
const NOW = new Date("2026-01-01T00:00:00.000Z");
const MINUTE = 60 * 1000;

/**
 * A deck built to exercise every ordering key, not just to look varied. An
 * earlier fixture generated its rows arithmetically and a mutation check caught
 * it: dropping `decompositionLength`, and even drawing the tiebreak inside the
 * comparator, both passed, because no two candidates ever reached those keys.
 *
 * So the ties are explicit. `沐`/`河` tie on everything above decomposition
 * length and differ on it. `休`/`床` tie on all four deterministic keys, so only
 * the tiebreak separates them.
 */
function buildDeck(): ScorableItem[] {
  const due = new Date(NOW.getTime() - MINUTE);
  const later = new Date(NOW.getTime() + MINUTE);

  const row = (
    vocabItem: string,
    vocabType: ScorableItem["vocabType"],
    opts: {
      decomposition?: string | null;
      seen: boolean;
      level: number;
      due: boolean;
      phonetic?: boolean;
    },
  ): ScorableItem => {
    const mute = vocabType === "component" && !opts.phonetic;
    const nextAt = opts.seen ? (opts.due ? due : later) : null;
    return {
      vocabItem,
      vocabType,
      decomposition: opts.decomposition ?? null,
      pinyin: mute ? "" : "x",
      translation: "gloss",
      audioUrl: mute ? "" : "a.mp3",
      phonetic: opts.phonetic ?? false,
      seen: opts.seen,
      readingLevel: opts.level,
      listeningLevel: opts.level,
      understandingLevel: opts.level,
      writingLevel: opts.level,
      readingNextAt: nextAt,
      listeningNextAt: nextAt,
      understandingNextAt: nextAt,
      writingNextAt: nextAt,
    };
  };

  return [
    // Components: meaning-only, and one phonetic, which is servable for three
    // types rather than one.
    row("亻", "component", { seen: true, level: 0, due: true }),
    row("氵", "component", { seen: true, level: 1, due: true }),
    row("艮", "component", { seen: true, level: 0, due: true, phonetic: true }),
    row("木", "component", { seen: false, level: 0, due: false }),

    // Two characters tying on isNew, minLevel and type priority, separated
    // only by how long their decomposition is.
    row("沐", "character", {
      decomposition: "⿰氵木",
      seen: true,
      level: 2,
      due: true,
    }),
    row("河", "character", {
      decomposition: "⿰氵⿱丁口",
      seen: true,
      level: 2,
      due: true,
    }),

    // Two characters tying on all four deterministic keys. Only the tiebreak
    // can order these, which is what makes an inline random detectable.
    row("休", "character", {
      decomposition: "⿰亻木",
      seen: true,
      level: 3,
      due: true,
    }),
    row("床", "character", {
      decomposition: "⿸广木",
      seen: true,
      level: 3,
      due: true,
    }),

    // A not-yet-due review, an introduction, and the two larger types.
    row("很", "character", {
      decomposition: "⿰彳艮",
      seen: true,
      level: 1,
      due: false,
    }),
    row("人", "character", { seen: false, level: 0, due: false }),
    row("你好", "compound", { seen: true, level: 2, due: true }),
    row("我很好", "sentence", { seen: true, level: 2, due: true }),
  ];
}

/** Answering advances the served type, which is what makes the next pick move. */
function markAnswered(
  deck: ScorableItem[],
  picked: { item: ScorableItem; studyType: StudyType | "new" },
) {
  const row = deck.find((item) => item.vocabItem === picked.item.vocabItem)!;
  if (picked.studyType === "new") {
    row.seen = true;
    return;
  }
  row[`${picked.studyType}Level`] = (row[`${picked.studyType}Level`] ?? 0) + 1;
  row[`${picked.studyType}NextAt`] = new Date(NOW.getTime() + 10 * MINUTE);
}

function sequenceOf(
  pick: (
    deck: ScorableItem[],
    random: () => number,
  ) => { item: ScorableItem; studyType: StudyType | "new" } | null,
  seed: number,
  steps: number,
): string[] {
  const random = mulberry32(seed);
  const deck = buildDeck();
  const served: string[] = [];

  for (let i = 0; i < steps; i++) {
    const picked = pick(deck, random);
    if (!picked) {
      served.push("nothing-due");
      break;
    }
    served.push(`${picked.item.vocabItem}:${picked.studyType}`);
    markAnswered(deck, picked);
  }
  return served;
}

describe("selectNextCard serves the sequence trunk served", () => {
  const head = (deck: ScorableItem[], random: () => number) =>
    selectNextCard(deck, {
      enabledStudyTypes: ALL_TYPES,
      gateLevel: CONSTITUENT_GATE_LEVEL,
      now: NOW,
      tiebreak: random,
    });

  const trunk = (deck: ScorableItem[], random: () => number) =>
    selectAsTrunkDid(deck, ALL_TYPES, NOW, random);

  for (const seed of [1, 7, 42, 1337, 90210]) {
    it(`should match trunk over twenty answers, seed ${seed}`, () => {
      expect(sequenceOf(head, seed, 20)).toEqual(sequenceOf(trunk, seed, 20));
    });
  }

  it("should serve something rather than nothing, so the comparison has teeth", () => {
    expect(sequenceOf(head, 1, 20)[0]).not.toBe("nothing-due");
  });

  it("should serve a due review before an introduction", () => {
    const sequence = sequenceOf(head, 1, 20);
    const firstNew = sequence.findIndex((entry) => entry.endsWith(":new"));
    const lastDue = sequence.findLastIndex(
      (entry) => entry !== "nothing-due" && !entry.endsWith(":new"),
    );

    if (firstNew !== -1 && lastDue !== -1) expect(firstNew).toBeGreaterThan(0);
  });
});
