import { expect, type APIRequestContext } from "@playwright/test";

export const LEARNER = {
  email: "verify@hanzimind.test",
  password: "wrong-password-on-purpose",
};

export const SEED_HINT =
  "The seeded learner verify@hanzimind.test is missing. Seed the lane with SEED_TEST_USER=1 (lane-up.sh does).";

export const RATE_LIMIT_HINT =
  "The auth layer allows three sign-ins per ten seconds per address. Wait ten seconds and rerun.";

export async function explainSignInFailure(request: APIRequestContext) {
  const response = await request.post("/api/auth/sign-in/email", {
    data: LEARNER,
  });
  if (response.status() === 429) return RATE_LIMIT_HINT;
  if (response.status() === 401) return SEED_HINT;
  return `Sign-in answered ${response.status()}: ${await response.text()}`;
}

export async function rpc<T = unknown>(
  request: APIRequestContext,
  path: string,
  input: unknown,
): Promise<T> {
  const response = await request.post(`/api/rpc/${path}`, {
    data: { json: input },
  });
  expect(response.ok(), `${path} answered ${response.status()}`).toBe(true);
  const body = (await response.json()) as { json: T };
  return body.json;
}
