import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { requestIdOf } from "@/lib/request-id";
import {
  InvalidInputError,
  isForeignKeyViolation,
  NotFoundError,
  toORPCError,
  withRequestId,
} from "../errors";

const DRIZZLE_FAILURE = new Error(
  'Failed query: select "id", "vocab_item", "translation", "pinyin" from "vocab_items" where "vocab_items"."vocab_item" = $1\nparams: 亻',
);

describe("toORPCError", () => {
  it("should map a NotFoundError to NOT_FOUND", () => {
    const mapped = toORPCError(new NotFoundError("Deck not found"));

    expect(mapped.code).toBe("NOT_FOUND");
  });

  it("should keep a NotFoundError's message, which services write for a person", () => {
    const mapped = toORPCError(new NotFoundError("Deck not found"));

    expect(mapped.message).toBe("Deck not found");
  });

  it("should map an InvalidInputError to BAD_REQUEST", () => {
    const mapped = toORPCError(
      new InvalidInputError("Item is not in this deck"),
    );

    expect(mapped.code).toBe("BAD_REQUEST");
  });

  it("should keep an InvalidInputError's message", () => {
    const mapped = toORPCError(
      new InvalidInputError("Item is not in this deck"),
    );

    expect(mapped.message).toBe("Item is not in this deck");
  });

  it("should map an unknown error to INTERNAL_SERVER_ERROR", () => {
    const mapped = toORPCError(DRIZZLE_FAILURE);

    expect(mapped.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("should never carry the original text of an unknown error", () => {
    const mapped = toORPCError(DRIZZLE_FAILURE);

    expect(mapped.message).toBe("Something went wrong");
  });

  it("should not leak the failed query, its columns or its bound parameters", () => {
    const mapped = toORPCError(DRIZZLE_FAILURE);

    for (const fragment of [
      "Failed query",
      "vocab_items",
      "params",
      "$1",
      "亻",
    ]) {
      expect(mapped.message).not.toContain(fragment);
    }
  });

  it("should keep the original error as the cause, so the log still has it", () => {
    const mapped = toORPCError(DRIZZLE_FAILURE);

    expect(mapped.cause).toBe(DRIZZLE_FAILURE);
  });

  it("should pass an ORPCError through unchanged, so auth codes survive", () => {
    const unauthorized = new ORPCError("UNAUTHORIZED", {
      message: "Unauthorized",
    });

    expect(toORPCError(unauthorized)).toBe(unauthorized);
  });

  it("should map a thrown non-Error to INTERNAL_SERVER_ERROR", () => {
    const mapped = toORPCError("connection reset by peer");

    expect(mapped.message).toBe("Something went wrong");
  });
});

describe("isForeignKeyViolation", () => {
  it("should recognise the SQLSTATE Postgres uses for a bad foreign key", () => {
    const violation = new Error("insert failed", {
      cause: { code: "23503" },
    });

    expect(isForeignKeyViolation(violation)).toBe(true);
  });

  it("should not claim a different SQLSTATE", () => {
    const other = new Error("insert failed", { cause: { code: "23505" } });

    expect(isForeignKeyViolation(other)).toBe(false);
  });

  it("should not throw on an error with no cause", () => {
    expect(isForeignKeyViolation(new Error("plain"))).toBe(false);
  });

  it("should not throw on a thrown non-Error", () => {
    expect(isForeignKeyViolation("23503")).toBe(false);
  });
});

describe("withRequestId", () => {
  it("puts the id where the client can read it back off the error", () => {
    const stamped = withRequestId(toORPCError(new Error("boom")), "req-1");

    expect(requestIdOf(stamped)).toBe("req-1");
  });

  it("keeps the code and message the mapper chose", () => {
    const stamped = withRequestId(
      toORPCError(new NotFoundError("Deck not found")),
      "req-1",
    );

    expect(stamped.code).toBe("NOT_FOUND");
    expect(stamped.message).toBe("Deck not found");
  });

  // isDefinedError on the client reads this flag; dropping it in the rebuild
  // would turn a handled 401 into an unknown fault.
  it("carries the defined flag across the rebuild", () => {
    const stamped = withRequestId(
      new ORPCError("UNAUTHORIZED", { defined: true }),
      "req-1",
    );

    expect(stamped.defined).toBe(true);
  });

  it("keeps the cause, which is what the log line explains", () => {
    const cause = new Error("boom");
    const stamped = withRequestId(toORPCError(cause), "req-1");

    expect(stamped.cause).toBe(cause);
  });

  it("merges into existing data rather than replacing it", () => {
    const stamped = withRequestId(
      new ORPCError("BAD_REQUEST", { data: { field: "email" } }),
      "req-1",
    );

    expect(stamped.data).toEqual({ field: "email", requestId: "req-1" });
  });

  // A data shape that is not a plain object cannot take a key, and losing it
  // would cost the caller more than the id is worth.
  it("leaves data alone when it cannot hold an id", () => {
    const original = new ORPCError("BAD_REQUEST", { data: ["email"] });

    expect(withRequestId(original, "req-1")).toBe(original);
  });

  it("returns the error untouched when there is no id", () => {
    const original = toORPCError(new Error("boom"));

    expect(withRequestId(original, undefined)).toBe(original);
  });
});
