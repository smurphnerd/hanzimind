"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  DecompositionGraph,
  type GraphView,
} from "@/components/decomposition-graph";
import {
  SegmentedToggle,
  type SegmentedOption,
} from "@/components/segmented-toggle";
import { useORPC } from "@/lib/orpc.client";
import { vocabTypeMeta } from "@/lib/vocab-type";
import type { DeckGraphDto, VocabType } from "@/definitions/definitions";

/** Components first: the legend reads bottom-up, the way the hierarchy is built. */
const LEGEND_TYPES: VocabType[] = ["component", "character", "compound"];

/**
 * Depth is 1-based on screen and 0-based in the data.
 *
 * A level is a tier of the unlock order, and "1 level" reads as the first tier
 * rather than the second. Showing `depth` levels means keeping `level < depth`.
 */
function depthOptions(maxLevel: number): SegmentedOption<number>[] {
  const total = maxLevel + 1;

  return Array.from({ length: total }, (_, index) => {
    const depth = index + 1;

    return {
      value: depth,
      label: depth === total ? "All" : String(depth),
      title:
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

      <div className="relative h-[68vh] min-h-[420px] w-full">
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
              : "No graph for this deck yet."}
          </div>
        )}

        {view && (
          <DecompositionGraph
            data={view}
            onSelect={(glyph) =>
              router.push(`/dictionary/${encodeURIComponent(glyph)}`)
            }
          />
        )}

        {view && data && (
          <div className="pointer-events-none absolute bottom-0 left-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {LEGEND_TYPES.map((type) => (
              <span key={type} className="inline-flex items-center gap-1.5">
                <span
                  className={`size-2.5 rounded-full ${vocabTypeMeta(type).fillClass}`}
                />
                {vocabTypeMeta(type).label}
              </span>
            ))}
            <span>
              {view.nodes.length} of {data.nodes.length} items ·{" "}
              {view.edges.length} links · click to open
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
