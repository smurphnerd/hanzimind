import { describe, expect, it } from "vitest";

import { getTableConfig, PgTable, type PgColumn } from "drizzle-orm/pg-core";

import { schema } from "../schema";

/** The drizzle config uses snake_case casing, which `getTableConfig` does not apply. */
const snake = (name: string) =>
  name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/**
 * Every non-unique index in the schema, as `table: [name -> columns]`, read from
 * the tables rather than listed.
 *
 * Primary keys are left out: Postgres indexes them whether or not anybody says
 * so, and the point of this file is the ones somebody has to remember.
 */
function declaredIndexes(): Record<string, Record<string, string[]>> {
  const tables = (Object.values(schema) as unknown[]).filter(
    (value): value is PgTable => value instanceof PgTable,
  );
  return Object.fromEntries(
    tables
      .map((table) => {
        const config = getTableConfig(table);
        return [
          config.name,
          Object.fromEntries(
            config.indexes.map((declared) => [
              declared.config.name,
              (declared.config.columns as PgColumn[]).map((column) =>
                snake(column.name),
              ),
            ]),
          ),
        ] as const;
      })
      .filter(([, indexes]) => Object.keys(indexes).length > 0),
  );
}

describe("schema indexes", () => {
  /**
   * Named one by one, because the failure this catches is silent. Every query
   * below works without its index — it just reads the whole table, which is
   * fast on a seeded lane and not on a corpus that has grown. A test naming the
   * index is the only thing that notices when one is dropped.
   */
  it("declares each index this schema depends on, by name and columns", () => {
    expect(declaredIndexes()).toEqual({
      // A correlated `count(*) where deck_id = ?` per deck card, on the busiest
      // read in the app. The primary key leads with `user_id` and cannot serve it.
      user_decks: {
        user_decks_deck_id_idx: ["deck_id"],
      },
      // "Which decks hold this item", the direction the primary key does not
      // index, which a deck delete and every membership check reads.
      deck_vocab_items: {
        deck_vocab_items_vocab_item_id_idx: ["vocab_item_id"],
      },
      // Releasing a deleted account's memory aids updates by this column.
      user_vocab_items: {
        user_vocab_items_memory_aid_id_idx: ["memory_aid_id"],
      },
      // Every dictionary entry lists the aids for its glyph.
      memory_aids: {
        memory_aids_vocab_item_id_idx: ["vocab_item_id"],
      },
      // The first serves the submit endpoint's own rate limit, which counts an
      // author's rows inside a window on every write. The second serves the
      // admin queue, which opens on `open`.
      suggestions: {
        suggestions_created_by_id_created_at_idx: [
          "created_by_id",
          "created_at",
        ],
        suggestions_status_idx: ["status"],
      },
      // `disabled` leads because every read path filters it first and it is far
      // more selective than the four study types.
      vocab_items: {
        vocab_items_disabled_vocab_type_idx: ["disabled", "vocab_type"],
      },
    });
  });
});
