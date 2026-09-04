import { describe, expect, it } from "vitest";

import {
  blockingReferences,
  clearedTables,
  coverage,
  schemaReferences,
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
