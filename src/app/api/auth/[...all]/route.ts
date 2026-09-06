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
  // Only the two routes that still answer FROM the database need levelling; see
  // `auth-timing.ts`. Sign-up is not one of them any more, because it answers
  // before it reads anything.
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
 * Answer the sign-up, then do it.
 *
 * The response is a constant emitted before anything looks the address up, so
 * there is nothing in it that could differ between a free address and a taken
 * one — see `sign-up-response.ts` for why that replaced six rounds of trying to
 * make two differently-assembled responses look alike.
 *
 * `after()` rather than a bare floating promise. better-auth's own
 * `advanced.backgroundTasks.handler` is not the seam for this: it does not
 * defer anything itself, it hands the promise to whatever you give it and does
 * not await, and it is consulted only where better-auth sends mail — the lookup
 * and the insert would have stayed inline. A detached promise is also the one
 * failure that would be worse than the leak, because a serverless invocation
 * can freeze the moment it responds and the account would never be created.
 * `after()` is the platform's own contract for work that must outlive the
 * response.
 *
 * The account work runs through the ordinary endpoint, so everything that
 * already governs it still applies: the field limits, the existing-address
 * email that is the learner's way back, and the log line that records which
 * case occurred. Only the caller's view of it has changed.
 */
const acknowledgeSignUp = (body: string, request: Request) => {
  const { auth, logger } = container.cradle;
  const parsed = parseAuthBody(body, request.headers.get("content-type"));
  const rejection = signUpRejection(parsed);
  if (rejection) {
    return Response.json(
      { code: "INVALID_SIGN_UP", message: rejection },
      {
        status: 400,
      },
    );
  }

  after(async () => {
    try {
      const settled = await auth.api.signUpEmail({
        body: parsed as { name: string; email: string; password: string },
        asResponse: true,
      });
      if (settled.status !== 200) {
        // The caller was told nothing and cannot be told now. This line is the
        // only record that the account did not appear, which is why it carries
        // the address.
        logger.error(
          {
            status: settled.status,
            email: (parsed as { email: string }).email,
          },
          "Sign-up: the deferred account work failed after the caller was acknowledged",
        );
      }
    } catch (error) {
      logger.error(
        { err: error, email: (parsed as { email: string }).email },
        "Sign-up: the deferred account work threw after the caller was acknowledged",
      );
    }
  });

  return Response.json(SIGN_UP_ACKNOWLEDGEMENT, { status: 200 });
};

/**
 * The body as an object, for either encoding better-auth accepts on this route.
 * Form encoding is handled because leaving it out would let one changed header
 * take a different path through this file.
 */
const parseAuthBody = (
  body: string,
  contentType: string | null,
): Record<string, unknown> | null => {
  try {
    if (contentType?.includes("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(body));
    }
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export const GET = authHandler.GET;
export const POST = authHandler.POST;
