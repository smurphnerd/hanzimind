import { hashPassword } from "better-auth/crypto";

import type { Drizzle } from "../database";
import { schema } from "../schema";

export const TEST_USER_PASSWORD = "verify-hanzimind";

type TestUser = {
  name: string;
  email: string;
  role: "user" | "admin";
};

const TEST_USERS: readonly TestUser[] = [
  { name: "Verify Learner", email: "verify@hanzimind.test", role: "user" },
  { name: "Verify Admin", email: "verify-admin@hanzimind.test", role: "admin" },
];

export function testUsersFor(env: {
  SEED_TEST_USER?: string;
}): readonly TestUser[] {
  return env.SEED_TEST_USER === "1" ? TEST_USERS : [];
}

/**
 * Inserts the verification accounts, already verified, so a lane can sign in
 * without Mailpit. The password hash comes from Better Auth's own `hashPassword`
 * and the account row mirrors what `signUpEmail` writes (`providerId`
 * "credential", `accountId` equal to the user id), so the normal sign-in
 * endpoint accepts it. Re-running is a no-op for a user that already exists.
 */
export async function seedTestUsers(
  database: Drizzle,
  env: { SEED_TEST_USER?: string; NODE_ENV?: string },
): Promise<number> {
  const users = testUsersFor(env);
  if (users.length === 0) return 0;
  if (env.NODE_ENV === "production") {
    throw new Error(
      "SEED_TEST_USER=1 would create an admin with a public password in production",
    );
  }

  const password = await hashPassword(TEST_USER_PASSWORD);
  let created = 0;
  for (const user of users) {
    const [inserted] = await database
      .insert(schema.users)
      .values({
        name: user.name,
        email: user.email,
        emailVerified: true,
        role: user.role,
      })
      .onConflictDoNothing()
      .returning({ id: schema.users.id });
    if (!inserted) continue;

    await database.insert(schema.accounts).values({
      userId: inserted.id,
      accountId: inserted.id,
      providerId: "credential",
      password,
    });
    created++;
  }
  return created;
}
