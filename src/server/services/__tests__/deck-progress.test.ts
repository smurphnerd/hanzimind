import { describe, it, expect } from "vitest";

import type { StudyType } from "@/definitions/definitions";
import {
  summariseDeckProgress,
  type ProgressRollupItem,
} from "../StudyService";

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

function item(overrides: Partial<ProgressRollupItem> = {}): ProgressRollupItem {
  return {
    vocabItem: "人",
    vocabType: "character",
    pinyin: "rén",
    translation: "man, person; people",
    audioUrl: "audio/4eba.mp3",
    decomposition: "？",
    seen: false,
    readingLevel: 0,
    listeningLevel: 0,
    understandingLevel: 0,
    writingLevel: 0,
    readingNextAt: null,
    listeningNextAt: null,
    understandingNextAt: null,
    writingNextAt: null,
    ...overrides,
  };
}

/** A bound form: no reading, no audio — meaning is the only thing askable. */
const component = (overrides: Partial<ProgressRollupItem> = {}) =>
  item({
    vocabItem: "亻",
    vocabType: "component",
    pinyin: "",
    audioUrl: "",
    translation: "person radical",
    decomposition: null,
    ...overrides,
  });

const summarise = (
  items: ProgressRollupItem[],
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
        item({ vocabItem: "大", seen: true, readingLevel: 2 }),
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
        component({ seen: true, understandingLevel: 3 }),
      ]);
      expect(progress.byStage[3]).toBe(1);
    });

    it("should bucket a character by its weakest level", () => {
      const progress = summarise([
        item({
          seen: true,
          readingLevel: 4,
          listeningLevel: 2,
          understandingLevel: 5,
          writingLevel: 3,
        }),
      ]);
      expect(progress.byStage[2]).toBe(1);
    });

    it("should ignore levels of disabled study types", () => {
      const progress = summarise(
        [item({ seen: true, readingLevel: 4, listeningLevel: 0 })],
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
          readingNextAt: OVERDUE,
          listeningNextAt: SCHEDULED,
          understandingNextAt: SCHEDULED,
          writingNextAt: SCHEDULED,
        }),
      ]);
      expect(progress.dueNow).toBe(1);
    });

    it("should not count a seen item with everything scheduled ahead", () => {
      const progress = summarise([
        item({
          seen: true,
          readingNextAt: SCHEDULED,
          listeningNextAt: SCHEDULED,
          understandingNextAt: SCHEDULED,
          writingNextAt: SCHEDULED,
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
          readingNextAt: OVERDUE,
          understandingNextAt: SCHEDULED,
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
        component({ seen: true, understandingLevel: GATE_LEVEL - 1 }),
        item({ vocabItem: "什", decomposition: "⿰亻十" }),
      ]);
      expect(progress.locked).toBe(1);
    });

    it("should release it once the part reaches the gate", () => {
      const progress = summarise([
        component({ seen: true, understandingLevel: GATE_LEVEL }),
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
