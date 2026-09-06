import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";

import {
  AUTH_FIELD_LIMITS,
  AUTH_PASSWORD_LENGTH,
  SIGN_UP_BOUNDED_FIELDS,
} from "@/definitions/definitions";
import {
  runSignUpThroughRouter,
  SIGN_UP_ACKNOWLEDGEMENT,
  signUpRejection,
} from "@/server/sign-up-response";
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

  /**
   * Sign-up's absence here is the redesign, not an omission. It answers a
   * constant before it looks anything up, so there is no address-dependent work
   * in front of its response for a bucket to hide — and keeping the floor would
   * have hidden whether that is actually true. What remains levelled is the two
   * routes that still answer FROM the database.
   */
  it("levels the two routes that still answer from the database, and not sign-up", () => {
    expect(LEVELLED_AUTH_ROUTES).toEqual([
      "/request-password-reset",
      "/send-verification-email",
    ]);
    expect(isLevelledAuthRoute(`${AUTH_BASE_PATH}/sign-up/email`)).toBe(false);
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
/**
 * What replaced six rounds of equalisation.
 *
 * The endpoint still builds a full user object internally; the caller no longer
 * sees it. These pin the boundary rather than the internals, because the
 * boundary is the whole claim: the body channels are closed by there being
 * nothing in the body to differ.
 */
describe("the sign-up acknowledgement", () => {
  /**
   * Pinned to the literal rather than scanned for suspicious substrings. The
   * scan was the first thing written here and it failed on its own message,
   * because "an email is on its way" contains the word `email` — a substring
   * search cannot tell a field name from English. Pinning the whole value makes
   * any future field an explicit edit with a failing test behind it.
   */
  it("is a literal, so no row, request or clock can reach it", () => {
    expect(SIGN_UP_ACKNOWLEDGEMENT).toEqual({
      status: true,
      message: "If that address can be used, an email is on its way to it.",
    });
    expect(JSON.stringify(SIGN_UP_ACKNOWLEDGEMENT)).not.toMatch(
      /\d{4}-\d{2}-\d{2}T/,
    );
  });

  /**
   * The property the whole redesign rests on: two calls cannot differ, because
   * there is no input to the value at all.
   */
  it("takes no argument, so two callers cannot be given different answers", () => {
    // Not a tautology about one object: the point is that the module exports a
    // VALUE and not a function of the request, so there is no input for a free
    // address and a taken one to differ on.
    expect(typeof SIGN_UP_ACKNOWLEDGEMENT).toBe("object");
    expect(SIGN_UP_ACKNOWLEDGEMENT).not.toBeInstanceOf(Function);
  });
});

/**
 * Deferring the account work means a failure after the response cannot be
 * reported, so anything the learner could have fixed has to be caught before
 * the acknowledgement or it becomes a silent dead end.
 */
describe("what sign-up still refuses synchronously", () => {
  const valid = {
    name: "A Learner",
    email: "learner@hanzimind.test",
    password: "a-long-enough-password",
  };

  it("accepts what the sign-up form accepts", () => {
    expect(signUpRejection(valid)).toBeNull();
    expect(signUpRejection({ ...valid, callbackURL: "/verified" })).toBeNull();
  });

  it("refuses a password the form would have caught, rather than going quiet", () => {
    expect(
      signUpRejection({
        ...valid,
        password: "a".repeat(AUTH_PASSWORD_LENGTH.min - 1),
      }),
    ).not.toBeNull();
  });

  /**
   * `users.name` is `text NOT NULL` and Postgres rejects a NUL outright, so
   * before this the insert failed and — now that the response comes first —
   * the account would simply never appear. A caller-supplied character that
   * cannot be stored has to be an error at the door.
   */
  it("refuses a name carrying a character Postgres cannot store", () => {
    expect(
      signUpRejection({ ...valid, name: "A\u0000Learner" }),
    ).not.toBeNull();
    expect(
      signUpRejection({ ...valid, name: "A\u001fLearner" }),
    ).not.toBeNull();
  });

  it("refuses an overlong name and an unparseable body", () => {
    expect(
      signUpRejection({
        ...valid,
        name: "A".repeat(AUTH_FIELD_LIMITS.name + 1),
      }),
    ).not.toBeNull();
    expect(signUpRejection(null)).not.toBeNull();
    expect(signUpRejection("not an object")).not.toBeNull();
  });

  /**
   * Every rule above reads only what was submitted, so the same refusal reaches
   * a caller whether or not the address has an account. That is what makes it
   * safe to answer this inline while everything else waits.
   */
  it("gives the identical refusal for an address that exists and one that does not", () => {
    const bad = { ...valid, password: "short" };
    expect(signUpRejection({ ...bad, email: "taken@hanzimind.test" })).toBe(
      signUpRejection({ ...bad, email: "free@hanzimind.test" }),
    );
  });
});

/**
 * The check that would have caught the router bypass.
 *
 * The redesign's first version finished with `auth.api.signUpEmail(...)`, and
 * better-auth's rate limiter lives in the ROUTER's `onRequest` — so sign-up
 * stopped being limited entirely while `auth-config.test.ts` went on passing,
 * because it asserts the rule exists and names a real route. Neither is
 * enforcement. This drives the same function the route drives and asserts the
 * limiter actually fires.
 */
describe("the deferred sign-up goes through the router", () => {
  const limitedInstance = () => {
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
        // The point of this suite: limiting ON, the way production runs.
        rateLimit: true,
        systemEmailFrom: "from@hanzimind.test",
      }),
      database: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
        rateLimit: [],
      }),
    });
    return { auth };
  };

  const signUpRequest = (email: string) => {
    const body = JSON.stringify({
      name: "A Learner",
      email,
      password: "a-long-enough-password",
    });
    return {
      body,
      request: new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "x-forwarded-for": "203.0.113.7",
        },
        body,
      }),
    };
  };

  it("is rate limited, which only the router can do", async () => {
    const { auth } = limitedInstance();
    const seen: string[] = [];
    const logger = {
      info: (_d: object, m: string) => seen.push(m),
      warn: (_d: object, m: string) => seen.push(m),
      error: (_d: object, m: string) => seen.push(m),
    };

    // The configured rule is five a minute for this path.
    for (let i = 0; i < 8; i += 1) {
      const { body, request } = signUpRequest(`burst-${i}@hanzimind.test`);
      await runSignUpThroughRouter(
        { handler: (deferred) => auth.handler(deferred), logger },
        request,
        body,
      );
    }

    expect(
      seen.filter((m) => m.includes("rate limited")).length,
      "the limiter never fired, so the work is not going through the router",
    ).toBeGreaterThan(0);
  }, 30_000);

  it("hands the handler an equivalent request rather than a parsed body", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(Response.json({}, { status: 200 }));
    const { body, request } = signUpRequest("shape@hanzimind.test");
    await runSignUpThroughRouter(
      { handler, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
      request,
      body,
    );

    const passed = handler.mock.calls[0][0] as Request;
    expect(passed).toBeInstanceOf(Request);
    expect(passed.method).toBe("POST");
    expect(passed.url).toBe(request.url);
    // The headers are what carry the IP the limiter keys on and the origin the
    // origin check reads, so losing them loses both.
    expect(passed.headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(passed.headers.get("origin")).toBe("http://localhost:3000");
    expect(await passed.text()).toBe(body);
  });

  it("records a rate-limited attempt rather than swallowing it", async () => {
    const warn = vi.fn();
    const { body, request } = signUpRequest("limited@hanzimind.test");
    await runSignUpThroughRouter(
      {
        handler: () => Promise.resolve(Response.json({}, { status: 429 })),
        logger: { info: vi.fn(), warn, error: vi.fn() },
      },
      request,
      body,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ email: "limited@hanzimind.test" }),
      expect.stringContaining("rate limited"),
    );
  });
});

/**
 * Every bounded field a sign-up can carry has to be checked BEFORE the
 * acknowledgement. A limit enforced only in the deferred work is a limit whose
 * breach answers 200 and creates nothing, which is how an oversized `image`
 * slipped through.
 */
describe("the synchronous rules cover every bounded sign-up field", () => {
  const valid = {
    name: "A Learner",
    email: "learner@hanzimind.test",
    password: "a-long-enough-password",
  };

  it.each([...SIGN_UP_BOUNDED_FIELDS])(
    "refuses an oversized %s at the door",
    (field) => {
      const oversized = "a".repeat(AUTH_FIELD_LIMITS[field] + 1);
      const body =
        field === "email"
          ? { ...valid, email: `${oversized}@hanzimind.test` }
          : { ...valid, [field]: oversized };
      expect(signUpRejection(body)).not.toBeNull();
    },
  );
});
