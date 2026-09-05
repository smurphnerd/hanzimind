import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

import { schema } from "@/server/database/schema";
import { STUDY_TYPES } from "@/definitions/definitions";
import {
  COPY_SQL,
  CREATE_TABLE_SQL,
  LEGACY_COLUMNS,
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
