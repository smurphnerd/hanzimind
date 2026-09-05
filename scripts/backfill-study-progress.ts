/**
 * Moves a live database's study progress out of `user_vocab_items`'s four
 * `<type>_level` / `<type>_next_at` column pairs and into one
 * `user_study_progress` row per study type.
 *
 * RUN THIS BEFORE `pnpm db:push`, not after. Push applies the whole schema in
 * one go, so it drops the four pairs in the same run that creates the new
 * table, and there is nothing left to copy from. The order is:
 *
 *   1. tsx scripts/backfill-study-progress.ts --dry-run   (safe on production)
 *   2. tsx scripts/backfill-study-progress.ts             (the copy)
 *   3. pnpm db:push                                       (drops the columns)
 *
 * Step 3 is safe because step 2 refuses to commit a copy it cannot prove.
 *
 * WHAT IT PROVES. The copy and the check run in one transaction. The check is
 * `VERIFY_SQL`: for every (learner, item, study type) the legacy columns
 * describe, it asserts either that a row carries exactly that level and due
 * time, or that the legacy pair was the default a missing row already stands
 * for. One disagreement rolls the whole thing back and exits non-zero, so a
 * committed run means every legacy value is accounted for. The check is the
 * guarantee rather than a claim about it, and `--verify` runs it alone.
 *
 * GOING BACK. `--down` reverses it: it puts the eight columns back, copies the
 * rows into them, and checks the result with the same query the forward
 * direction uses, which is symmetric. Then revert the code and run `pnpm
 * db:push`, which drops `user_study_progress` because the reverted schema has no
 * such table. The DDL has to be spelled out here for the same reason as the
 * forward one: at the moment it runs, `schema.ts` does not describe those
 * columns. `--down` is NOT a substitute for a `pg_dump` before step 2 — it can
 * only restore what the rows still hold.
 *
 * MODES.
 *   --dry-run  Rehearses all of it — create, copy, check — prints the counts,
 *              then rolls back. Postgres makes DDL transactional, so even the
 *              CREATE TABLE is undone and nothing survives the run. This is the
 *              mode to point at a database you are not allowed to change.
 *              Combines with --down.
 *   --verify   Compares only. Writes nothing and creates nothing, so it needs
 *              the new table to exist and the legacy columns to still be there.
 *              Use it to re-check a database someone else has migrated.
 *   --down     Restores the columns from the rows. See above.
 *   (default)  Copies and commits.
 *
 * RE-RUNNING IT. Only genuinely inert AFTER `pnpm db:push` has dropped the legacy
 * columns: there is then nothing to read, and the script says so and exits 0,
 * which is what makes it safe to leave in a deploy script. Before that it is
 * safe but not a no-op. `ON CONFLICT DO NOTHING` means a second run never
 * overwrites a row, so a level the app advanced in between is not reverted — but
 * the legacy column still holds the old value, `VERIFY_SQL` sees the two
 * disagree, and the run rolls back and exits NON-ZERO. That is the check doing
 * its job on a database that has moved on, not a failure to fix: copy, then push,
 * and do not leave the two apart across a period of study.
 *
 * THE ONE THING IT CANNOT UNDO. If `pnpm db:push` runs BEFORE the copy, the eight
 * columns and every level in them are gone, and no mode here can bring them back
 * — `--down` restores what the rows hold, and there would be no rows. The script
 * detects that state rather than reporting success over it: see
 * `lostProgressRefusal`. Take a `pg_dump` before step 2.
 *
 * WHAT IS NOT COPIED. A pair at level 0 with a null due time is exactly what a
 * missing row means, so it is left out rather than written as several hundred
 * rows per learner saying nothing. Level 0 WITH a due time is a different
 * thing — an answer got wrong — and is copied. `VERIFY_SQL` accepts absence for
 * the first case and for no other.
 */
import { pathToFileURL } from "node:url";

import { sql } from "drizzle-orm";

import { bootstrap } from "./bootstrap";
import { STUDY_TYPES } from "@/definitions/definitions";

/** The eight columns this script reads out of `user_vocab_items`. */
export const LEGACY_COLUMNS = STUDY_TYPES.flatMap((type) => [
  `${type}_level`,
  `${type}_next_at`,
]);

/**
 * `user_study_progress` as `drizzle-kit push` would create it.
 *
 * Spelled out here rather than taken from `schema.ts` because the copy has to
 * run before push does, and push cannot be asked to add a table without also
 * dropping the columns this script exists to read.
 * `backfill-study-progress.test.ts` pins it against the Drizzle table so a
 * column cannot land in one and not the other, and the live check is that a
 * `pnpm db:push` straight afterwards reports no drift.
 */
