import { constituentsOf } from "@/server/study-rules";
import type {
  DeckGraphNodeDto,
  GraphEdgeDto,
  GraphNodeDto,
  VocabType,
} from "@/definitions/definitions";

/**
 * The decomposition graph, as pure data.
 *
 * Kept free of the database on purpose, the same way study-rules.ts is: the
 * traversal here decides what a learner sees, and that decision is worth pinning
 * down in tests without standing up Postgres. VocabService owns the one query
 * that produces `GraphGlyph[]`; everything below is a function of those rows.
 */

/** A vocab row reduced to what the graph needs. */
export interface GraphGlyph {
  vocabItem: string;
  vocabType: VocabType;
  pinyin: string;
  translation: string | null;
  decomposition: string | null;
}

/**
 * Adjacency for the whole teachable corpus, in both directions.
 *
 * `children` maps a composed item to the parts it is built from; `parents` is
 * the reverse — the characters a component appears in. The reverse direction is
 * the whole point of the view (from 亻 you want to see 你, 他, 们) and it is also
 * where the size lives, so those lists are pre-sorted cheapest-first.
 */
export interface DecompositionIndex {
  glyphs: Map<string, GraphGlyph>;
  children: Map<string, string[]>;
  parents: Map<string, string[]>;
  /** Total undirected degree per glyph, across the whole corpus. */
  degree: Map<string, number>;
}

/**
 * Turn corpus rows into both adjacency directions.
 *
 * Disabled rows must be excluded by the caller's query, which also removes the
 * need to subtract hidden parts afterwards: an edge survives only if its part
 * resolved to a row in `glyphs`, so a disabled part is structurally absent. That
 * is the same guarantee VocabService.removeDisabled gives per call, without a
 * query per glyph.
 *
 * Sentences must be excluded too — they decompose by word segmentation rather
 * than by glyph, a different relation from the one this graph draws.
 */
export function buildDecompositionIndex(
  rows: readonly GraphGlyph[],
): DecompositionIndex {
  const glyphs = new Map(rows.map((row) => [row.vocabItem, row]));
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();

  for (const row of rows) {
    // Dedupe (林 decomposes to 木木) and drop self-references, which would
    // otherwise render as a node tethered to itself.
    const parts = [...new Set(constituentsOf(row))].filter(
      (part) => part !== row.vocabItem && glyphs.has(part),
    );
    if (parts.length === 0) continue;

    children.set(row.vocabItem, parts);
    for (const part of parts) {
      const uses = parents.get(part);
      if (uses) uses.push(row.vocabItem);
      else parents.set(part, [row.vocabItem]);
    }
  }

  // Corpus-wide degree per glyph. Every node carries it, and the renderer sizes
  // nodes by it, so it is worth one pass here rather than two map lookups per
  // node on every draw.
  const degree = new Map<string, number>();
  for (const glyph of glyphs.keys()) {
    degree.set(
      glyph,
      (children.get(glyph)?.length ?? 0) + (parents.get(glyph)?.length ?? 0),
    );
  }

  return { glyphs, children, parents, degree };
}

/**
 * The focus glyph, every glyph one hop from it, and every edge among that set.
 *
 * One hop, and nothing capped. Both halves matter:
 *
 * Uncapped, because a partial list of a glyph's direct relationships is worse
 * than useless — you cannot tell a component used by six characters from one used
 * by six hundred if both are drawn with twelve. Degree bounds this for us: the
 * widest node in the corpus is 口 at 488, so the worst case is a few hundred
 * nodes.
 *
 * One hop, because two is already the whole corpus. 99.9% of characters sit in a
 * single connected component with a mean shortest path of 4.3 hops, so each extra
 * hop dissolves the picture toward a featureless 9.5k-node ball with no distance
 * variation left for a force layout to express.
 */
export function extractNeighbourhood(
  index: DecompositionIndex,
  focus: string,
): { nodes: GraphNodeDto[]; edges: GraphEdgeDto[] } {
  const { glyphs, children, parents, degree } = index;

  // A glyph can be both a part of and built from the focus, and a decomposition
  // can name a glyph twice, so the set is what defines membership.
  const selected = new Set<string>([focus]);
  for (const neighbour of [
    ...(children.get(focus) ?? []),
    ...(parents.get(focus) ?? []),
  ]) {
    selected.add(neighbour);
  }

  // Every edge among the selected glyphs, not only those touching the focus.
  // Neighbours are frequently related to each other — 你 and 您 both sit one hop
  // from 亻 and 您 is built from 你 — and those edges are the difference between a
  // graph and a star. Iterating `children` alone emits each edge exactly once.
  const edges: GraphEdgeDto[] = [];
  for (const glyph of selected) {
    for (const child of children.get(glyph) ?? []) {
      if (selected.has(child)) edges.push({ parent: glyph, child });
    }
  }

  const nodes: GraphNodeDto[] = [];
  for (const glyph of selected) {
    const row = glyphs.get(glyph);
    if (!row) continue;
    nodes.push({
      vocabItem: glyph,
      vocabType: row.vocabType,
      pinyin: row.pinyin,
      translation: row.translation,
      degree: degree.get(glyph) ?? 0,
    });
  }
  // Focus first, then by glyph, so the payload is stable for a given corpus.
  nodes.sort((a, b) => {
    if (a.vocabItem === focus) return -1;
    if (b.vocabItem === focus) return 1;
    return a.vocabItem < b.vocabItem ? -1 : a.vocabItem > b.vocabItem ? 1 : 0;
  });

  return { nodes, edges };
}

