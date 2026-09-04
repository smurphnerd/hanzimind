import {
  and,
  eq,
  inArray,
  ne,
  type ExtractTablesWithRelations,
} from "drizzle-orm";
import { getTableConfig, PgTable, type PgColumn } from "drizzle-orm/pg-core";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";

import type { Drizzle } from "./database/database";
import { schema } from "./database/schema";

type Database = Pick<Drizzle, "selectDistinct">;

export type Reference = {
  /** `table.column`, as Postgres names them. */
  from: string;
  /** The table it points at. */
  to: string;
  cascades: boolean;
};

/**
 * Every foreign key in the schema, read from the tables themselves rather than
 * listed. A list is correct only until the next column lands, and the one this
 * replaced missed `suggestions.memory_aid_id`.
 */
export function schemaReferences(): Reference[] {
  const tables = (Object.values(schema) as unknown[]).filter(
    (value): value is PgTable => value instanceof PgTable,
  );
  return tables.flatMap((table) => {
    const config = getTableConfig(table);
    return config.foreignKeys.map((key) => {
      const reference = key.reference();
      return {
        from: `${config.name}.${reference.columns.map((column) => snake(column.name)).join(",")}`,
        to: getTableConfig(reference.foreignTable).name,
        cascades: key.onDelete === "cascade",
      };
    });
  });
}

/**
 * The references a deletion has to answer for: everything pointing at a table
 * whose rows go, minus the ones Postgres cascades on its own.
 */
