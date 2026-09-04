import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pino } from "pino";

import { getDatabase, type Drizzle } from "./database";

/**
 * Apply the checked-in migrations in `drizzle/` to the database named by
 * `DATABASE_URL`, or adopt an existing database into the journal with
 * `--baseline`.
 *
 * Deliberately reads `DATABASE_URL` and `LOG_LEVEL` directly instead of going
 * through `scripts/bootstrap.ts`. `envSchema` demands `S3_OPTIONS`,
 * `AUTH_SECRET`, `DEEPL_API_KEY` and the rest, none of which a schema
 * migration has any use for, and requiring them would mean an operator has to
 * assemble the whole application environment to add a column — or, worse, put
 * placeholder secrets on a production command line. `getDatabase` is still the
 * connection path, so the TLS negotiation a hosted Postgres needs and the pool
 * `error` listener come along unchanged.
 */

/** Where drizzle-kit writes, per `out` in `drizzle.config.ts`. */
export const MIGRATIONS_FOLDER = path.join(
  import.meta.dirname,
  "../../..",
  "drizzle",
);

/**
 * Where drizzle-orm's migrator keeps its journal. These are its defaults, named
 * here rather than left implicit because `docs/remote-setup.md` tells an
 * operator to look at this exact table during the production cutover, and a
 * table you tell someone to inspect should not be a default that can move.
 * `drizzle.config.ts` repeats them for `drizzle-kit migrate`, which reads the
 * config rather than this file.
 */
export const MIGRATIONS_SCHEMA = "drizzle";
export const MIGRATIONS_TABLE = "__drizzle_migrations";

type JournalEntry = { idx: number; when: number; tag: string };

/** One row of the migrator's journal, as it is stored. */
type AppliedMigration = { hash: string; created_at: string };

