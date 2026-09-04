import { describe, expect, it } from "vitest";

import { acceptRequestId, requestIdOf } from "../request-id";

describe("acceptRequestId", () => {
  it("reuses a proxy's id, so one request reads as one event across hops", () => {
    expect(acceptRequestId("a1b2-c3.d4_e5")).toBe("a1b2-c3.d4_e5");
  });

  it("rejects an id with anything that does not belong in a log line", () => {
    expect(acceptRequestId("id with spaces")).toBeUndefined();
    expect(acceptRequestId("id\nlooks-like-two-lines")).toBeUndefined();
    expect(acceptRequestId("<script>")).toBeUndefined();
  });

  it("rejects an id long enough to bloat every line it touches", () => {
    expect(acceptRequestId("a".repeat(65))).toBeUndefined();
  });

  it("has nothing to reuse when the header is absent or empty", () => {
    expect(acceptRequestId(null)).toBeUndefined();
    expect(acceptRequestId("")).toBeUndefined();
  });
});

describe("requestIdOf", () => {
  it("reads the id this app minted off an oRPC error payload", () => {
    expect(requestIdOf({ data: { requestId: "req-1" } })).toBe("req-1");
  });

  it("falls back to a Next server error's digest", () => {
    expect(
      requestIdOf(Object.assign(new Error("boom"), { digest: "d1" })),
    ).toBe("d1");
  });

  it("prefers the minted id, which is the one in the log line", () => {
    const error = Object.assign(new Error("boom"), {
      digest: "d1",
      data: { requestId: "req-1" },
    });

    expect(requestIdOf(error)).toBe("req-1");
  });

  // An id that matches no log line is decoration, and worse than none.
  it("invents nothing when the error carries no id", () => {
    expect(requestIdOf(new Error("boom"))).toBeUndefined();
    expect(requestIdOf({ digest: "" })).toBeUndefined();
    expect(requestIdOf("not an object")).toBeUndefined();
    expect(requestIdOf(null)).toBeUndefined();
  });
});
