import { describe, expect, it } from "vitest";

import type { SQL } from "drizzle-orm";

import {
  assertAccountReleased,
  blockingReferences,
  clearedTables,
  coverage,
  schemaReferences,
  type DatabaseKey,
  type Executor,
} from "../account-deletion";

describe("clearedTables", () => {
  // Derived from the steps that empty them, not listed. A step that starts
  // deleting from a new table widens the search for blocking references on its
  // own, which is the level the second review found this missing at.
  it("is every table the deletion empties, plus the users row itself", () => {
    expect(clearedTables()).toEqual([
      "deck_vocab_items",
      "decks",
      "memory_aids",
      "suggestions",
      "user_decks",
      "user_vocab_items",
      "user_vocab_synonyms",
      "users",
    ]);
  });
});

describe("blockingReferences", () => {
  it("finds every reference a deletion has to answer for, from the schema", () => {
    expect(blockingReferences().map((reference) => reference.from)).toEqual([
      "deck_vocab_items.deck_id",
      "decks.created_by_id",
      "memory_aids.created_by_id",
      "suggestions.created_by_id",
      "suggestions.memory_aid_id",
      "suggestions.resolved_by_id",
      "user_decks.deck_id",
      "user_decks.user_id",
      "user_vocab_items.memory_aid_id",
      "user_vocab_items.user_id",
      "user_vocab_synonyms.user_id",
      "vocab_items.default_memory_aid_id",
    ]);
  });

  it("leaves out what Postgres cascades on its own", () => {
    const cascading = schemaReferences()
      .filter((reference) => reference.cascades)
      .map((reference) => reference.from);
    expect([...cascading].sort()).toEqual([
      "accounts.user_id",
      "sessions.user_id",
    ]);
    for (const from of cascading) {
      expect(coverage()[from]).toBeUndefined();
    }
  });
});

describe("coverage", () => {
  // The guard: a new column pointing at users, or at any table the deletion
  // empties, fails here rather than in production on a learner who cannot
  // delete their account. Each entry comes from the Drizzle column the step's
  // own query uses, so it cannot describe work the code does not do.
  it("names every blocking reference, and nothing that is not one", () => {
    const blocking = blockingReferences().map((reference) => reference.from);
    expect(Object.keys(coverage()).sort()).toEqual([...blocking].sort());
  });

  it("says of each whether the row goes or only the reference does", () => {
    expect(coverage()).toEqual({
      "deck_vocab_items.deck_id": "delete",
      "decks.created_by_id": "delete",
      "memory_aids.created_by_id": "delete",
      "suggestions.created_by_id": "delete",
      "suggestions.memory_aid_id": "release",
      "suggestions.resolved_by_id": "release",
      "user_decks.deck_id": "delete",
      "user_decks.user_id": "delete",
      "user_vocab_items.memory_aid_id": "release",
      "user_vocab_items.user_id": "delete",
      "user_vocab_synonyms.user_id": "delete",
      "vocab_items.default_memory_aid_id": "release",
    });
  });
});

/**
 * The post-condition asks Postgres what still points at the account, so a test
 * of it is a test of what it does with the answers. The fake below is a
 * database that gives fixed ones: a foreign-key catalogue, and a count per
 * table.
 */
const render = (query: SQL) =>
  (query as unknown as { queryChunks: unknown[] }).queryChunks
    .map((chunk) => {
      const value = (chunk as { value?: unknown }).value;
      if (Array.isArray(value)) return value.join("");
      return value === undefined ? String(chunk) : String(value);
    })
    .join(" ");

const key = (over: Partial<DatabaseKey>): DatabaseKey => ({
  name: `${over.table}_fk`,
  table: "decks",
  columns: ["created_by_id"],
  parentTable: "users",
  parentColumns: ["id"],
  blocks: true,
  cascades: false,
  ...over,
});

