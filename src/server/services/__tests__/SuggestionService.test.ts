import { describe, it, expect, vi, afterEach } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Logger } from "pino";

import type { Drizzle } from "@/server/database/database";
import {
  SUGGESTION_RATE_LIMIT,
  SUGGESTION_RATE_WINDOW_MS,
} from "@/definitions/definitions";
import {
  isOverSuggestionRateLimit,
  SuggestionService,
} from "../SuggestionService";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

/**
 * A database that answers the one query the limiter makes and records the
 * condition it was given, so the window can be asserted rather than assumed.
 */
function databaseReturning(rows: { count: number }[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const database = {
    select: () => ({ from: () => ({ where }) }),
  } as unknown as Drizzle;

  return { database, where };
}

function service(rows: { count: number }[]) {
  const { database, where } = databaseReturning(rows);
  return { service: new SuggestionService({ logger, database }), where };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isOverSuggestionRateLimit", () => {
  it("should allow a user who has filed nothing", () => {
    expect(isOverSuggestionRateLimit(0)).toBe(false);
  });

  it("should allow the last submission inside the allowance", () => {
    expect(isOverSuggestionRateLimit(SUGGESTION_RATE_LIMIT - 1)).toBe(false);
  });

  it("should block once the allowance is exactly used up", () => {
    expect(isOverSuggestionRateLimit(SUGGESTION_RATE_LIMIT)).toBe(true);
  });

  it("should block above the allowance", () => {
    expect(isOverSuggestionRateLimit(SUGGESTION_RATE_LIMIT + 1)).toBe(true);
  });
});

describe("SuggestionService", () => {
  describe("countRecentForUser", () => {
    it("should return the counted rows", async () => {
      const { service: suggestions } = service([{ count: 7 }]);

      expect(
        await suggestions.countRecentForUser(
          "user-1",
          SUGGESTION_RATE_WINDOW_MS,
        ),
      ).toBe(7);
    });

    it("should return 0 when the count comes back empty", async () => {
      const { service: suggestions } = service([]);

      expect(
        await suggestions.countRecentForUser(
          "user-1",
          SUGGESTION_RATE_WINDOW_MS,
        ),
      ).toBe(0);
    });

    it("should count only this user's rows inside the window", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
      const { service: suggestions, where } = service([{ count: 0 }]);

      await suggestions.countRecentForUser("user-1", SUGGESTION_RATE_WINDOW_MS);

      // The dialect renders the cutoff as a timestamp literal, so an hour-long
      // window an hour before "now" must bind exactly 11:00.
      const query = new PgDialect().sqlToQuery(where.mock.calls[0]![0] as SQL);
      expect(query.params).toEqual(["user-1", "2026-07-27T11:00:00.000Z"]);
    });
  });

  /**
   * The pair the endpoint actually runs: the 10th submission of the hour goes
   * through, the 11th does not.
   */
  describe("the limiter as the endpoint applies it", () => {
    it("should let the final allowed submission through", async () => {
      const { service: suggestions } = service([
        { count: SUGGESTION_RATE_LIMIT - 1 },
      ]);

      const recent = await suggestions.countRecentForUser(
        "user-1",
        SUGGESTION_RATE_WINDOW_MS,
      );

      expect(isOverSuggestionRateLimit(recent)).toBe(false);
    });

    it("should block the one after it", async () => {
      const { service: suggestions } = service([
        { count: SUGGESTION_RATE_LIMIT },
      ]);

      const recent = await suggestions.countRecentForUser(
        "user-1",
        SUGGESTION_RATE_WINDOW_MS,
      );

      expect(isOverSuggestionRateLimit(recent)).toBe(true);
    });
  });
});
