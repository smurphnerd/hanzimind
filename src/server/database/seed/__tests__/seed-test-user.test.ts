import { verifyPassword } from "better-auth/crypto";
import { describe, expect, it } from "vitest";

import type { Drizzle } from "../../database";
import {
  seedTestUsers,
  TEST_USER_PASSWORD,
  testUsersFor,
} from "../seed-test-users";

type InsertedRow = Record<string, unknown>;

function recordingDatabase(rows: InsertedRow[]): Drizzle {
  const insert = () => ({
    values: (row: InsertedRow) => {
      rows.push(row);
      const chain = {
        onConflictDoNothing: () => chain,
        returning: async () => [{ id: `id-${rows.length}` }],
        then: (resolve: (value: unknown) => void) => resolve(undefined),
      };
      return chain;
    },
  });
  return { insert } as unknown as Drizzle;
}

function untouchableDatabase(): Drizzle {
  return new Proxy({} as Drizzle, {
    get(_, property) {
      throw new Error(`database.${String(property)} was called`);
    },
  });
}

describe("testUsersFor", () => {
  it("returns nothing when SEED_TEST_USER is unset", () => {
    expect(testUsersFor({})).toEqual([]);
  });

  it("returns nothing when SEED_TEST_USER is not exactly 1", () => {
    expect(testUsersFor({ SEED_TEST_USER: "true" })).toEqual([]);
  });

  it("returns the learner and the admin when SEED_TEST_USER=1", () => {
    const emails = testUsersFor({ SEED_TEST_USER: "1" }).map((u) => [
      u.email,
      u.role,
    ]);
    expect(emails).toEqual([
      ["verify@hanzimind.test", "user"],
      ["verify-admin@hanzimind.test", "admin"],
    ]);
  });
});

describe("seedTestUsers", () => {
  it("does not touch the database when SEED_TEST_USER is unset", async () => {
    await expect(seedTestUsers(untouchableDatabase(), {})).resolves.toBe(0);
  });

  it("refuses to seed in production even with SEED_TEST_USER=1", async () => {
    await expect(
      seedTestUsers(untouchableDatabase(), {
        SEED_TEST_USER: "1",
        NODE_ENV: "production",
      }),
    ).rejects.toThrow(/production/);
  });

  it("creates verified users with a credential account when SEED_TEST_USER=1", async () => {
    const rows: InsertedRow[] = [];

    const created = await seedTestUsers(recordingDatabase(rows), {
      SEED_TEST_USER: "1",
    });

    expect(created).toBe(2);
    const learner = rows[0];
    expect(learner).toMatchObject({
      email: "verify@hanzimind.test",
      emailVerified: true,
      role: "user",
    });
    const account = rows[1];
    expect(account).toMatchObject({
      providerId: "credential",
      userId: "id-1",
      accountId: "id-1",
    });
    expect(account.password).not.toBe(TEST_USER_PASSWORD);
    await expect(
      verifyPassword({
        hash: account.password as string,
        password: TEST_USER_PASSWORD,
      }),
    ).resolves.toBe(true);
  });
});
