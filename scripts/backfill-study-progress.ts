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
 *   --verify   Compares only, and always runs. It writes nothing and changes
 *              nothing, so there is no state it should decline to describe --
 *              a diagnostic that refuses on the database you are worried about
 *              is no diagnostic. With the legacy columns gone there is nothing
 *              left to compare against, so it reports the counts instead.
 *   --down     Restores the columns from the rows. See above.
 *   (default)  Copies and commits.
 *
 *   --accept-unexplained-seen   Overrides the refusal below, for an operator who
 *              knows their learners really do have that many introduction-only
 *              items. The refusal cannot prove which state it is looking at, so
 *              it must not be a dead end.
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
 * — `--down` restores what the rows hold, and there would be no rows. Take a
 * `pg_dump` before step 2.
 *
 * `lostProgressRefusal` notices when a database stops accounting for the history
 * it should have, and stops rather than reporting success over it. It measures
 * how many seen items have no progress row at all, NOT whether the new table is
 * empty: the empty test was silent one graded answer after the loss, and fired
 * on a healthy database one introduction card in. It cannot prove what happened,
 * so it says what it saw, gives both readings, and takes an override.
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
 * How many seen items a learner may have with no progress row before the state
 * stops looking like ordinary use.
 *
 * An item gets `seen` and no progress row exactly one way: it was shown as an
 * introduction and never answered. That is a session boundary, and it is rare by
 * construction — an introduction writes no `next_at`, so the item is immediately
 * due at level 0, and selection puts due reviews ahead of introductions, which
 * means the very next card is almost always the graded one for the same item.
 * A learner accumulates roughly one of these per abandoned session.
 *
 * So a handful is ordinary and sixty is not. 20 sits well above what abandoned
 * sessions produce and two thirds below the real learner's 61, which is the
 * margin that matters: the number has to separate "one intro card" from "every
 * level is gone".
 *
 * PER LEARNER, not summed. This is the whole reason the limit can be a constant.
 * Summed, the statistic grows with the user base while the limit does not, so a
 * hundred learners each holding one abandoned introduction would cross 20 and
 * refuse a database where nothing is wrong. The catastrophe does not look like
 * that: it puts nearly every seen item of EVERY learner out of account at once,
 * so the worst single learner is already far past the limit. Taking the maximum
 * asks "is there a learner whose history stopped adding up", which means the
 * same thing on the operator's one-learner database and on a thousand.
 *
 * It is a judgement, not a measurement, which is why crossing it refuses with an
 * override rather than deciding on the operator's behalf.
 */
export const UNEXPLAINED_SEEN_LIMIT = 20;

/**
 * The refusal to print when the database no longer accounts for the progress it
 * should have, or null when it does. Pure, so the truth table is a unit test.
 *
 * WHAT THIS MEASURES, and why the earlier version was wrong. It first asked "is
 * `user_study_progress` empty while something is marked seen", which is neither
 * necessary nor sufficient. One card answered through the API after the loss
 * makes the table non-empty and the check silent, and one introduction card on a
 * healthy database makes it fire. Both were demonstrated live.
 *
 * The statistic that does separate them is how many of ONE learner's seen items
 * have NO progress of any kind. On a healthy learner that is the count of their
 * abandoned sessions; on a database whose levels were dropped it is very nearly
 * every seen item they have, and an answer trickling in afterwards moves it by
 * one rather than switching it off.
 *
 * `worst` is the learner with the most such items, so the caller does the
 * grouping and this stays pure. Null when nobody has seen anything.
 *
 * WHAT IT CANNOT DO. It cannot prove the accident happened, only that the
 * database does not look like one that was migrated correctly. So the message
 * gives both readings, makes the destructive advice conditional on the first,
 * and takes an override for an operator who knows it is the second.
 */
export interface LearnerProgress {
  userId: string;
  /** Items this learner has answered or been shown at least once. */
  seenItems: number;
  /** How many of those have at least one user_study_progress row. */
  itemsWithProgress: number;
}

/** Seen items this learner has no progress of any kind for. */
export const unexplainedSeen = (learner: LearnerProgress) =>
  learner.seenItems - learner.itemsWithProgress;

