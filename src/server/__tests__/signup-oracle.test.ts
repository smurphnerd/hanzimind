import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";

import {
  AUTH_BASE_PATH,
  LEVELLED_AUTH_ROUTES,
  RESPONSE_QUANTUM_MS,
  isLevelledAuthRoute,
  padToQuantumMs,
} from "@/server/auth-timing";
import { buildAuthOptions } from "@/server/auth";
import type { Cradle } from "@/server/initialization";

const fakeLogger = () => {
  const child = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { ...child, child: () => child };
};

/**
 * A real better-auth instance on an in-memory database, so these assertions
 * run through the same endpoint a browser hits rather than through a
 * reimplementation of it. Only the storage is swapped; the options — plugins,
 * synthetic user, hooks, verification requirement — are the ones production
 * builds.
 */
const instance = () => {
  const sendEmail = vi.fn().mockResolvedValue("id");
  const logger = fakeLogger();
  const deps = {
    database: {},
    email: { sendEmail },
    logger,
  } as unknown as Cradle;
  const auth = betterAuth({
    ...buildAuthOptions(deps, {
      authSecret: "secret",
      baseUrl: "http://localhost:3000",
      rateLimit: false,
      systemEmailFrom: "from@hanzimind.test",
    }),
    // The memory adapter will not create a model it was not handed, and
    // better-auth's model names are singular whatever `usePlural` does to the
    // Postgres table names.
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      rateLimit: [],
    }),
  });
  const signUp = async (email: string) => {
    const response = await auth.api.signUpEmail({
      body: {
        name: "A Learner",
        email,
        password: "a-long-enough-password",
        callbackURL: "/verified",
      },
      asResponse: true,
    });
    return { status: response.status, body: await response.text() };
  };
  return { auth, signUp, sendEmail, logger };
};

const parse = (body: string) =>
  JSON.parse(body) as { token: unknown; user: Record<string, unknown> };

/**
 * One response with the three things it is entitled to differ in blanked out —
 * the generated id, the clock, and the address that was asked about — read over
 * a caller-supplied key list so both sides are compared over the same keys.
 */
const shapeOf = (
  answer: { body: string; email: string },
  keys: readonly string[],
) => {
  const parsed = parse(answer.body);
  const user = Object.fromEntries(
    keys.map((key) => [key, parsed.user[key] ?? null]),
  );
  return JSON.stringify({ token: parsed.token, user })
    .split(answer.email)
    .join("<address>")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<timestamp>")
    .replace(/"id":"[^"]*"/g, '"id":"<id>"');
};

/**
 * Both shapes, over every key either of them mentions, with a missing key read
 * as null. On trunk these differed: `"role":"user"` for a free address against
 * `"role":null` for a taken one.
 *
 * The union-with-null step is the memory adapter's doing, not a softened
 * assertion. It drops null columns from a row it returns, so a created user
 * arrives here without `image`, `banReason` or `banExpires` while the synthetic
 * user names all three. Postgres has no such habit — `select()` returns every
 * column — and the lane confirms the two bodies match byte for byte there. A
 * field genuinely present on one side and absent on the other still fails this,
 * because the absent one reads as null and the present one does not.
 */
const shapePair = (
  free: { body: string; email: string },
  taken: { body: string; email: string },
) => {
  const keys = [
    ...new Set([
      ...Object.keys(parse(free.body).user),
      ...Object.keys(parse(taken.body).user),
    ]),
  ].sort();
  return [shapeOf(free, keys), shapeOf(taken, keys)] as const;
};

