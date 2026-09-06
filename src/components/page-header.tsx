import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /**
   * The h1 text. Named `heading` rather than `title` so that the HTML attribute
   * of that name means exactly one thing wherever it still appears outside
   * `components/ui` — a mouse-only hover hint, which this app has replaced with
   * `ui/tooltip`. Grepping for it is then a real check rather than a list to
   * re-triage by hand.
   */
  heading: React.ReactNode;
  description?: React.ReactNode;
  /** Rendered on the right on desktop, below the title on mobile. */
  action?: React.ReactNode;
  className?: string;
}

/** The shared page title block, so every screen sets the same rhythm. */
export function PageHeader({
  heading,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
          {heading}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
