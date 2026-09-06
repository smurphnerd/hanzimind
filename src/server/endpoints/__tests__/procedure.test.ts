import { ORPCError } from "@orpc/client";
import { call } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { requestIdOf } from "@/lib/request-id";
import type { Cradle } from "@/server/initialization";
import { NotFoundError } from "../errors";
import { commonProcedure } from "../procedure";

const REQUEST_ID = "req-42";

const context = {
  headers: new Headers(),
  requestId: REQUEST_ID,
  cradle: {} as Cradle,
};

const failing = (thrown: unknown) =>
  commonProcedure.handler(() => {
    throw thrown;
  });

/**
 * The point of a request id is that the failure a learner reads it off and the
 * line the server logged are provably the same event. The log side is one field
 * on one call; this pins the client side, which travels further and is the half
 * that silently stops matching.
 */
describe("loggingMiddleware", () => {
  it("puts the request id where the client can read it back", async () => {
    const error = await call(failing(new Error("boom")), undefined, {
      context,
    }).catch((error: unknown) => error);

    expect(requestIdOf(error)).toBe(REQUEST_ID);
  });

  it("still maps a service error to its code", async () => {
    const error = await call(
      failing(new NotFoundError("Deck not found")),
      undefined,
      { context },
    ).catch((error: unknown) => error);

    expect((error as ORPCError<string, unknown>).code).toBe("NOT_FOUND");
  });

  it("carries the id on an error a procedure threw deliberately", async () => {
    const error = await call(
      failing(new ORPCError("UNAUTHORIZED", { defined: true })),
      undefined,
      { context },
    ).catch((error: unknown) => error);

    expect((error as ORPCError<string, unknown>).defined).toBe(true);
    expect(requestIdOf(error)).toBe(REQUEST_ID);
  });

  it("leaves a successful call alone", async () => {
    const ok = commonProcedure.handler(() => "fine");

    await expect(call(ok, undefined, { context })).resolves.toBe("fine");
  });
});
