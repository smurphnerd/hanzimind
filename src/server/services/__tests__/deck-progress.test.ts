import { describe, it, expect } from "vitest";

import {
  emptyStudyProgress,
  STUDY_TYPES,
  type StudyProgressDto,
  type StudyType,
} from "@/definitions/definitions";
import {
  summariseDeckProgress,
  type StudiableItem,
} from "@/server/study-rules";
import { enabledStudyTypes, progressByItem } from "../StudyService";

const ALL_TYPES: StudyType[] = [
  "reading",
  "listening",
  "understanding",
  "writing",
];

const NOW = new Date("2026-01-01T00:00:00Z");
const OVERDUE = new Date("2025-12-31T00:00:00Z");
const SCHEDULED = new Date("2026-01-02T00:00:00Z");

const GATE_LEVEL = 2;

/**
 * Levels and due times named by study type. The factory folds them into the
 * total `progress` map the rollup reads, so a case still says only the one
 * thing it is about.
 */
type Levels = Partial<Record<StudyType, number>>;
type Due = Partial<Record<StudyType, Date | null>>;
type Overrides = Partial<StudiableItem> & { levels?: Levels; due?: Due };

function progressWith(levels: Levels, due: Due): StudyProgressDto {
  const progress = emptyStudyProgress();
  for (const type of STUDY_TYPES) {
    progress[type] = { level: levels[type] ?? 0, nextAt: due[type] ?? null };
  }
  return progress;
}

function item({ levels, due, ...overrides }: Overrides = {}): StudiableItem {
  return {
    vocabItem: "人",
    vocabType: "character",
    pinyin: "rén",
    translation: "man, person; people",
    audioUrl: "audio/4eba.mp3",
    phonetic: false,
    decomposition: "？",
    seen: false,
    progress: progressWith(levels ?? {}, due ?? {}),
    ...overrides,
  };
}

/**
 * A bound form. The borrowed reading is present, as it is on 97 production rows;
 * `phonetic: false` is what makes meaning the only thing askable.
 */
const component = (overrides: Overrides = {}) =>
  item({
    vocabItem: "亻",
    vocabType: "component",
    pinyin: "rén",
    audioUrl: "audio/4ebb.mp3",
    phonetic: false,
    translation: "person radical",
    decomposition: null,
    ...overrides,
  });

const summarise = (
  items: StudiableItem[],
  enabledStudyTypes: StudyType[] = ALL_TYPES,
) =>
  summariseDeckProgress({
    deckId: "deck-1",
    items,
    enabledStudyTypes,
    gateLevel: GATE_LEVEL,
    now: NOW,
  });

