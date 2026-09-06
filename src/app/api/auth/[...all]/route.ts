import { toNextJsHandler } from "better-auth/next-js";
import { after } from "next/server";

import {
  AUTH_BASE_PATH,
  isLevelledAuthRoute,
  isOversizedBody,
  levelResponseTime,
  MAX_LEVELLED_BODY_BYTES,
  SIGN_UP_PATH,
} from "@/server/auth-timing";
import {
  parseSignUpBody,
  runSignUpThroughRouter,
  SIGN_UP_ACKNOWLEDGEMENT,
  signUpRejection,
} from "@/server/sign-up-response";
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
  // Only the two routes that still answer FROM the database are levelled; see
  // `auth-timing.ts`. Sign-up is not one of them, because it answers before it
  // reads anything.
  await levelResponseTime(pathname, performance.now() - startedAt);
  return response;
});

const answer = async (request: Request, pathname: string) => {
  const { auth, logger } = container.cradle;
  const isSignUp = pathname === `${AUTH_BASE_PATH}${SIGN_UP_PATH}`;
  if (
    request.method !== "POST" ||
    !(isSignUp || isLevelledAuthRoute(pathname))
  ) {
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

  if (isSignUp) return acknowledgeSignUp(body, request);

  // Reading the body consumed it, so better-auth is handed an equivalent
  // request rather than the original one.
  return auth.handler(
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
    }),
  );
};

/**
 * Answer the sign-up, then do it — through the router, never around it.
 *
 * The response is a constant emitted before anything is looked up, so there is
 * nothing in it that could differ between a free address and a taken one; see
 * `sign-up-response.ts` for why that replaced six rounds of trying to make two
 * differently-assembled responses look alike.
 *
 * `runSignUpThroughRouter` is handed `auth.handler` rather than
 * `auth.api.signUpEmail` because the rate limiter, the origin check and the
 * CSRF check all live in the router and all vanish on the API path. That is not
 * a theoretical concern: the first version of this called the API and dropped
 * every one of them.
 *
 * `after()` rather than a bare floating promise. better-auth's own
 * `advanced.backgroundTasks.handler` is not the seam either: it defers nothing
 * itself, and it is consulted only where better-auth sends mail, so the lookup
 * and the insert would have stayed inline. A detached promise is the one
 * failure worse than the leak, because a serverless invocation can freeze the
 * moment it responds and the account would never exist.
 */
const acknowledgeSignUp = (body: string, request: Request) => {
  const { auth, logger } = container.cradle;
  const parsed = parseSignUpBody(body, request.headers.get("content-type"));
  const rejection = signUpRejection(parsed);
  if (rejection) {
    return Response.json(
      { code: "INVALID_SIGN_UP", message: rejection },
      { status: 400 },
    );
  }

  /**
   * Logged BEFORE the work is scheduled, and that ordering is the point.
   *
   * The caller has been told the request succeeded, so if the process dies in
   * the window between this response and the deferred work finishing there is
   * no row, no mail and — without this line — no record that anything was ever
   * attempted. Before the redesign the same kill produced a failed request the
   * caller could see. An accepted line with no matching outcome line beneath it
   * is how an operator finds the ones lost in that window.
   */
  logger.info(
    { email: (parsed as { email: string }).email },
    "Sign-up: accepted, doing the work after the response",
  );

  after(() =>
    runSignUpThroughRouter(
      { handler: (deferred) => auth.handler(deferred), logger },
      request,
      body,
    ),
  );

  return Response.json(SIGN_UP_ACKNOWLEDGEMENT, { status: 200 });
};

export const GET = authHandler.GET;
export const POST = authHandler.POST;
