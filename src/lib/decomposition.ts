/**
 * Split a raw decomposition string into teachable component characters,
 * stripping Ideographic Description Characters (U+2FF0–U+2FFF) and the
 * `？`/`?` placeholders. Mirrors the server-side logic in
 * VocabService.getVocabItemParts.
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
