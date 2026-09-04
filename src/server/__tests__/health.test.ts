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

describe("createCachedProbe", () => {
  it("reports the check's result", async () => {
    const probe = createCachedProbe({
      check: async () => undefined,
      ttlMs: 1000,
      timeoutMs: 1000,
    });

    expect((await probe()).healthy).toBe(true);
  });

  it("reports a failing check as unhealthy rather than throwing", async () => {
    const probe = createCachedProbe({
      check: async () => {
        throw new Error("connection refused");
      },
      ttlMs: 1000,
      timeoutMs: 1000,
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
    vi.useFakeTimers();
    try {
      const probe = createCachedProbe({
        check: () => new Promise<void>(() => {}),
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

  it("hands the failure to the caller's logger instead of swallowing it", async () => {
    const onFailure = vi.fn();
    const failure = new Error("connection refused");
    const probe = createCachedProbe({
      check: async () => {
        throw failure;
      },
      ttlMs: 1000,
      timeoutMs: 1000,
      onFailure,
    });

    await probe();

    expect(onFailure).toHaveBeenCalledWith(failure);
  });

  // A probe that started before the window and finished after it must not be
  // stamped as fresh on arrival, or a slow check hides how old its answer is.
  it("dates a result from when the check started", async () => {
    const time = clock(1000);
    const probe = createCachedProbe({
      check: async () => {
        time.advance(300);
      },
      ttlMs: 2000,
      timeoutMs: 1000,
      now: time.now,
    });

    expect((await probe()).checkedAt).toBe(1000);
  });
});
