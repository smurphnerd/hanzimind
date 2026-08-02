"use client";

import type { ReactElement, RefObject } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import { forceCollide, forceX } from "d3-force";
import type {
  ForceGraphMethods,
  ForceGraphProps,
  LinkObject,
  NodeObject,
} from "react-force-graph-2d";

import type { GraphEdgeDto, GraphNodeDto } from "@/definitions/definitions";
import { paletteSnapshot, subscribeToTheme } from "@/lib/graph-palette";
import { cn } from "@/lib/utils";

/**
 * A node as the simulation sees it. d3-force MUTATES these objects, writing
 * `x`/`y`/`vx`/`vy` onto them, so they must be our own copies rather than the
 * query cache's DTOs — handing React Query's data straight to the simulation
 * corrupts the cache and makes refetches jump.
 */
type SimNodeData = GraphNodeDto & { id: string; row?: number };
type SimNode = NodeObject<SimNodeData>;
type SimLink = LinkObject<SimNodeData>;

// The renderer reaches for `window` on import, so it can only be pulled in on
// the client. `dynamic` erases the component's own generic signature, hence the
// cast: it restores exactly the props/ref shape the library declares, pinned to
// our concrete node and link types.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as (
  props: ForceGraphProps<SimNode, SimLink> & {
    ref?: RefObject<ForceGraphMethods<SimNode, SimLink> | undefined>;
  },
) => ReactElement;

/**
 * Node radius from degree.
 *
 * Square-rooted and clamped: degree spans 1 to 488, so a linear mapping would
 * make 口 four hundred times the radius of a leaf. The floor is set by the glyph
 * rather than the dot — a circle smaller than this cannot hold a readable
 * character, and the character is the whole point.
 */
function radiusOf(node: SimNode) {
  return 9 + Math.min(11, Math.sqrt(node.degree) * 1.4);
}

/**
 * Collision radius as a multiple of the drawn radius.
 *
 * Proportional rather than a fixed gap, because the fit is scale-invariant: node
 * radius is fixed in graph units, so adding a constant separation only inflates
 * the layout's extent, zoomToFit compensates, and every node ends up smaller on
 * screen for no gain in readability. A ratio fixes the gap as a fraction of a node
 * instead, which is what the eye actually judges.
 */
const COLLIDE_RATIO = 1.25;

/**
 * Largest a node may be drawn on screen, as a radius in CSS pixels.
 *
 * Only bounds the INITIAL framing. zoomToFit scales to the graph's extent, so a
 * three-node entry like 你好 would otherwise be magnified until two glyphs filled
 * the panel. Generous, because overlap is prevented by forceCollide rather than by
 * keeping things small, so the only thing this guards against is absurdity.
 */
const MAX_NODE_RADIUS_PX = 60;

/**
 * Node count past which a graph is treated as crowded.
 *
 * A hub like 口 brings 488 neighbours, and at that size per-node glyph text and
 * hover hit-testing both stop being affordable while the layout is running.
 * Below it, everything is drawn all the time.
 */
const CROWDED_NODES = 120;

/** How hard a node is held to its row. Matches d3's own forceY convention. */
const BAND_STRENGTH = 1;

/**
 * Pulls every node to its row, spacing the rows to match the layout's own width.
 *
 * The spacing cannot be a constant, and cannot even be computed up front: how wide
 * a band ends up depends on how many sublayers it bulges into, which varies with the
 * deck, the depth selected and the panel. A fixed estimate left the full HSK 1 deck
 * filling 97% of the panel's height but only 72% of its width, while the two-level
 * cut of the same deck filled 45% of the height — one number cannot serve both.
 *
 * So the width is measured every tick and the rows are spaced to match the panel's
 * aspect ratio, which converges on filling it whatever the contents. Stable because
 * the coupling only runs one way: charge and collision set the width, and the width
 * sets the row spacing. Nothing here pushes horizontally.
 *
 * Written out rather than composed from `forceY` because the target moves: `forceY`
 * resolves its accessor once, at initialize, and would freeze the spacing at
 * whatever the first tick happened to measure.
 */
