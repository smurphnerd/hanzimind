import { describe, expect, it } from "vitest";

import { newRequestId, requestIdOf } from "../request-id";

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

describe("newRequestId", () => {
  // Honouring an inbound x-request-id would correlate a trace across hops, but
  // nothing trusted sits in front of this app, so it would only let a caller
  // pin or collide with someone else's id.
  it("mints a fresh id every time rather than trusting a caller", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });
});
