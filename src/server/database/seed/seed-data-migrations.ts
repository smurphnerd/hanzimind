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
 *   2. nobody has studied anything — no `user_vocab_items` row has `seen` set.
 *
 * The first alone is not enough, and measuring it proved that. A database whose
 * columns were just dropped WITH the data in them also has no legacy columns, so
 * a re-seed would have written the marker over the wreckage and certified the
 * loss. That is the indistinguishability the marker exists to escape, reappearing
 * one level up.
 *
 * WHY `seen` AND NOT AN EMPTY TABLE. The gate first asked for an empty
 * `user_vocab_items`, which was sound but too narrow: `study/addDeck` writes a
 * row per deck item, so saving a single deck closed the window, and a healthy
 * never-migrated database whose first seed happened to land after that was told
 * to restore a snapshot of a migration it never ran.
 *
 * `seen` is the wider fact and just as safe. A non-default legacy pair could
 * only be written by `processAnswer`, which sets `seen` in the same statement,
 * so no seen row implies every legacy pair was still at its default and there
 * was nothing to lose. A re-seed of a studied database leaves the marker exactly
 * as it found it.
 *
 * WHAT MAKES THE WINDOW RELIABLE is the ORDER, not the width. This runs first in
 * `seed/index.ts`, before anything else writes, so the claim is evaluated when
 * the database is definitionally free of learner data. An earlier version ran
 * last and justified itself with "studying needs a dictionary and the dictionary
 * arrives with the first seed" — which is false, because `seedDictionary` commits
 * in batches, so an interrupted first seed leaves a usable dictionary and no
 * marker. Killing one at thirty seconds left 420 rows and no marker; one answer
 * after that shut the window permanently. Running first makes an interruption
 * harmless: the marker is written, the dictionary is partial, and the marker is
 * still true. Do not move this call later in the seed.
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
 * Whether the seed may claim a marker for one move. Pure, so the gate has a
 * truth table a test can hold to.
 *
 * Each condition rules out a different way of being wrong:
 *
 *   markerTableExists  false means the schema has not been pushed for this yet,
 *                      and writing would kill the seed rather than record
 *                      anything.
 *   studiedItems > 0   somebody has answered a card, so this database has a past
 *                      the seed cannot vouch for. This is the one that stops a
 *                      re-seed certifying a database whose columns were just
 *                      dropped with the data still in them.
 *   legacyColumnsRemaining > 0
 *                      the old shape is still here, so the move is still owed
 *                      and claiming it done would be a lie.
 */
export function shouldClaimMarker(state: {
  markerTableExists: boolean;
  /**
   * Rows in `user_vocab_items`, which is one per deck item the moment a learner
   * SAVES a deck, long before they answer anything.
   *
   * Deliberately passed and deliberately unread. An earlier gate consulted this
   * instead of `studiedItems` and refused healthy databases; with the number
   * absent from the signature that mistake is not expressible here, so a test
   * cannot kill it and reverting to it looks like a no-op. Present, the
   * difference between the two rules is a case with a value that must not change
   * the answer. Do not delete it without moving that case somewhere it can still
   * fail.
   */
  learnerRows: number;
  studiedItems: number;
  legacyColumnsRemaining: number;
}): boolean {
  if (!state.markerTableExists) return false;
  if (state.studiedItems > 0) return false;
  return state.legacyColumnsRemaining === 0;
}

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

  // The seed must never be the thing that fails a deploy. A database pushed from
  // a schema without this table is a schema/data ordering the operator can
  // recover from; a seed that dies on a Postgres parser error partway through is
  // not, and it took the dictionary down with it.
  const markerTable = await database.execute(
    sql.raw("select to_regclass('data_migrations') as name"),
  );
  const markerTableExists =
    (markerTable.rows[0] as { name: string | null }).name !== null;
  if (!markerTableExists) return claimed;

  const counts = await database.execute(
    sql.raw(`select count(*)::int as rows,
                    count(*) filter (where seen)::int as studied
               from user_vocab_items`),
  );
  const { rows: learnerRows, studied: studiedItems } = counts.rows[0] as {
    rows: number;
    studied: number;
  };

  for (const move of MOVES) {
    // `studied` above reads `user_vocab_items` by name while each move declares
    // its own table, which is a deliberate inconsistency while there is exactly
    // one move and its columns are columns OF that table. A second move against
    // a different table would make the two disagree — the gate would ask about
    // the wrong history — so at that point the studied-check has to move inside
    // this loop and be asked per move.
    const { table, columns } = move.supersededColumns;
    const present = await database.execute(
      sql.raw(`select count(*)::int as count
                 from information_schema.columns
                where table_schema = current_schema()
                  and table_name = '${table}'
                  and column_name in (${columns.map((c) => `'${c}'`).join(", ")})`),
    );
    const legacyColumnsRemaining = (present.rows[0] as { count: number }).count;
    if (
      !shouldClaimMarker({
        markerTableExists,
        learnerRows,
        studiedItems,
        legacyColumnsRemaining,
      })
    ) {
      continue;
    }

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
