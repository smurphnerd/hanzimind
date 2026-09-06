import type { DeckTypeCountsDto, VocabType } from "@/definitions/definitions";
import { vocabTypeMeta } from "@/lib/vocab-type";

/**
 * Smallest unit first, so the strip reads in the order the deck is actually
 * learned. The deck page's own GROUPS list shares this order.
 */
export const COMPOSITION_ORDER: readonly VocabType[] = [
  "component",
  "character",
  "compound",
  "sentence",
] as const;

export type CompositionSegment = {
  type: VocabType;
  count: number;
  /** Share of the drawn total, as a percentage. */
  percent: number;
};

/**
 * The deck's type mix as widths that fill the bar edge to edge.
 *
 * The denominator is the counts actually drawn, not the deck's item count, so a
 * type the bar does not show cannot leave a gap in it. A type with no items
 * produces no segment at all rather than a zero-width span, which would still
 * land in the DOM and in the label.
 */
export function compositionSegments(
  counts: DeckTypeCountsDto,
  order: readonly VocabType[] = COMPOSITION_ORDER,
): CompositionSegment[] {
  const present = order
    .map((type) => ({ type, count: counts[type] ?? 0 }))
    .filter(({ count }) => count > 0);

  const total = present.reduce((sum, { count }) => sum + count, 0);

  if (total === 0) return [];

  return present.map(({ type, count }) => ({
    type,
    count,
    percent: (count / total) * 100,
  }));
}

/**
 * The bar's accessible name, which is the only way this reaches a screen reader.
 *
 * Pluralised, because one of the two copies this replaces did not and read
 * "1 characters" for any deck with a single item of a type.
 */
export function describeComposition(segments: CompositionSegment[]): string {
  return segments
    .map(({ type, count }) => {
      const label = vocabTypeMeta(type).label.toLowerCase();
      return `${count} ${label}${count === 1 ? "" : "s"}`;
    })
    .join(", ");
}