export function blockingReferences(): Reference[] {
  const cleared = clearedTables();
  return schemaReferences()
    .filter((reference) => cleared.includes(reference.to))
    .filter((reference) => !reference.cascades)
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** The drizzle config uses snake_case casing, which `getTableConfig` does not apply. */
const snake = (name: string) =>
  name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

type Tx = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** What the deletion is holding while it works: the account, and what it owns. */
type Subject = { userId: string; memoryAidIds: string[]; deckIds: string[] };

/**
 * One thing the deletion does, and the references it answers for. The columns
 * are the real Drizzle columns the query below uses, so a step cannot claim to
 * cover a reference it does not touch: the claim and the work name the same
 * object.
 */
type Step = {
  /** `delete` empties rows; `release` nulls a column and keeps the row. */
  action: "delete" | "release";
  columns: PgColumn[];
  run: (tx: Tx, subject: Subject) => Promise<unknown>;
};

const STEPS: Step[] = [
  {
    action: "delete",
    columns: [schema.userVocabSynonyms.userId],
    run: (tx, { userId }) =>
      tx
        .delete(schema.userVocabSynonyms)
        .where(eq(schema.userVocabSynonyms.userId, userId)),
  },
  {
    action: "delete",
    columns: [schema.suggestions.createdById],
    run: (tx, { userId }) =>
      tx
        .delete(schema.suggestions)
        .where(eq(schema.suggestions.createdById, userId)),
  },
  {
    // resolvedById names the admin who closed a suggestion, not its author, so
    // an admin can be deleted without taking other people's reports with them.
    action: "release",
    columns: [schema.suggestions.resolvedById],
    run: (tx, { userId }) =>
      tx
        .update(schema.suggestions)
        .set({ resolvedById: null })
        .where(eq(schema.suggestions.resolvedById, userId)),
  },
  {
    action: "release",
    columns: [schema.vocabItems.defaultMemoryAidId],
    run: (tx, { memoryAidIds }) =>
      memoryAidIds.length === 0
        ? Promise.resolve()
        : tx
            .update(schema.vocabItems)
            .set({ defaultMemoryAidId: null })
            .where(inArray(schema.vocabItems.defaultMemoryAidId, memoryAidIds)),
  },
  {
    // Another learner's report of this account's memory aid keeps its row.
    action: "release",
    columns: [schema.suggestions.memoryAidId],
    run: (tx, { memoryAidIds }) =>
      memoryAidIds.length === 0
        ? Promise.resolve()
        : tx
            .update(schema.suggestions)
            .set({ memoryAidId: null })
            .where(inArray(schema.suggestions.memoryAidId, memoryAidIds)),
  },
  {
    action: "release",
    columns: [schema.userVocabItems.memoryAidId],
    run: (tx, { memoryAidIds }) =>
      memoryAidIds.length === 0
        ? Promise.resolve()
        : tx
            .update(schema.userVocabItems)
            .set({ memoryAidId: null })
            .where(inArray(schema.userVocabItems.memoryAidId, memoryAidIds)),
  },
  {
    action: "delete",
    columns: [schema.memoryAids.createdById],
    run: (tx, { userId }) =>
      tx
        .delete(schema.memoryAids)
        .where(eq(schema.memoryAids.createdById, userId)),
  },
  {
    action: "delete",
    columns: [schema.userVocabItems.userId],
    run: (tx, { userId }) =>
      tx
        .delete(schema.userVocabItems)
        .where(eq(schema.userVocabItems.userId, userId)),
  },
  {
    action: "delete",
    columns: [schema.userDecks.userId],
    run: (tx, { userId }) =>
      tx.delete(schema.userDecks).where(eq(schema.userDecks.userId, userId)),
  },
  {
    action: "delete",
    columns: [schema.deckVocabItems.deckId],
    run: (tx, { deckIds }) =>
      deckIds.length === 0
        ? Promise.resolve()
        : tx
            .delete(schema.deckVocabItems)
            .where(inArray(schema.deckVocabItems.deckId, deckIds)),
  },
  {
    action: "delete",
    columns: [schema.userDecks.deckId],
    run: (tx, { deckIds }) =>
      deckIds.length === 0
        ? Promise.resolve()
        : tx
            .delete(schema.userDecks)
            .where(inArray(schema.userDecks.deckId, deckIds)),
  },
  {
    // The account's own decks go with it. One another learner studies stops the
    // deletion before any of this runs; see decksStudiedByOthers.
    action: "delete",
    columns: [schema.decks.createdById],
    run: (tx, { deckIds }) =>
      deckIds.length === 0
        ? Promise.resolve()
        : tx.delete(schema.decks).where(inArray(schema.decks.id, deckIds)),
  },
];

const nameOf = (column: PgColumn) =>
  `${getTableConfig(column.table as PgTable).name}.${snake(column.name)}`;

/**
 * Tables whose rows disappear when an account does: `users`, which better-auth
 * deletes, and every table a step empties. Read from the steps rather than
 * listed, because a reference into any of them blocks the delete exactly as
 * hard as a reference into `users`.
 */
export function clearedTables(): string[] {
  const tables = STEPS.filter((step) => step.action === "delete").flatMap(
    (step) => step.columns.map((column) => nameOf(column).split(".")[0]),
  );
  return [...new Set(["users", ...tables])].sort();
}

/**
 * What the deletion does about each blocking reference, derived from the steps
 * that do the work. A step names the columns its own query uses, so a treatment
 * cannot drift from the code the way a prose map could.
 */
export function coverage(): Record<string, Step["action"]> {
  return Object.fromEntries(
    STEPS.flatMap((step) =>
      step.columns.map((column) => [nameOf(column), step.action] as const),
    ),
  );
}

/**
 * Clears everything a deleted account holds, in the order the foreign keys
 * demand: rows pointing at the learner's memory aids before the aids, rows
 * pointing at their decks before the decks.
 */
export async function clearAccountData(tx: Tx, userId: string) {
  const aids = await tx
    .select({ id: schema.memoryAids.id })
    .from(schema.memoryAids)
    .where(eq(schema.memoryAids.createdById, userId));
  const decks = await tx
    .select({ id: schema.decks.id })
    .from(schema.decks)
    .where(eq(schema.decks.createdById, userId));
  const subject: Subject = {
    userId,
    memoryAidIds: aids.map((aid) => aid.id),
    deckIds: decks.map((deck) => deck.id),
  };
  for (const step of STEPS) await step.run(tx, subject);
}

/** Decks this account published that somebody else is studying. */
export function decksStudiedByOthers(database: Database) {
  return (userId: string) =>
    database
      .selectDistinct({ name: schema.decks.deckName })
      .from(schema.decks)
      .innerJoin(schema.userDecks, eq(schema.userDecks.deckId, schema.decks.id))
      .where(
        and(
          eq(schema.decks.createdById, userId),
          ne(schema.userDecks.userId, userId),
        ),
      );
}
