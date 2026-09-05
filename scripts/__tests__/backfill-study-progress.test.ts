import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

import { schema } from "@/server/database/schema";
import { STUDY_TYPES } from "@/definitions/definitions";
import {
  COPY_SQL,
  CREATE_TABLE_SQL,
  LEGACY_COLUMNS,
  RESTORE_COLUMNS_SQL,
  RESTORE_ROWS_SQL,
  VERIFY_SQL,
} from "../backfill-study-progress";

/** The drizzle config casts to snake_case; `getTableConfig` does not apply it. */
const snake = (name: string) =>
  name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/**
 * The script has to create `user_study_progress` itself, because the copy runs
 * before `pnpm db:push` and push cannot add the table without dropping the
 * columns being copied. That leaves one DDL in two places, so this pins the
 * hand-written one to the Drizzle table it has to reproduce.
 *
 * It checks shape, not text: a column added to `schema.ts` and forgotten here
 * fails, which is the drift that would silently lose a value. Whether the two
 * agree on every constraint detail is settled live, by `pnpm db:push` reporting
 * no drift immediately after the script has run.
 */
describe("CREATE_TABLE_SQL", () => {
  const table = getTableConfig(schema.userStudyProgress);
  const columnNames = table.columns.map((column) => snake(column.name));
  const quoted = (name: string) => new RegExp(`"${name}"\\s`);

  it("should declare every column the Drizzle table has", () => {
    const missing = columnNames.filter(
      (name) => !quoted(name).test(CREATE_TABLE_SQL),
    );
    expect(missing).toEqual([]);
  });

  it("should declare no column the Drizzle table does not have", () => {
    const declared = [...CREATE_TABLE_SQL.matchAll(/^ {2}"(\w+)"/gm)].map(
      (match) => match[1],
    );
    expect(declared.sort()).toEqual([...columnNames].sort());
  });

  it("should give the primary key the three columns Drizzle does", () => {
    expect(
      table.primaryKeys[0].columns.map((column) => snake(column.name)),
    ).toEqual(["user_id", "vocab_item_id", "study_type"]);
    expect(CREATE_TABLE_SQL).toContain(
      `primary key ("user_id", "vocab_item_id", "study_type")`,
    );
  });

  it("should be safe to re-run", () => {
    expect(CREATE_TABLE_SQL).toContain("create table if not exists");
  });
});

describe("LEGACY_COLUMNS", () => {
  it("should name a level and a due time for every study type", () => {
    expect(LEGACY_COLUMNS).toEqual([
      "reading_level",
      "reading_next_at",
      "listening_level",
      "listening_next_at",
      "understanding_level",
      "understanding_next_at",
      "writing_level",
      "writing_next_at",
    ]);
  });

  it("should cover every study type the app has", () => {
    expect(LEGACY_COLUMNS).toHaveLength(STUDY_TYPES.length * 2);
  });
});

describe("COPY_SQL", () => {
  it("should read every legacy column", () => {
    const unread = LEGACY_COLUMNS.filter(
      (column) => !COPY_SQL.includes(`u.${column}`),
    );
    expect(unread).toEqual([]);
  });

  it("should leave a row the app has since advanced alone", () => {
    // Idempotence, and the reason a second run cannot undo a level the learner
    // earned between the copy and the column drop.
    expect(COPY_SQL).toContain(
      "on conflict (user_id, vocab_item_id, study_type) do nothing",
    );
  });

  it("should skip the pairs a missing row already stands for", () => {
    expect(COPY_SQL).toContain("where not (legacy.level = 0");
  });
});

describe("VERIFY_SQL", () => {
  it("should compare every legacy column", () => {
    const unread = LEGACY_COLUMNS.filter(
      (column) => !VERIFY_SQL.includes(`u.${column}`),
    );
    expect(unread).toEqual([]);
  });

  it("should compare due times with `is distinct from`", () => {
    // `p.next_at <> legacy.next_at` is null when either side is null, so a
    // dropped due time would pass a `where` built on it. This is the whole
    // difference between a check and a check that cannot fail.
    expect(VERIFY_SQL).toContain("p.next_at is distinct from legacy.next_at");
  });

  it("should accept a missing row only where the legacy pair was the default", () => {
    expect(VERIFY_SQL).toContain(
      "when p.user_id is null then not (legacy.level = 0 and legacy.next_at is null)",
    );
  });
});

/**
 * The reverse. `--down` has to put the eight columns back before `schema.ts`
 * describes them again, so its DDL is hand-written too — and unlike the forward
 * DDL there is no `db:push` afterwards to catch a mistake, because push on the
 * reverted schema simply agrees with whatever is there. These pin the
 * definitions instead.
 */
describe("RESTORE_COLUMNS_SQL", () => {
  it("should add every legacy column back", () => {
    const missing = LEGACY_COLUMNS.filter(
      (column) =>
        !RESTORE_COLUMNS_SQL.includes(`add column if not exists "${column}"`),
    );
    expect(missing).toEqual([]);
  });

  it("should restore a level as a non-null integer defaulting to zero", () => {
    // What the column was at a391426. A nullable one would let `?? 0` back in,
    // and no default would fail on the existing rows.
    expect(RESTORE_COLUMNS_SQL).toContain(
      `add column if not exists "reading_level" integer not null default 0`,
    );
  });

  it("should restore a due time as a nullable timestamp", () => {
    expect(RESTORE_COLUMNS_SQL).toContain(
      `add column if not exists "reading_next_at" timestamp`,
    );
  });

  it("should be safe to re-run", () => {
    expect(RESTORE_COLUMNS_SQL).not.toContain('add column "');
  });
});

describe("RESTORE_ROWS_SQL", () => {
  it("should clear every legacy column before filling any of them", () => {
    // Without the reset, a re-run over columns that already exist keeps stale
    // values on exactly the pairs the forward copy declined to write, and
    // nothing else would overwrite them.
    const [reset] = RESTORE_ROWS_SQL;
    const unreset = LEGACY_COLUMNS.filter(
      (column) =>
        !reset.includes(`${column} = 0`) && !reset.includes(`${column} = null`),
    );
    expect(unreset).toEqual([]);
  });

  it("should write one statement per study type after the reset", () => {
    expect(RESTORE_ROWS_SQL).toHaveLength(STUDY_TYPES.length + 1);
  });

  it("should match each statement to its own study type", () => {
    for (const [index, type] of STUDY_TYPES.entries()) {
      const statement = RESTORE_ROWS_SQL[index + 1];
      expect(statement).toContain(`set ${type}_level = p.level`);
      expect(statement).toContain(`p.study_type = '${type}'`);
    }
  });

  it("should join on the whole primary key", () => {
    // Dropping vocab_item_id from the join would write one item's level onto
    // every item the learner studies.
    expect(RESTORE_ROWS_SQL[1]).toContain("p.user_id = u.user_id");
    expect(RESTORE_ROWS_SQL[1]).toContain("p.vocab_item_id = u.vocab_item_id");
  });
});
