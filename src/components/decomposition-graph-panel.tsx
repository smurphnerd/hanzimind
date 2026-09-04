"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { DecompositionGraph } from "@/components/decomposition-graph";
import {
  GraphPanelFrame,
  describeNeighbourhood,
} from "@/components/graph-panel-frame";
import { useORPC } from "@/lib/orpc.client";

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
    <GraphPanelFrame
      className="h-[60vh] min-h-[380px]"
      isPending={isPending}
      error={isError ? error : null}
      errorFallback="No decomposition graph for this entry."
      caption={
        data ? describeNeighbourhood(data.nodes.length, linkable) : undefined
      }
    >
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
    </GraphPanelFrame>
  );
}
