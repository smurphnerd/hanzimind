import { describe, expect, it } from "vitest";

import type { SQL } from "drizzle-orm";

import {
  assertAccountDeletable,
  blockingReferences,
  clearedTables,
  coverage,
  schemaReferences,
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
 * The trial delete is three statements, so a test of it is a test of what it
 * does with the three answers Postgres can give: it went, it did not go, or the
 * statement raised.
 */
function fakeDatabase(answer: {
  rows?: Record<string, unknown>[];
  raises?: unknown;
}) {
  const statements: string[] = [];
  const database = {
    execute: async (query: SQL) => {
      const text = render(query);
      statements.push(text.replace(/\s+/g, " ").trim());
      if (!text.includes("delete from")) return { rows: [] };
      if (answer.raises) throw answer.raises;
      return { rows: answer.rows ?? [] };
    },
  } satisfies Executor;
  return { database, statements };
}

function render(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks;
  if (chunks) return chunks.map(render).join(" ");
  const value = (query as { value?: unknown }).value;
  if (Array.isArray(value)) return value.join("");
  return value === undefined ? String(query) : String(value);
}

describe("assertAccountDeletable", () => {
  it("passes when the trial delete removes the account's row", async () => {
    const { database, statements } = fakeDatabase({
      rows: [{ id: "learner" }],
    });
    await expect(
      assertAccountDeletable(database, "learner"),
    ).resolves.toBeUndefined();
    expect(statements.filter((text) => text.includes("savepoint"))).toEqual([
      "savepoint account_deletion_trial",
      "rollback to savepoint account_deletion_trial",
    ]);
  });

  // A rule can answer a delete with success while removing nothing, which
  // showed a learner the success card over a row whose password was gone. The
  // absence of an error is not the fact worth checking; the row count is.
  it("refuses when the trial delete removes nothing", async () => {
    const { database } = fakeDatabase({ rows: [] });
    await expect(assertAccountDeletable(database, "learner")).rejects.toThrow(
      /removed 0 rows rather than one, so something is intercepting it/,
    );
  });

  it("refuses when the trial delete raises, and repeats what Postgres said", async () => {
    const { database } = fakeDatabase({
      raises: Object.assign(new Error("probe_guard raised"), {
        detail: "Key (id)=(learner) is still referenced.",
      }),
    });
    await expect(assertAccountDeletable(database, "learner")).rejects.toThrow(
      /probe_guard raised Key \(id\)=\(learner\) is still referenced\./,
    );
  });

  // A raised statement leaves the transaction unusable, and the caller still
  // has to log and roll back.
  it("puts the transaction back on its feet before it throws", async () => {
    const { database, statements } = fakeDatabase({
      raises: new Error("nope"),
    });
    await expect(assertAccountDeletable(database, "learner")).rejects.toThrow();
    expect(statements.at(-1)).toBe(
      "rollback to savepoint account_deletion_trial",
    );
  });

  it("never lets the trial delete stand", async () => {
    const { database, statements } = fakeDatabase({
      rows: [{ id: "learner" }],
    });
    await assertAccountDeletable(database, "learner");
    expect(statements.at(-1)).toBe(
      "rollback to savepoint account_deletion_trial",
    );
  });
});