export function lostProgressRefusal(state: {
  direction: "copy" | "restore";
  legacyColumnsPresent: boolean;
  worst: LearnerProgress | null;
  accepted: boolean;
}): string | null {
  if (state.accepted) return null;

  // Nothing can have been lost while the columns that hold it are still there
  // and all the copy would do is read them.
  if (state.direction === "copy" && state.legacyColumnsPresent) return null;

  if (!state.worst) return null;
  const unexplained = unexplainedSeen(state.worst);
  if (unexplained <= UNEXPLAINED_SEEN_LIMIT) return null;

  const consequence =
    state.direction === "copy"
      ? "the copy would have nothing to read, and this script would report success over a database that had already lost its levels"
      : "the restore starts by zeroing all eight columns, so it would write that shortfall over whatever the columns still hold";

  return [
    "REFUSING TO CONTINUE.",
    "",
    `Observed: learner ${state.worst.userId} has ${state.worst.seenItems} items marked seen, but only ${state.worst.itemsWithProgress} of them have any row in user_study_progress. That leaves ${unexplained} seen items with no progress of any kind, against a limit of ${UNEXPLAINED_SEEN_LIMIT}. This is the worst single learner, not a total: a large user base does not add up to a refusal.`,
    "",
    "Two things look like that, and this script cannot tell them apart:",
    "",
    "  1. `pnpm db:push` ran before the copy. That drops the eight legacy columns and every level in them, and no mode here can bring them back. If this is what happened, the levels are gone from everywhere this script can read, and the recovery is a restore from the snapshot taken before the migration.",
    "",
    "  2. Those items were genuinely only ever shown as introductions and never answered. Ordinary in ones and twos; this many is not, which is why it stopped.",
    "",
    `Either way, continuing is wrong: under (1) ${consequence}.`,
    "",
    "Nothing has been written by this run. If you know (2) is the true reading, re-run with --accept-unexplained-seen.",
  ].join("\n");
}

/**
 * Which of the eight legacy columns `user_vocab_items` still has.
 *
 * `partial` is its own answer rather than a synonym for absent. Half a schema
 * means something interrupted a push, and neither direction can act on it: the
 * copy would read columns that are not all there, and the restore would report
 * "the legacy columns are gone" about a table that still has four of them.
 */
async function legacySchema(database: Executor) {
  const wanted = LEGACY_COLUMNS.map((column) => `'${column}'`).join(", ");
  const result = await database.execute(
    sql.raw(`select column_name
               from information_schema.columns
              where table_schema = current_schema()
                and table_name = 'user_vocab_items'
                and column_name in (${wanted})`),
  );
  const present = result.rows.map(
    (row) => (row as { column_name: string }).column_name,
  );
  const state =
    present.length === LEGACY_COLUMNS.length
      ? "present"
      : present.length === 0
        ? "absent"
        : "partial";
  return { state, present } as const;
}

export const halfSchemaRefusal = (present: string[]) =>
  `user_vocab_items has ${present.length} of the ${LEGACY_COLUMNS.length} legacy columns (${present.join(", ")}). Refusing to act on half a schema.`;

/** What the database says about the learner's history, on both shapes. */
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
    worst: await worstLearner(database, tableExists),
  };
}

/**
 * The learner with the most seen items that have no progress row, or null when
 * nobody has seen anything.
 *
 * Grouped rather than summed, so the limit means the same thing whatever the
 * user base. Counted from `user_vocab_items` outward and restricted to seen
 * rows, so the subtraction cannot go negative: every item counted in
 * `itemsWithProgress` is one already counted in `seenItems`.
 */
