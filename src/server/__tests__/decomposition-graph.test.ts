import { describe, it, expect } from "vitest";

import {
  buildDecompositionIndex,
  extractDeckGraph,
  extractNeighbourhood,
  layerByPrerequisites,
  type GraphGlyph,
} from "../decomposition-graph";

function glyph(overrides: Partial<GraphGlyph> = {}): GraphGlyph {
  return {
    vocabItem: "你",
    vocabType: "character",
    pinyin: "nǐ",
    translation: "you",
    decomposition: null,
    ...overrides,
  };
}

const component = (vocabItem: string) =>
  glyph({ vocabItem, vocabType: "component", pinyin: "", translation: "part" });

const character = (vocabItem: string, decomposition: string | null) =>
  glyph({ vocabItem, decomposition });

const compound = (vocabItem: string) =>
  glyph({ vocabItem, vocabType: "compound" });

/**
 * 亻 is the hub: every 亻-character below is built from it. Wide enough that a cap
 * would be visible if one were reintroduced, small enough to assert exact sets.
 *
 * 您 (⿱你心) earns its place twice over — it is a USER of 你 rather than a part of
 * it, and its edge to 你 runs between two nodes that are both one hop from 亻.
 */
function hubCorpus() {
  return buildDecompositionIndex([
    component("亻"),
    character("尔", null),
    character("你", "⿰亻尔"),
    character("您", "⿱你心"),
    character("心", null),
    character("他", "⿰亻也"),
    character("们", "⿰亻门"),
    character("休", "⿰亻木"),
    character("信", "⿰亻言"),
    character("也", null),
    character("门", null),
    character("木", null),
    character("言", null),
  ]);
}

/**
 * A hub wide enough that any plausible fan-out cap would be visible.
 *
 * 40 users, so a cap of 12 or 24 — the values this endpoint used to take — shows
 * up as a short list rather than passing unnoticed. Real hubs are wider still:
 * 口 is a part of 488 characters.
 */
const WIDE_HUB_USERS = 40;

function wideHubCorpus() {
  const users = Array.from({ length: WIDE_HUB_USERS }, (_, i) =>
    // Arbitrary distinct glyphs; only their identity matters. The range starts
    // well clear of 一 (U+4E00) — generating over it made the shared part one of
    // its own users, which added 39 spurious edges between the users.
    character(String.fromCodePoint(0x5000 + i), "⿰亻一"),
  );

  return buildDecompositionIndex([
    component("亻"),
    character("一", null),
    ...users,
  ]);
}

const glyphsIn = (result: { nodes: { vocabItem: string }[] }) =>
  result.nodes.map((node) => node.vocabItem);

describe("buildDecompositionIndex", () => {
  it("links a character to its parts in both directions", () => {
    const index = buildDecompositionIndex([
      component("亻"),
      character("尔", null),
      character("你", "⿰亻尔"),
    ]);

    expect(index.children.get("你")).toEqual(["亻", "尔"]);
    expect(index.parents.get("亻")).toEqual(["你"]);
    expect(index.parents.get("尔")).toEqual(["你"]);
  });

  // 林 is 木木. Two identical parts are one relationship, and emitting it twice
  // would draw a doubled edge and double the part's degree.
  it("collapses a repeated part into one edge", () => {
    const index = buildDecompositionIndex([
      character("木", null),
      character("林", "⿰木木"),
    ]);

    expect(index.children.get("林")).toEqual(["木"]);
    expect(index.parents.get("木")).toEqual(["林"]);
    expect(index.degree.get("木")).toBe(1);
  });

  // A decomposition that names the character itself must not produce a loop —
  // rendered, it is a node tethered to its own centre.
  it("drops a self-referential part", () => {
    const index = buildDecompositionIndex([
      character("木", null),
      character("本", "⿻木本"),
    ]);

    expect(index.children.get("本")).toEqual(["木"]);
    expect(index.parents.get("本")).toBeUndefined();
  });

  // Disabled rows are excluded by the caller's query, so a part with no row must
  // vanish from the graph rather than appear as an edge to nothing.
  it("ignores parts with no row in the corpus", () => {
    const index = buildDecompositionIndex([character("你", "⿰亻尔")]);

    expect(index.children.get("你")).toBeUndefined();
    expect(index.degree.get("你")).toBe(0);
  });

  // A component is the floor of the hierarchy: whatever strokes it is drawn from
  // are more basic than a radical, and are never taught.
  it("never decomposes a component", () => {
    const index = buildDecompositionIndex([
      component("亻"),
      character("人", "⿰亻人"),
    ]);

    expect(index.children.get("亻")).toBeUndefined();
  });

  it("splits a compound into its characters", () => {
    const index = buildDecompositionIndex([
      character("你", null),
      character("好", null),
      compound("你好"),
    ]);

    expect(index.children.get("你好")).toEqual(["你", "好"]);
    expect(index.parents.get("你")).toEqual(["你好"]);
  });

  it("counts degree across both directions", () => {
    const index = hubCorpus();

    // 亻 is a part of five characters and has no parts of its own.
    expect(index.degree.get("亻")).toBe(5);
    // 你 is built from 亻 and 尔, and is used by 您.
    expect(index.degree.get("你")).toBe(3);
  });
});

