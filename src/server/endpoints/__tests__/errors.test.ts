import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import {
  InvalidInputError,
  isForeignKeyViolation,
  NotFoundError,
  toORPCError,
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
