import { describe, expect, it } from "vitest";

import type { SQL } from "drizzle-orm";

import {
  assertAccountReleased,
  blockingReferences,
  clearedTables,
  coverage,
  schemaReferences,
  type Action,
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
 * child table.
 */
function render(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks;
  if (chunks) return chunks.map(render).join(" ");
  const value = (query as { value?: unknown }).value;
  if (Array.isArray(value)) return value.join("");
  return value === undefined ? String(query) : String(value);
}

const CHARS: Record<Action, string> = {
  "no-action": "a",
  restrict: "r",
  cascade: "c",
  "set-null": "n",
  "set-default": "d",
};

const key = (over: Partial<DatabaseKey>): DatabaseKey => ({
  name: `${over.table ?? "decks"}_fk`,
  schema: "public",
  table: "decks",
  columns: ["created_by_id"],
  parentSchema: "public",
  parentTable: "users",
  parentColumns: ["id"],
  onDelete: "restrict",
  refusesNull: false,
  ...over,
});

function fakeDatabase(
  keys: DatabaseKey[],
  counts: Record<string, number>,
  onDelete: Record<string, string> = {},
) {
  return {
    execute: async (query: SQL) => {
      const text = render(query);
      if (text.includes("current_schema()"))
        return { rows: [{ name: "public" }] };
      if (text.includes("pg_constraint")) {
        return {
          rows: keys.map((k) => ({
            name: k.name,
            child_schema: k.schema,
            child_table: k.table,
            child_columns: k.columns,
            child_refuses_null: k.refusesNull,
            parent_schema: k.parentSchema,
            parent_table: k.parentTable,
            parent_columns: k.parentColumns,
            on_delete: onDelete[k.name] ?? CHARS[k.onDelete],
          })),
        };
      }
      // The child table is the one named before the join, so read only that far.
      const child = text.split(" join ")[0]!;
      const table = keys.find((k) => child.includes(k.table))?.table ?? "";
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
      /public\.decks\.created_by_id \(2\)/,
    );
  });

  // The point of the whole exercise. The steps say they clear user_decks, and
  // five rounds of review each defeated a check that believed such a claim.
  // This one never reads them, so a step that declares a column its query does
  // not cover stops the deletion instead of stranding the learner.
  it("throws for a leftover the steps claim to cover", async () => {
    const database = fakeDatabase(
      [key({ table: "user_decks", columns: ["user_id"] })],
      { user_decks: 1 },
    );
    expect(coverage()["user_decks.user_id"]).toBe("delete");
    await expect(assertAccountReleased(database, "learner")).rejects.toThrow(
      /user_decks\.user_id \(1\)/,
    );
  });

  it("lets a cascading reference stand, because Postgres removes it too", async () => {
    const database = fakeDatabase(
      [key({ table: "sessions", columns: ["user_id"], onDelete: "cascade" })],
      { sessions: 3 },
    );
    await expect(
      assertAccountReleased(database, "learner"),
    ).resolves.toBeUndefined();
  });

  it("walks past a cascading child to whatever points at that", async () => {
    const database = fakeDatabase(
      [
        key({ table: "sessions", columns: ["user_id"], onDelete: "cascade" }),
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

  // The fifth review's second defeat. Postgres accepts `on delete set null`
  // onto a column declared not null and fails only when the delete runs, so
  // the rewrite is checked rather than assumed.
  it("refuses a set null onto a column that refuses one", async () => {
    const database = fakeDatabase(
      [
        key({
          table: "probe_setnull",
          columns: ["uid"],
          onDelete: "set-null",
          refusesNull: true,
        }),
      ],
      { probe_setnull: 1 },
    );
    await expect(assertAccountReleased(database, "learner")).rejects.toThrow(
      /set null onto a column that refuses one/,
    );
  });

  it("lets a set null onto a nullable column stand", async () => {
    const database = fakeDatabase(
      [key({ table: "notes", columns: ["uid"], onDelete: "set-null" })],
      { notes: 4 },
    );
    await expect(
      assertAccountReleased(database, "learner"),
    ).resolves.toBeUndefined();
  });

  // Whether the default satisfies the key depends on a row this cannot see.
  it("refuses a set default it cannot show will satisfy the key", async () => {
    const database = fakeDatabase(
      [key({ table: "audits", columns: ["uid"], onDelete: "set-default" })],
      { audits: 1 },
    );
    await expect(assertAccountReleased(database, "learner")).rejects.toThrow(
      /set default/,
    );
  });

  // Default-deny, the rule both defeats came down to: an action this does not
  // recognise stops the deletion rather than falling off the end of the switch.
  it("refuses an action it does not recognise", async () => {
    const database = fakeDatabase(
      [key({ name: "future_fk", table: "future", columns: ["uid"] })],
      {},
      { future_fk: "z" },
    );
    await expect(assertAccountReleased(database, "learner")).rejects.toThrow(
      /does not know what Postgres does to future_fk/,
    );
  });

  // The fifth review's first defeat: the catalogue used to be filtered to the
  // application's own schema, and a child anywhere in the database still blocks
  // the parent delete.
  it("sees a child table in another schema", async () => {
    const database = fakeDatabase(
      [
        key({
          name: "receipts_fk",
          schema: "probe_audit",
          table: "receipts",
          columns: ["uid"],
        }),
      ],
      { receipts: 1 },
    );
    await expect(assertAccountReleased(database, "learner")).rejects.toThrow(
      /probe_audit\.receipts\.uid/,
    );
  });

  // Refusing on sight failed every deletion in the database over a key nothing
  // referenced, so a composite key is evaluated through its own columns.
  it("evaluates a composite key rather than refusing it on sight", async () => {
    const keys = [
      key({
        name: "pairs_fk",
        table: "pairs",
        columns: ["user_id", "user_email"],
        parentColumns: ["id", "email"],
      }),
    ];
    await expect(
      assertAccountReleased(fakeDatabase(keys, {}), "learner"),
    ).resolves.toBeUndefined();
    await expect(
      assertAccountReleased(fakeDatabase(keys, { pairs: 1 }), "learner"),
    ).rejects.toThrow(/pairs\.user_id,user_email \(1\)/);
  });

  it("says so when the database enforces a key the schema list does not name", async () => {
    const warnings: object[] = [];
    const database = fakeDatabase(
      [
        key({
          name: "receipts_fk",
          schema: "probe_audit",
          table: "receipts",
          columns: ["uid"],
        }),
      ],
      {},
    );
    await assertAccountReleased(database, "learner", {
      warn: (data) => warnings.push(data),
    });
    expect(warnings[0]).toMatchObject({
      missing: ["probe_audit.receipts.uid"],
    });
  });
});
