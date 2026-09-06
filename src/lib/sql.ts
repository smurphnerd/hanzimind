/**
 * Neutralise LIKE wildcards so a search for `%` matches a literal percent sign
 * rather than every row. Backslash is Postgres's default escape character, so it
 * has to be escaped before the wildcards that will use it.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, (char) => `\\${char}`);
}
