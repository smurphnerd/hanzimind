import { describe, expect, it } from "vitest";

import { pageRange } from "../pagination";

describe("pageRange", () => {
  it("describes the first page of several", () => {
    expect(pageRange(1, 20, 45)).toEqual({
      page: 1,
      totalPages: 3,
      from: 1,
      to: 20,
      total: 45,
      hasPrevious: false,
      hasNext: true,
    });
  });

  it("shows the remainder on the last page and offers no next", () => {
    const range = pageRange(3, 20, 45);

    expect(range.from).toBe(41);
    expect(range.to).toBe(45);
    expect(range.hasNext).toBe(false);
    expect(range.hasPrevious).toBe(true);
  });

  it("reports one page and no items when the list is empty", () => {
    expect(pageRange(1, 20, 0)).toEqual({
      page: 1,
      totalPages: 1,
      from: 0,
      to: 0,
      total: 0,
      hasPrevious: false,
      hasNext: false,
    });
  });

  // Regression: a list can shrink under an open page — an admin hides a glyph,
  // a suggestion is resolved — and all three copies of this maths then rendered
  // a label counting past the end, like "181-45 of 45".
  it("clamps a page past the end onto the last page", () => {
    const range = pageRange(10, 20, 45);

    expect(range.page).toBe(3);
    expect(range.from).toBe(41);
    expect(range.to).toBe(45);
    expect(range.hasNext).toBe(false);
  });

  it("clamps a page below the first", () => {
    expect(pageRange(0, 20, 45).page).toBe(1);
    expect(pageRange(-3, 20, 45).page).toBe(1);
  });

  it("fills exactly when the total is a multiple of the page size", () => {
    const range = pageRange(2, 20, 40);

    expect(range.to).toBe(40);
    expect(range.totalPages).toBe(2);
    // Regression: inferring "there is more" from a full page offered a Next
    // button onto an empty page whenever the count landed on an exact multiple.
    expect(range.hasNext).toBe(false);
  });

  it("counts a single item as one page", () => {
    expect(pageRange(1, 20, 1)).toMatchObject({
      totalPages: 1,
      from: 1,
      to: 1,
      hasNext: false,
    });
  });
});
