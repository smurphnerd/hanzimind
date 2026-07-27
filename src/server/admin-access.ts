/**
 * Admin rights come from the ADMIN_EMAILS environment variable rather than a
 * column, so they cannot be granted from inside the app — there is no endpoint
 * that could be tricked into promoting someone, and a compromised account cannot
 * escalate itself. Changing the list is a deploy, which is the intended friction.
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
