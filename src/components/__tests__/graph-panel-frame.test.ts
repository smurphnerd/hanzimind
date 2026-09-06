import { describe, expect, it } from "vitest";

import { describeDeckCut, describeNeighbourhood } from "../graph-panel-frame";

describe("describeNeighbourhood", () => {
  it("counts everything but the focus glyph", () => {
    expect(describeNeighbourhood(5, false)).toBe("4 connections");
  });

  // The copy this replaced spelled this rule as `nodes.length === 2`.
  it("singularises a lone connection", () => {
    expect(describeNeighbourhood(2, false)).toBe("1 connection");
  });

  it("handles a glyph nothing connects to", () => {
    expect(describeNeighbourhood(1, false)).toBe("0 connections");
  });

  it("never counts below zero", () => {
    expect(describeNeighbourhood(0, false)).toBe("0 connections");
  });

  // Off during a study session, where the graph is shown but must not navigate.
  it("only offers the click hint when the nodes are linkable", () => {
    expect(describeNeighbourhood(5, true)).toBe(
      "4 connections · click to open",
    );
    expect(describeNeighbourhood(5, false)).not.toContain("click");
  });
});

describe("describeDeckCut", () => {
  it("says how much of the deck is on screen", () => {
    expect(describeDeckCut(12, 398, 20)).toBe(
      "12 of 398 items · 20 links · click to open",
    );
  });

  it("reads sensibly when the whole deck is shown", () => {
    expect(describeDeckCut(398, 398, 640)).toBe(
      "398 of 398 items · 640 links · click to open",
    );
  });
});