export function readJournal(folder = MIGRATIONS_FOLDER): JournalEntry[] {
  const journal = JSON.parse(
    readFileSync(path.join(folder, "meta", "_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };
  return journal.entries;
}

export function readMigrationSql(
  tag: string,
  folder = MIGRATIONS_FOLDER,
): string {
  return readFileSync(path.join(folder, `${tag}.sql`), "utf8");
}

/**
 * The hash drizzle-orm's migrator records for a migration: sha256 over the
 * whole file, byte for byte, which is why `drizzle/` is prettier-ignored.
 *
 * The migrator does not currently verify this. It decides what to apply purely
 * from `created_at desc limit 1`, so a row with any hash at all would make the
 * baseline count as applied. We compute the real one anyway: a behavioural
 * detail of a dependency is a bad thing to bet a production migration journal
 * on, and a future drizzle that starts comparing hashes would otherwise find a
 * row it cannot match and either re-run the baseline or refuse to move.
 */
export function migrationHash(tag: string, folder = MIGRATIONS_FOLDER): string {
  return crypto
    .createHash("sha256")
    .update(readMigrationSql(tag, folder))
    .digest("hex");
}

/** Every table a migration creates, in file order. */
export function tablesCreatedBy(migrationSql: string): string[] {
  return [
    ...migrationSql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/g),
  ].map((match) => match[1]!);
}

async function journalRows(database: Drizzle): Promise<AppliedMigration[]> {
  const present = await database.execute<{ journal: string | null }>(
    sql`select to_regclass(${`${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`}) as journal`,
  );
  if (!present.rows[0]?.journal) return [];
  return (
    await database.execute<AppliedMigration>(
      sql`select hash, created_at from ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} order by created_at`,
    )
  ).rows;
}

async function publicTables(database: Drizzle): Promise<Set<string>> {
  const { rows } = await database.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  return new Set(rows.map((row) => row.tablename));
}

export type BaselineOutcome =
  | { action: "recorded"; tag: string; hash: string }
  | { action: "already-journalled"; applied: number }
  | { action: "empty-database" };

/**
 * Tell a database that already has the baseline's tables that it has already
 * run the baseline, so the next `db:migrate` starts at 0001 instead of trying
 * to create tables that exist.
 *
 * Idempotent, and read-only on every path that decides not to write, because
 * the three databases this runs against have nothing else in common: a fresh
 * lane (nothing to adopt), a lane or developer database built by the old
 * `drizzle-kit push` (adopt it), and one already migrated (leave it alone).
 * `lane-up.sh` therefore runs this unconditionally before `db:migrate`, which
 * makes the documented production cutover the same pair of commands every lane
 * boot exercises.
 *
 * Refuses when only some of the baseline's tables are present. That database is
 * half-built, no automatic answer is right, and it is exactly the case where
 * guessing wrong writes a journal row that makes the missing tables
 * unreachable.
 */
export async function baseline(database: Drizzle): Promise<BaselineOutcome> {
  const applied = await journalRows(database);
  if (applied.length > 0) {
    return { action: "already-journalled", applied: applied.length };
  }

  const [first] = readJournal();
  if (!first) throw new Error(`No migrations in ${MIGRATIONS_FOLDER}`);

  const wanted = tablesCreatedBy(readMigrationSql(first.tag));
  const existing = await publicTables(database);
  const present = wanted.filter((table) => existing.has(table));

  if (present.length === 0) return { action: "empty-database" };
  if (present.length < wanted.length) {
    const missing = wanted.filter((table) => !existing.has(table));
    throw new Error(
      `Refusing to baseline: ${present.length} of ${wanted.length} tables from ${first.tag} exist, missing ${missing.join(", ")}. ` +
        `A half-built database needs a person to look at it, not a journal row that hides the missing tables.`,
    );
  }

  const hash = migrationHash(first.tag);
  await database.execute(
    sql`create schema if not exists ${sql.identifier(MIGRATIONS_SCHEMA)}`,
  );
  await database.execute(sql`
    create table if not exists ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `);
  await database.execute(
    sql`insert into ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} ("hash", "created_at") values (${hash}, ${first.when})`,
  );
  return { action: "recorded", tag: first.tag, hash };
}

/** Apply every migration the journal does not yet record. Returns how many ran. */
export async function applyPending(database: Drizzle): Promise<number> {
  const before = await journalRows(database);
  await migrate(database, {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsSchema: MIGRATIONS_SCHEMA,
    migrationsTable: MIGRATIONS_TABLE,
  });
  const after = await journalRows(database);
  return after.length - before.length;
}

async function main() {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Run this through `pnpm db:migrate`, or source a lane's .env.lane first.",
    );
    process.exit(1);
  }

  const logger = pino({ level: process.env["LOG_LEVEL"] ?? "warn" });
  const database = getDatabase(logger, url);
  const startedAt = Date.now();

  try {
    if (process.argv.includes("--baseline")) {
      const outcome = await baseline(database);
      if (outcome.action === "recorded") {
        console.log(
          `Recorded ${outcome.tag} as already applied (${outcome.hash.slice(0, 12)}…). Run db:migrate to apply anything after it.`,
        );
      } else if (outcome.action === "already-journalled") {
        console.log(
          `Nothing to adopt: ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE} already records ${outcome.applied} migration(s).`,
        );
      } else {
        console.log(
          "Nothing to adopt: this database has none of the baseline's tables. Run db:migrate to create them.",
        );
      }
    } else {
      const applied = await applyPending(database);
      console.log(
        applied === 0
          ? `Already up to date, applied 0 migrations in ${Date.now() - startedAt}ms.`
          : `Applied ${applied} migration(s) in ${Date.now() - startedAt}ms.`,
      );
    }
  } finally {
    await database.$client.end();
  }
}

// Only when run as a command. The unit tests import the helpers above.
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  try {
    await main();
  } catch (error) {
    // The message, not a stack trace. The failure most worth reading here is
    // `--baseline` refusing a half-built database, and that message is the
    // whole answer.
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
