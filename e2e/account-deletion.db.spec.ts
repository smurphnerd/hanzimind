/**
 * The only test of the deletion guard that runs against a real Postgres. Every
 * other one hands it a stub, and a stub cannot reach what defeated the guard
 * live: a trigger, a rule that swallows the delete, a trigger behind a cascade,
 * a foreign key in another schema, a set-null onto a column that refuses one.
 * None of those is visible to a hand-written row set, and each one left a
 * learner locked out of an account that still held all their data.
 *
 * So this plants the real thing in the lane's database, runs the real deletion,
 * and asserts the refusal and that the credentials survive it.
 *
 * Every case rolls its transaction back, including the ones that expect a
 * refusal. Relying on the refusal to abort means that when the refusal stops
 * happening — the regression these exist to catch — the transaction commits and
 * destroys the seeded learner's decks and progress, which is how a failing test
 * becomes two problems.
 */
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { clearAccountData } from "@/server/account-deletion";
import { schema } from "@/server/database/schema";

import { LEARNER, SEED_HINT } from "./fixtures";

function laneDatabaseUrl() {
  const lane = process.env.E2E_LANE ?? "0";
  const env = readFileSync(`development/lanes/${lane}/.env.lane`, "utf8");
  const match = /^DATABASE_URL=(.+)$/m.exec(env);
  if (!match) throw new Error(`lane ${lane} has no DATABASE_URL`);
  return match[1]!;
}

const database = drizzle(laneDatabaseUrl(), { schema, casing: "snake_case" });

/** Thrown to undo the deletion whatever the outcome, so the lane keeps its learner. */
class Rollback extends Error {}

/** What the account has to still have afterwards, or it is locked out. */
async function credentials(userId: string) {
  const rows = await database
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId));
  return rows.length;
}

async function learnerId() {
  const [learner] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, LEARNER.email));
  expect(learner, SEED_HINT).toBeTruthy();
  return learner!.id;
}

/** Runs the real deletion and always undoes it, whatever it decided. */
function attemptDeletion(userId: string) {
  return database.transaction(async (tx) => {
    await clearAccountData(tx, userId);
    throw new Rollback();
  });
}

/** Plants something in the database, runs the deletion, and cleans up. */
async function planted(
  setUp: string[],
  tearDown: string[],
  run: () => Promise<void>,
) {
  try {
    for (const statement of setUp) await database.execute(sql.raw(statement));
    await run();
  } finally {
    for (const statement of tearDown)
      await database.execute(sql.raw(statement));
  }
}

test.describe.configure({ mode: "serial" });

test("with nothing planted, the deletion runs to the end", async () => {
  const userId = await learnerId();
  // The deletion reaching its own rollback is what "it would have succeeded"
  // looks like from outside. Without this the refusals below prove nothing.
  await expect(attemptDeletion(userId)).rejects.toThrow(Rollback);
  expect(await credentials(userId)).toBe(1);
});

test("a foreign key from another schema refuses the deletion", async () => {
  const userId = await learnerId();
  await planted(
    [
      "create schema probe_audit",
      `create table probe_audit.receipts (
         id text primary key, uid text references public.users(id))`,
      `insert into probe_audit.receipts
         select 'r1', id from users where email = '${LEARNER.email}'`,
    ],
    ["drop schema if exists probe_audit cascade"],
    async () => {
      await expect(attemptDeletion(userId)).rejects.toThrow(/receipts/);
      expect(await credentials(userId), "kept its password").toBe(1);
    },
  );
});

test("a set null onto a column that refuses one refuses the deletion", async () => {
  const userId = await learnerId();
  await planted(
    [
      // Postgres accepts this constraint and fails only when the delete runs.
      `create table probe_setnull (
         id text primary key,
         uid text not null references users(id) on delete set null)`,
      `insert into probe_setnull
         select 's1', id from users where email = '${LEARNER.email}'`,
    ],
    ["drop table if exists probe_setnull"],
    async () => {
      await expect(attemptDeletion(userId)).rejects.toThrow(/probe_setnull/);
      expect(await credentials(userId), "kept its password").toBe(1);
    },
  );
});

// Deferred to commit, which the trial never reaches: the rollback discards the
// queued check unevaluated unless the trial fires it first. Both of these
// passed the trial and stranded the learner at better-auth's own commit.
test("a deferred foreign key refuses the deletion", async () => {
  const userId = await learnerId();
  await planted(
    [
      `create table probe_def (
         id text primary key,
         uid text references users(id) deferrable initially deferred)`,
      `insert into probe_def
         select 'd1', id from users where email = '${LEARNER.email}'`,
    ],
    ["drop table if exists probe_def"],
    async () => {
      await expect(attemptDeletion(userId)).rejects.toThrow(/probe_def/);
      expect(await credentials(userId), "kept its password").toBe(1);
    },
  );
});

