import { describe, expect, it, vi } from "vitest";

import type { Cradle } from "@/server/initialization";
import { buildAuthOptions } from "@/server/auth";

const fakeLogger = () => {
  const child = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { ...child, child: () => child };
};

const deps = {
  database: {},
  email: { sendEmail: vi.fn().mockResolvedValue("id") },
  logger: fakeLogger(),
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

  it("carries a sender for reset, change email and delete account", () => {
    expect(typeof options.emailAndPassword.sendResetPassword).toBe("function");
    expect(options.user.changeEmail.enabled).toBe(true);
    expect(typeof options.user.changeEmail.sendChangeEmailConfirmation).toBe(
      "function",
    );
    expect(options.user.deleteUser.enabled).toBe(true);
    expect(typeof options.user.deleteUser.sendDeleteAccountVerification).toBe(
      "function",
    );
  });

  it("sends the reset link to the address that asked for it", async () => {
    const sendEmail = vi.fn().mockResolvedValue("id");
    const spied = { ...deps, email: { sendEmail } } as unknown as Cradle;
    await buildAuthOptions(spied, {
      authSecret: "secret",
      baseUrl: "http://localhost:3000",
      systemEmailFrom: "from@hanzimind.test",
    }).emailAndPassword.sendResetPassword({
      user: { email: "a@b.test", name: "A" },
      url: "http://reset",
    } as never);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@b.test",
        subject: "Reset your password - Hanzimind",
      }),
    );
  });

  it("sends the change-email confirmation to the address on file, not the new one", async () => {
    const sendEmail = vi.fn().mockResolvedValue("id");
    const spied = { ...deps, email: { sendEmail } } as unknown as Cradle;
    await buildAuthOptions(spied, {
      authSecret: "secret",
      baseUrl: "http://localhost:3000",
      systemEmailFrom: "from@hanzimind.test",
    }).user.changeEmail.sendChangeEmailConfirmation({
      user: { email: "old@b.test", name: "A" },
      newEmail: "new@b.test",
      url: "http://confirm",
    } as never);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "old@b.test",
        subject: "Confirm your new email - Hanzimind",
      }),
    );
  });

  it("logs and rethrows when a send fails", async () => {
    const logger = fakeLogger();
    const failing = {
      ...deps,
      logger,
      email: { sendEmail: vi.fn().mockRejectedValue(new Error("smtp down")) },
    } as unknown as Cradle;
    await expect(
      buildAuthOptions(failing, {
        authSecret: "secret",
        baseUrl: "http://localhost:3000",
        systemEmailFrom: "from@hanzimind.test",
      }).user.deleteUser.sendDeleteAccountVerification({
        user: { email: "a@b.test", name: "A" },
        url: "http://delete",
      } as never),
    ).rejects.toThrow("smtp down");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "delete-account", to: "a@b.test" }),
      "Failed to send an auth email",
    );
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
