import {
  compositionSegments,
  describeComposition,
} from "@/lib/deck-composition";
import { cn } from "@/lib/utils";
import { vocabTypeMeta } from "@/lib/vocab-type";
import type { DeckTypeCountsDto } from "@/definitions/definitions";

/**
 * What a deck is made of, as one stacked bar.
 *
 * The legend is off by default because the two callers disagree: the deck page
 * shows the bar alone above its own type headings, which are the legend, and the
 * browse card has nothing else to name the colours. `className` always lands on
 * the outermost element, so a caller's margin behaves the same either way.
 */
export function CompositionBar({
  typeCounts,
  legend = false,
  className,
}: {
  typeCounts: DeckTypeCountsDto;
  legend?: boolean;
  className?: string;
}) {
  const segments = compositionSegments(typeCounts);

  if (segments.length === 0) return null;

  const bar = (
    <div
      className={cn(
        "flex h-2.5 w-full overflow-hidden rounded-full bg-muted",
        !legend && className,
      )}
      role="img"
      aria-label={describeComposition(segments)}
    >
      {segments.map(({ type, percent }) => (
        <span
          key={type}
          className={vocabTypeMeta(type).fillClass}
          style={{ width: `${percent}%` }}
        />
      ))}
    </div>
  );

  if (!legend) return bar;

  return (
    <div className={cn("space-y-2", className)}>
      {bar}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {segments.map(({ type, count }) => (
          <span
            key={type}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className={cn(
                "size-2 rounded-full",
                vocabTypeMeta(type).fillClass,
              )}
            />
            {vocabTypeMeta(type).label}
            <span className="font-display font-bold text-foreground tabular-nums">
              {count}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
