import { describe, it, expect } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type * as schema from "@/server/database/schema";
import { VocabService, memoryAidOrder, toVocabItemDto } from "../VocabService";

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
    const dto = toVocabItemDto(
      row({ vocabItem: "人", vocabType: "character" }),
    );
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

/**
 * A database that answers a level query the way Postgres would: it reads the
 * glyphs the condition actually asks for, through drizzle's own renderer, so the
 * test can tell "asked for the right frontier" from "asked for everything".
 */
const fakeDatabase = (corpus: Row[]) => {
  const asked: string[][] = [];

  // The hierarchy is four levels deep, so a walk that has run this many level
  // queries is not going to stop. Failing here rather than letting it spin keeps
  // a broken termination guard a red test instead of a hung run.
  const LEVEL_LIMIT = 20;

  const database = {
    select: () => ({
      from: () => ({
        where: (condition: SQL) => {
          const { sql: text, params } = new PgDialect().sqlToQuery(condition);
          const glyphs = params.filter(
            (p): p is string => typeof p === "string",
          );
          asked.push(glyphs);
          if (asked.length > LEVEL_LIMIT) {
            throw new Error(
              `level query ran ${asked.length} times; the walk is not terminating`,
            );
          }

          // Honour the filter the query asked for rather than applying one of
          // its own: a fake that always hides disabled rows keeps the test green
          // after the production filter is deleted. Matching the column rather
          // than one spelling of the predicate, so `ne(disabled, true)` — the
          // same behaviour written differently — does not read as its absence.
          const excludesDisabled = /"disabled"/.test(text);

          return Promise.resolve(
            corpus.filter(
              (r) =>
                glyphs.includes(r.vocabItem) &&
                !(excludesDisabled && r.disabled),
            ),
          );
        },
      }),
    }),
  };

  return { database, asked };
};

const vocabServiceWith = (
  corpus: Row[],
  words: Record<string, string[]> = {},
) => {
  const fake = fakeDatabase(corpus);
  const vocabService = new VocabService({
    logger: { warn: () => {} },
    database: fake.database,
    translator: { cutSentence: (s: string) => words[s] ?? Array.from(s) },
  } as unknown as ConstructorParameters<typeof VocabService>[0]);

  return { vocabService, ...fake };
};

describe("resolveConstituentClosure", () => {
  // 你好 → 你 好 → 亻 (尔 disabled) 女 子
  const corpus = [
    row({ vocabItem: "你好", vocabType: "compound" }),
    row({ vocabItem: "你", vocabType: "character", decomposition: "⿰亻尔" }),
    row({ vocabItem: "好", vocabType: "character", decomposition: "⿰女子" }),
    row({ vocabItem: "亻", vocabType: "component" }),
    row({ vocabItem: "尔", vocabType: "component", disabled: true }),
    row({ vocabItem: "女", vocabType: "component" }),
    row({ vocabItem: "子", vocabType: "component" }),
  ];

  it("returns the item and everything under it", async () => {
    const { vocabService } = vocabServiceWith(corpus);
    const closure = await vocabService.resolveConstituentClosure(["你好"]);

    expect(closure.sort()).toEqual(
      ["你好", "你", "好", "亻", "女", "子"].sort(),
    );
  });

  it("leaves out a disabled part", async () => {
    const { vocabService } = vocabServiceWith(corpus);
    expect(
      await vocabService.resolveConstituentClosure(["你好"]),
    ).not.toContain("尔");
  });

  // The whole point of the change: the walk this replaced ran two queries per
  // glyph visited, so a fifty-word deck cost several hundred.
  it("costs one query per level, not per glyph", async () => {
    const { vocabService, asked } = vocabServiceWith(corpus);
    await vocabService.resolveConstituentClosure(["你好"]);

    expect(asked).toEqual([["你好"], ["你", "好"], ["亻", "尔", "女", "子"]]);
  });

  it("scales with depth, not with the size of the request", async () => {
    const wide = Array.from({ length: 50 }, (_, i) => `词${i}`);
    const { vocabService, asked } = vocabServiceWith(
      wide
        .map((vocabItem) =>
          row({ vocabItem, vocabType: "compound", decomposition: null }),
        )
        .concat([row({ vocabItem: "词", vocabType: "component" })]),
      {},
    );

    const closure = await vocabService.resolveConstituentClosure(wide);

    expect(asked).toHaveLength(2);
    expect(closure).toEqual(expect.arrayContaining([...wide, "词"]));
  });

  // The walk this replaced resolved parts through getVocabItem, which throws for
  // a glyph with no row, so one such part aborted the whole deck. Nothing in the
  // corpus does this today; the level query simply returns no row for it.
  it("drops a part the dictionary does not carry instead of throwing", async () => {
    const { vocabService } = vocabServiceWith([
      row({ vocabItem: "你", vocabType: "character", decomposition: "⿰亻尔" }),
      row({ vocabItem: "亻", vocabType: "component" }),
    ]);

    await expect(
      vocabService.resolveConstituentClosure(["你"]),
    ).resolves.toEqual(["你", "亻"]);
  });

  // Rows are editable, so a cycle is reachable even though the corpus is a DAG.
  // Without the resolved-set guard this walks forever; the fake's level limit is
  // what turns that into a failure rather than a hang.
  it("terminates on a decomposition cycle", async () => {
    const { vocabService } = vocabServiceWith([
      row({ vocabItem: "甲", vocabType: "character", decomposition: "⿰乙丙" }),
      row({ vocabItem: "乙", vocabType: "character", decomposition: "⿰甲丙" }),
      row({ vocabItem: "丙", vocabType: "character", decomposition: "⿰丙丙" }),
    ]);

    const closure = await vocabService.resolveConstituentClosure(["甲"]);
    expect(closure.sort()).toEqual(["丙", "乙", "甲"].sort());
  });

  // A sentence splits into words, not characters. Resolving it through the
  // decomposition relation instead would drop every compound in it — 喜欢 would
  // never become a deck row, only 喜 and 欢 separately.
  it("cuts a sentence into words", async () => {
    const sentence = "我喜欢你";
    const { vocabService } = vocabServiceWith(
      [
        row({ vocabItem: sentence, vocabType: "sentence" }),
        row({ vocabItem: "我", vocabType: "character", decomposition: null }),
        row({ vocabItem: "喜欢", vocabType: "compound" }),
        row({ vocabItem: "喜", vocabType: "character", decomposition: null }),
        row({ vocabItem: "欢", vocabType: "character", decomposition: null }),
        row({ vocabItem: "你", vocabType: "character", decomposition: null }),
      ],
      { [sentence]: ["我", "喜欢", "你"] },
    );

    expect(await vocabService.resolveConstituentClosure([sentence])).toContain(
      "喜欢",
    );
  });
});
