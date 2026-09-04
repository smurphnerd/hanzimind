import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";

import { schema } from "@/server/database/schema";
import { DeckService } from "../DeckService";
import type { PreparedVocabItem, VocabService } from "../VocabService";

type Insert = { table: unknown; values: Record<string, unknown>[] };

/**
 * A transaction that records what was inserted and answers the one select
 * createDeck makes inside it: the ids of the glyphs it is about to link.
 *
 * `attempted` holds every insert the body issued; `committed` holds them only
 * once the body has returned. Postgres discards a transaction's writes when its
 * body throws, and a fake that kept them would report a rollback as working no
 * matter what the code did — which is the exact defect this file has to be able
 * to see.
 *
 * `failInsertInto` makes one table reject, so a test can fail the create at a
 * chosen step rather than by stubbing the whole transaction away.
 */
const fakeTransaction = (
  rows: { id: string; vocabItem: string }[],
  failInsertInto?: unknown,
) => {
  const attempted: Insert[] = [];
  const committed: Insert[] = [];
  // The handle the body runs on, kept so a test can prove a write was handed
  // this transaction rather than the pool.
  const handles: unknown[] = [];

  const transaction = vi.fn(
    async (body: (tx: unknown) => Promise<string>): Promise<string> => {
      const tx = {
        insert: (table: unknown) => ({
          values: (
            values: Record<string, unknown> | Record<string, unknown>[],
          ) => {
            attempted.push({
              table,
              values: Array.isArray(values) ? values : [values],
            });

            const settled =
              table === failInsertInto
                ? Promise.reject(new Error("deadlock detected"))
                : Promise.resolve();

            return Object.assign(settled, {
              returning: () => Promise.resolve([{ id: "deck-1" }]),
              onConflictDoNothing: () => settled,
            });
          },
        }),
        select: () => ({
          from: () => ({ where: () => Promise.resolve(rows) }),
        }),
      };

      handles.push(tx);
      const result = await body(tx);
      committed.push(...attempted);
      return result;
    },
  );

  return { transaction, attempted, committed, handles };
};

/**
 * Stands in for the real insertVocabItems by writing through whatever executor
 * it is handed, so the transaction fake records which connection the rows went
 * to. The ON CONFLICT the real one emits is pinned in VocabService.test.ts.
 */
type FakeExecutor = {
  insert: (table: unknown) => { values: (values: unknown[]) => Promise<unknown> };
};

const passthroughInsert = () =>
  vi.fn<VocabService["insertVocabItems"]>(async (executor, prepared) => {
    if (prepared.length === 0) {
      return;
    }

    await (executor as unknown as FakeExecutor)
      .insert(schema.vocabItems)
      .values(prepared);
  });

const preparedRow = (vocabItem: string): PreparedVocabItem => ({
  vocabItem,
  translation: "friend",
  pinyin: "péng yǒu",
  vocabType: "compound",
  audioUrl: "https://cdn.example/audio/abc.mp3",
});

const serviceWith = (
  vocabService: Partial<VocabService>,
  rows: { id: string; vocabItem: string }[] = [],
  failInsertInto?: unknown,
) => {
  const fake = fakeTransaction(rows, failInsertInto);
  const deckService = new DeckService({
    logger: { warn: vi.fn() },
    database: { transaction: fake.transaction },
    vocabService,
  } as unknown as ConstructorParameters<typeof DeckService>[0]);

  return { deckService, ...fake };
};

const create = (deckService: DeckService, vocabList: string[]) =>
  deckService.createDeck("user-1", {
    deckName: "HSK 1",
    description: "",
    vocabList,
  });

const vocabItemInserts = (inserts: Insert[]) =>
  inserts.filter((insert) => insert.table === schema.vocabItems);

