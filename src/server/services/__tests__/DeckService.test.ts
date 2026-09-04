import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";

import { schema } from "@/server/database/schema";
import { DeckService } from "../DeckService";
import type { VocabService } from "../VocabService";

type Insert = { table: unknown; values: Record<string, unknown>[] };

/**
 * A transaction that records what was inserted and answers the one select
 * createDeck makes inside it: the ids of the glyphs it is about to link.
 */
const fakeTransaction = (rows: { id: string; vocabItem: string }[]) => {
  const inserts: Insert[] = [];

  const transaction = vi.fn(
    async (body: (tx: unknown) => Promise<string>): Promise<string> => {
      const tx = {
        insert: (table: unknown) => ({
          values: (
            values: Record<string, unknown> | Record<string, unknown>[],
          ) => {
            inserts.push({
              table,
              values: Array.isArray(values) ? values : [values],
            });

            return Object.assign(Promise.resolve(), {
              returning: () => Promise.resolve([{ id: "deck-1" }]),
            });
          },
        }),
        select: () => ({
          from: () => ({ where: () => Promise.resolve(rows) }),
        }),
      };

      return body(tx);
    },
  );

  return { transaction, inserts };
};

const serviceWith = (
  vocabService: Partial<VocabService>,
  rows: { id: string; vocabItem: string }[] = [],
) => {
  const fake = fakeTransaction(rows);
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

describe("createDeck", () => {
  it("links every glyph the closure resolved, and marks the ones nobody asked for", async () => {
    const { deckService, inserts } = serviceWith(
      {
        getStoredVocabItems: vi.fn(async () => [
          { vocabItem: "你好", disabled: false },
        ]),
        addVocabItem: vi.fn(async () => {}),
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
    const membership = inserts.find((i) => i.table === schema.deckVocabItems);
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
    const addVocabItem = vi.fn(async () => {});
    const { deckService, inserts } = serviceWith(
      {
        getStoredVocabItems: vi.fn(async () => [
          { vocabItem: "丶", disabled: true },
          { vocabItem: "你好", disabled: false },
        ]),
        addVocabItem,
        resolveConstituentClosure: vi.fn(async () => ["你好"]),
      },
      [{ id: "v1", vocabItem: "你好" }],
    );

    const result = await create(deckService, ["丶", "你好"]);

    expect(result.skipped).toEqual(["丶"]);
    // Creating it would throw: there is nothing to build a single character from.
    expect(addVocabItem).not.toHaveBeenCalled();
    expect(
      inserts.find((i) => i.table === schema.deckVocabItems)?.values,
    ).toEqual([{ deckId: "deck-1", vocabItemId: "v1", isConstituent: false }]);
  });

  it("creates a glyph that is genuinely absent, and does not skip it", async () => {
    const addVocabItem = vi.fn(async () => {});
    const { deckService } = serviceWith(
      {
        getStoredVocabItems: vi.fn(async () => []),
        addVocabItem,
        resolveConstituentClosure: vi.fn(async () => ["朋友"]),
      },
      [{ id: "v1", vocabItem: "朋友" }],
    );

    const result = await create(deckService, ["朋友"]);

    expect(addVocabItem).toHaveBeenCalledWith("朋友");
    expect(result.skipped).toEqual([]);
  });

  // Pins the phase order. The transaction must stay closed until every external
  // call has returned, so a failure on item 30 of 50 leaves no half-built deck
  // and no transaction held open across a network call.
  it("writes nothing when speech synthesis fails", async () => {
    const { deckService, transaction } = serviceWith({
      getStoredVocabItems: vi.fn(async () => []),
      addVocabItem: vi.fn(async () => {
        throw new Error("Edge TTS closed the connection");
      }),
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
