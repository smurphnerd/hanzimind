/**
 * ADMIN_EMAILS seeds who starts out an admin. The runtime source of truth is
 * now `users.role` (Better Auth admin plugin), which travels on the session and
 * can be granted in-app; this env list only bootstraps the first admins, via
 * scripts/backfill-admin-roles.ts. These helpers exist for that backfill — they
 * are no longer consulted on the request path.
 */

/** Splits the raw ADMIN_EMAILS value into comparable addresses. */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/**
 * Whether this address is an admin.
 *
 * Addresses are compared case-insensitively because providers treat the local
 * part inconsistently and a user can sign up with any casing. An empty or
 * missing address is never an admin, so an unconfigured ADMIN_EMAILS closes the
 * door rather than opening it.
 */
export function isAdminEmail(
  email: string | null | undefined,
  adminEmails: readonly string[],
): boolean {
  if (!email) return false;

  const normalised = email.trim().toLowerCase();
  if (normalised.length === 0) return false;

  return adminEmails.includes(normalised);
}
