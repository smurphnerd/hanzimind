"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import type { VocabType } from "@/definitions/definitions";
import { cn } from "@/lib/utils";
import { vocabTypeMeta } from "@/lib/vocab-type";

/** Components first: the legend reads bottom-up, the way the hierarchy is built. */
const LEGEND_TYPES: VocabType[] = ["component", "character", "compound"];

/**
 * The chrome around a decomposition graph: the sized canvas box, the loading
 * line, the error line, the type legend and the caption under it.
 *
 * It owns no query and no graph. Each panel fetches its own data — the entry
 * view and the deck view ask different procedures, and the query must not fire
 * until the viewer switches to that tab — so the caller passes the graph in and
 * says which of the three states it is in.
 */
export function GraphPanelFrame({
  isPending,
  error,
  errorFallback,
  caption,
  className,
  children,
}: {
  isPending: boolean;
  /** Null when the query succeeded. */
  error: unknown;
  /** Shown when the failure carried no message of its own. */
  errorFallback: string;
  /** The counts under the legend. Absent while there is nothing drawn. */
  caption?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("relative w-full", className)}>
      {isPending && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Building graph…
        </div>
      )}

      {error != null && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {error instanceof Error ? error.message : errorFallback}
        </div>
      )}

      {children}

      {caption != null && (
        <div className="pointer-events-none absolute bottom-0 left-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {LEGEND_TYPES.map((type) => (
            <span key={type} className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  vocabTypeMeta(type).fillClass,
                )}
              />
              {vocabTypeMeta(type).label}
            </span>
          ))}
          <span>{caption}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The caption for a one-hop view: how many glyphs connect to the focus.
 *
 * Counted as nodes minus the focus itself. The copy this replaces pluralised by
 * testing `nodes.length === 2`, which is the same rule stated in terms of the
 * wrong quantity and reads as an off-by-one every time someone checks it.
 */
export function describeNeighbourhood(
  nodeCount: number,
  linkable: boolean,
): string {
  const connections = Math.max(0, nodeCount - 1);
  const suffix = linkable ? " · click to open" : "";

  return `${connections} connection${connections === 1 ? "" : "s"}${suffix}`;
}

/**
 * The caption for the deck view, which shows a cut of a bigger graph and so has
 * to say how much of it is on screen.
 */
export function describeDeckCut(
  visibleNodes: number,
  totalNodes: number,
  visibleEdges: number,
): string {
  return `${visibleNodes} of ${totalNodes} items · ${visibleEdges} links · click to open`;
}