function bandForce(rows: number, aspect: number) {
  const middle = (rows - 1) / 2;
  const gaps = Math.max(1, rows - 1);
  let nodes: SimNode[] = [];

  const force = (alpha: number) => {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const node of nodes) {
      const x = node.x ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    if (!Number.isFinite(minX)) return;

    // One gap fewer than there are rows: the outermost nodes sit ON the first and
    // last lines rather than half a gap beyond them.
    const gap = (maxX - minX) / aspect / gaps;

    for (const node of nodes) {
      const target = ((node.row ?? 0) - middle) * gap;
      node.vy =
        (node.vy ?? 0) + (target - (node.y ?? 0)) * BAND_STRENGTH * alpha;
    }
  };

  force.initialize = (simNodes: SimNode[]) => {
    nodes = simNodes;
  };

  return force;
}

/**
 * Any node set plus the edges among it — structural rather than one wire type, so
 * a one-hop neighbourhood and a whole deck can share the renderer.
 *
 * `focus` is what a neighbourhood has and a deck does not: with no focus, nothing
 * matches, and no node gets the ring.
 *
 * `rows` turns the free layout into a banded one, pulling each node to the row it
 * carries. Deliberately a layout word rather than a domain one: what a row *means*
 * belongs to the caller, and the renderer only needs to know the order.
 */
export interface GraphView {
  nodes: Array<GraphNodeDto & { row?: number }>;
  edges: GraphEdgeDto[];
  focus?: string;
  rows?: number;
}

interface DecompositionGraphProps {
  data: GraphView;
  /** Navigating to another glyph; omitted where the entry is not linkable. */
  onSelect?: (vocabItem: string) => void;
  className?: string;
}