describe("createDeck", () => {
  it("links every glyph the closure resolved, and marks the ones nobody asked for", async () => {
    const { deckService, committed } = serviceWith(
      {
        getStoredVocabItems: vi.fn(async () => [
          { vocabItem: "你好", disabled: false },
        ]),
        prepareVocabItems: vi.fn(async () => []),
        insertVocabItems: passthroughInsert(),
        resolveConstituentClosure: vi.fn(async () => ["你好", "你", "亻"]),
      },
      [
        { id: "v1", vocabItem: "你好" },
        { id: "v2", vocabItem: "你" },
        { id: "v3", vocabItem: "亻" },
      ],
    );

    const result = await create(deckService, ["你好"]);

    expect(result.id).toBe("deck-1");
    const membership = committed.find(
      (i) => i.table === schema.deckVocabItems,
    );
    expect(membership?.values).toEqual([
      { deckId: "deck-1", vocabItemId: "v1", isConstituent: false },
      { deckId: "deck-1", vocabItemId: "v2", isConstituent: true },
      { deckId: "deck-1", vocabItemId: "v3", isConstituent: true },
    ]);
  });

  // A disabled glyph is stored but cannot be taught. It has to come back in
  // `skipped` — that list is the only thing the create form tells the learner
  // about items it left out.
  it("reports a disabled glyph as skipped and leaves it out of the deck", async () => {
    const prepareVocabItems = vi.fn(async () => []);
    const { deckService, committed } = serviceWith(
      {
        getStoredVocabItems: vi.fn(async () => [
          { vocabItem: "丶", disabled: true },
          { vocabItem: "你好", disabled: false },
        ]),
        prepareVocabItems,
        insertVocabItems: passthroughInsert(),
        resolveConstituentClosure: vi.fn(async () => ["你好"]),
      },
      [{ id: "v1", vocabItem: "你好" }],
    );

    const result = await create(deckService, ["丶", "你好"]);

    expect(result.skipped).toEqual(["丶"]);
    // Resolving it would throw: there is nothing to build a single character from.
    expect(prepareVocabItems).toHaveBeenCalledWith([]);
    expect(
      committed.find((i) => i.table === schema.deckVocabItems)?.values,
    ).toEqual([{ deckId: "deck-1", vocabItemId: "v1", isConstituent: false }]);
  });

  it("creates a glyph that is genuinely absent, and does not skip it", async () => {
    const prepareVocabItems = vi.fn(async () => [preparedRow("朋友")]);
    const { deckService } = serviceWith(
      {
        getStoredVocabItems: vi.fn(async () => []),
        prepareVocabItems,
        insertVocabItems: passthroughInsert(),
        resolveConstituentClosure: vi.fn(async () => ["朋友"]),
      },
      [{ id: "v1", vocabItem: "朋友" }],
    );

    const result = await create(deckService, ["朋友"]);

    expect(prepareVocabItems).toHaveBeenCalledWith(["朋友"]);
    expect(result.skipped).toEqual([]);
  });

  // The words a create invents have to be written by the deck's own transaction,
  // because that is the only thing a later failure can take back.
  it("writes the words it invented on the deck's own transaction", async () => {
    const insertVocabItems = passthroughInsert();
    const { deckService, committed, handles } = serviceWith(
      {
        getStoredVocabItems: vi.fn(async () => []),
        prepareVocabItems: vi.fn(async () => [preparedRow("朋友")]),
        insertVocabItems,
        resolveConstituentClosure: vi.fn(async () => ["朋友"]),
      },
      [{ id: "v1", vocabItem: "朋友" }],
    );

    await create(deckService, ["朋友"]);

    // The handle it was given is the one the transaction body runs on, not the
    // pool — a rollback cannot reach a row written on any other connection.
    const [executor] = insertVocabItems.mock.calls[0] ?? [];
    expect(executor).toBe(handles[0]);
    expect(vocabItemInserts(committed)).toHaveLength(1);
  });

  // Finding 35. The create used to insert the learner's words on the pool before
  // the transaction opened, so a failure here left them in the shared dictionary
  // with no deck to reach them from and no way for the learner to remove them.
  it("discards the words it invented when a later step of the create fails", async () => {
    const { deckService, attempted, committed } = serviceWith(
      {
        getStoredVocabItems: vi.fn(async () => []),
        prepareVocabItems: vi.fn(async () => [preparedRow("朋友")]),
        insertVocabItems: passthroughInsert(),
        resolveConstituentClosure: vi.fn(async () => ["朋友"]),
      },
      [{ id: "v1", vocabItem: "朋友" }],
      schema.deckVocabItems,
    );

    await expect(create(deckService, ["朋友"])).rejects.toThrow(
      "deadlock detected",
    );

    // It got as far as writing them, so the rollback is what saves us rather
    // than the create having stopped early.
    expect(vocabItemInserts(attempted)).toHaveLength(1);
    expect(committed).toEqual([]);
  });

  // The other half, and the one that turns a leak into data loss if it is wrong.
  // A word the dictionary already holds is never prepared, so it is never
  // written, so the rollback has nothing of it to undo — no filter decides this.
  it("never writes a row for a word the dictionary already holds", async () => {
    const { deckService, attempted } = serviceWith(
      {
        getStoredVocabItems: vi.fn(async () => [
          { vocabItem: "你好", disabled: false },
        ]),
        prepareVocabItems: vi.fn(async () => []),
        insertVocabItems: passthroughInsert(),
        resolveConstituentClosure: vi.fn(async () => ["你好"]),
      },
      [{ id: "v1", vocabItem: "你好" }],
      schema.deckVocabItems,
    );

    await expect(create(deckService, ["你好"])).rejects.toThrow(
      "deadlock detected",
    );

    expect(vocabItemInserts(attempted)).toEqual([]);
  });

  // Pins the phase order. The transaction must stay closed until every external
  // call has returned, so a failure on item 30 of 50 leaves no half-built deck
  // and no transaction held open across a network call. Moving the DeepL and
  // speech-synthesis calls inside the transaction is the obvious way to make the
  // create atomic and the wrong one: the pool holds ten connections.
  it("writes nothing when speech synthesis fails", async () => {
    const { deckService, transaction } = serviceWith({
      getStoredVocabItems: vi.fn(async () => []),
      prepareVocabItems: vi.fn(async () => {
        throw new Error("Edge TTS closed the connection");
      }),
      insertVocabItems: passthroughInsert(),
      resolveConstituentClosure: vi.fn(async () => []),
    });

    await expect(create(deckService, ["你好", "谢谢"])).rejects.toThrow(
      "Edge TTS closed the connection",
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});

/**
 * Runs a read method against a driver that answers nothing and records the SQL
 * drizzle actually generated, with its bind values.
 *
 * A query builder will happily assemble SQL that Postgres then rejects, and
 * neither typecheck nor a mocked query builder can tell.
 */
const captureSql = async (run: (service: DeckService) => Promise<unknown>) => {
  const statements: { text: string; values: unknown[] }[] = [];
  const database = drizzle({
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

  const service = new DeckService({
    logger: { warn: vi.fn() },
    database,
    vocabService: {},
  } as unknown as ConstructorParameters<typeof DeckService>[0]);

  await run(service);

  return statements;
};

describe("browseDeck", () => {
  // The wildcard has to be neutralised in the bind value, not in the SQL: the
  // pattern reaches Postgres as a parameter, so an unescaped "%" there is what
  // made a search for it match every deck.
  it("sends a wildcard search as a literal pattern", async () => {
    const [countQuery] = await captureSql((service) =>
      service.browseDeck({ search: " % ", page: 1, perPage: 50 }),
    );

    expect(countQuery?.values).toEqual(["%\\%%", "%\\%%"]);
  });

  // Match the id as a trailing sort key, not merely as text after "order by":
  // the learner subquery mentions "decks"."id" itself, so a looser pattern is
  // satisfied by an ORDER BY that has no tie-break at all.
  const tieBreak = /order by [\s\S]*,\s*"decks"\."id"/;

  it("breaks ties on the listing, so paging cannot drop a deck", async () => {
    const [, listing] = await captureSql((service) =>
      service.browseDeck({ page: 1, perPage: 50 }),
    );

    expect(listing?.text).toMatch(tieBreak);
  });

  it("breaks ties on the saved-deck listing too", async () => {
    const [, listing] = await captureSql((service) =>
      service.getUserDecks({ userId: "user-1", page: 1, perPage: 50 }),
    );

    expect(listing?.text).toMatch(tieBreak);
  });
});
