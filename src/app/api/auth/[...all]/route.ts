import { toNextJsHandler } from "better-auth/next-js";

import { convergeLostSignUpRace } from "@/server/auth-race";
import {
  AUTH_BASE_PATH,
  isLevelledAuthRoute,
  isOversizedBody,
  levelResponseTime,
  MAX_LEVELLED_BODY_BYTES,
  SIGN_UP_PATH,
} from "@/server/auth-timing";
import { container } from "@/server/initialization";

const TOO_LARGE = {
  code: "REQUEST_TOO_LARGE",
  message: "That request was too large. Please shorten what you entered.",
};

const authHandler = toNextJsHandler(async (request) => {
  const startedAt = performance.now();
  const { pathname } = new URL(request.url);

  const response = await answer(request, pathname);
  response.headers.set("Cache-Control", "no-store,private,must-revalidate");
  // Held out here rather than inside a handler because the whole request is
  // what an attacker times, not the branch we happened to instrument. See
  // `auth-timing.ts` for which routes this covers and why the rest are left
  // alone.
  await levelResponseTime(pathname, performance.now() - startedAt);
  return response;
});

/**
 * Two of the three things that keep sign-up from saying whether an address is
 * taken, both of which have to happen out here rather than inside better-auth.
 *
 * The body is measured before better-auth is called at all, so an oversized
 * request is refused before anything parses it, looks an address up or hashes a
 * password — the bucket a levelled route answers in only hides its two paths
 * while both fit inside it, and the caller decides how much work one of them
 * does. The refusal is the same 400 for every address and is levelled like any
 * other answer, so neither its content nor its speed says anything.
 *
 * Then a sign-up that lost the insert race is converged onto the answer the
 * taken path gives; `auth-race.ts` explains why that is a replay rather than a
 * rewrite, and why the replay must not go back through the HTTP handler.
 *
 * Only levelled POSTs are intercepted. Every other request reaches better-auth
 * with its body untouched, which matters for a route that reads the stream
 * itself.
 */
const answer = async (request: Request, pathname: string) => {
  const { auth, logger } = container.cradle;
  if (request.method !== "POST" || !isLevelledAuthRoute(pathname)) {
    return auth.handler(request);
  }

  const body = await request.text();
  if (isOversizedBody(body)) {
    logger.warn(
      { path: pathname, bytes: Buffer.byteLength(body, "utf8") },
      `Refused an auth request body over ${MAX_LEVELLED_BODY_BYTES} bytes`,
    );
    return Response.json(TOO_LARGE, { status: 400 });
  }
  // Reading the body consumed it, so better-auth is handed an equivalent
  // request rather than the original one.
  const response = await auth.handler(
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
    }),
  );

  return convergeLostSignUpRace({
    response,
    isSignUp: pathname === `${AUTH_BASE_PATH}${SIGN_UP_PATH}`,
    body,
    contentType: request.headers.get("content-type"),
    // Through the endpoint rather than the handler, so the replay spends no
    // rate-limit budget the taken path would not have spent.
    replay: (replayed) =>
      auth.api.signUpEmail({
        // The endpoint's body type is an intersection with an open record and
        // does not narrow from `Record<string, unknown>`. The value is the same
        // bytes better-auth validated moments ago on the first attempt.
        body: replayed as unknown as {
          name: string;
          email: string;
          password: string;
        },
        asResponse: true,
      }),
    logger: {
      info: (data, message) =>
        logger.info({ ...data, path: pathname }, message),
      error: (data, message) =>
        logger.error({ ...data, path: pathname }, message),
    },
  });
};

export const GET = authHandler.GET;
export const POST = authHandler.POST;