export function DecompositionGraph({
  data,
  onSelect,
  className,
}: DecompositionGraphProps) {
  const graphRef = useRef<ForceGraphMethods<SimNode, SimLink> | undefined>(
    undefined,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const palette = useSyncExternalStore(
    subscribeToTheme,
    paletteSnapshot,
    () => null,
  );

  // force-graph needs pixel dimensions, so the container has to be measured
  // rather than styled.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map<SimNode>((node) => ({
        ...node,
        id: node.vocabItem,
      })),
      // Reversed relative to the wire format on purpose. The DTO is directed
      // parent→child ("is built from"), but force-graph draws its arrowhead
      // source→target, and the useful reading is composition flow: the part
      // points at what it helps build, so 口 → 啚 → 鄙 runs simple to complex.
      links: data.edges.map<SimLink>((edge) => ({
        source: edge.child,
        target: edge.parent,
      })),
    }),
    [data],
  );

  const crowded = graphData.nodes.length > CROWDED_NODES;
  const maxZoom = useMemo(() => {
    const largest = graphData.nodes.reduce(
      (max, node) => Math.max(max, radiusOf(node)),
      1,
    );

    return MAX_NODE_RADIUS_PX / largest;
  }, [graphData]);

  /**
   * Neighbours of the hovered node, for the dim-everything-else pass.
   *
   * Skipped when the neighbourhood is not selective. Hovering the focus of a hub
   * graph "highlights" all 283 of its neighbours, which dims nothing and repaints
   * every link in the accent colour — a solid coral starburst that hides the very
   * structure it was meant to pick out. Highlighting only says something when it
   * selects a minority.
   */
  const highlighted = useMemo(() => {
    if (!hovered) return null;

    const near = new Set<string>([hovered]);
    for (const edge of data.edges) {
      if (edge.parent === hovered) near.add(edge.child);
      if (edge.child === hovered) near.add(edge.parent);
    }

    return near.size > data.nodes.length * 0.5 ? null : near;
  }, [hovered, data.edges, data.nodes.length]);

  /**
   * Frame the settled layout, but never magnify past MAX_NODE_RADIUS_PX.
   *
   * Hand-rolled rather than `zoomToFit` because the cap has to apply to the initial
   * framing only. Setting force-graph's `maxZoom` would also stop the viewer zooming
   * in by hand, which is exactly what they need on a dense deck or a hub.
   */
  const fitToView = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const box = graph.getGraphBbox();
    if (!box) return;

    const padding = 40;
    const fit = Math.min(
      size.width / Math.max(box.x[1] - box.x[0] + padding, 1),
      size.height / Math.max(box.y[1] - box.y[0] + padding, 1),
    );

    graph.centerAt((box.x[0] + box.x[1]) / 2, (box.y[0] + box.y[1]) / 2, 400);
    graph.zoom(Math.min(fit, maxZoom), 400);
  }, [size.width, size.height, maxZoom]);

  const drawNode = useCallback(
    (node: SimNode, ctx: CanvasRenderingContext2D, scale: number) => {
      if (!palette || node.x === undefined || node.y === undefined) return;

      const radius = radiusOf(node);
      const isFocus = node.vocabItem === data.focus;
      const dimmed = highlighted !== null && !highlighted.has(node.vocabItem);

      ctx.globalAlpha = dimmed ? 0.28 : 1;

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = palette.type[node.vocabType];
      ctx.fill();

      if (isFocus) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = palette.focus;
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }

      // The glyph IS the label — this is a graph of characters, so it is drawn
      // inside the node rather than beside it. Gated on RENDERED size, not on the
      // raw zoom scale: a 490-node hub graph lays out over far more graph units
      // than a 4-node one, so the two are not comparable in scale terms.
      if (radius * scale < 4.5) {
        ctx.globalAlpha = 1;
        return;
      }

      const glyphCount = [...node.vocabItem].length;
      const fontSize = Math.max(
        (radius * 1.7) / Math.max(1, glyphCount * 0.8),
        10 / scale,
      );
      ctx.font = `500 ${fontSize}px ${palette.hanziFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = palette.surface;
      ctx.fillText(node.vocabItem, node.x, node.y);

      // Pinyin only once there is room for it without colliding with neighbours.
      if (radius * scale > 26 && node.pinyin) {
        ctx.font = `${9 / scale}px ${palette.sansFont}`;
        ctx.fillStyle = palette.text;
        ctx.fillText(node.pinyin, node.x, node.y + radius + 8 / scale);
      }

      ctx.globalAlpha = 1;
    },
    [palette, data.focus, highlighted],
  );

  // The hit area has to be painted separately, or clicks land on the default
  // circle sized by `val` rather than on the circle actually drawn.
  const drawPointerArea = useCallback(
    (node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
      if (node.x === undefined || node.y === undefined) return;

      ctx.beginPath();
      ctx.arc(node.x, node.y, radiusOf(node) + 4, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [],
  );

  const linkColor = useCallback(
    (link: SimLink) => {
      if (!palette) return "transparent";
      if (!highlighted) return palette.line;

      // d3-force swaps the string ids we hand it for live node objects as soon as
      // the simulation starts, so a link endpoint can be either.
      const source =
        typeof link.source === "object" ? link.source.vocabItem : link.source;
      const target =
        typeof link.target === "object" ? link.target.vocabItem : link.target;

      return typeof source === "string" &&
        typeof target === "string" &&
        highlighted.has(source) &&
        highlighted.has(target)
        ? palette.focus
        : palette.line;
    },
    [palette, highlighted],
  );

  /**
   * Retune the simulation, once per dataset, from inside the engine loop.
   *
   * It has to happen here rather than in an effect. Setting `graphData` makes
   * force-graph rebuild its simulation, which discards any force registered
   * beforehand — an effect that ran on mount silently lost every one of these, and
   * tripling the collision radius as a probe changed the picture not at all.
   * `onEngineTick` is the first moment the simulation provably exists with its
   * nodes loaded.
   *
   * The collision force is the important one. These nodes are not dots — each holds
   * a glyph and is sized by degree — and charge acts between CENTRES, knowing
   * nothing about radius, so without collision a circle simply sits on top of its
   * neighbour.
   */
  const tunedFor = useRef<object | null>(null);
  const tuneForces = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || tunedFor.current === graphData) return;
    tunedFor.current = graphData;

    graph.d3Force("charge")?.strength(crowded ? -420 : -260);
    graph.d3Force("link")?.distance(crowded ? 90 : 58);
    graph.d3Force(
      "collide",
      forceCollide<SimNode>(
        (node) => radiusOf(node) * COLLIDE_RATIO,
      ).iterations(2),
    );

    // A banded layout is the whole point of the deck view: a free layout of the
    // same graph settles into a ball where level 0 and level 6 are
    // indistinguishable, so the progression it is supposed to show is invisible.
    //
    // Pulled rather than pinned (`fy`). A hard pin makes every band exactly one node
    // tall, and the widest here holds 91 of them — a strip far wider than any panel,
    // which the fit then shrinks until the glyphs are specks. Letting collision push
    // nodes off their line lets a crowded band bulge into two or three sublayers and
    // keeps the aspect ratio readable, at the cost of bands that are approximate
    // rather than exact.
    if (data.rows && data.rows > 1 && size.height > 0) {
      graph.d3Force("row", bandForce(data.rows, size.width / size.height));
      // Links have to give way vertically, or they haul connected nodes off their
      // line while unconnected ones stay on it — at two levels deep that split one
      // band into two and the picture read as three rows instead of two. A link is
      // shorter than the gap between bands, so at full strength it wins. Weak enough
      // that the bands hold, strong enough to still gather each part near the glyphs
      // that use it, which is what organises the horizontal order.
      graph.d3Force("link")?.strength(0.06);

      // Nothing attracts across a gap, so a component with no edge into the rest is
      // pure repulsion and gets flung clear of the layout, dragging the fit with it:
      // the HSK 1 deck has one such island (彳/很/艮) that took a quarter of the
      // panel to itself.
      //
      // Capping charge's reach rather than adding a spring back to the centre. A
      // spring strong enough to haul in something that far also squeezes the main
      // body — at 0.18 it halved the layout's width — because a spring pulls hardest
      // exactly where the graph is widest. Charge's long tail is what launches the
      // island and contributes nothing else: separation between neighbours is local,
      // and collision already guarantees no overlap.
      graph.d3Force("charge")?.distanceMax((crowded ? 90 : 58) * 6);
      // Still a gentle gather, now that it only has to close a small gap.
      graph.d3Force("centreX", forceX<SimNode>(0).strength(0.03));
    } else {
      graph.d3Force("row", null);
      graph.d3Force("centreX", null);
    }
  }, [graphData, crowded, data.rows, size.width, size.height]);

  return (
    // `absolute inset-0` rather than `h-full`: the parent is a flex item whose
    // specified height is `auto`, so a percentage height has nothing definite to
    // resolve against and collapses the canvas to zero.
    <div
      ref={containerRef}
      className={cn("absolute inset-0", className)}
      // force-graph does not fire onNodeHover(null) when the pointer leaves the
      // canvas entirely, so the last hovered node stayed highlighted forever.
      onPointerLeave={() => setHovered(null)}
    >
      {size.width > 0 && palette && (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={size.width}
          height={size.height}
          backgroundColor="transparent"
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={drawPointerArea}
          linkColor={linkColor}
          linkWidth={(link) =>
            highlighted && linkColor(link) !== palette.line ? 2 : 1
          }
          // Arrows read part → whole, so following them goes from the simplest
          // component to the most composed character. Parked near the target end
          // rather than mid-line, where a short link would bury the head under the
          // node it points at.
          linkDirectionalArrowLength={crowded ? 4 : 6}
          linkDirectionalArrowRelPos={0.82}
          linkDirectionalArrowColor={() => palette.muted}
          nodeLabel={(node) =>
            `${node.vocabItem} ${node.pinyin} — ${node.translation ?? "no gloss"} (used in ${node.degree})`
          }
          onNodeClick={
            onSelect ? (node) => onSelect(node.vocabItem) : undefined
          }
          onNodeHover={(node) => setHovered(node ? node.vocabItem : null)}
          // Dragging reheats the simulation, and on a hub graph that means waiting
          // for several hundred nodes to resettle after an accidental grab.
          enableNodeDrag={!crowded}
          onEngineTick={tuneForces}
          // Fit only once the layout has settled. Fitting on a timer frames a
          // half-expanded graph and then the nodes drift outside the viewport.
          onEngineStop={fitToView}
          // Settle fast: a long jiggle reads as jank, and a hub graph needs the
          // extra ticks to unwind its ring.
          cooldownTicks={crowded ? 260 : 140}
          d3VelocityDecay={0.32}
          warmupTicks={30}
        />
      )}
    </div>
  );
}
