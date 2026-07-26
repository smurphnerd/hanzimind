/**
 * Split a raw decomposition string into candidate component characters,
 * stripping Ideographic Description Characters (U+2FF0–U+2FFF) and the
 * `？`/`?` placeholders.
 *
 * This is purely string-level. It cannot tell whether a part is disabled, so it
 * is not enough on its own for anything user-facing — go through
 * VocabService.getVocabItemParts, which additionally drops disabled parts, and
 * render the resulting array. Client components should use the `constituents`
 * field rather than re-splitting the raw `decomposition` string.
 */
export function filterDecomposition(
  decomposition: string | null | undefined,
): string[] {
  if (!decomposition) return [];
  return Array.from(decomposition).filter((c) => {
    if (c === "？" || c === "?") return false;
    const cp = c.codePointAt(0) ?? 0;
    if (cp >= 0x2ff0 && cp <= 0x2fff) return false;
    return true;
  });
}
