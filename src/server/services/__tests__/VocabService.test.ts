import { describe, it, expect } from "vitest";

import type * as schema from "@/server/database/schema";
import { memoryAidOrder, toVocabItemDto } from "../VocabService";

type Row = typeof schema.vocabItems.$inferSelect;

/**
 * A row as production actually holds it: 亻 carries the reading the dictionary
 * copied off 人, because the component work never wiped those columns. 97 of
 * the 107 live components look like this.
 */
const row = (overrides: Partial<Row> = {}): Row =>
  ({
    id: "id-1",
    vocabItem: "亻",
    vocabType: "component",
    script: "both",
    pinyin: "rén",
    audioUrl: "https://cdn.example/audio/20154.mp3",
    phonetic: false,
    translation: "man, person; people",
    disabled: false,
    defaultMemoryAidId: "aid-9",
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
    ...overrides,
  }) as Row;

describe("toVocabItemDto", () => {
  // Regression: the search list returned the raw row while the entry page went
  // through readingOf, so the same glyph was silent in one place and offered a
  // working play button for 人's audio in the other.
  it("hides a plain component's borrowed reading", () => {
    const dto = toVocabItemDto(row());
    expect(dto.pinyin).toBe("");
    expect(dto.audioUrl).toBe("");
  });

  it("still reports the flag, which the blanked reading can no longer carry", () => {
    expect(toVocabItemDto(row()).phonetic).toBe(false);
    expect(toVocabItemDto(row({ phonetic: true })).phonetic).toBe(true);
  });

  it("serves a phonetic component's own reading", () => {
    const dto = toVocabItemDto(
      row({ vocabItem: "艮", pinyin: "gěn", phonetic: true }),
    );
    expect(dto.pinyin).toBe("gěn");
    expect(dto.audioUrl).not.toBe("");
  });

  it("leaves a character alone", () => {
    const dto = toVocabItemDto(row({ vocabItem: "人", vocabType: "character" }));
    expect(dto.pinyin).toBe("rén");
    expect(dto.audioUrl).not.toBe("");
  });

  it("drops the admin-only columns a select() sweeps up", () => {
    const dto = toVocabItemDto(row());
    expect(dto).not.toHaveProperty("disabled");
    expect(dto).not.toHaveProperty("defaultMemoryAidId");
  });
});

describe("memoryAidOrder", () => {
  // Regression: a bare `sql`0`` fallback in ORDER BY is read by Postgres as
  // "order by the 0th select column", which is out of range and throws — so
  // every memory-aid list with no starred default (i.e. almost all of them)
  // failed to load. The fix is to emit no rank term at all in that case.
  it("orders by usage only when there is no default", () => {
    expect(memoryAidOrder(null)).toHaveLength(1);
    expect(memoryAidOrder(undefined)).toHaveLength(1);
    expect(memoryAidOrder("")).toHaveLength(1);
  });

  it("adds a rank term ahead of usage when a default is set", () => {
    expect(memoryAidOrder("aid-123")).toHaveLength(2);
  });
});
