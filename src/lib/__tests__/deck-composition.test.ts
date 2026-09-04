import { describe, expect, it } from "vitest";

import { compositionSegments, describeComposition } from "../deck-composition";

const counts = (over: Partial<Record<string, number>> = {}) =>
  ({
    component: 0,
    character: 0,
    compound: 0,
    sentence: 0,
    ...over,
  }) as never;

describe("compositionSegments", () => {
  it("draws nothing for a deck with no items", () => {
    expect(compositionSegments(counts())).toEqual([]);
  });

  it("gives a single type the whole bar", () => {
    expect(compositionSegments(counts({ character: 7 }))).toEqual([
      { type: "character", count: 7, percent: 100 },
    ]);
  });

  it("splits by share of the counts it draws", () => {
    const segments = compositionSegments(
      counts({ component: 1, character: 3 }),
    );

    expect(segments.map((s) => s.percent)).toEqual([25, 75]);
  });

  it("fills the bar edge to edge", () => {
    const segments = compositionSegments(
      counts({ component: 47, character: 283, compound: 68 }),
    );
    const width = segments.reduce((sum, s) => sum + s.percent, 0);

    expect(width).toBeCloseTo(100, 10);
  });

  // A zero-width span would still be in the DOM and in the accessible name.
  it("omits a type with no items rather than drawing it at zero width", () => {
    const segments = compositionSegments(counts({ character: 2, sentence: 0 }));

    expect(segments.map((s) => s.type)).toEqual(["character"]);
  });

  it("orders smallest unit first", () => {
    const segments = compositionSegments(
      counts({ sentence: 1, component: 1, compound: 1, character: 1 }),
    );

    expect(segments.map((s) => s.type)).toEqual([
      "component",
      "character",
      "compound",
      "sentence",
    ]);
  });
});

describe("describeComposition", () => {
  // Regression: the deck-page copy had no pluralisation rule, so a deck with one
  // character was announced as "1 characters".
  it("singularises a count of one", () => {
    const text = describeComposition(
      compositionSegments(counts({ character: 1 })),
    );

    expect(text).toBe("1 character");
  });

  it("pluralises everything else", () => {
    const text = describeComposition(
      compositionSegments(counts({ component: 2, character: 3 })),
    );

    expect(text).toBe("2 components, 3 characters");
  });

  it("says nothing about an empty deck", () => {
    expect(describeComposition(compositionSegments(counts()))).toBe("");
  });
});
