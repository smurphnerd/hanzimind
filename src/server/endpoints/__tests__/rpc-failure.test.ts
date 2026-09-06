import { ORPCError } from "@orpc/client";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";

import { requestIdOf } from "@/lib/request-id";
import { accountForFailure } from "../rpc-failure";

const REQUEST_ID = "req-42";

const lane = () => {
  const logger = { error: vi.fn(), warn: vi.fn() };
  const report = vi.fn();

  return {
    logger,
    report,
    account: (error: unknown) =>
      accountForFailure(error, {
        logger: logger as unknown as Logger,
        requestId: REQUEST_ID,
        path: "/vocab/search",
        report,
      }),
  };
};

describe("accountForFailure", () => {
  /**
   * A body the codec cannot decode fails before any procedure runs, so
   * loggingMiddleware never sees it. Left alone, oRPC builds the 400 itself and
   * the id reaches the header and nowhere a page could show it.
   */
  it("stamps the id onto a failure that never reached a procedure", () => {
    const { account } = lane();

    const failure = account(new SyntaxError("Unexpected token }"));

    expect(failure.code).toBe("BAD_REQUEST");
    expect(requestIdOf(failure)).toBe(REQUEST_ID);
  });

  it("keeps the undecodable body as the cause", () => {
    const { account } = lane();
    const cause = new SyntaxError("Unexpected token }");

    expect(account(cause).cause).toBe(cause);
  });

  it("leaves an error the middleware already mapped alone", () => {
    const { account } = lane();
    const mapped = new ORPCError("NOT_FOUND", { message: "Deck not found" });

    expect(account(mapped)).toBe(mapped);
  });

  it("logs a fault with the error, and reports it", () => {
    const { account, logger, report } = lane();

    const failure = account(new ORPCError("INTERNAL_SERVER_ERROR"));

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID, err: failure }),
      "RPC call failed",
    );
    expect(report).toHaveBeenCalledWith(failure);
  });

  /**
   * A 401 is ordinary traffic — every signed-out page load makes one. Logging
   * it at error with a full stack buries the faults, and reporting it would let
   * anyone fill the error budget from outside.
   */
  it("logs a rejection at warn, without a stack", () => {
    const { account, logger } = lane();

    account(new ORPCError("UNAUTHORIZED"));

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED", status: 401 }),
      "RPC call rejected",
    );
    expect(logger.warn.mock.calls[0][0]).not.toHaveProperty("err");
  });

  it("does not report a rejection", () => {
    const { account, report } = lane();

    account(new ORPCError("NOT_FOUND"));

    expect(report).not.toHaveBeenCalled();
  });

  it("logs exactly one line per failure", () => {
    const { account, logger } = lane();

    account(new ORPCError("BAD_REQUEST"));

    expect(logger.warn.mock.calls.length + logger.error.mock.calls.length).toBe(
      1,
    );
  });
});
