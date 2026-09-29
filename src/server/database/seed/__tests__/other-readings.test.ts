import { describe, it, expect } from "vitest";

import { loadOtherReadings } from "../other-readings";

describe("other-readings.tsv", () => {
  const readings = loadOtherReadings();

  // The heteronyms the one-reading model marked wrong on a reading card.
  it.each([
    ["觉", "jiào"],
    ["长", "zhǎng"],
    ["得", "děi"],
    ["地", "de"],
    ["着", "zháo"],
  ])("should list %s's other reading %s", (glyph, reading) => {
    expect(readings.get(glyph)).toContain(reading);
  });

  // RWC writes run-ons like "zháole"; only single syllables are readings.
  it("should hold only single-syllable readings", () => {
    const runOns = [...readings].flatMap(([glyph, list]) =>
      list
        .filter(
          (reading) =>
            (
              reading
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .match(/[aeiouv]+/g) ?? []
            ).length > 1,
        )
        .map((reading) => `${glyph}:${reading}`),
    );
    expect(runOns).toEqual([]);
  });

  it("should never list a reading the overrides replaced as wrong", () => {
    expect(readings.get("呢")).not.toContain("né");
    expect(readings.get("子") ?? []).not.toContain("zi");
  });
});