// The same hole with no foreign key in it, which is what shows the defect is
// anything deferred to commit rather than deferred keys.
test("a deferred constraint trigger refuses the deletion", async () => {
  const userId = await learnerId();
  await planted(
    [
      `create function probe_deferred() returns trigger language plpgsql as $$
         begin raise exception 'probe_deferred says no'; end $$`,
      `create constraint trigger probe_deferred_trg after delete on users
         deferrable initially deferred
         for each row execute function probe_deferred()`,
    ],
    [
      "drop trigger if exists probe_deferred_trg on users",
      "drop function if exists probe_deferred()",
    ],
    async () => {
      await expect(attemptDeletion(userId)).rejects.toThrow(
        /probe_deferred says no/,
      );
      expect(await credentials(userId), "kept its password").toBe(1);
    },
  );
});

// The three below have no row in pg_constraint at all, which is why no walk of
// the catalogue could ever have caught them.
test("a trigger that raises refuses the deletion", async () => {
  const userId = await learnerId();
  await planted(
    [
      `create function probe_guard() returns trigger language plpgsql as $$
         begin raise exception 'probe_guard says no'; end $$`,
      `create trigger probe_guard_trg before delete on users
         for each row execute function probe_guard()`,
    ],
    [
      "drop trigger if exists probe_guard_trg on users",
      "drop function if exists probe_guard()",
    ],
    async () => {
      await expect(attemptDeletion(userId)).rejects.toThrow(
        /probe_guard says no/,
      );
      expect(await credentials(userId), "kept its password").toBe(1);
    },
  );
});

// The worst outcome the flow can produce: the delete reports success while
// removing nothing, so the learner is shown "Your account is gone" over a row
// whose password has already been taken away.
test("a rule that swallows the delete refuses the deletion", async () => {
  const userId = await learnerId();
  await planted(
    ["create rule probe_no_delete as on delete to users do instead nothing"],
    ["drop rule if exists probe_no_delete on users"],
    async () => {
      // Postgres refuses RETURNING on a relation whose delete a rule rewrites,
      // so the trial cannot be quietly swallowed; if a rule ever gets past that
      // the row count catches it instead.
      await expect(attemptDeletion(userId)).rejects.toThrow(
        /cannot perform DELETE RETURNING|removed 0 rows rather than one/,
      );
      expect(await credentials(userId), "kept its password").toBe(1);
    },
  );
});

test("a trigger behind a cascading child refuses the deletion", async () => {
  const userId = await learnerId();
  await planted(
    [
      `create table probe_casc (
         id text primary key,
         uid text references users(id) on delete cascade)`,
      `insert into probe_casc
         select 'c1', id from users where email = '${LEARNER.email}'`,
      `create function probe_casc_guard() returns trigger language plpgsql as $$
         begin raise exception 'probe_casc says no'; end $$`,
      `create trigger probe_casc_trg before delete on probe_casc
         for each row execute function probe_casc_guard()`,
    ],
    [
      "drop table if exists probe_casc",
      "drop function if exists probe_casc_guard()",
    ],
    async () => {
      await expect(attemptDeletion(userId)).rejects.toThrow(
        /probe_casc says no/,
      );
      expect(await credentials(userId), "kept its password").toBe(1);
    },
  );
});

// The walk this replaced anchored on current_schema() and never checked that a
// users table was there, so a search_path pointing somewhere else made it walk
// a table that does not exist and pass everything. The trial delete has no
// anchor to miss: it resolves the same names the application's own queries do.
test("a search_path pointing elsewhere does not blind the deletion", async () => {
  const userId = await learnerId();
  await planted(
    [
      "create schema probe_ns",
      `create table public.probe_ns_notes (
         id text primary key, uid text references public.users(id))`,
      `insert into public.probe_ns_notes
         select 'n1', id from users where email = '${LEARNER.email}'`,
    ],
    [
      "drop table if exists public.probe_ns_notes",
      "drop schema if exists probe_ns cascade",
    ],
    async () => {
      await expect(
        database.transaction(async (tx) => {
          await tx.execute(sql.raw("set local search_path = probe_ns, public"));
          await clearAccountData(tx, userId);
          throw new Rollback();
        }),
      ).rejects.toThrow(/probe_ns_notes/);
      expect(await credentials(userId), "kept its password").toBe(1);
    },
  );
});

/**
 * The other half of the pass condition. Refusing is safe and a lockout is not,
 * but a guard that refuses everything is no feature.
 */
test("a composite key nothing references does not block the deletion", async () => {
  const userId = await learnerId();
  await planted(
    [
      "create unique index probe_users_id_email on users(id, email)",
      `create table probe_pairs (
         id text primary key, uid text, uemail text,
         foreign key (uid, uemail) references users(id, email))`,
    ],
    [
      "drop table if exists probe_pairs",
      "drop index if exists probe_users_id_email",
    ],
    async () => {
      await expect(attemptDeletion(userId)).rejects.toThrow(Rollback);
    },
  );
});

test("a row pointing at itself is not a leftover", async () => {
  const userId = await learnerId();
  await planted(
    [
      "alter table users add column probe_referred_by text references users(id)",
      `update users set probe_referred_by = id where id = '${userId}'`,
    ],
    ["alter table users drop column if exists probe_referred_by"],
    async () => {
      // Postgres deletes such a row happily: the reference goes with it.
      await expect(attemptDeletion(userId)).rejects.toThrow(Rollback);
    },
  );
});
