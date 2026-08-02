"use client";

import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { DecompositionGraph } from "@/components/decomposition-graph";
import { useORPC } from "@/lib/orpc.client";
import { vocabTypeMeta } from "@/lib/vocab-type";
import type { VocabType } from "@/definitions/definitions";
import { cn } from "@/lib/utils";

/** Components first: the legend reads bottom-up, the way the hierarchy is built. */
const LEGEND_TYPES: VocabType[] = ["component", "character", "compound"];

interface DecompositionGraphPanelProps {
  vocabItem: string;
  /**
   * Whether clicking a node navigates to it. Off during a study session, where
   * following a link would abandon the card mid-review.
   */
  linkable?: boolean;
}

/**
 * The graph view of one entry: the glyph, everything one hop from it, and every
 * edge among that set.
 *
 * Fetched here rather than passed in, so the query only fires when a viewer
 * actually switches to this view, and so both screens that show a vocab entry get
 * the graph without either of them knowing about the endpoint.
 */
export function DecompositionGraphPanel({
  vocabItem,
  linkable = true,
}: DecompositionGraphPanelProps) {
  const orpc = useORPC();
  const router = useRouter();

  const { data, isPending, isError, error } = useQuery(
    orpc.vocab.graph.queryOptions({ input: { vocabItem } }),
  );

  return (
    <div className="relative h-[60vh] min-h-[380px] w-full">
      {isPending && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Building graph…
        </div>
      )}

      {isError && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {error instanceof Error
            ? error.message
            : "No decomposition graph for this entry."}
        </div>
      )}

      {data && (
        <DecompositionGraph
          data={data}
          onSelect={
            linkable
              ? (glyph) =>
                  router.push(`/dictionary/${encodeURIComponent(glyph)}`)
              : undefined
          }
        />
      )}

      {data && (
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
          <span>
            {data.nodes.length - 1} connection
            {data.nodes.length === 2 ? "" : "s"}
            {linkable && " · click to open"}
          </span>
        </div>
      )}
    </div>
  );
}
