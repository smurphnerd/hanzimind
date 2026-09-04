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
 * Somewhere to run a query, narrow enough that a test can stand in for the
 * database.
 */
export type Executor = {
  execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }>;
};

/** Somewhere to say that the database and the schema file disagree. */
type Log = { warn: (data: object, message: string) => void };

/** A foreign key as Postgres holds it, not as the schema file describes it. */
export type DatabaseKey = {
  name: string;
  table: string;
  columns: string[];
  parentTable: string;
  parentColumns: string[];
  /** Postgres refuses the parent delete rather than fixing this child. */
  blocks: boolean;
  /** Postgres deletes this child along with its parent. */
  cascades: boolean;
};

/**
 * Every foreign key the live database is actually enforcing. The schema file is
 * a second-hand account of this, and the post-condition below has to be free of
 * whatever the schema file, or the steps, failed to notice.
 */
export async function databaseKeys(db: Executor): Promise<DatabaseKey[]> {
  const result = await db.execute(sql`
    select
      c.conname as name,
      child.relname as child_table,
      (
        select array_agg(a.attname::text order by k.ord)
        from unnest(c.conkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) as child_columns,
      parent.relname as parent_table,
      (
        select array_agg(a.attname::text order by k.ord)
        from unnest(c.confkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum
      ) as parent_columns,
      c.confdeltype as on_delete
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_class parent on parent.oid = c.confrelid
    join pg_namespace space on space.oid = child.relnamespace
    where c.contype = 'f' and space.nspname = current_schema()
    order by child.relname, c.conname
  `);
  return result.rows.map((row) => {
    // 'c' cascades and 'n'/'d' rewrite the child; 'a' and 'r' refuse the delete.
    const onDelete = String(row.on_delete);
    return {
      name: String(row.name),
      table: String(row.child_table),
      columns: columnList(row.child_columns, row.name),
      parentTable: String(row.parent_table),
      parentColumns: columnList(row.parent_columns, row.name),
      blocks: onDelete === "a" || onDelete === "r",
      cascades: onDelete === "c",
    };
  });
}

/**
 * Postgres hands back `name[]` for a constraint's columns, which the driver
 * leaves as the literal `{a,b}` unless it is cast to text, so this refuses
 * anything that did not arrive as a list rather than walk one character at a
 * time.
 */