export const CREATE_TABLE_SQL = `
create table if not exists "user_study_progress" (
  "user_id" text not null,
  "vocab_item_id" text not null,
  "study_type" text not null,
  "level" integer not null default 0,
  "next_at" timestamp,
  "created_at" timestamp not null default now(),
  "updated_at" timestamp not null,
  constraint "user_study_progress_user_id_vocab_item_id_study_type_pk"
    primary key ("user_id", "vocab_item_id", "study_type"),
  constraint "user_study_progress_user_id_users_id_fk"
    foreign key ("user_id") references "users"("id"),
  constraint "user_study_progress_vocab_item_id_vocab_items_id_fk"
    foreign key ("vocab_item_id") references "vocab_items"("id")
)`;

/**
 * The eight columns as they stood before this migration, for `--down`.
 *
 * Same defaults and nullability as the Drizzle table had at `a391426`: a level
 * is a non-null integer defaulting to 0, a due time is a nullable timestamp.
 * `if not exists` so a half-finished rollback can be re-run.
 */
export const RESTORE_COLUMNS_SQL = `
alter table "user_vocab_items"
${LEGACY_COLUMNS.map((column) =>
  column.endsWith("_level")
    ? `  add column if not exists "${column}" integer not null default 0`
    : `  add column if not exists "${column}" timestamp`,
).join(",\n")}`;

/**
 * The rows folded back into the columns: a reset, then one UPDATE per type.
 *
 * The reset is not redundant. `add column if not exists` leaves an existing
 * column's contents alone, so a half-finished rollback re-run would otherwise
 * keep stale values on the pairs the new table has no row for — and those are
 * exactly the pairs the forward direction declined to write, so nothing would
 * overwrite them. Resetting first makes the restored shape a function of the
 * rows alone.
 *
 * One statement per type rather than one `case` over four, because each writes
 * a different pair of columns and four statements each saying one thing read
 * better than one saying four.
 */
export const RESTORE_ROWS_SQL = [
  `update user_vocab_items set
${STUDY_TYPES.map((type) => `  ${type}_level = 0, ${type}_next_at = null`).join(
  ",\n",
)}`,
  ...STUDY_TYPES.map(
    (type) => `
update user_vocab_items u
   set ${type}_level = p.level,
       ${type}_next_at = p.next_at
  from user_study_progress p
 where p.user_id = u.user_id
   and p.vocab_item_id = u.vocab_item_id
   and p.study_type = '${type}'`,
  ),
];

/**
 * The legacy columns unpivoted into the shape the new table holds.
 *
 * `values` rather than four unioned selects, so each row is read once and so
 * the four types are named in one place.
 */
const LEGACY_ROWS_SQL = `
  select u.user_id, u.vocab_item_id, t.study_type, t.level, t.next_at
    from user_vocab_items u
    cross join lateral (values
      ('reading',       u.reading_level,       u.reading_next_at),
      ('listening',     u.listening_level,     u.listening_next_at),
      ('understanding', u.understanding_level, u.understanding_next_at),
      ('writing',       u.writing_level,       u.writing_next_at)
    ) as t(study_type, level, next_at)`;

/** A pair that says nothing a missing row does not already say. */
const IS_DEFAULT = `(legacy.level = 0 and legacy.next_at is null)`;

export const COPY_SQL = `
insert into user_study_progress
  (user_id, vocab_item_id, study_type, level, next_at, created_at, updated_at)
select legacy.user_id, legacy.vocab_item_id, legacy.study_type,
       legacy.level, legacy.next_at, now(), now()
  from (${LEGACY_ROWS_SQL}) as legacy
 where not ${IS_DEFAULT}
    on conflict (user_id, vocab_item_id, study_type) do nothing`;

/**
 * Every legacy value the new table fails to account for. Empty is the proof.
 *
 * `is distinct from` rather than `<>`, so a null due time compares as a value
 * instead of swallowing the comparison and passing. The `limit` bounds what a
 * failure prints; it cannot hide a mismatch from a run that passes, because a
 * passing run returns no rows at all.
 */
export const VERIFY_SQL = `
select legacy.user_id, legacy.vocab_item_id, legacy.study_type,
       legacy.level as legacy_level, legacy.next_at as legacy_next_at,
       p.level as copied_level, p.next_at as copied_next_at
  from (${LEGACY_ROWS_SQL}) as legacy
  left join user_study_progress p
    on p.user_id = legacy.user_id
   and p.vocab_item_id = legacy.vocab_item_id
   and p.study_type = legacy.study_type
 where case
         when p.user_id is null then not ${IS_DEFAULT}
         else p.level is distinct from legacy.level
           or p.next_at is distinct from legacy.next_at
       end
 limit 20`;

type Executor = {
  execute: (query: ReturnType<typeof sql.raw>) => Promise<{ rows: unknown[] }>;
};

