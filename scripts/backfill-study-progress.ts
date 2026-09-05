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
 * MODES.
 *   --dry-run  Rehearses all of it — create, copy, check — prints the counts,
 *              then rolls back. Postgres makes DDL transactional, so even the
 *              CREATE TABLE is undone and nothing survives the run. This is the
 *              mode to point at a database you are not allowed to change.
 *   --verify   Compares only. Writes nothing and creates nothing, so it needs
 *              the new table to exist and the legacy columns to still be there.
 *              Use it to re-check a database someone else has migrated.
 *   (default)  Copies and commits.
 *
 * IDEMPOTENT. Rows go in with ON CONFLICT DO NOTHING, so a second run cannot
 * revert a level the app has advanced since the first. Once `pnpm db:push` has
 * dropped the legacy columns there is nothing left to read, and the script says
 * so and exits 0 — which is what makes it safe to leave in a deploy script.
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

const countOf = async (database: Executor, query: string) => {
  const result = await database.execute(
    sql.raw(`select count(*)::int as count from (${query}) as q`),
  );
  return (result.rows[0] as { count: number }).count;
};

/** Thrown to roll a rehearsal back. Never an error the operator has to read. */
class Rehearsed extends Error {}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const verifyOnly = process.argv.includes("--verify");
  if (dryRun && verifyOnly) {
    throw new Error("Pass --dry-run or --verify, not both");
  }

  const { logger, database } = bootstrap();

  const present = await legacyColumnsPresent(database);
  if (present.length === 0) {
    logger.info(
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