async function worstLearner(
  database: Executor,
  tableExists: boolean,
): Promise<LearnerProgress | null> {
  const withProgress = tableExists
    ? `left join (select distinct user_id, vocab_item_id from user_study_progress) p
         on p.user_id = u.user_id and p.vocab_item_id = u.vocab_item_id`
    : "";
  const progressCount = tableExists
    ? "count(*) filter (where p.user_id is not null)"
    : "0";

  const result = await database.execute(
    sql.raw(`select u.user_id,
                    count(*)::int as seen_items,
                    ${progressCount}::int as items_with_progress
               from user_vocab_items u
               ${withProgress}
              where u.seen
              group by u.user_id
              order by (count(*) - ${progressCount}) desc
              limit 1`),
  );
  const row = result.rows[0] as
    | { user_id: string; seen_items: number; items_with_progress: number }
    | undefined;
  if (!row) return null;

  return {
    userId: row.user_id,
    seenItems: row.seen_items,
    itemsWithProgress: row.items_with_progress,
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
  accepted: boolean;
}) {
  const { logger, database, dryRun, accepted } = args;

  const state = await progressState(database);
  if (!state.tableExists) {
    throw new Error(
      "user_study_progress does not exist, so there is nothing to restore from. If the legacy columns are still there, this database was never migrated.",
    );
  }

  // Before the reset, which is the destructive half. A restore from an empty
  // table writes zeros over every column it touches, so on a database that has
  // been studied it destroys exactly what it claims to be recovering.
  const columns = await legacySchema(database);
  if (columns.state === "partial") {
    throw new Error(halfSchemaRefusal(columns.present));
  }

  const refusal = lostProgressRefusal({
    direction: "restore",
    legacyColumnsPresent: columns.state === "present",
    worst: state.worst,
    accepted,
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
  const accepted = process.argv.includes("--accept-unexplained-seen");
  if (dryRun && verifyOnly) {
    throw new Error("Pass --dry-run or --verify, not both");
  }
  if (down && verifyOnly) {
    throw new Error("Pass --down or --verify, not both");
  }

  const { logger, database } = bootstrap();
  const columns = await legacySchema(database);

  // Before every other check. `--verify` writes nothing and changes nothing, so
  // there is no state it should refuse to describe — a diagnostic that declines
  // to run on the database you are worried about is no diagnostic at all. It
  // reports what it can see and leaves the judgement to the reader.
  if (verifyOnly) {
    const state = await progressState(database);
    const unexplained = state.worst ? unexplainedSeen(state.worst) : 0;

    if (!state.tableExists) {
      logger.info(
        {
          legacyColumns: columns.present.length,
          seenRows: state.seenRows,
        },
        "user_study_progress does not exist yet, so nothing has been copied and there is nothing to compare. Run the copy first.",
      );
      return;
    }

    if (columns.state !== "present") {
      logger.info(
        {
          legacyColumns: columns.present.length,
          progressRows: state.progressRows,
          seenRows: state.seenRows,
          worstLearner: state.worst?.userId,
          worstLearnerSeenWithNoProgress: unexplained,
        },
        columns.state === "absent"
          ? "The legacy columns are gone, so there is nothing left to compare against. The counts above are what remains; seenWithNoProgress far above zero would mean the levels never reached user_study_progress."
          : "user_vocab_items has only some of the legacy columns, so a comparison would be meaningless. The counts above are what remains.",
      );
      return;
    }

    const mismatches = await database.execute(sql.raw(VERIFY_SQL));
    if (mismatches.rows.length > 0) {
      logger.error(
        { sample: mismatches.rows },
        "user_study_progress does not account for every legacy value",
      );
      throw new Error("Verification failed");
    }
    logger.info(
      {
        legacyPairs: await countOf(database, LEGACY_ROWS_SQL),
        worstLearnerSeenWithNoProgress: unexplained,
      },
      "Every legacy level and due time is accounted for in user_study_progress",
    );
    return;
  }

  if (columns.state === "partial") {
    throw new Error(halfSchemaRefusal(columns.present));
  }

  if (down) return goingBack({ logger, database, dryRun, accepted });

  const state = await progressState(database);
  const refusal = lostProgressRefusal({
    direction: "copy",
    legacyColumnsPresent: columns.state === "present",
    worst: state.worst,
    accepted,
  });
  if (refusal) throw new Error(refusal);

  if (columns.state === "absent") {
    logger.info(
      {
        progressRows: state.progressRows,
        worstLearnerSeenWithNoProgress: state.worst
          ? unexplainedSeen(state.worst)
          : 0,
      },
      "user_vocab_items has no legacy level columns, so this database already keeps progress in user_study_progress. Nothing to do.",
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
