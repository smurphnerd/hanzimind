import {
  and,
  eq,
  inArray,
  ne,
  sql,
  type SQL,
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
    columns: [schema.userStudyProgress.userId],
    run: (tx, { userId }) =>
      tx
        .delete(schema.userStudyProgress)
        .where(eq(schema.userStudyProgress.userId, userId)),
  },
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
 * Somewhere to run a statement, narrow enough that a test can stand in for the
 * database.
 */
export type Executor = {
  execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }>;
};

const TRIAL = "account_deletion_trial";

/**
 * Deletes the account's own row, checks that it went, and rolls that back.
 *
 * Six reviews defeated six versions of a check that MODELLED what the database
 * would do — first a list of references, then a derivation of one, then a walk
 * of the live foreign keys. Each was defeated by something outside its model,
 * and the last two by things a walk of `pg_constraint` cannot see at all: a
 * trigger that raises, a rule that reports success while deleting nothing, a
 * trigger behind a cascade, and a search_path that made the walk start at a
 * table that did not exist and pass everything.
 *
 * So this asks Postgres instead of modelling it, on a savepoint. The trial
 * evaluates every constraint, trigger, rule, cascade and referential action,
 * because it IS the delete, which makes it exactly as accurate as the thing
 * that enforces them. It is also cheaper than the walk it replaces, and it has
 * no over-refusals: the earlier walk refused three shapes Postgres would have
 * allowed.
 *
 * Two mechanisms carry the rule case, where a delete reports success while
 * removing nothing — the case that showed a learner "Your account is gone" over
 * a surviving row whose password had already been taken, the worst outcome this
 * flow can produce. They catch DIFFERENT rules and neither is redundant. The
 * row count catches a rule that does nothing, which reports zero rows. And
 * `returning` catches a rule that SUBSTITUTES another delete, which reports a
 * truthful-looking one row: Postgres refuses `returning` outright on a relation
 * whose delete a rule rewrites. Dropping either one puts a live escape back.
 *
 * WARNING FOR ANYONE ADDING A DELETE TRIGGER. The trial is a real delete, so
 * every before/after delete trigger on `users` and on every cascading child
 * runs TWICE per deletion. Postgres undoes the second run's work at the
 * rollback, but only what is transactional: a sequence, a counter, an FDW or
 * dblink write, or anything reaching outside the database does its work twice
 * and stays done. There are no such triggers today.
 *
 * What it cannot cover: better-auth deletes the users row in a LATER
 * transaction, so a schema change landing between this commit and that delete
 * is still a lockout. See the note in auth.tsx.
 */
export async function assertAccountDeletable(db: Executor, userId: string) {
  await db.execute(sql.raw(`savepoint ${TRIAL}`));
  let removed: number;
  try {
    const result = await db.execute(
      sql`delete from ${schema.users} where ${schema.users.id} = ${userId} returning ${schema.users.id}`,
    );
    removed = result.rows.length;
    // A deferred constraint is checked at commit, and this never commits: the
    // rollback below discards the queued check unevaluated, so a `deferrable
    // initially deferred` foreign key — or a deferred constraint trigger, which
    // is the same hole with no foreign key in it — passed the trial and then
    // stranded the learner at better-auth's own commit. This fires the queue
    // while the trial can still fail on it.
    await db.execute(sql.raw("set constraints all immediate"));
  } catch (cause) {
    // The failed statement leaves the transaction unusable, and the caller
    // still has to log and roll back, so put it back on its feet first.
    await db.execute(sql.raw(`rollback to savepoint ${TRIAL}`));
    throw new Error(
      `Postgres refused to delete this account: ${describe(cause)} Nothing has been deleted.`,
      { cause },
    );
  }
  await db.execute(sql.raw(`rollback to savepoint ${TRIAL}`));
  if (removed !== 1) {
    throw new Error(
      `A trial delete of this account removed ${removed} rows rather than one, so something is intercepting it. Nothing has been deleted.`,
    );
  }
}

/**
 * Postgres names the constraint in the message and the row in the detail, but
 * the driver wraps that in its own error whose message is only the SQL that
 * failed. The innermost cause is the one worth repeating.
 */
function describe(thrown: unknown) {
  let error = thrown;
  while (
    error &&
    typeof error === "object" &&
    (error as { cause?: unknown }).cause
  ) {
    error = (error as { cause: unknown }).cause;
  }
  const { message, detail } = (error ?? {}) as {
    message?: unknown;
    detail?: unknown;
  };
  const said = String(message ?? thrown);
  return detail ? `${said} ${String(detail)}` : said;
}

/**
 * Clears everything a deleted account holds, in the order the foreign keys
 * demand: rows pointing at the learner's memory aids before the aids, rows
 * pointing at their decks before the decks.
 *
 * The steps say what this intends to clear. `assertAccountDeletable`, at the
 * end and inside the same transaction, asks Postgres whether it worked — so a
 * step that misses something rolls the whole thing back instead of stranding
 * the learner.
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
  await assertAccountDeletable(tx, userId);
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
