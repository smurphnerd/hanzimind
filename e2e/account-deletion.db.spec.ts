/**
 * The only test of the deletion post-condition that runs against a real
 * Postgres. Every other one hands it a stub executor, and a stub cannot reach
 * the two things that defeated it live: a foreign key the catalogue query
 * filtered out, and a referential action the walk had no branch for. Both were
 * invisible to a hand-written row set and both left a learner locked out of an
 * account that still held all their data.
 *
 * So this plants a real reference in the lane's database, runs the real
 * deletion, and asserts the refusal and that the credentials survive it.
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

const database = drizzle(laneDatabaseUrl(), {
  schema,
  casing: "snake_case",
});

/** What the account has to still have after a refusal, or it is locked out. */
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

test.describe.configure({ mode: "serial" });

test("with nothing planted, the deletion runs to the end", async () => {
  const userId = await learnerId();
  class Rollback extends Error {}
  // Rolled back, so the lane keeps its learner for every other spec. The point
  // is that the post-condition passes when it should, or the refusals below
  // would prove nothing.
  await expect(
    database.transaction(async (tx) => {
      await clearAccountData(tx, userId);
      throw new Rollback();
    }),
  ).rejects.toThrow(Rollback);
  expect(await credentials(userId)).toBe(1);
});

test("a foreign key from another schema refuses the deletion", async () => {
  const userId = await learnerId();
  await database.execute(sql`create schema if not exists probe_audit`);
  try {
    await database.execute(sql`
      create table probe_audit.receipts (
        id text primary key,
        uid text references public.users(id))
    `);
    await database.execute(
      sql`insert into probe_audit.receipts (id, uid) values ('r1', ${userId})`,
    );

    await expect(
      database.transaction((tx) => clearAccountData(tx, userId)),
    ).rejects.toThrow(/probe_audit\.receipts\.uid/);
    expect(await credentials(userId), "the account kept its password").toBe(1);
  } finally {
    await database.execute(sql`drop schema if exists probe_audit cascade`);
  }
});

test("a set null onto a column that refuses one refuses the deletion", async () => {
  const userId = await learnerId();
  try {
    // Postgres accepts this constraint and fails only when the delete runs.
    await database.execute(sql`
      create table probe_setnull (
        id text primary key,
        uid text not null references users(id) on delete set null)
    `);
    await database.execute(
      sql`insert into probe_setnull (id, uid) values ('s1', ${userId})`,
    );

    await expect(
      database.transaction((tx) => clearAccountData(tx, userId)),
    ).rejects.toThrow(/set null onto a column that refuses one/);
    expect(await credentials(userId), "the account kept its password").toBe(1);
  } finally {
    await database.execute(sql`drop table if exists probe_setnull`);
  }
});

/**
 * The other half of the pass condition. Refusing is safe and a lockout is not,
 * but a guard that refuses everything is no feature: the shape check this
 * replaced would have failed every deletion in the database on encountering a
 * composite key, whether or not a row referenced the account.
 */
test("a composite key nothing references does not block the deletion", async () => {
  const userId = await learnerId();
  class Rollback extends Error {}
  try {
    await database.execute(
      sql`create unique index probe_users_id_email on users(id, email)`,
    );
    await database.execute(sql`
      create table probe_pairs (
        id text primary key,
        uid text,
        uemail text,
        foreign key (uid, uemail) references users(id, email))
    `);

    await expect(
      database.transaction(async (tx) => {
        await clearAccountData(tx, userId);
        throw new Rollback();
      }),
    ).rejects.toThrow(Rollback);
  } finally {
    await database.execute(sql`drop table if exists probe_pairs`);
    await database.execute(sql`drop index if exists probe_users_id_email`);
  }
});

test("a row pointing at itself is not a leftover", async () => {
  const userId = await learnerId();
  class Rollback extends Error {}
  try {
    await database.execute(
      sql`alter table users add column probe_referred_by text references users(id)`,
    );
    await database.execute(
      sql`update users set probe_referred_by = id where id = ${userId}`,
    );

    // Postgres deletes such a row happily: the reference goes with it.
    await expect(
      database.transaction(async (tx) => {
        await clearAccountData(tx, userId);
        throw new Rollback();
      }),
    ).rejects.toThrow(Rollback);
  } finally {
    await database.execute(
      sql`alter table users drop column if exists probe_referred_by`,
    );
  }
});
