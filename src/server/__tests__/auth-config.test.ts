import { describe, expect, it, vi } from "vitest";

import type { Cradle } from "@/server/initialization";
import { buildAuthOptions } from "@/server/auth";

const deps = {
  database: {},
  email: { sendEmail: vi.fn().mockResolvedValue("id") },
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
} as unknown as Cradle;

const options = buildAuthOptions(deps, {
  authSecret: "secret",
  baseUrl: "http://localhost:3000",
  systemEmailFrom: "HanziMind <no-reply@hanzimind.test>",
});

describe("buildAuthOptions", () => {
  it("rate limits the three guessable endpoints at five a minute", () => {
    expect(options.rateLimit.customRules).toEqual({
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/forget-password": { window: 60, max: 5 },
    });
  });

  it("keeps a session for 30 days, refreshes it daily and caches it in the cookie", () => {
    expect(options.session).toEqual({
      expiresIn: 2592000,
      updateAge: 86400,
      cookieCache: { enabled: true, maxAge: 300 },
    });
  });

  it("requires a password of at least 10 characters", () => {
    expect(options.emailAndPassword.minPasswordLength).toBe(10);
  });

  it("still requires a verified email before sign-in", () => {
    expect(options.emailAndPassword.requireEmailVerification).toBe(true);
  });

  it("awaits the verification send, so a failure reaches the caller", async () => {
    const failing = {
      ...deps,
      email: { sendEmail: vi.fn().mockRejectedValue(new Error("smtp down")) },
    } as unknown as Cradle;
    const send = buildAuthOptions(failing, {
      authSecret: "secret",
      baseUrl: "http://localhost:3000",
      systemEmailFrom: "from@hanzimind.test",
    }).emailVerification.sendVerificationEmail;

    await expect(
      send({
        user: { email: "a@b.test", name: "A" },
        url: "http://x",
      } as never),
    ).rejects.toThrow("smtp down");
  });

  it("sends the verification email through the adapter", async () => {
    const sendEmail = vi.fn().mockResolvedValue("id");
    const spied = { ...deps, email: { sendEmail } } as unknown as Cradle;
    await buildAuthOptions(spied, {
      authSecret: "secret",
      baseUrl: "http://localhost:3000",
      systemEmailFrom: "from@hanzimind.test",
    }).emailVerification.sendVerificationEmail({
      user: { email: "a@b.test", name: "A" },
      url: "http://x",
    } as never);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@b.test",
        from: "from@hanzimind.test",
        subject: "Verify your email - Hanzimind",
      }),
    );
  });
});
