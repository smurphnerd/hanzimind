import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "violet" | "coral" | "green" | "teal" | "amber";

const TONE: Record<StatTone, string> = {
  violet: "bg-type-character-soft text-type-character",
  coral: "bg-secondary text-primary",
  green: "bg-success/15 text-success",
  teal: "bg-type-component-soft text-type-component",
  amber: "bg-type-sentence-soft text-type-sentence",
};

interface StatTileProps {
  icon: React.ReactNode;
  tone: StatTone;
  value: React.ReactNode;
  label: string;
  className?: string;
}

/**
 * The home page's stat card, extracted so every screen shows a number the same
 * way. `tabular-nums` keeps the digits from shifting when a value updates.
 */
export function StatTile({
  icon,
  tone,
  value,
  label,
  className,
}: StatTileProps) {
  return (
    <Card className={className}>
      <CardContent className="flex items-center gap-4">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-2xl",
            TONE[tone],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="font-display text-2xl font-extrabold tracking-tight tabular-nums">
            {value}
          </div>
          <div className="truncate text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

interface InlineStatProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** A compact icon + text stat for card footers, where a full StatTile is too heavy. */
export function InlineStat({ icon, children, className }: InlineStatProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-muted-foreground",
        className,
      )}
    >
      {icon}
      <span className="tabular-nums">{children}</span>
    </span>
  );
}
