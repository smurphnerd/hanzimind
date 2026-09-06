import { describe, expect, it } from "vitest";

import { escapeLike } from "../sql";

describe("escapeLike", () => {
  // Regression: deck search interpolated the term straight into a LIKE pattern,
  // so searching "%" listed every deck on the site.
  it("escapes a wildcard so it matches itself", () => {
    expect(escapeLike("%")).toBe("\\%");
    expect(escapeLike("_")).toBe("\\_");
  });

  it("escapes the escape character first", () => {
    expect(escapeLike("\\")).toBe("\\\\");
    expect(escapeLike("\\%")).toBe("\\\\\\%");
  });

  it("leaves an ordinary term alone", () => {
    expect(escapeLike("HSK 1")).toBe("HSK 1");
  });
});
