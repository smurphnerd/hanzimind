import { describe, expect, it, vi } from "vitest";

import { createCachedProbe } from "../health";

const clock = (start = 0) => {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
};

/** A check that never answers: a database that has hung rather than refused. */
const neverAnswers = () => vi.fn(() => new Promise<void>(() => {}));

/**
 * Fake timers with the clock faked too and started at zero, so the cache window
 * and the timeout advance together. Faking only the timer would leave freshness
 * on the wall clock, where nothing expires during a test and a probe that
 * re-queried on every poll would still look single-flighted.
 */
const useTestClock = () =>
  vi.useFakeTimers({ now: 0, toFake: ["setTimeout", "clearTimeout", "Date"] });

describe("createCachedProbe", () => {
  it("reports the check's result", async () => {
    const probe = createCachedProbe({
      check: async () => undefined,
      ttlMs: 1000,
      timeoutMs: 500,
    });

    expect((await probe()).healthy).toBe(true);
  });

  it("reports a failing check as unhealthy rather than throwing", async () => {
    const probe = createCachedProbe({
      check: async () => {
        throw new Error("connection refused");
      },
      ttlMs: 1000,
      timeoutMs: 500,
    });

    expect((await probe()).healthy).toBe(false);
  });

  // The whole point: /api/health takes no auth, so the query rate has to be
  // bounded by the clock rather than by how often it is called.
  it("costs one check per window however often it is asked", async () => {
    const time = clock();
    const check = vi.fn(async () => undefined);
    const probe = createCachedProbe({
      check,
      ttlMs: 2000,
      timeoutMs: 1000,
      now: time.now,
    });

    await probe();
    time.advance(1999);
    await probe();
    await probe();

    expect(check).toHaveBeenCalledTimes(1);
  });

  it("checks again once the window has passed", async () => {
    const time = clock();
    const check = vi.fn(async () => undefined);
    const probe = createCachedProbe({
      check,
      ttlMs: 2000,
      timeoutMs: 1000,
      now: time.now,
    });

    await probe();
    time.advance(2000);
    await probe();

    expect(check).toHaveBeenCalledTimes(2);
  });

  // Without this a burst that arrives on a cold cache opens one connection per
  // caller, which is the amplifier the cache exists to prevent.
  it("collapses concurrent callers onto one check", async () => {
    let release: () => void = () => {};
    const check = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const probe = createCachedProbe({ check, ttlMs: 2000, timeoutMs: 1000 });

    const callers = Promise.all([probe(), probe(), probe()]);
    release();
    await callers;

    expect(check).toHaveBeenCalledTimes(1);
  });

  // A failing database is the worst moment to start retrying on every request.
  it("caches a failure for the same window as a success", async () => {
    const time = clock();
    const check = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const probe = createCachedProbe({
      check,
      ttlMs: 2000,
      timeoutMs: 1000,
      now: time.now,
    });

    await probe();
    time.advance(1000);
    await probe();

    expect(check).toHaveBeenCalledTimes(1);
  });

  it("gives up on a check that hangs, so the response never does", async () => {
    useTestClock();
    try {
      const probe = createCachedProbe({
        check: neverAnswers(),
        ttlMs: 2000,
        timeoutMs: 500,
      });

      const result = probe();
      await vi.advanceTimersByTimeAsync(500);

      expect((await result).healthy).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The case that shipped broken and that no test above can see, because every
   * one of them sets a timeout shorter than the window.
   *
   * A timeout releases the caller; it cannot cancel the query, which goes on
   * holding a Postgres backend. Single-flighting the caller's wait rather than
   * the check itself meant every stale poll opened another `select 1` against a
   * database that had not answered the first — fifteen probes and four
   * abandoned backends, out of a pool of ten, from thirty seconds of polling.
   */
  it("opens no second connection while a check has not answered", async () => {
    useTestClock();
    try {
      const check = neverAnswers();
      const probe = createCachedProbe({ check, ttlMs: 2000, timeoutMs: 750 });

      for (let poll = 0; poll < 30; poll++) {
        const pending = probe();
        await vi.advanceTimersByTimeAsync(1000);
        await pending;
      }

      expect(check).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caches a timed-out answer for the rest of the window", async () => {
    useTestClock();
    try {
      const probe = createCachedProbe({
        check: neverAnswers(),
        ttlMs: 2000,
        timeoutMs: 500,
      });

      const first = probe();
      await vi.advanceTimersByTimeAsync(500);
      await first;

      // Answered from the cache: no second wait, and no second query.
      await expect(probe()).resolves.toMatchObject({
        healthy: false,
        checkedAt: 500,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes the answer when a check comes back after its caller gave up", async () => {
    useTestClock();
    try {
      let release: () => void = () => {};
      const probe = createCachedProbe({
        check: () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
        ttlMs: 5000,
        timeoutMs: 500,
      });

      const first = probe();
      await vi.advanceTimersByTimeAsync(500);
      expect((await first).healthy).toBe(false);

      release();
      await vi.advanceTimersByTimeAsync(0);

      expect((await probe()).healthy).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // Both values are constants at the call site, so the pair that shipped —
  // equal timeout and window — is a wiring mistake worth refusing outright
  // rather than one more case to remember to test.
  it("refuses a timeout that is not shorter than its cache window", () => {
    expect(() =>
      createCachedProbe({
        check: async () => undefined,
        ttlMs: 2000,
        timeoutMs: 2000,
      }),
    ).toThrow(/shorter/);
  });

  it("hands the failure to the caller's logger instead of swallowing it", async () => {
    const onFailure = vi.fn();
    const failure = new Error("connection refused");
    const probe = createCachedProbe({
      check: async () => {
        throw failure;
      },
      ttlMs: 1000,
      timeoutMs: 500,
      onFailure,
    });

    await probe();

    expect(onFailure).toHaveBeenCalledWith(failure);
  });

  // A slow check that is dated from its start is stale on arrival, which is the
  // other half of how the timeout path lost its cache.
  it("dates a result from when the check answered, not when it started", async () => {
    const time = clock(1000);
    const probe = createCachedProbe({
      check: async () => {
        time.advance(300);
      },
      ttlMs: 2000,
      timeoutMs: 1000,
      now: time.now,
    });

    expect((await probe()).checkedAt).toBe(1300);
  });
});
