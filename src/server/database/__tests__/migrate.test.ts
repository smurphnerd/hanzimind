import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { getTableName, is, Table } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";

import {
  MIGRATIONS_FOLDER,
  MIGRATIONS_SCHEMA,
  MIGRATIONS_TABLE,
  migrationHash,
  readJournal,
  readMigrationSql,
  tablesCreatedBy,
} from "../migrate";
import * as schema from "../schema";

const journal = readJournal();

/** Every `pgTable` schema.ts exports, by its real Postgres name. */
const schemaTables = Object.values(schema)
  .filter((value) => is(value, Table))
  .map((table) => getTableName(table))
  .sort();

/** Every table any checked-in migration creates. */
const migratedTables = journal
  .flatMap((entry) => tablesCreatedBy(readMigrationSql(entry.tag)))
  .sort();

describe("the checked-in migrations", () => {
  it("creates every table schema.ts exports", () => {
    // Guard against the assertion below passing on an empty list, which is what
    // it would do if a drizzle upgrade changed how `is(value, Table)` answers.
    expect(schemaTables.length).toBeGreaterThan(10);
    expect(migratedTables).toEqual(expect.arrayContaining(schemaTables));
  });

  it("creates no table schema.ts does not export", () => {
    expect(schemaTables).toEqual(expect.arrayContaining(migratedTables));
  });

  it("reproduces the schema file exactly, so db:generate has nothing to emit", async () => {
    // The offline half of "run drizzle-kit generate and see no changes": diff
    // the checked-in snapshot against schema.ts through drizzle-kit's own
    // differ. Zero statements is the whole assertion. Without this, editing
    // schema.ts and forgetting to run db:generate is invisible until a lane or
    // production tries to boot against a schema no migration builds.
    const latest = journal.at(-1)!;
    const snapshot = JSON.parse(
      readFileSync(
        path.join(
          MIGRATIONS_FOLDER,
          "meta",
          `${String(latest.idx).padStart(4, "0")}_snapshot.json`,
        ),
        "utf8",
      ),
    ) as Parameters<typeof generateMigration>[0];
    const current = generateDrizzleJson(
      schema,
      undefined,
      undefined,
      "snake_case",
    );
    expect(await generateMigration(snapshot, current)).toEqual([]);
  });

  it("has a file for every journal entry and an entry for every file", () => {
    const onDisk = readdirSync(MIGRATIONS_FOLDER)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.replace(/\.sql$/, ""))
      .sort();
    expect(onDisk).toEqual(journal.map((entry) => entry.tag).sort());
  });

  it("hashes each migration the way drizzle's own migrator does", () => {
    // The hash and the folder timestamp are what `--baseline` writes into the
    // journal so a database that already has the tables is left alone. Pinning
    // them against drizzle's reader is what keeps that row valid across a
    // drizzle upgrade.
    const theirs = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
    expect(theirs.map((m) => ({ hash: m.hash, when: m.folderMillis }))).toEqual(
      journal.map((entry) => ({
        hash: migrationHash(entry.tag),
        when: entry.when,
      })),
    );
  });
});

describe("tablesCreatedBy", () => {
  it("reads the quoted name out of each CREATE TABLE", () => {
    expect(
      tablesCreatedBy(
        `CREATE TABLE "accounts" (\n\t"id" text\n);\nCREATE TABLE IF NOT EXISTS "decks" ("id" text);`,
      ),
    ).toEqual(["accounts", "decks"]);
  });

  it("ignores a table named only inside a foreign key", () => {
    expect(
      tablesCreatedBy(
        `ALTER TABLE "accounts" ADD CONSTRAINT "fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");`,
      ),
    ).toEqual([]);
  });
});

describe("the journal table name", () => {
  it("matches what drizzle.config.ts tells drizzle-kit to use", () => {
    const config = readFileSync(
      path.join(MIGRATIONS_FOLDER, "..", "drizzle.config.ts"),
      "utf8",
    );
    expect(config).toContain(`schema: "${MIGRATIONS_SCHEMA}"`);
    expect(config).toContain(`table: "${MIGRATIONS_TABLE}"`);
  });
});