describe("summariseDeckProgress", () => {
  describe("unstudiable items", () => {
    it("should keep an item with no servable study type out of byStage", () => {
      const progress = summarise([component({ translation: null })]);
      expect(progress.byStage).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it("should report it as unstudiable", () => {
      const progress = summarise([component({ translation: null })]);
      expect(progress.unstudiable).toBe(1);
    });

    it("should exclude it from total", () => {
      const progress = summarise([component({ translation: null }), item()]);
      expect(progress.total).toBe(1);
    });

    it("should keep byStage summing to total", () => {
      const progress = summarise([
        component({ translation: null }),
        item({ vocabItem: "人" }),
        item({ vocabItem: "大", seen: true, levels: { reading: 2 } }),
      ]);
      const bucketed = progress.byStage.reduce((a, b) => a + b, 0);
      expect(bucketed).toBe(progress.total);
    });

    it("should not count it as new or locked", () => {
      const progress = summarise([component({ translation: null })]);
      expect([progress.newAvailable, progress.locked]).toEqual([0, 0]);
    });

    it("should treat every item as unstudiable when no study types are enabled", () => {
      const progress = summarise([item()], []);
      expect(progress.unstudiable).toBe(1);
    });
  });

  describe("bucketing", () => {
    it("should bucket a component by its understanding level alone", () => {
      // The trap: a plain minimum over every enabled type would read this
      // component's untouchable readingLevel of 0 and report it as not started.
      const progress = summarise([
        component({ seen: true, levels: { understanding: 3 } }),
      ]);
      expect(progress.byStage[3]).toBe(1);
    });

    it("should bucket a character by its weakest level", () => {
      const progress = summarise([
        item({
          seen: true,
          levels: { reading: 4, listening: 2, understanding: 5, writing: 3 },
        }),
      ]);
      expect(progress.byStage[2]).toBe(1);
    });

    it("should ignore levels of disabled study types", () => {
      const progress = summarise(
        [item({ seen: true, levels: { reading: 4, listening: 0 } })],
        ["reading"],
      );
      expect(progress.byStage[4]).toBe(1);
    });

    it("should always return six stages", () => {
      expect(summarise([]).byStage).toHaveLength(6);
    });
  });

  describe("seen", () => {
    it("should count an item answered wrong as seen", () => {
      const progress = summarise([item({ seen: true })]);
      expect(progress.seen).toBe(1);
    });

    it("should still bucket that item as not started", () => {
      const progress = summarise([item({ seen: true })]);
      expect(progress.byStage[0]).toBe(1);
    });

    it("should not count an unseen item", () => {
      expect(summarise([item({ seen: false })]).seen).toBe(0);
    });
  });

  describe("dueNow", () => {
    it("should count a seen item whose servable type is overdue", () => {
      const progress = summarise([
        item({
          seen: true,
          due: {
            reading: OVERDUE,
            listening: SCHEDULED,
            understanding: SCHEDULED,
            writing: SCHEDULED,
          },
        }),
      ]);
      expect(progress.dueNow).toBe(1);
    });

    it("should not count a seen item with everything scheduled ahead", () => {
      const progress = summarise([
        item({
          seen: true,
          due: {
            reading: SCHEDULED,
            listening: SCHEDULED,
            understanding: SCHEDULED,
            writing: SCHEDULED,
          },
        }),
      ]);
      expect(progress.dueNow).toBe(0);
    });

    it("should treat a never-scheduled type as due", () => {
      expect(summarise([item({ seen: true })]).dueNow).toBe(1);
    });

    it("should ignore a due time on a type the item cannot be served for", () => {
      // 亻 carries a stale readingNextAt from before components became
      // meaning-only; a reading card can never be produced for it.
      const progress = summarise([
        component({
          seen: true,
          due: { reading: OVERDUE, understanding: SCHEDULED },
        }),
      ]);
      expect(progress.dueNow).toBe(0);
    });

    it("should not count unseen items", () => {
      expect(summarise([item({ seen: false })]).dueNow).toBe(0);
    });
  });

  describe("new and locked", () => {
    it("should count an unseen item with no constituents as available", () => {
      expect(summarise([item()]).newAvailable).toBe(1);
    });

    it("should count an unseen item behind an immature part as locked", () => {
      const progress = summarise([
        component({ seen: true, levels: { understanding: GATE_LEVEL - 1 } }),
        item({ vocabItem: "什", decomposition: "⿰亻十" }),
      ]);
      expect(progress.locked).toBe(1);
    });

    it("should release it once the part reaches the gate", () => {
      const progress = summarise([
        component({ seen: true, levels: { understanding: GATE_LEVEL } }),
        item({ vocabItem: "什", decomposition: "⿰亻十" }),
      ]);
      expect(progress.newAvailable).toBe(1);
    });

    it("should not let a part that can never be served gate its dependants", () => {
      // A glossless component can never advance, so gating on it would lock 什
      // permanently — the deadlock this codebase already shipped once.
      const progress = summarise([
        component({ translation: null }),
        item({ vocabItem: "什", decomposition: "⿰亻十" }),
      ]);
      expect(progress.locked).toBe(0);
    });
  });

  it("should return a zero shape for an empty deck", () => {
    expect(summarise([])).toEqual({
      deckId: "deck-1",
      total: 0,
      unstudiable: 0,
      seen: 0,
      dueNow: 0,
      newAvailable: 0,
      locked: 0,
      byStage: [0, 0, 0, 0, 0, 0],
    });
  });
});

describe("enabledStudyTypes", () => {
  const off = {
    readingEnabled: false,
    listeningEnabled: false,
    understandingEnabled: false,
    writingEnabled: false,
  };

  it("should return nothing when the learner has every mode off", () => {
    expect(enabledStudyTypes(off)).toEqual([]);
  });

  it("should return only the modes that are on", () => {
    expect(
      enabledStudyTypes({
        ...off,
        listeningEnabled: true,
        writingEnabled: true,
      }),
    ).toEqual(["listening", "writing"]);
  });

  // The order decides which type wins a tie: selectNextCard walks this array
  // and picks with a strict `<`, so the earliest at the lowest level is served.
  it("should keep reading, listening, understanding, writing in that order", () => {
    expect(
      enabledStudyTypes({
        readingEnabled: true,
        listeningEnabled: true,
        understandingEnabled: true,
        writingEnabled: true,
      }),
    ).toEqual(["reading", "listening", "understanding", "writing"]);
  });
});

describe("progressByItem", () => {
  const row = (
    vocabItemId: string,
    studyType: StudyType,
    level: number,
    nextAt: Date | null = null,
  ) => ({ vocabItemId, studyType, level, nextAt });

  it("should key each item's progress by its id", () => {
    const byItem = progressByItem([row("v1", "reading", 3, SCHEDULED)]);
    expect(byItem.get("v1")?.reading).toEqual({
      level: 3,
      nextAt: SCHEDULED,
    });
  });

  it("should fill the types with no row from emptyStudyProgress", () => {
    // The whole contract of the sparse table: a type nobody has answered is
    // level 0, due now — the same thing the four nullable columns used to say
    // with a default and a null.
    const byItem = progressByItem([row("v1", "reading", 3, SCHEDULED)]);
    expect(byItem.get("v1")).toEqual({
      ...emptyStudyProgress(),
      reading: { level: 3, nextAt: SCHEDULED },
    });
  });

  it("should keep a level of zero that carries a due time", () => {
    // An answer got wrong leaves the level at 0 WITH a nextAt, which is not
    // the same as never answered and must survive the round trip.
    const byItem = progressByItem([row("v1", "writing", 0, OVERDUE)]);
    expect(byItem.get("v1")?.writing).toEqual({ level: 0, nextAt: OVERDUE });
  });

  it("should keep separate items apart", () => {
    const byItem = progressByItem([
      row("v1", "reading", 1),
      row("v2", "reading", 2),
    ]);
    expect([
      byItem.get("v1")?.reading.level,
      byItem.get("v2")?.reading.level,
    ]).toEqual([1, 2]);
  });

  it("should return no entry for an item with no rows", () => {
    expect(progressByItem([]).get("v1")).toBeUndefined();
  });
});