function fakeDatabase(keys: DatabaseKey[], counts: Record<string, number>) {
  return {
    execute: async (query: SQL) => {
      const text = render(query);
      if (text.includes("pg_constraint")) {
        return {
          rows: keys.map((k) => ({
            name: k.name,
            child_table: k.table,
            child_columns: k.columns,
            parent_table: k.parentTable,
            parent_columns: k.parentColumns,
            on_delete: k.cascades ? "c" : k.blocks ? "r" : "n",
          })),
        };
      }
      const table = keys.find((k) => text.includes(k.table))?.table ?? "";
      const remaining = counts[table] ?? 0;
      if (text.includes("distinct")) {
        return {
          rows: Array.from({ length: remaining }, (_, index) => ({
            value: `${table}-${index}`,
          })),
        };
      }
      return { rows: [{ count: remaining }] };
    },
  } satisfies Executor;
}

describe("assertAccountReleased", () => {
  it("passes when nothing points at the account any more", async () => {
    const database = fakeDatabase(
      [
        key({ table: "decks" }),
        key({ table: "user_decks", columns: ["user_id"] }),
      ],
      {},
    );
    await expect(
      assertAccountReleased(database, "learner"),
    ).resolves.toBeUndefined();
  });

  it("names the table and column that still points at the account", async () => {
    const database = fakeDatabase([key({ table: "decks" })], { decks: 2 });
    await expect(assertAccountReleased(database, "learner")).rejects.toThrow(
      /decks\.created_by_id \(2\)/,
    );
  });

  // The point of the whole exercise. The steps say they clear user_decks, and
  // four rounds of review each defeated a check that believed such a claim.
  // This one never reads them, so a step that declares a column its query does
  // not cover stops the deletion instead of stranding the learner.
  it("throws for a leftover the steps claim to cover", async () => {
    const database = fakeDatabase(
      [key({ table: "user_decks", columns: ["user_id"] })],
      {
        user_decks: 1,
      },
    );
    expect(coverage()["user_decks.user_id"]).toBe("delete");
    await expect(assertAccountReleased(database, "learner")).rejects.toThrow(
      /user_decks\.user_id \(1\)/,
    );
  });

  it("lets a cascading reference stand, because Postgres removes it too", async () => {
    const database = fakeDatabase(
      [
        key({
          table: "sessions",
          columns: ["user_id"],
          blocks: false,
          cascades: true,
        }),
      ],
      { sessions: 3 },
    );
    await expect(
      assertAccountReleased(database, "learner"),
    ).resolves.toBeUndefined();
  });

  it("walks past a cascading child to whatever points at that", async () => {
    const database = fakeDatabase(
      [
        key({
          table: "sessions",
          columns: ["user_id"],
          blocks: false,
          cascades: true,
        }),
        key({
          name: "device_tokens_fk",
          table: "device_tokens",
          columns: ["session_id"],
          parentTable: "sessions",
          parentColumns: ["id"],
        }),
      ],
      { sessions: 2, device_tokens: 1 },
    );
    await expect(assertAccountReleased(database, "learner")).rejects.toThrow(
      /device_tokens\.session_id/,
    );
  });

  it("refuses rather than skip a key it cannot check", async () => {
    const database = fakeDatabase(
      [
        key({
          name: "pair_fk",
          table: "pairs",
          columns: ["user_id", "deck_id"],
        }),
      ],
      {},
    );
    await expect(assertAccountReleased(database, "learner")).rejects.toThrow(
      /cannot verify pair_fk/,
    );
  });

  it("says so when the database enforces a key the schema list does not name", async () => {
    const warnings: object[] = [];
    const database = fakeDatabase(
      [key({ name: "invoices_fk", table: "invoices", columns: ["user_id"] })],
      {},
    );
    await assertAccountReleased(database, "learner", {
      warn: (data) => warnings.push(data),
    });
    expect(warnings[0]).toMatchObject({ missing: ["invoices.user_id"] });
  });
});
