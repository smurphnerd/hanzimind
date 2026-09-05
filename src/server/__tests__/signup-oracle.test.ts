import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";

import { AUTH_FIELD_LIMITS } from "@/definitions/definitions";
import {
  convergeLostSignUpRace,
  FAILED_TO_CREATE_USER,
} from "@/server/auth-race";
import {
  AUTH_BASE_PATH,
  LEVELLED_AUTH_ROUTES,
  MAX_LEVELLED_BODY_BYTES,
  RESPONSE_QUANTUM_MS,
  isLevelledAuthRoute,
  isOversizedBody,
  padToQuantumMs,
} from "@/server/auth-timing";
import { buildAuthOptions, overlongAuthField } from "@/server/auth";
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

  /**
   * The create hook fires for any user the adapter writes, and the admin plugin
   * serves a create-user route of its own, so the line is keyed on the sign-up
   * endpoint. Without that, `grep 'Sign-up: '` would report accounts nobody
   * signed up for.
   */
  it("does not call a user created outside sign-up a sign-up", async () => {
    const { auth, logger } = instance();
    const context = await auth.$context;
    await context.internalAdapter.createUser({
      email: "made-by-hand@hanzimind.test",
      name: "Made By Hand",
      emailVerified: false,
    });

    expect(logger.info).not.toHaveBeenCalledWith(
      expect.anything(),
      "Sign-up: the address was free, created an account",
    );
  });

  /**
   * The bucket only hides the two paths from each other while both fit inside
   * it, and the caller decides how much work one of them does: a free address
   * has the submitted `name` rendered into a verification email and a taken one
   * does not. A 4 MB name put the free path three buckets out and the taken
   * path one — a one-request oracle, sharper than the statistical one the
   * bucket had just closed.
   */
  it("refuses an overlong name before it can be rendered into an email", async () => {
    const { auth, sendEmail } = instance();
    await expect(
      auth.api.signUpEmail({
        body: {
          name: "A".repeat(AUTH_FIELD_LIMITS.name + 1),
          email: "free@hanzimind.test",
          password: "a-long-enough-password",
        },
        asResponse: true,
      }),
    ).rejects.toThrow(/name must be at most/i);
    expect(sendEmail, "it did the work anyway").not.toHaveBeenCalled();
  });

  it("accepts a name of exactly the length the sign-up form allows", async () => {
    const { auth } = instance();
    const response = await auth.api.signUpEmail({
      body: {
        name: "A".repeat(AUTH_FIELD_LIMITS.name),
        email: "free@hanzimind.test",
        password: "a-long-enough-password",
      },
      asResponse: true,
    });
    expect(response.status).toBe(200);
  });

  /**
   * The refusal has to arrive the same way for both kinds, or it is the oracle
   * it was added to close.
   */
  it("refuses an overlong field identically whether or not the address exists", async () => {
    const { auth, signUp } = instance();
    await signUp("taken@hanzimind.test");
    const refuse = (email: string) =>
      auth.api
        .signUpEmail({
          body: {
            name: "A".repeat(AUTH_FIELD_LIMITS.name + 1),
            email,
            password: "a-long-enough-password",
          },
          asResponse: true,
        })
        .then(
          (response) => response.text(),
          (error: Error) => error.message,
        );

    expect(await refuse("taken@hanzimind.test")).toBe(
      await refuse("free@hanzimind.test"),
    );
  });
});

