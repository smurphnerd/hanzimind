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

/** What Postgres does to the child row when the parent row goes. */
export type Action =
  | "no-action"
  | "restrict"
  | "cascade"
  | "set-null"
  | "set-default";

const ACTIONS: Record<string, Action> = {
  a: "no-action",
  r: "restrict",
  c: "cascade",
  n: "set-null",
  d: "set-default",
};

/** A foreign key as Postgres holds it, not as the schema file describes it. */
export type DatabaseKey = {
  name: string;
  schema: string;
  table: string;
  columns: string[];
  parentSchema: string;
  parentTable: string;
  parentColumns: string[];
  onDelete: Action;
  /**
   * Whether a column of this key refuses a null, which is what turns a
   * `set null` rewrite into a failed parent delete.
   */
  refusesNull: boolean;
};

/**
 * Every foreign key the live database is actually enforcing, in every schema.
 *
 * Not restricted to the application's own schema: a child table anywhere in the
 * database still blocks the parent delete, and a key this query does not return
 * is a key the walk below cannot refuse. That filter was one of the two ways the
 * fifth review reproduced the lockout.
 */
export async function databaseKeys(db: Executor): Promise<DatabaseKey[]> {
  const result = await db.execute(sql`
    select
      c.conname as name,
      childspace.nspname as child_schema,
      child.relname as child_table,
      (
        select array_agg(a.attname::text order by k.ord)
        from unnest(c.conkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) as child_columns,
      (
        select bool_or(a.attnotnull)
        from unnest(c.conkey) k(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) as child_refuses_null,
      parentspace.nspname as parent_schema,
      parent.relname as parent_table,
      (
        select array_agg(a.attname::text order by k.ord)
        from unnest(c.confkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum
      ) as parent_columns,
      c.confdeltype as on_delete
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_namespace childspace on childspace.oid = child.relnamespace
    join pg_class parent on parent.oid = c.confrelid
    join pg_namespace parentspace on parentspace.oid = parent.relnamespace
    where c.contype = 'f'
    order by childspace.nspname, child.relname, c.conname
  `);
  return result.rows.map((row) => {
    const action = ACTIONS[String(row.on_delete)];
    // An action nobody here has heard of is not a licence to ignore the key.
    if (!action) {
      throw new Error(
        `Account deletion does not know what Postgres does to ${String(row.name)} on delete (${String(row.on_delete)}), so it will not proceed.`,
      );
    }
    const columns = columnList(row.child_columns, row.name);
    const parentColumns = columnList(row.parent_columns, row.name);
    if (columns.length === 0 || columns.length !== parentColumns.length) {
      throw new Error(
        `Account deletion could not pair the columns of ${String(row.name)}, so it will not proceed.`,
      );
    }
    return {
      name: String(row.name),
      schema: String(row.child_schema),
      table: String(row.child_table),
      columns,
      parentSchema: String(row.parent_schema),
      parentTable: String(row.parent_table),
      parentColumns,
      onDelete: action,
      refusesNull: row.child_refuses_null === true,
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
type Doomed = {
  schema: string;
  table: string;
  column: string;
  values: string[];
};

const HOPS = 10;

const name = (key: DatabaseKey) =>
  `${key.schema}.${key.table}.${key.columns.join(",")}`;

/**
 * Refuses to let the transaction commit unless the account really is free of
 * every reference the database enforces.
 *
 * This is the guard the list of steps cannot be. Five reviews defeated that
 * list, because a list is a claim about which references were CONSIDERED and
 * the harm depends on which ones SURVIVE. So this asks the second question, and
 * asks it of Postgres: walk out from the account's own row along the keys the
 * database is enforcing, and if anything still points at a row that is about to
 * go, throw. The transaction rolls back, better-auth never reaches the
 * learner's sessions or credentials, and they keep both their data and their
 * way in.
 *
 * The rule underneath every branch below is that a reference this cannot
 * positively prove harmless refuses the deletion. Refusing costs a learner one
 * retry; being wrong the other way leaves them locked out of an account that
 * still holds all their data. Both times this was defeated, the cause was the
 * same: a key the model could not classify was skipped instead of refused.
 */
export async function assertAccountReleased(
  db: Executor,
  userId: string,
  log?: Log,
) {
  const keys = await databaseKeys(db);
  const home = await currentSchema(db);
  reportDisagreement(keys, home, log);

  const leftovers: string[] = [];
  let frontier: Doomed[] = [
    { schema: home, table: "users", column: "id", values: [userId] },
  ];
  for (let hop = 0; hop < HOPS && frontier.length > 0; hop++) {
    const next: Doomed[] = [];
    for (const doomed of frontier) {
      const inbound = keys.filter(
        (key) =>
          key.parentSchema === doomed.schema &&
          key.parentTable === doomed.table,
      );
      for (const key of inbound) {
        const remaining = await countReferencing(db, key, doomed);
        if (remaining === 0) continue;
        switch (key.onDelete) {
          case "no-action":
          case "restrict":
            leftovers.push(`${name(key)} (${remaining})`);
            break;
          case "set-null":
            // Postgres accepts `on delete set null` onto a column declared not
            // null and fails only at delete time, so the rewrite has to be
            // checked rather than assumed.
            if (key.refusesNull) {
              leftovers.push(
                `${name(key)} (${remaining}, set null onto a column that refuses one)`,
              );
            }
            break;
          case "set-default":
            // Whether the default satisfies the key depends on a row existing
            // that this cannot see, so it is refused rather than assumed.
            leftovers.push(
              `${name(key)} (${remaining}, set default, which cannot be shown to satisfy the key)`,
            );
            break;
          case "cascade":
            next.push(...(await behind(db, keys, key, doomed)));
            break;
          default: {
            const unreachable: never = key.onDelete;
            throw new Error(
              `Account deletion does not handle ${String(unreachable)} on ${key.name}, so it will not proceed.`,
            );
          }
        }
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

async function currentSchema(db: Executor) {
  const result = await db.execute(sql`select current_schema() as name`);
  return String(result.rows[0]?.name ?? "public");
}

const qualified = (schema: string, table: string) =>
  sql`${sql.identifier(schema)}.${sql.identifier(table)}`;

/**
 * One bound parameter per value. Drizzle binds a JS array as a single one,
 * which Postgres then tries to read as an array literal.
 */
const valueList = (values: string[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

/**
 * The doomed rows joined to the rows referencing them, through whatever columns
 * the key is actually built on. Joining rather than comparing one column is what
 * lets a composite key, or one onto a column other than the primary key, be
 * evaluated instead of refused on sight — the earlier blanket refusal would have
 * failed every deletion in the database over a key nothing referenced.
 */
function rowsReferencing(key: DatabaseKey, doomed: Doomed) {
  const pairs = sql.join(
    key.columns.map(
      (column, index) =>
        sql`child.${sql.identifier(column)} = parent.${sql.identifier(key.parentColumns[index]!)}`,
    ),
    sql` and `,
  );
  // A row pointing at itself goes with the row, so it is not a leftover.
  const itself =
    key.schema === doomed.schema && key.table === doomed.table
      ? sql` and child.${sql.identifier(doomed.column)} not in (${valueList(doomed.values)})`
      : sql.empty();
  return sql`
    from ${qualified(key.schema, key.table)} child
    join ${qualified(key.parentSchema, key.parentTable)} parent on ${pairs}
    where parent.${sql.identifier(doomed.column)} in (${valueList(doomed.values)})${itself}
  `;
}

async function countReferencing(
  db: Executor,
  key: DatabaseKey,
  doomed: Doomed,
) {
  if (doomed.values.length === 0) return 0;
  const result = await db.execute(
    sql`select count(*)::int as count ${rowsReferencing(key, doomed)}`,
  );
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
        .filter(
          (k) => k.parentSchema === key.schema && k.parentTable === key.table,
        )
        .flatMap((k) => k.parentColumns),
    ),
  ];
  const found: Doomed[] = [];
  for (const column of referenced) {
    const result = await db.execute(
      sql`select distinct child.${sql.identifier(column)} as value ${rowsReferencing(key, doomed)}`,
    );
    const values = result.rows
      .map((row) => String(row.value))
      .filter(
        (value) =>
          key.schema !== doomed.schema ||
          key.table !== doomed.table ||
          column !== doomed.column ||
          !doomed.values.includes(value),
      );
    if (values.length > 0) {
      found.push({ schema: key.schema, table: key.table, column, values });
    }
  }
  return found;
}

/**
 * The schema-derived list and the database can disagree — a key added by a
 * migration, or dropped by one, or one in a schema the file has never heard of.
 * Say so, and say which of them is in charge: the post-condition reads the
 * database, so the database governs and the list is what needs fixing.
 */
function reportDisagreement(keys: DatabaseKey[], home: string, log?: Log) {
  if (!log) return;
  const cleared = clearedTables();
  const blocks = (key: DatabaseKey) => key.onDelete !== "cascade";
  const live = keys
    .filter(
      (key) =>
        blocks(key) &&
        key.parentSchema === home &&
        cleared.includes(key.parentTable),
    )
    .map((key) =>
      key.schema === home ? `${key.table}.${key.columns.join(",")}` : name(key),
    );
  const listed = blockingReferences().map((reference) => reference.from);
  const missing = live.filter((entry) => !listed.includes(entry));
  const stale = listed.filter((entry) => !live.includes(entry));
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
