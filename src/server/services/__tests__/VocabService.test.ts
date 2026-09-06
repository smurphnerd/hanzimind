import { describe, it, expect } from "vitest";
import type { SQL } from "drizzle-orm";
import type { Executor } from "@/server/database/database";
import { PgDialect } from "drizzle-orm/pg-core";

import type * as schema from "@/server/database/schema";
import { drizzle } from "drizzle-orm/node-postgres";

import { AdminService } from "../AdminService";
import {
  VocabService,
  memoryAidOrder,
  toVocabItemDto,
  type PreparedVocabItem,
} from "../VocabService";

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

  // The study session's introduction card and its result card both build their
  // DTO from this mapper now. They used to hand-copy twenty fields each, which
  // is how the drift above happened in the first place, and a component with a
  // borrowed reading is exactly what it costs when they diverge.
  it("blanks the borrowed reading on the path the study card takes", () => {
    const dto = toVocabItemDto(row({ pinyin: "rén", audioUrl: "a.mp3" }));

    expect(dto.pinyin).toBe("");
    expect(dto.audioUrl).toBe("");
  });

  it("keeps a phonetic component's own reading on that same path", () => {
    const dto = toVocabItemDto(
      row({ phonetic: true, pinyin: "gěn", audioUrl: "a.mp3" }),
    );

    expect(dto.pinyin).toBe("gěn");
    expect(dto.audioUrl).toBe("a.mp3");
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

/**
 * The decomposition index is cached for five minutes, which is right for a
 * corpus that only changes when an admin edits it — and wrong for the admin,
 * who is the one person watching for the edit to take effect.
 */
describe("decomposition index cache", () => {
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
  };

  const lane = () => {
    const corpus = [
      row({ vocabItem: "你", vocabType: "character", decomposition: "⿰亻尔" }),
      row({ vocabItem: "亻", vocabType: "component", decomposition: null }),
    ];
    let builds = 0;

    const database = {
      query: { vocabItems: { findFirst: async () => corpus[0] } },
      select: () => ({
        from: () => ({
          where: () => {
            builds += 1;
            return Promise.resolve(corpus);
          },
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({ returning: async () => [corpus[0]] }),
        }),
      }),
    };

    const vocabService = new VocabService({
      logger,
      database,
    } as unknown as ConstructorParameters<typeof VocabService>[0]);

    const adminService = new AdminService({
      logger,
      database,
      vocabService,
    } as unknown as ConstructorParameters<typeof AdminService>[0]);

    return { vocabService, adminService, builds: () => builds };
  };

  it("builds the index once and reuses it", async () => {
    const { vocabService, builds } = lane();

    await vocabService.getDecompositionGraph("你");
    await vocabService.getDecompositionGraph("你");

    expect(builds()).toBe(1);
  });

  it("rebuilds after the index is invalidated", async () => {
    const { vocabService, builds } = lane();

    await vocabService.getDecompositionGraph("你");
    vocabService.invalidateDecompositionIndex();
    await vocabService.getDecompositionGraph("你");

    expect(builds()).toBe(2);
  });

  // Without this an admin disables a glyph, opens its parent's graph, still
  // sees it, and has no way to tell a stale cache from an edit that failed.
  it("is invalidated by an admin update", async () => {
    const { vocabService, adminService, builds } = lane();

    await vocabService.getDecompositionGraph("你");
    await adminService.updateVocabItem({ id: "id-1", disabled: true });
    await vocabService.getDecompositionGraph("你");

    expect(builds()).toBe(2);
  });

  it("does not rebuild when the admin changed nothing", async () => {
    const { vocabService, adminService, builds } = lane();

    await vocabService.getDecompositionGraph("你");
    await adminService.updateVocabItem({ id: "id-1" });
    await vocabService.getDecompositionGraph("你");

    expect(builds()).toBe(1);
  });
});

/**
 * A VocabService whose slow half is a stub, over the same level-query fake.
 *
 * `resolved` records every glyph that reached DeepL and speech synthesis, which
 * is the only way to tell "did not need creating" from "created twice".
 */
const preparingServiceWith = (
  corpus: Row[],
  words: Record<string, string[]> = {},
) => {
  const fake = fakeDatabase(corpus);
  const resolved: string[] = [];

  const vocabService = new VocabService({
    logger: { warn: () => {} },
    database: {
      ...fake.database,
      // The guard the whole design rests on. Anything this method writes is
      // written outside the caller's transaction and so survives its rollback.
      insert: () => {
        throw new Error("prepareVocabItems wrote to the database");
      },
    },
    translator: {
      cutSentence: (s: string) => words[s] ?? [s],
      translateSentence: async (s: string) => {
        resolved.push(s);
        return `gloss of ${s}`;
      },
      getPinyin: (s: string) => `pinyin-${s}`,
    },
    tts: { getVocabAudio: async (s: string) => `https://cdn/${s}.mp3` },
  } as unknown as ConstructorParameters<typeof VocabService>[0]);

  return { vocabService, resolved, ...fake };
};

describe("prepareVocabItems", () => {
  // The whole reason the method exists. A create that fails after this point has
  // to be able to discard the words it invented, and it can only do that if they
  // were never written outside its transaction.
  it("writes nothing", async () => {
    const { vocabService } = preparingServiceWith([
      row({ vocabItem: "朋", vocabType: "character" }),
      row({ vocabItem: "友", vocabType: "character" }),
    ]);

    // The database this runs against throws on any insert, so returning at all
    // is the assertion.
    const prepared = await vocabService.prepareVocabItems(["朋友"]);

    expect(prepared.map((item) => item.vocabItem)).toEqual(["朋友"]);
  });

  it("resolves the glyph and everything it is written with", async () => {
    const { vocabService } = preparingServiceWith(
      [
        row({ vocabItem: "我", vocabType: "character" }),
        row({ vocabItem: "朋", vocabType: "character" }),
        row({ vocabItem: "友", vocabType: "character" }),
      ],
      { 我朋友: ["我", "朋友"] },
    );

    const prepared = await vocabService.prepareVocabItems(["我朋友"]);

    // The sentence, then the compound it cuts into. Its characters are already
    // in the dictionary, which is the only place characters ever come from.
    expect(prepared.map((item) => item.vocabItem)).toEqual(["我朋友", "朋友"]);
  });

  // The rows this returns are the only ones the create will write, so a glyph
  // the dictionary already holds has to be structurally absent from it. A
  // rollback that deleted by name instead would take another learner's row.
  it("leaves out a word the dictionary already holds", async () => {
    const { vocabService, resolved } = preparingServiceWith([
      row({ vocabItem: "你好", vocabType: "compound" }),
    ]);

    expect(await vocabService.prepareVocabItems(["你好"])).toEqual([]);
    expect(resolved).toEqual([]);
  });

  // A disabled row still owns its glyph. Preparing it would insert a duplicate,
  // which ON CONFLICT then silently drops, leaving the deck built around a row
  // the learner cannot be taught from.
  it("leaves out a disabled word, which still owns the glyph", async () => {
    const { vocabService } = preparingServiceWith([
      row({ vocabItem: "你好", vocabType: "compound", disabled: true }),
    ]);

    expect(await vocabService.prepareVocabItems(["你好"])).toEqual([]);
  });

  // Two words sharing a part used to be reconciled by the first one's INSERT
  // being visible to the second one's lookup. There are no inserts here to see,
  // so without the seen-set this pays DeepL twice and then hands the deck's
  // transaction two rows for one glyph.
  it("resolves a shared part once", async () => {
    const { vocabService, resolved } = preparingServiceWith(
      [
        row({ vocabItem: "我", vocabType: "character" }),
        row({ vocabItem: "你", vocabType: "character" }),
        row({ vocabItem: "好", vocabType: "character" }),
        row({ vocabItem: "吗", vocabType: "character" }),
      ],
      { 我你好: ["我", "你好"], 你好吗: ["你好", "吗"] },
    );

    const prepared = await vocabService.prepareVocabItems(["我你好", "你好吗"]);

    expect(prepared.filter((item) => item.vocabItem === "你好")).toHaveLength(
      1,
    );
    expect(resolved.filter((item) => item === "你好")).toHaveLength(1);
  });

  // Same reason resolveConstituentClosure batches: a fifty-word create used to
  // cost a lookup per glyph visited, and the levels are known up front.
  it("costs one lookup per level, not one per glyph", async () => {
    const wide = Array.from({ length: 50 }, (_, i) => `词${i}`);
    const { vocabService, asked } = preparingServiceWith([
      row({ vocabItem: "词", vocabType: "character" }),
      ...Array.from({ length: 10 }, (_, i) =>
        row({ vocabItem: String(i), vocabType: "character" }),
      ),
    ]);

    await vocabService.prepareVocabItems(wide);

    expect(asked).toHaveLength(2);
  });

  // The dictionary seed is the only source of single characters, so a compound
  // naming one the corpus lacks cannot be built. It has to fail the create
  // rather than store a character with no strokes, no radical and no etymology.
  it("refuses a single character the dictionary does not carry", async () => {
    const { vocabService } = preparingServiceWith([]);

    await expect(vocabService.prepareVocabItems(["朋"])).rejects.toThrow(
      "Cannot add vocab item with single character",
    );
  });
});

describe("insertVocabItems", () => {
  const captureInsert = async (prepared: PreparedVocabItem[]) => {
    const statements: { text: string; values: unknown[] }[] = [];
    const database = drizzle({
      // Matches getDatabase, so the column names in the rendered SQL are the
      // ones Postgres actually sees.
      casing: "snake_case",
      client: {
        query: (
          config: { text: string; values?: unknown[] },
          values: unknown[],
        ) => {
          statements.push({
            text: config.text,
            values: config.values ?? values ?? [],
          });

          return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
        },
      } as never,
    });

    const vocabService = new VocabService({
      logger: { warn: () => {} },
      database,
    } as unknown as ConstructorParameters<typeof VocabService>[0]);

    // A schema-less drizzle instance still renders the SQL, which is the whole
    // point here; only its generic parameter differs from the real one.
    await vocabService.insertVocabItems(
      database as unknown as Executor,
      prepared,
    );

    return statements;
  };

  const prepared: PreparedVocabItem = {
    vocabItem: "朋友",
    translation: "friend",
    pinyin: "péng yǒu",
    vocabType: "compound",
    audioUrl: "https://cdn/朋友.mp3",
  };

  // The whole of the concurrency answer. Two creates naming the same new word
  // both prepare it, because neither saw the other's row when it looked; the
  // second blocks on the first's uncommitted index entry and then does nothing,
  // so one row exists and both decks link to it. Without this the loser's
  // transaction dies on a unique violation and takes its deck with it.
  it("yields to a row a concurrent create already wrote", async () => {
    const [insert] = await captureInsert([prepared]);

    expect(insert?.text).toMatch(/on conflict .*do nothing/i);
    expect(insert?.text).toMatch(/"vocab_item"/);
  });

  // Not `.returning()`: that reports only the rows this statement wrote, so deck
  // membership built from it would drop the word the other create won the race
  // for. The membership read finds the row whoever inserted it.
  it("does not report which rows it wrote", async () => {
    const [insert] = await captureInsert([prepared]);

    expect(insert?.text).not.toMatch(/returning/i);
  });

  it("writes every prepared row in one statement", async () => {
    const statements = await captureInsert([
      prepared,
      { ...prepared, vocabItem: "谢谢" },
    ]);

    expect(statements).toHaveLength(1);
    expect(statements[0]?.values).toEqual(
      expect.arrayContaining(["朋友", "谢谢"]),
    );
  });

  // Two creates sharing two new words in opposite orders would each hold the
  // index entry the other is waiting for, and Postgres would kill one of them.
  // Any order both agree on fixes it; the glyph is the one they both have.
  it("takes its rows in an order every create agrees on", async () => {
    const forward = await captureInsert([
      { ...prepared, vocabItem: "谢谢" },
      { ...prepared, vocabItem: "朋友" },
    ]);
    const reverse = await captureInsert([
      { ...prepared, vocabItem: "朋友" },
      { ...prepared, vocabItem: "谢谢" },
    ]);

    // Only the glyphs: the rest of each row is a generated id and a timestamp.
    const glyphs = (statement?: { values: unknown[] }) =>
      statement?.values.filter((value) => value === "朋友" || value === "谢谢");

    expect(glyphs(forward[0])).toEqual(["朋友", "谢谢"]);
    expect(glyphs(reverse[0])).toEqual(["朋友", "谢谢"]);
  });

  it("issues no statement when there is nothing to write", async () => {
    expect(await captureInsert([])).toEqual([]);
  });
});
