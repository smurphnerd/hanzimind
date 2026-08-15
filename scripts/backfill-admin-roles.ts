/**
 * Seeds the `users.role` column from the ADMIN_EMAILS environment variable.
 *
 * Admin access used to be computed on every request by matching the signed-in
 * email against ADMIN_EMAILS. It now lives on the session as `user.role`
 * (Better Auth admin plugin), so the env list is no longer consulted at
 * runtime — it is only the seed for who starts out an admin. This script closes
 * that gap: every account whose email is in ADMIN_EMAILS is promoted to
 * `role = 'admin'` so nobody loses the access they already had.
 *
 * ADDITIVE and idempotent: it only ever promotes, never demotes, so running it
 * again — or against a database where roles have since been edited in-app — is
 * safe. Removing someone's admin rights is a deliberate act done in the app or
 * by hand, never a side effect of this backfill.
 *
 * Run with:  doppler run --project hanzimind --config <cfg> -- \
 *              ./node_modules/.bin/tsx scripts/backfill-admin-roles.ts --dry-run
 */
import { pino } from "pino";
import { and, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import { parseAdminEmails } from "@/server/admin-access";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const logger = pino({ transport: { target: "pino-pretty" } });

  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const adminEmails = parseAdminEmails(process.env["ADMIN_EMAILS"]);
  if (adminEmails.length === 0) {
    logger.warn("ADMIN_EMAILS is empty — nothing to promote.");
    return;
  }

  const database = getDatabase(logger, databaseUrl);

  // Match case-insensitively: parseAdminEmails lower-cases, and a user can sign
  // up with any casing. Only touch rows that are not already admins.
  const toPromote = await database
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(
      and(
        inArray(sql`lower(${schema.users.email})`, adminEmails),
        // `is distinct from` so a NULL role counts as "not admin" and is caught.
        sql`${schema.users.role} is distinct from 'admin'`,
      ),
    );

  logger.info(
    { adminEmails, matches: toPromote.map((u) => u.email) },
    dryRun
      ? "Dry run — accounts that WOULD be promoted to admin"
      : "Promoting accounts to admin",
  );

  if (!dryRun && toPromote.length > 0) {
    await database
      .update(schema.users)
      .set({ role: "admin" })
      .where(
        inArray(
          schema.users.id,
          toPromote.map((u) => u.id),
        ),
      );
  }

  logger.info(
    { promoted: dryRun ? 0 : toPromote.length, matched: toPromote.length },
    "Admin-role backfill complete",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