function columnList(value: unknown, name: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Account deletion could not read the columns of ${String(name)} from the database.`,
    );
  }
  return value.map(String);
}

/** Rows that are about to disappear, named by one of their columns. */
type Doomed = { table: string; column: string; values: string[] };

const HOPS = 10;

/**
 * Refuses to let the transaction commit unless the account really is free of
 * every reference the database enforces.
 *
 * This is the guard the list of steps cannot be. Four reviews each closed one
 * gap in that list and each was defeated by the next, because a list is a claim
 * about which references were considered and the harm depends on which ones
 * survive. So this asks the second question, and asks it of Postgres: walk out
 * from the account's own row along the keys the database is enforcing, and if
 * anything still points at a row that is about to go, throw. The transaction
 * rolls back, better-auth never reaches the learner's sessions or credentials,
 * and they keep both their data and their way in.
 *
 * It cannot inherit the steps' blind spot, because it never reads them.
 */
export async function assertAccountReleased(
  db: Executor,
  userId: string,
  log?: Log,
) {
  const keys = await databaseKeys(db);
  reportDisagreement(keys, log);

  const leftovers: string[] = [];
  let frontier: Doomed[] = [{ table: "users", column: "id", values: [userId] }];
  for (let hop = 0; hop < HOPS && frontier.length > 0; hop++) {
    const next: Doomed[] = [];
    for (const doomed of frontier) {
      for (const key of keys.filter((k) => k.parentTable === doomed.table)) {
        // A composite key, or one onto some other unique column, cannot be
        // checked against a set of single-column values. Refusing the deletion
        // is the only honest answer: the alternative is a silent blind spot,
        // which is the thing this function exists to end.
        if (
          key.columns.length !== 1 ||
          key.parentColumns.length !== 1 ||
          key.parentColumns[0] !== doomed.column
        ) {
          throw new Error(
            `Account deletion cannot verify ${key.name} (${key.table}.${key.columns.join(",")} -> ${key.parentTable}.${key.parentColumns.join(",")}), so it will not proceed.`,
          );
        }
        const remaining = await countReferencing(db, key, doomed.values);
        if (remaining === 0) continue;
        if (key.blocks) {
          leftovers.push(`${key.table}.${key.columns[0]} (${remaining})`);
          continue;
        }
        // A cascading child goes too, so whatever points at it is equally
        // doomed and has to be walked in turn.
        if (key.cascades) next.push(...(await behind(db, keys, key, doomed)));
      }
    }
    frontier = next;
  }
  if (frontier.length > 0) {
    throw new Error(
      `Account deletion gave up walking references after ${HOPS} hops, so it will not proceed.`,
    );
  }
  if (leftovers.length > 0) {
    throw new Error(
      `Account deletion left ${leftovers.length} reference${leftovers.length === 1 ? "" : "s"} to this account: ${leftovers.join(", ")}. Nothing has been deleted.`,
    );
  }
}

/**
 * One bound parameter per value. Drizzle binds a JS array as a single one,
 * which Postgres then tries to read as an array literal.
 */
const valueList = (values: string[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

async function countReferencing(
  db: Executor,
  key: DatabaseKey,
  values: string[],
) {
  if (values.length === 0) return 0;
  const result = await db.execute(sql`
    select count(*)::int as count
    from ${sql.identifier(key.table)}
    where ${sql.identifier(key.columns[0])} in (${valueList(values)})
  `);
  return Number(result.rows[0]?.count ?? 0);
}

/** The doomed rows of a cascading child, named by whatever else references them. */
async function behind(
  db: Executor,
  keys: DatabaseKey[],
  key: DatabaseKey,
  doomed: Doomed,
): Promise<Doomed[]> {
  const referenced = [
    ...new Set(
      keys
        .filter((k) => k.parentTable === key.table)
        .flatMap((k) => k.parentColumns),
    ),
  ];
  const found: Doomed[] = [];
  for (const column of referenced) {
    const result = await db.execute(sql`
      select distinct ${sql.identifier(column)} as value
      from ${sql.identifier(key.table)}
      where ${sql.identifier(key.columns[0])} in (${valueList(doomed.values)})
    `);
    const values = result.rows.map((row) => String(row.value));
    if (values.length > 0) found.push({ table: key.table, column, values });
  }
  return found;
}

/**
 * The schema-derived list and the database can disagree — a key added by a
 * migration, or dropped by one. Say so, and say which of them is in charge: the
 * post-condition reads the database, so the database governs and the list is
 * what needs fixing.
 */
function reportDisagreement(keys: DatabaseKey[], log?: Log) {
  if (!log) return;
  const cleared = clearedTables();
  const live = keys
    .filter((key) => key.blocks && cleared.includes(key.parentTable))
    .map((key) => `${key.table}.${key.columns.join(",")}`);
  const listed = blockingReferences().map((reference) => reference.from);
  const missing = live.filter((name) => !listed.includes(name));
  const stale = listed.filter((name) => !live.includes(name));
  if (missing.length === 0 && stale.length === 0) return;
  log.warn(
    { missing, stale },
    "The database's blocking references disagree with the schema's; the database governs the deletion and the schema list is what is out of date",
  );
}

/**
 * Clears everything a deleted account holds, in the order the foreign keys
 * demand: rows pointing at the learner's memory aids before the aids, rows
 * pointing at their decks before the decks.
 *
 * The steps say what this intends to clear. `assertAccountReleased`, at the
 * end and inside the same transaction, says whether it worked — so a step that
 * misses something rolls the whole thing back instead of stranding the learner.
 */
export async function clearAccountData(tx: Tx, userId: string, log?: Log) {
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
  await assertAccountReleased(tx, userId, log);
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