/**
 * The refusal to print when the database says progress has already been lost,
 * or null when nothing is wrong. Pure, so the truth table is a unit test.
 *
 * The state it catches: somebody has studied, and `user_study_progress` is
 * empty. Reaching that means the levels went somewhere unrecoverable.
 *
 *   copy, columns gone     the drop ran before the copy. Every level is gone.
 *   restore, any columns   there is nothing to restore FROM, and the reset the
 *                          restore starts with would zero whatever the columns
 *                          still hold — turning a rollback into the same loss.
 *
 * `copy` with the columns still present is the normal starting point and is not
 * refused: the table is empty because the copy has not run yet.
 *
 * `seenRows` is the signal for "somebody has studied" because `seen` is the one
 * fact about a learner's history that this migration never moves. Its blind spot
 * is a learner who has only ever been shown introductions and never answered a
 * graded card: they have `seen` rows and legitimately no progress rows. The
 * message says so, so an operator can tell the two apart.
 */
export function lostProgressRefusal(state: {
  direction: "copy" | "restore";
  legacyColumnsPresent: boolean;
  progressRows: number;
  seenRows: number;
}): string | null {
  if (state.progressRows > 0) return null;
  if (state.seenRows === 0) return null;
  if (state.direction === "copy" && state.legacyColumnsPresent) return null;

  const cause =
    state.direction === "copy"
      ? "the legacy columns are gone, so `pnpm db:push` ran before the copy did"
      : state.legacyColumnsPresent
        ? "there is nothing to restore from, and the restore would zero the columns that still hold it"
        : "the legacy columns are gone and there is nothing to restore from";

  return [
    `REFUSING TO CONTINUE. ${state.seenRows} user_vocab_items rows are marked seen, but user_study_progress is empty and ${cause}.`,
    "That combination cannot come from a correct sequence, and this script cannot repair it: the levels are not anywhere it can read.",
    "Recovery is a restore from the snapshot taken before the migration. Nothing has been written by this run.",
    "One benign reading: a learner who has only ever been shown introductions and has never answered a graded card has seen rows and no progress rows. If that is genuinely this database, there is nothing here to migrate.",
  ].join("\n");
}

async function legacyColumnsPresent(database: Executor): Promise<string[]> {
  const wanted = LEGACY_COLUMNS.map((column) => `'${column}'`).join(", ");
  const result = await database.execute(
    sql.raw(`select column_name
               from information_schema.columns
              where table_schema = current_schema()
                and table_name = 'user_vocab_items'
                and column_name in (${wanted})`),
  );
  return result.rows.map((row) => (row as { column_name: string }).column_name);
}

/** Whether anyone has studied, and whether any of it is in the new table. */
async function progressState(database: Executor) {
  const table = await database.execute(
    sql.raw("select to_regclass('user_study_progress') as name"),
  );
  const tableExists = (table.rows[0] as { name: string | null }).name !== null;
  return {
    tableExists,
    progressRows: tableExists
      ? await countOf(database, "select 1 from user_study_progress")
      : 0,
    seenRows: await countOf(
      database,
      "select 1 from user_vocab_items where seen",
    ),
  };
}

const countOf = async (database: Executor, query: string) => {
  const result = await database.execute(
    sql.raw(`select count(*)::int as count from (${query}) as q`),
  );
  return (result.rows[0] as { count: number }).count;
};

/** Thrown to roll a rehearsal back. Never an error the operator has to read. */
class Rehearsed extends Error {}

/**
 * Put the columns back and fill them from the rows.
 *
 * Checked with `VERIFY_SQL`, the same query the forward direction commits on.
 * It is symmetric: it fails both on a row the columns do not carry and on a
 * column value no row justifies, so it proves the restored shape and the rows
 * describe the same progress whichever way the data travelled.
 */
