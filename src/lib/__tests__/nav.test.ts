import { describe, expect, it } from "vitest";

import { isCurrentPage, safeCallbackUrl } from "../nav";

const BASE = "https://hanzimind.test";

describe("safeCallbackUrl", () => {
  it("should send a visitor with no redirect to the root", () => {
    expect(safeCallbackUrl(BASE, null)).toBe("/");
  });

  it("should not double the slash on a path that already leads with one", () => {
    expect(safeCallbackUrl(BASE, "/dictionary/%E4%BA%BA")).toBe(
      `${BASE}/dictionary/%E4%BA%BA`,
    );
  });

  it("should percent-encode a raw non-ascii path", () => {
    // An HTTP header is a ByteString and better-auth writes this into
    // `location`, so a raw 人 made sign-in answer 500 with no session.
    expect(safeCallbackUrl(BASE, "/dictionary/人")).toBe(
      `${BASE}/dictionary/%E4%BA%BA`,
    );
  });

  it("should not double-encode a path that is already encoded", () => {
    expect(safeCallbackUrl(BASE, "/dictionary/%E4%BA%BA")).not.toContain("%25");
  });

  it("should keep a traversal attempt on our own origin", () => {
    expect(safeCallbackUrl(BASE, "/../etc/passwd")).toBe(`${BASE}/etc/passwd`);
  });

  it("should refuse a javascript url", () => {
    expect(safeCallbackUrl(BASE, "javascript:alert(1)")).toBe(
      `${BASE}/javascript:alert(1)`,
    );
  });

  it("should accept a path with no leading slash", () => {
    expect(safeCallbackUrl(BASE, "decks")).toBe(`${BASE}/decks`);
  });

  it("should refuse a protocol-relative url", () => {
    expect(safeCallbackUrl(BASE, "//evil.test/steal")).toBe(
      `${BASE}/evil.test/steal`,
    );
  });

  it("should refuse an absolute url", () => {
    expect(safeCallbackUrl(BASE, "https://evil.test")).toBe(
      `${BASE}/https://evil.test`,
    );
  });
});

describe("isCurrentPage", () => {
  it("should mark the exact page", () => {
    expect(isCurrentPage("/decks", "/decks")).toBe(true);
  });

  it("should mark a nav section from one of its entries", () => {
    expect(isCurrentPage("/dictionary/%E4%BA%BA", "/dictionary")).toBe(true);
  });

  it("should not mark a sibling whose path merely starts the same", () => {
    expect(isCurrentPage("/decksomething", "/decks")).toBe(false);
  });

  it("should not mark an unrelated page", () => {
    expect(isCurrentPage("/profile", "/decks")).toBe(false);
  });
});
