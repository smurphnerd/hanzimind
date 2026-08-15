import { describe, it, expect } from "vitest";

import { filterDecomposition } from "../decomposition";

describe("filterDecomposition", () => {
  it("should return the component characters of a decomposition", () => {
    // 你 = ⿰亻尔
    expect(filterDecomposition("⿰亻尔")).toEqual(["亻", "尔"]);
  });

  it("should strip Ideographic Description Characters", () => {
    // Every IDC in U+2FF0–U+2FFF describes layout, not content.
    expect(filterDecomposition("⿱⿰木木⿰木木")).toEqual([
      "木",
      "木",
      "木",
      "木",
    ]);
  });

  it("should strip the fullwidth question mark placeholder", () => {
    expect(filterDecomposition("⿰亻？")).toEqual(["亻"]);
  });

  it("should strip the ASCII question mark placeholder", () => {
    expect(filterDecomposition("⿰亻?")).toEqual(["亻"]);
  });

  it("should return an empty array for an atomic glyph", () => {
    // A glyph that cannot be broken down is recorded as a bare placeholder.
    expect(filterDecomposition("？")).toEqual([]);
  });

  it("should return an empty array for null", () => {
    expect(filterDecomposition(null)).toEqual([]);
  });

  it("should return an empty array for undefined", () => {
    expect(filterDecomposition(undefined)).toEqual([]);
  });

  it("should return an empty array for an empty string", () => {
    expect(filterDecomposition("")).toEqual([]);
  });

  it("should keep duplicate components", () => {
    // 林 = ⿰木木 — both halves are taught, so neither is deduplicated away.
    expect(filterDecomposition("⿰木木")).toEqual(["木", "木"]);
  });

  it("should handle components outside the Basic Multilingual Plane", () => {
    // Surrogate pairs must count as one component, not two.
    expect(filterDecomposition("⿰𠀀木")).toEqual(["𠀀", "木"]);
  });
});