describe("extractNeighbourhood", () => {
  it("returns the focus with the parts it is built from", () => {
    const result = extractNeighbourhood(hubCorpus(), "你");

    expect(glyphsIn(result)).toContain("亻");
    expect(glyphsIn(result)).toContain("尔");
  });

  it("returns the focus with the glyphs built from it", () => {
    const result = extractNeighbourhood(hubCorpus(), "你");

    expect(glyphsIn(result)).toContain("您");
  });

  it("puts the focus first and includes it exactly once", () => {
    const result = extractNeighbourhood(hubCorpus(), "你");

    expect(result.nodes[0]?.vocabItem).toBe("你");
    expect(glyphsIn(result).filter((g) => g === "你")).toHaveLength(1);
  });

  // The whole point of the one-hop framing: a glyph's direct relationships are
  // reported completely. A partial list is indistinguishable from a complete one,
  // so sampling would quietly misinform.
  it("returns every connection, however many there are", () => {
    const index = hubCorpus();
    const result = extractNeighbourhood(index, "亻");

    expect(index.parents.get("亻")).toHaveLength(5);
    expect(glyphsIn(result).sort()).toEqual(
      ["亻", "他", "们", "信", "休", "你"].sort(),
    );
  });

  // Same contract, at a width where a fan-out cap would actually bite. Guards the
  // specific regression of reintroducing one.
  it("does not cap a wide hub's connections", () => {
    const index = wideHubCorpus();
    const result = extractNeighbourhood(index, "亻");

    expect(index.parents.get("亻")).toHaveLength(WIDE_HUB_USERS);
    // The hub, its 40 users, and nothing else — 一 is two hops away.
    expect(result.nodes).toHaveLength(WIDE_HUB_USERS + 1);
    expect(result.edges).toHaveLength(WIDE_HUB_USERS);
    expect(result.nodes.find((n) => n.vocabItem === "亻")?.degree).toBe(
      WIDE_HUB_USERS,
    );
  });

  // Stops at one hop: 尔 is a part of 你, but from 亻 it is two hops away and must
  // not appear. Otherwise the corpus's single 9.5k-node component floods in.
  it("stops at one hop", () => {
    const result = extractNeighbourhood(hubCorpus(), "亻");

    expect(glyphsIn(result)).not.toContain("尔");
    expect(glyphsIn(result)).not.toContain("木");
  });

  it("does not reach the focus's grandparents", () => {
    const result = extractNeighbourhood(hubCorpus(), "尔");

    // 你 is built from 尔, so it is one hop. 您 is built from 你 — one further.
    expect(glyphsIn(result)).toContain("你");
    expect(glyphsIn(result)).not.toContain("您");
  });

  // Without this, the result is a star and the relationships between a glyph's
  // neighbours — which is where the structure lives — are invisible.
  it("includes edges between neighbours, not only edges to the focus", () => {
    const result = extractNeighbourhood(hubCorpus(), "你");
    const has = (parent: string, child: string) =>
      result.edges.some((e) => e.parent === parent && e.child === child);

    // Edges are emitted in both directions relative to the focus: 你 is the
    // PARENT of 亻 and 尔, and the CHILD of 您. A pass that only walked
    // children-of-focus would silently drop 您 from the picture it pulled in.
    expect(has("您", "你")).toBe(true);
    expect(has("你", "亻")).toBe(true);
    expect(has("你", "尔")).toBe(true);
  });

  it("emits each edge exactly once", () => {
    const result = extractNeighbourhood(hubCorpus(), "亻");
    const keys = result.edges.map((e) => `${e.parent}>${e.child}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never emits an edge to a glyph outside the returned nodes", () => {
    const result = extractNeighbourhood(hubCorpus(), "亻");
    const present = new Set(glyphsIn(result));

    for (const edge of result.edges) {
      expect(present.has(edge.parent)).toBe(true);
      expect(present.has(edge.child)).toBe(true);
    }
  });

  // Degree is corpus-wide, not response-wide: it is what tells the viewer 口 is
  // shared by hundreds of characters when only its own hop is drawn.
  it("reports corpus-wide degree, not degree within the response", () => {
    const result = extractNeighbourhood(hubCorpus(), "你");
    const hub = result.nodes.find((n) => n.vocabItem === "亻");

    // 亻 shows 5 even though this graph only draws its edge to 你.
    expect(hub?.degree).toBe(5);
  });

  it("returns a lone node for a glyph with no relationships", () => {
    const index = buildDecompositionIndex([character("孑", null)]);
    const result = extractNeighbourhood(index, "孑");

    expect(glyphsIn(result)).toEqual(["孑"]);
    expect(result.edges).toEqual([]);
  });

  // A component has no parts, but the characters built from it are the entire
  // point of looking at one.
  it("gives a component its users", () => {
    const result = extractNeighbourhood(hubCorpus(), "亻");

    expect(result.nodes).toHaveLength(6);
    expect(result.edges).toHaveLength(5);
  });

  // Decomposition is not acyclic in practice, and the view is undirected, so a
  // glyph appearing in both directions must not be emitted twice.
  it("handles a glyph that is both a part of and built from the focus", () => {
    const index = buildDecompositionIndex([
      character("甲", "⿰乙丙"),
      character("乙", "⿰甲丙"),
      character("丙", null),
    ]);
    const result = extractNeighbourhood(index, "甲");

    expect(glyphsIn(result).filter((g) => g === "乙")).toHaveLength(1);
  });

  it("returns a stable order for the same input, focus first", () => {
    const index = hubCorpus();

    expect(extractNeighbourhood(index, "亻")).toEqual(
      extractNeighbourhood(index, "亻"),
    );

    // 您 rather than the hub: its neighbourhood is 你 and 心, both of which sort
    // ahead of it, so leading with the focus is the only way it lands first. 亻
    // happens to be the lowest codepoint in its own neighbourhood and so cannot
    // tell the two orderings apart.
    expect(extractNeighbourhood(index, "您").nodes[0].vocabItem).toBe("您");
  });
});

/**
 * A chain where the longest and shortest paths to a glyph differ.
 *
 * 体 is built from 休 (two levels down) and 一 (one level down). Layering by the
 * shortest route would call it level 1 and place it beside its own prerequisite;
 * only the longest route gives the order the app teaches in.
 */
function chainCorpus() {
  return buildDecompositionIndex([
    component("亻"),
    character("木", null),
    character("一", null),
    character("休", "⿰亻木"),
    character("体", "⿰休一"),
  ]);
}

describe("layerByPrerequisites", () => {
  it("puts everything with no prerequisite in the set on level 0", () => {
    const level = layerByPrerequisites(hubCorpus());

    // 亻 is a component, and 尔/心/也/门/木/言 are characters whose own parts are
    // absent — nothing in this set gates any of them.
    for (const glyph of ["亻", "尔", "心", "也", "门", "木", "言"]) {
      expect(level.get(glyph)).toBe(0);
    }
  });

  it("counts levels from the deepest prerequisite, not the nearest", () => {
    const level = layerByPrerequisites(chainCorpus());

    expect(level.get("休")).toBe(1);
    // Reachable in one hop via 一, in two via 休. Only the longer answer is right.
    expect(level.get("体")).toBe(2);
  });

  /**
   * The invariant the depth control rests on: every part sits strictly below the
   * thing it gates, so filtering to level <= N can never show a glyph while hiding
   * something it is built from.
   */
  it("places every part strictly below the glyph it gates", () => {
    for (const index of [hubCorpus(), chainCorpus()]) {
      const level = layerByPrerequisites(index);

      for (const [parent, parts] of index.children) {
        for (const part of parts) {
          expect(level.get(part)!).toBeLessThan(level.get(parent)!);
        }
      }
    }
  });

  it("gates a compound on the characters it is written with", () => {
    const level = layerByPrerequisites(
      buildDecompositionIndex([
        component("亻"),
        character("尔", null),
        character("好", null),
        character("你", "⿰亻尔"),
        compound("你好"),
      ]),
    );

    expect(level.get("你")).toBe(1);
    // 你 is level 1 and 好 is level 0, so the word lands one past the deeper of them.
    expect(level.get("你好")).toBe(2);
  });

  /**
   * Mutual prerequisites cannot be satisfied, so they have no honest level — but
   * dropping them would silently shrink the deck a viewer is looking at.
   */
  it("parks glyphs locked in a cycle past everything that resolved", () => {
    const level = layerByPrerequisites(
      buildDecompositionIndex([
        // A clean chain reaching level 2, so "deeper than everything resolvable"
        // is a claim with teeth rather than a restatement of "greater than zero".
        component("亻"),
        character("木", null),
        character("休", "⿰亻木"),
        character("体", "⿰休一"),
        character("一", null),
        // 甲 and 乙 each need the other, so neither can ever be introduced.
        character("甲", "⿰乙丙"),
        character("乙", "⿰甲丙"),
        character("丙", null),
      ]),
    );

    // Nothing is dropped: a cycle must not silently shrink the deck on screen.
    expect(level.size).toBe(8);
    expect(level.get("体")).toBe(2);
    // Partial relaxation would have left both on level 1, beside the chain's
    // 休 — deep enough to look introducible, which they never are.
    expect(level.get("甲")!).toBeGreaterThan(2);
    expect(level.get("乙")!).toBeGreaterThan(2);
  });
});

describe("extractDeckGraph", () => {
  it("returns every glyph in the deck and every edge between two of them", () => {
    const result = extractDeckGraph(hubCorpus());

    expect(result.nodes).toHaveLength(13);
    // Six composed glyphs (你您他们休信), each naming two in-set parts.
    expect(result.edges).toHaveLength(12);
    // 亻 and the bare characters are 0, the 亻-characters are 1, 您 is 2.
    expect(result.maxLevel).toBe(2);
  });

  it("reports degree within the deck, not across the corpus", () => {
    // 亻 is a part of 488 characters in the real corpus and 5 of these.
    const hub = extractDeckGraph(hubCorpus()).nodes.find(
      (node) => node.vocabItem === "亻",
    );

    expect(hub?.degree).toBe(5);
  });

  it("orders nodes by level, then by glyph, in teaching order", () => {
    // hubCorpus is deliberately declared out of level order — 您 (level 2) is
    // third, ahead of six level-0 characters — so an unsorted payload shows up.
    const nodes = extractDeckGraph(hubCorpus()).nodes;

    expect(nodes.map((node) => node.level)).toEqual(
      [...nodes].map((node) => node.level).sort((a, b) => a - b),
    );
    // The tie-break: within a level, by glyph.
    const roots = nodes.filter((node) => node.level === 0);
    expect(roots.map((node) => node.vocabItem)).toEqual(
      [...roots].map((node) => node.vocabItem).sort(),
    );
  });

  it("returns a stable payload for the same deck", () => {
    const index = hubCorpus();

    expect(extractDeckGraph(index)).toEqual(extractDeckGraph(index));
  });
});