/**
 * Every glyph's depth in the unlock order of whatever set the index was built
 * from.
 *
 * Level 0 is everything with no prerequisite inside the set: components, which are
 * the floor of the hierarchy, plus any character whose parts happen to sit outside
 * it. Beyond that a glyph's level is one past its *deepest* prerequisite.
 *
 * The longest path is the point, not an implementation detail. A glyph is only
 * introduced once every part is known, so the slowest chain sets the pace — and it
 * is what makes a depth filter honest: a prerequisite always lands on a strictly
 * lower level than the thing it gates, so cutting the graph at level N can never
 * hide a part of something it still shows.
 *
 * This is the same relation `isUnlocked` gates on, restricted the same way. A part
 * outside the set does not gate, because it cannot be learned here; the index has
 * already dropped those, so membership does the filtering.
 *
 * Mutual prerequisites would be unsatisfiable, so a cycle has no honest level.
 * There are none in the corpus today — the decomposition relation is a DAG across
 * all 9,574 characters — but the rows are editable, and a cycle silently dropping
 * nodes from a view is a worse failure than an arbitrary one. Anything Kahn cannot
 * drain is parked one level past everything that resolved, so it surfaces only at
 * full depth.
 */
export function layerByPrerequisites(
  index: DecompositionIndex,
): Map<string, number> {
  const { glyphs, children, parents } = index;
  const level = new Map<string, number>();
  const pending = new Map<string, number>();
  const queue: string[] = [];

  for (const glyph of glyphs.keys()) {
    const deps = children.get(glyph)?.length ?? 0;
    if (deps === 0) {
      level.set(glyph, 0);
      queue.push(glyph);
    } else {
      pending.set(glyph, deps);
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const glyph = queue[head];
    const next = (level.get(glyph) ?? 0) + 1;

    for (const user of parents.get(glyph) ?? []) {
      // Every settled dependency raises the floor, so the last one to arrive
      // leaves behind the maximum — the longest path.
      level.set(user, Math.max(level.get(user) ?? 0, next));

      const remaining = (pending.get(user) ?? 0) - 1;
      if (remaining > 0) {
        pending.set(user, remaining);
      } else {
        pending.delete(user);
        queue.push(user);
      }
    }
  }

  if (pending.size > 0) {
    let deepest = 0;
    for (const settled of level.values()) deepest = Math.max(deepest, settled);
    for (const glyph of pending.keys()) level.set(glyph, deepest + 1);
  }

  return level;
}

/**
 * The whole set as one graph, every node tagged with its unlock depth.
 *
 * Unlike the one-hop view there is no focus and nothing is capped: a deck is a
 * bounded, curated set — the largest here is 398 rows and 640 edges — so the
 * interesting question is its overall shape rather than one glyph's surroundings.
 *
 * `degree` is therefore local to this set, not corpus-wide. A component used by
 * three hundred characters but only four in the deck should be drawn as the size it
 * is *here*, or the deck's own hubs disappear next to it.
 */
export function extractDeckGraph(index: DecompositionIndex): {
  nodes: DeckGraphNodeDto[];
  edges: GraphEdgeDto[];
  maxLevel: number;
} {
  const { glyphs, children, degree } = index;
  const level = layerByPrerequisites(index);

  // `children` only ever holds in-set parts, so iterating it emits each edge
  // exactly once with no membership test.
  const edges: GraphEdgeDto[] = [];
  for (const [glyph, parts] of children) {
    for (const part of parts) edges.push({ parent: glyph, child: part });
  }

  const nodes: DeckGraphNodeDto[] = [];
  let maxLevel = 0;
  for (const [glyph, row] of glyphs) {
    const depth = level.get(glyph) ?? 0;
    maxLevel = Math.max(maxLevel, depth);
    nodes.push({
      vocabItem: glyph,
      vocabType: row.vocabType,
      pinyin: row.pinyin,
      translation: row.translation,
      degree: degree.get(glyph) ?? 0,
      level: depth,
    });
  }

  // Teaching order, then glyph, so the payload is stable for a given deck.
  nodes.sort((a, b) =>
    a.level !== b.level
      ? a.level - b.level
      : a.vocabItem < b.vocabItem
        ? -1
        : a.vocabItem > b.vocabItem
          ? 1
          : 0,
  );

  return { nodes, edges, maxLevel };
}