async function goingBack(args: {
  logger: ReturnType<typeof bootstrap>["logger"];
  database: ReturnType<typeof bootstrap>["database"];
  dryRun: boolean;
}) {
  const { logger, database, dryRun } = args;

  const state = await progressState(database);
  if (!state.tableExists) {
    throw new Error(
      "user_study_progress does not exist, so there is nothing to restore from. If the legacy columns are still there, this database was never migrated.",
    );
  }

  // Before the reset, which is the destructive half. A restore from an empty
  // table writes zeros over every column it touches, so on a database that has
  // been studied it destroys exactly what it claims to be recovering.
  const refusal = lostProgressRefusal({
    direction: "restore",
    legacyColumnsPresent:
      (await legacyColumnsPresent(database)).length === LEGACY_COLUMNS.length,
    progressRows: state.progressRows,
    seenRows: state.seenRows,
  });
  if (refusal) throw new Error(refusal);

  try {
    await database.transaction(async (tx) => {
      await tx.execute(sql.raw(RESTORE_COLUMNS_SQL));
      for (const statement of RESTORE_ROWS_SQL) {
        await tx.execute(sql.raw(statement));
      }

      // A progress row whose parent is gone has nowhere to be restored to, and
      // VERIFY_SQL walks from the parent so it would never see it.
      const orphans = await countOf(
        tx,
        `select 1 from user_study_progress p
          where not exists (select 1 from user_vocab_items u
                             where u.user_id = p.user_id
                               and u.vocab_item_id = p.vocab_item_id)`,
      );
      const mismatches = await tx.execute(sql.raw(VERIFY_SQL));
      if (orphans > 0 || mismatches.rows.length > 0) {
        logger.error(
          { orphans, sample: mismatches.rows },
          "The restore does not reproduce every progress row. Rolling back.",
        );
        throw new Error("Verification failed, nothing was written");
      }

      logger.info(
        {
          progressRows: await countOf(tx, "select 1 from user_study_progress"),
          rowsRestoredInto: await countOf(tx, "select 1 from user_vocab_items"),
          verified: "the columns and the rows describe the same progress",
        },
        dryRun ? "Dry run complete, rolling back" : "Restore complete",
      );

      if (dryRun) throw new Rehearsed();
    });
  } catch (error) {
    if (!(error instanceof Rehearsed)) throw error;
  }

  logger.info(
    dryRun
      ? "Nothing was written. Re-run without --dry-run to restore the columns."
      : "The columns are back. Revert the code, then pnpm db:push to drop user_study_progress.",
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const verifyOnly = process.argv.includes("--verify");
  const down = process.argv.includes("--down");
  if (dryRun && verifyOnly) {
    throw new Error("Pass --dry-run or --verify, not both");
  }
  if (down && verifyOnly) {
    throw new Error("Pass --down or --verify, not both");
  }

  const { logger, database } = bootstrap();

  if (down) return goingBack({ logger, database, dryRun });

  const present = await legacyColumnsPresent(database);
  if (present.length === 0) {
    const state = await progressState(database);
    const refusal = lostProgressRefusal({
      direction: "copy",
      legacyColumnsPresent: false,
      progressRows: state.progressRows,
      seenRows: state.seenRows,
    });
    if (refusal) throw new Error(refusal);

    logger.info(
      { progressRows: state.progressRows },
      "user_vocab_items has no legacy level columns, so this database already keeps progress in user_study_progress. Nothing to do.",
    );
    return;
  }
  if (present.length !== LEGACY_COLUMNS.length) {
    throw new Error(
      `user_vocab_items has ${present.length} of the ${LEGACY_COLUMNS.length} legacy columns (${present.join(", ")}). Refusing to act on half a schema.`,
    );
  }

  if (verifyOnly) {
    const mismatches = await database.execute(sql.raw(VERIFY_SQL));
    if (mismatches.rows.length > 0) {
      logger.error(
        { sample: mismatches.rows },
        "user_study_progress does not account for every legacy value",
      );
      throw new Error("Verification failed");
    }
    logger.info(
      { legacyPairs: await countOf(database, LEGACY_ROWS_SQL) },
      "Every legacy level and due time is accounted for in user_study_progress",
    );
    return;
  }

  try {
    await database.transaction(async (tx) => {
      await tx.execute(sql.raw(CREATE_TABLE_SQL));

      const before = await countOf(tx, "select 1 from user_study_progress");
      await tx.execute(sql.raw(COPY_SQL));
      const after = await countOf(tx, "select 1 from user_study_progress");

      const mismatches = await tx.execute(sql.raw(VERIFY_SQL));
      if (mismatches.rows.length > 0) {
        logger.error(
          { sample: mismatches.rows },
          "The copy does not account for every legacy value. Rolling back.",
        );
        throw new Error("Verification failed, nothing was written");
      }

      logger.info(
        {
          legacyPairs: await countOf(tx, LEGACY_ROWS_SQL),
          carryingProgress: await countOf(
            tx,
            `select 1 from (${LEGACY_ROWS_SQL}) as legacy where not ${IS_DEFAULT}`,
          ),
          rowsBefore: before,
          rowsWritten: after - before,
          rowsAfter: after,
          verified: "every legacy level and due time is accounted for",
        },
        dryRun ? "Dry run complete, rolling back" : "Copy complete",
      );

      if (dryRun) throw new Rehearsed();
    });
  } catch (error) {
    if (!(error instanceof Rehearsed)) throw error;
  }

  logger.info(
    dryRun
      ? "Nothing was written. Re-run without --dry-run to copy, then pnpm db:push to drop the legacy columns."
      : "Now run pnpm db:push to drop the legacy columns.",
  );
}

/**
 * Only when run as a command. The SQL above is exported for
 * `backfill-study-progress.test.ts`, and importing a module must not open a
 * database connection.
 */
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
