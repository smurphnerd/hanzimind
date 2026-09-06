import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One memory aid, however it is being shown.
 *
 * The four lists that render an aid differ only in what sits to the left of it
 * and what sits to the right: a position number, a read-only star, a star you
 * can press, a report button, nothing. Everything between — the quotation, the
 * meta line under it, the spacing — was written out four times.
 *
 * The marker is an aside rather than the first thing inside the quotation. Two
 * of the copies inlined it, which put an interactive `button` inside a `p` in
 * the admin's version and made the number part of the sentence for a screen
 * reader in the others.
 */
export function MemoryAidCard({
  marker,
  children,
  meta,
  action,
  highlighted = false,
  className,
}: {
  /** Shown to the left: a number, a star, or nothing. */
  marker?: ReactNode;
  /** The aid itself. Rendered in quotation marks. */
  children: ReactNode;
  /** The line under it: who wrote it, how many learners saved it. */
  meta?: ReactNode;
  /** Shown to the right, such as the report button. */
  action?: ReactNode;
  /** The official pick, which the entry page and the admin both tint. */
  highlighted?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-border p-3",
        highlighted && "border-primary/40 bg-secondary/40",
        className,
      )}
    >
      {marker && <div className="mt-0.5 shrink-0">{marker}</div>}

      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">&ldquo;{children}&rdquo;</p>
        {meta && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {meta}
          </div>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
