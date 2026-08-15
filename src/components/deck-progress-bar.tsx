import { GROWTH_STAGES, growthStage } from "@/lib/growth";
import { cn } from "@/lib/utils";

interface DeckProgressBarProps {
  /** Item counts per growth stage, index 0..5. Comes straight from DeckProgressDto.byStage. */
  byStage: number[];
  total: number;
  size?: "sm" | "md";
  className?: string;
}

const TRACK = {
  sm: "h-2",
  md: "h-3",
} as const;

/**
 * A deck's mastery as one stacked bar, one segment per growth stage.
 *
 * The garden language is deliberate: GrowthTracker shows a single item's five
 * pips, and this is the same six stages aggregated over a whole deck, so the two
 * read as one system. Stage 0 ("Not started") is rendered as the muted track
 * rather than a coloured segment — nothing has grown yet, so nothing should look
 * like it has.
 */
export function DeckProgressBar({
  byStage,
  total,
  size = "md",
  className,
}: DeckProgressBarProps) {
  // Stages 1..5 are the grown ones; index 0 is the empty remainder and stays as
  // exposed track, so a brand-new deck renders as a flat grey bar rather than a
  // full bar of "Not started".
  const grown = GROWTH_STAGES.slice(1)
    .map((stage) => ({ stage, count: byStage[stage.index] ?? 0 }))
    .filter(({ count }) => count > 0);

  return (
    <div
      className={cn(
        "flex w-full overflow-hidden rounded-full bg-stage-none/25",
        TRACK[size],
        className,
      )}
      role="img"
      aria-label={
        total === 0
          ? "No items yet"
          : `${byStage.slice(1).reduce((a, b) => a + b, 0)} of ${total} items growing`
      }
    >
      {grown.map(({ stage, count }) => (
        <span
          key={stage.key}
          className={cn("transition-[width] duration-500", stage.fillClass)}
          style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
        />
      ))}
    </div>
  );
}

interface GrowthLegendProps {
  byStage: number[];
  className?: string;
}

/** The per-stage counts under a DeckProgressBar. Hides stages with nothing in them. */
export function GrowthLegend({ byStage, className }: GrowthLegendProps) {
  const present = GROWTH_STAGES.slice(1).filter(
    (stage) => (byStage[stage.index] ?? 0) > 0,
  );

  if (present.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}
    >
      {present.map((stage) => (
        <span
          key={stage.key}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span className={cn("size-2 rounded-full", stage.fillClass)} />
          {stage.label}
          <span className="font-display font-bold text-foreground tabular-nums">
            {byStage[stage.index]}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Re-exported so callers do not need to reach into @/lib/growth for one helper. */
export { growthStage };