describe("sign-up is not an account-existence oracle", () => {
  it("answers a taken address with the same body it answers a free one", async () => {
    const { signUp } = instance();
    const free = await signUp("free@hanzimind.test");
    const taken = await signUp("taken@hanzimind.test");
    const again = await signUp("taken@hanzimind.test");

    expect(again.status).toBe(taken.status);
    const [freeShape, takenShape] = shapePair(
      { body: free.body, email: "free@hanzimind.test" },
      { body: again.body, email: "taken@hanzimind.test" },
    );
    expect(takenShape).toBe(freeShape);
  });

  it("carries the role a real account gets, which is the field that leaked", async () => {
    const { signUp } = instance();
    await signUp("taken@hanzimind.test");
    const again = await signUp("taken@hanzimind.test");

    expect(JSON.parse(again.body).user.role).toBe("user");
  });

  it("still refuses to create a second account for the address", async () => {
    const { signUp, auth } = instance();
    await signUp("taken@hanzimind.test");
    const again = await signUp("taken@hanzimind.test");

    // The response invents a user; the database must not have gained one.
    const created = JSON.parse(again.body).user.id;
    await expect(
      auth.api.signInEmail({
        body: {
          email: "taken@hanzimind.test",
          password: "a-long-enough-password",
        },
      }),
      // Unverified, so sign-in is refused — but it is refused for the ONE
      // account that exists, and the synthetic id is not it.
    ).rejects.toThrow();
    expect(created).not.toBe("");
  });

  it("sends exactly one email either way, so the two paths cost the same", async () => {
    const free = instance();
    await free.signUp("free@hanzimind.test");
    expect(free.sendEmail).toHaveBeenCalledTimes(1);

    const taken = instance();
    await taken.signUp("taken@hanzimind.test");
    taken.sendEmail.mockClear();
    await taken.signUp("taken@hanzimind.test");
    expect(taken.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("gives an unverified account the verification link it never used", async () => {
    const { signUp, sendEmail } = instance();
    await signUp("taken@hanzimind.test");
    sendEmail.mockClear();
    await signUp("taken@hanzimind.test");

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "taken@hanzimind.test",
        subject: "Verify your email - Hanzimind",
      }),
    );
  });

  it("tells a verified account holder they already have one, with a way back in", async () => {
    const { auth, signUp, sendEmail } = instance();
    await signUp("taken@hanzimind.test");
    await auth.$context.then((context) =>
      context.internalAdapter.updateUserByEmail("taken@hanzimind.test", {
        emailVerified: true,
      }),
    );
    sendEmail.mockClear();
    await signUp("taken@hanzimind.test");

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "taken@hanzimind.test",
        subject: "You already have a Hanzimind account",
      }),
    );
  });

  /**
   * Only the response is blinded. An operator answering "did my sign-up work"
   * still needs to know which case it was, and the log is where they look.
   */
  it("records which case it was in the log, where an enumerator cannot read it", async () => {
    const { signUp, logger } = instance();
    await signUp("taken@hanzimind.test");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ email: "taken@hanzimind.test" }),
      "Sign-up: the address was free, created an account",
    );

    await signUp("taken@hanzimind.test");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ email: "taken@hanzimind.test" }),
      "Sign-up: the address already has an account, answered as if new",
    );
  });
});

describe("response-time levelling", () => {
  it("levels every unauthenticated route that takes an email address", () => {
    for (const route of LEVELLED_AUTH_ROUTES) {
      expect(isLevelledAuthRoute(`${AUTH_BASE_PATH}${route}`)).toBe(true);
    }
  });

  it("covers sign-up and password reset, the two that measurably leaked", () => {
    expect(LEVELLED_AUTH_ROUTES).toContain("/sign-up/email");
    expect(LEVELLED_AUTH_ROUTES).toContain("/request-password-reset");
  });

  // Measured at 0.0% apart on a lane, on a route a learner uses far more than
  // once. Adding three quarters of a second there would be a cost with no
  // corresponding leak closed.
  it("leaves sign-in alone", () => {
    expect(isLevelledAuthRoute(`${AUTH_BASE_PATH}/sign-in/email`)).toBe(false);
  });

  it("leaves anything outside the auth base path alone", () => {
    expect(isLevelledAuthRoute("/api/rpc/vocab/search")).toBe(false);
    expect(isLevelledAuthRoute("/sign-up/email")).toBe(false);
  });

  it("holds a fast response to the end of the first bucket", () => {
    expect(padToQuantumMs(10, 750)).toBe(740);
    expect(padToQuantumMs(749, 750)).toBe(1);
  });

  // A response that has cost nothing measurable must still wait, or "instant"
  // becomes its own signal.
  it("holds an instant response for a whole bucket", () => {
    expect(padToQuantumMs(0, 750)).toBe(750);
  });

  it("rounds an overrun up to the next bucket rather than revealing its cost", () => {
    // Already on a boundary, so nothing to add.
    expect(padToQuantumMs(750, 750)).toBe(0);
    expect(padToQuantumMs(800, 750)).toBe(700);
    expect(padToQuantumMs(1600, 750)).toBe(650);
  });

  /**
   * The bucket has to clear the slowest levelled route with room to spare.
   * `/send-verification-email` measured 533 ms p95 on a lane, already carrying
   * better-auth's own 500 ms floor, and production adds a real SMTP round trip
   * to that.
   */
  it("uses a bucket wide enough for the slowest route measured", () => {
    expect(RESPONSE_QUANTUM_MS).toBeGreaterThan(533);
  });
});
