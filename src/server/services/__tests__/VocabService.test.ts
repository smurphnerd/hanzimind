import { describe, it, expect } from "vitest";

import { memoryAidOrder } from "../VocabService";

describe("memoryAidOrder", () => {
  // Regression: a bare `sql`0`` fallback in ORDER BY is read by Postgres as
  // "order by the 0th select column", which is out of range and throws — so
  // every memory-aid list with no starred default (i.e. almost all of them)
  // failed to load. The fix is to emit no rank term at all in that case.
  it("orders by usage only when there is no default", () => {
    expect(memoryAidOrder(null)).toHaveLength(1);
    expect(memoryAidOrder(undefined)).toHaveLength(1);
    expect(memoryAidOrder("")).toHaveLength(1);
  });

  it("adds a rank term ahead of usage when a default is set", () => {
    expect(memoryAidOrder("aid-123")).toHaveLength(2);
  });
});