describe("bounding what a levelled route will process", () => {
  it("names a field that is one character too long", () => {
    expect(
      overlongAuthField({ name: "A".repeat(AUTH_FIELD_LIMITS.name + 1) }),
    ).toBe("name");
    expect(
      overlongAuthField({
        redirectTo: "A".repeat(AUTH_FIELD_LIMITS.redirectTo + 1),
      }),
    ).toBe("redirectTo");
    expect(
      overlongAuthField({
        callbackURL: "A".repeat(AUTH_FIELD_LIMITS.callbackURL + 1),
      }),
    ).toBe("callbackURL");
  });

  it("passes a field of exactly its limit", () => {
    expect(
      overlongAuthField({
        name: "A".repeat(AUTH_FIELD_LIMITS.name),
        email: "a".repeat(AUTH_FIELD_LIMITS.email),
      }),
    ).toBeNull();
  });

  it("ignores a body it cannot read, rather than throwing on it", () => {
    expect(overlongAuthField(null)).toBeNull();
    expect(overlongAuthField("a string")).toBeNull();
    expect(overlongAuthField({ name: 42 })).toBeNull();
  });

  /**
   * The per-field limits are the tight bound; this is the one that survives a
   * field nobody thought to name, so it must not depend on the field list.
   */
  it("caps the whole body of a levelled route regardless of which field is large", () => {
    const under = JSON.stringify({ anything: "A".repeat(1000) });
    const over = JSON.stringify({
      neverHeardOf: "A".repeat(MAX_LEVELLED_BODY_BYTES),
    });
    expect(isOversizedBody(under)).toBe(false);
    expect(isOversizedBody(over)).toBe(true);
  });

  it("measures the body in bytes, not characters", () => {
    // A four-byte emoji is two UTF-16 units, so a character count would let
    // through twice what the byte budget allows.
    const justOverInBytes = "🀄".repeat(MAX_LEVELLED_BODY_BYTES / 4 + 1);
    expect(justOverInBytes.length).toBeLessThan(MAX_LEVELLED_BODY_BYTES);
    expect(isOversizedBody(justOverInBytes)).toBe(true);
  });

  it("leaves room for every field limit at once, so no honest request is refused by the wrong rule", () => {
    const largest = Object.values(AUTH_FIELD_LIMITS).reduce((a, b) => a + b, 0);
    expect(MAX_LEVELLED_BODY_BYTES).toBeGreaterThan(largest);
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

/**
 * The channel neither the levelling nor the bounds could reach, because it is a
 * status code: better-auth's sign-up looks the address up and then inserts, and
 * the two are not atomic, so two concurrent sign-ups at a FREE address collided
 * on the unique email index and one came back 422. A TAKEN address never
 * inserts and so can never 422 — one burst, no statistics, exact.
 */
describe("a sign-up that loses the insert race", () => {
  const okResponse = () =>
    Response.json({ token: null, user: { role: "user" } }, { status: 200 });
  const raceLost = () =>
    Response.json(
      { message: "Failed to create user", code: FAILED_TO_CREATE_USER },
      { status: 422 },
    );
  const body = JSON.stringify({
    name: "A Learner",
    email: "taken@hanzimind.test",
    password: "a-long-enough-password",
  });
  const silent = { info: vi.fn(), error: vi.fn() };

  const converge = (
    over: Partial<Parameters<typeof convergeLostSignUpRace>[0]>,
  ) =>
    convergeLostSignUpRace({
      response: raceLost(),
      isSignUp: true,
      body,
      contentType: "application/json",
      replay: () => Promise.resolve(okResponse()),
      logger: silent,
      ...over,
    });

  it("answers with what the replay returns, which is what the taken path returns", async () => {
    const settled = await converge({});
    expect(settled.status).toBe(200);
  });

  it("replays the address that was asked about, not a fresh one", async () => {
    const replay = vi.fn().mockResolvedValue(okResponse());
    await converge({ replay });
    expect(replay).toHaveBeenCalledWith(
      expect.objectContaining({ email: "taken@hanzimind.test" }),
    );
  });

  /**
   * A convergence that only understood JSON would leave the whole channel open
   * to anyone who changed one header, and better-auth accepts both encodings on
   * this route.
   */
  it("understands a form-encoded body, which is the header-flip bypass", async () => {
    const replay = vi.fn().mockResolvedValue(okResponse());
    await converge({
      body: new URLSearchParams({
        name: "A Learner",
        email: "taken@hanzimind.test",
        password: "a-long-enough-password",
      }).toString(),
      contentType: "application/x-www-form-urlencoded",
      replay,
    });
    expect(replay).toHaveBeenCalledWith(
      expect.objectContaining({ email: "taken@hanzimind.test" }),
    );
  });

  it("leaves a 422 on any other route alone", async () => {
    const replay = vi.fn();
    const settled = await converge({ isSignUp: false, replay });
    expect(settled.status).toBe(422);
    expect(replay).not.toHaveBeenCalled();
  });

  it("leaves a successful sign-up alone", async () => {
    const replay = vi.fn();
    const settled = await converge({ response: okResponse(), replay });
    expect(settled.status).toBe(200);
    expect(replay).not.toHaveBeenCalled();
  });

  it("leaves a 422 that is not a failed insert alone", async () => {
    const replay = vi.fn();
    const settled = await converge({
      response: Response.json({ code: "USER_ALREADY_EXISTS" }, { status: 422 }),
      replay,
    });
    expect(settled.status).toBe(422);
    expect(replay).not.toHaveBeenCalled();
  });

  /**
   * A replay that fails too means the insert did not fail on a duplicate. That
   * is a real database failure, not an attacker, and answering 200 would cost a
   * learner their account with no sign anything went wrong.
   */
  it("keeps the 422 when the replay does not settle either", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const settled = await converge({
      replay: () => Promise.resolve(raceLost()),
      logger,
    });
    expect(settled.status).toBe(422);
    expect(logger.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("genuinely unusable"),
    );
  });

  it("does not throw on a body it cannot parse", async () => {
    const replay = vi.fn();
    const settled = await converge({ body: "not json at all", replay });
    expect(settled.status).toBe(422);
    expect(replay).not.toHaveBeenCalled();
  });

  it("records the race in the log, where an enumerator cannot read it", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    await converge({ logger });
    expect(logger.info).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("lost a race"),
    );
  });
});

/**
 * The same thing end to end, against a real better-auth whose storage enforces
 * the unique email the way Postgres does, with the lookup made to miss so the
 * collision happens on demand rather than when the scheduler feels like it.
 */
describe("the race, reproduced against a real sign-up", () => {
  const collidingInstance = () => {
    const sendEmail = vi.fn().mockResolvedValue("id");
    const logger = fakeLogger();
    const deps = {
      database: {},
      email: { sendEmail },
      logger,
    } as unknown as Cradle;
    const store = {
      user: [] as Record<string, unknown>[],
      session: [],
      account: [],
      verification: [],
      rateLimit: [],
    };
    const inner = memoryAdapter(store);
    /**
     * Two things Postgres does and the memory adapter does not: reject a
     * duplicate email, and — for one call only — let a lookup miss a row that
     * another request is about to insert. Together they are the race, made
     * deterministic instead of hoped for.
     *
     * `transaction` has to be wrapped as well as `findOne` and `create`, and
     * that is not a detail. Sign-up runs inside `runWithTransaction`, which
     * hands every call to the adapter that `adapter.transaction` yields; a
     * wrapper that stops at the top level is invisible from inside, and the
     * first version of this test silently reproduced nothing at all.
     */
    let lookupsToBlind = 0;
    type Adapter = ReturnType<typeof inner>;
    const wrap = (adapter: Adapter): Adapter =>
      ({
        ...adapter,
        findOne: async (data: { model: string }) => {
          if (data.model === "user" && lookupsToBlind > 0) {
            lookupsToBlind -= 1;
            return null;
          }
          return adapter.findOne(data as never);
        },
        create: async (data: { model: string; data: { email?: string } }) => {
          if (
            data.model === "user" &&
            store.user.some((row) => row.email === data.data.email)
          ) {
            throw new Error(
              'duplicate key value violates unique constraint "users_email_unique"',
            );
          }
          return adapter.create(data as never);
        },
        transaction: (fn: (trx: Adapter) => unknown) =>
          adapter.transaction(((trx: Adapter) =>
            fn(wrap(trx))) as never) as never,
      }) as Adapter;
    const database = (options: Parameters<typeof inner>[0]) =>
      wrap(inner(options));
    // Armed by the test rather than on by default, because the winner's own
    // lookup would otherwise spend it and no collision would ever happen.
    const blindNextUserLookup = () => {
      lookupsToBlind = 1;
    };
    const auth = betterAuth({
      ...buildAuthOptions(deps, {
        authSecret: "secret",
        baseUrl: "http://localhost:3000",
        rateLimit: false,
        systemEmailFrom: "from@hanzimind.test",
      }),
      database: database as never,
    });
    return { auth, store, blindNextUserLookup };
  };

  const shapeOfResponse = async (response: Response, email: string) =>
    `${response.status} ${(await response.text())
      .split(email)
      .join("<address>")
      .replace(/"id":"[^"]*"/g, '"id":"<id>"')
      .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<timestamp>")}`;

  /** Returns what better-auth said, and what the caller answers after it. */
  const signUpConverging = async (
    auth: ReturnType<typeof collidingInstance>["auth"],
    email: string,
  ) => {
    const body = JSON.stringify({
      name: "A Learner",
      email,
      password: "a-long-enough-password",
    });
    const call = () =>
      auth.api.signUpEmail({
        body: JSON.parse(body) as never,
        asResponse: true,
      });
    const raw = await call();
    return {
      rawStatus: raw.status,
      answered: await convergeLostSignUpRace({
        response: raw,
        isSignUp: true,
        body,
        contentType: "application/json",
        replay: () => call(),
        logger: { info: vi.fn(), error: vi.fn() },
      }),
    };
  };

  it("the loser's answer is the answer a taken address gets", async () => {
    const { auth, store, blindNextUserLookup } = collidingInstance();
    const email = "raced@hanzimind.test";

    // The winner creates the row.
    await auth.api.signUpEmail({
      body: {
        name: "A Learner",
        email,
        password: "a-long-enough-password",
      },
      asResponse: true,
    });
    expect(store.user).toHaveLength(1);

    // The loser's lookup is blinded once, so it tries to insert and collides.
    blindNextUserLookup();
    const loser = await signUpConverging(auth, email);
    // A third request, with nothing blinded, is an ordinary taken sign-up.
    const taken = await signUpConverging(auth, email);

    // Assert the precondition, because a test that quietly fails to reproduce
    // the collision passes whatever the fix does. The first version of this one
    // did exactly that: the blinded lookup never fired, because sign-up runs in
    // a transaction and the wrapper did not follow it in.
    expect(loser.rawStatus, "the collision did not happen").toBe(422);
    expect(taken.rawStatus).toBe(200);

    expect(await shapeOfResponse(loser.answered, email)).toBe(
      await shapeOfResponse(taken.answered, email),
    );
    expect(store.user, "the race created a second account").toHaveLength(1);
  });
});
