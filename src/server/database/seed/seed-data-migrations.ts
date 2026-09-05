import { sql } from "drizzle-orm";

import type { Drizzle } from "../database";

/**
 * The moves `pnpm db:push` cannot make, and which of them a fresh database is
 * already past by virtue of never having had the old shape.
 *
 * Each entry names the legacy columns its move exists to drain. Two conditions
 * have to hold before the seed claims a marker, and the second one is the
 * important one:
 *
 *   1. those columns are absent, and
 *   2. there is no learner history at all — `user_vocab_items` is empty.
 *
 * The first alone is not enough, and measuring it proved that. A database whose
 * columns were just dropped WITH the data in them also has no legacy columns, so
 * a re-seed would have written the marker over the wreckage and certified the
 * loss. That is the indistinguishability the marker exists to escape, reappearing
 * one level up.
 *
 * Emptiness is the fact that separates them. A database that never had the old
 * shape has no progress to have lost; one that lost its progress still has the
 * learners and the rows that used to carry it. So the seed claims a marker only
 * for a database with nothing in it yet, and a re-seed of an established
 * database — which every lane boot does — leaves the marker exactly as it found
 * it.
 */
const MOVES = [
  {
    name: "study-progress-rows",
    supersededColumns: {
      table: "user_vocab_items",
      columns: [
        "reading_level",
        "listening_level",
        "understanding_level",
        "writing_level",
        "reading_next_at",
        "listening_next_at",
        "understanding_next_at",
        "writing_next_at",
      ],
    },
    note: "seeded on the row shape; there were never legacy columns to copy from",
  },
] as const;

/**
 * Record the data moves a fresh database is born past.
 *
 * `backfill-study-progress.ts` writes the same rows when it migrates an existing
 * database, and refuses when the old columns are gone and no row is there. A
 * fresh database has no old columns and never ran the copy, so without this it
 * would look exactly like one whose data was dropped — which is the state that
 * refusal exists to catch.
 */
export async function seedDataMigrations(database: Drizzle): Promise<string[]> {
  const claimed: string[] = [];

  const history = await database.execute(
    sql.raw("select count(*)::int as count from user_vocab_items"),
  );
  // Anything here means learners have used this database, so it is not a fresh
  // one and the seed has no business certifying anything about its past.
  if ((history.rows[0] as { count: number }).count > 0) return claimed;

  for (const move of MOVES) {
    const { table, columns } = move.supersededColumns;
    const present = await database.execute(
      sql.raw(`select count(*)::int as count
                 from information_schema.columns
                where table_schema = current_schema()
                  and table_name = '${table}'
                  and column_name in (${columns.map((c) => `'${c}'`).join(", ")})`),
    );
    const remaining = (present.rows[0] as { count: number }).count;
    if (remaining > 0) continue;

    const written = await database.execute(
      sql.raw(`insert into data_migrations (name, note, created_at, updated_at)
               values ('${move.name}', '${move.note}', now(), now())
                  on conflict (name) do nothing
            returning name`),
    );
    if (written.rows.length > 0) claimed.push(move.name);
  }

  return claimed;
}
