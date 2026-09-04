"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  DecompositionGraph,
  type GraphView,
} from "@/components/decomposition-graph";
import {
  GraphPanelFrame,
  describeDeckCut,
} from "@/components/graph-panel-frame";
import { SegmentedToggle } from "@/components/segmented-toggle";
import type { HintedSegmentedOption } from "@/components/segmented-control";
import { useORPC } from "@/lib/orpc.client";
import type { DeckGraphDto } from "@/definitions/definitions";

/**
 * Depth is 1-based on screen and 0-based in the data.
 *
 * A level is a tier of the unlock order, and "1 level" reads as the first tier
 * rather than the second. Showing `depth` levels means keeping `level < depth`.
 */
function depthOptions(maxLevel: number): HintedSegmentedOption<number>[] {
  const total = maxLevel + 1;

  return Array.from({ length: total }, (_, index) => {
    const depth = index + 1;

    return {
      value: depth,
      label: depth === total ? "All" : String(depth),
      hint:
        depth === total
          ? `All ${total} levels`
          : `First ${depth} of ${total} levels`,
    };
  });
}

/**
 * The deck, cut to a depth, banded by level.
 *
 * Memoised rather than filtered inline: a fresh array every render is a fresh
 * `graphData` identity, which rebuilds the force simulation and leaves the layout
 * permanently reheating.
 *
 * `row` is `level` under the name the renderer uses. Deepest level on top, so the
 * graph reads bottom-up the way the hierarchy is built — components underneath the
 * characters they form, characters underneath the words.
 */
function useDeckView(
  data: DeckGraphDto | undefined,
  depth: number,
): GraphView | null {
  return useMemo(() => {
    if (!data) return null;

    const visible = data.nodes.filter((node) => node.level < depth);
    const rows = Math.min(depth, data.maxLevel + 1);
    const nodes = visible.map((node) => ({
      ...node,
      row: rows - 1 - node.level,
    }));
    // A part always sits on a strictly lower level than the glyph it gates, so
    // testing the parent alone is enough — an edge whose parent survived cannot
    // have lost its child. Guaranteed by layerByPrerequisites, and tested there.
    const kept = new Set(visible.map((node) => node.vocabItem));
    const edges = data.edges.filter((edge) => kept.has(edge.parent));

    return { nodes, edges, rows };
  }, [data, depth]);
}

/**
 * A deck as one graph, with a control for how deep into its unlock order to look.
 *
 * Fetched here rather than passed in, so the query only fires when a viewer
 * actually switches to this view.
 */
export function DeckGraphPanel({ deckId }: { deckId: string }) {
  const orpc = useORPC();
  const router = useRouter();
  // Everything, until asked otherwise: the shape of the whole deck is the point,
  // and the control is for narrowing it.
  const [depth, setDepth] = useState(Number.POSITIVE_INFINITY);

  const { data, isPending, isError, error } = useQuery(
    orpc.decks.graph.queryOptions({ input: { deckId } }),
  );

  const view = useDeckView(data, depth);
  const options = data ? depthOptions(data.maxLevel) : [];
  // `Infinity` is not one of the options, so resolve it to the widest one once the
  // deck's depth is known. Storing the sentinel rather than a guessed number keeps
  // "all" selected when the deck turns out deeper than any default would have been.
  const selected = Number.isFinite(depth) ? depth : (data?.maxLevel ?? 0) + 1;

  return (
    <div className="space-y-3">
      {data && options.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Levels deep</p>
            {/* The rule, not just the number: it is what makes the control mean
                something more than "show fewer dots". */}
            <p className="text-xs text-muted-foreground">
              Each level unlocks once everything it is built from is known.
            </p>
          </div>
          <SegmentedToggle
            options={options}
            value={selected}
            onChange={setDepth}
            label="Levels deep"
          />
        </div>
      )}

      <GraphPanelFrame
        className="h-[68vh] min-h-[420px]"
        isPending={isPending}
        error={isError ? error : null}
        errorFallback="No graph for this deck yet."
        caption={
          view && data
            ? describeDeckCut(
                view.nodes.length,
                data.nodes.length,
                view.edges.length,
              )
            : undefined
        }
      >
        {view && (
          <DecompositionGraph
            data={view}
            onSelect={(glyph) =>
              router.push(`/dictionary/${encodeURIComponent(glyph)}`)
            }
          />
        )}
      </GraphPanelFrame>
    </div>
  );
}
