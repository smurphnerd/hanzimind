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
  acknowledgeSignUp,
  runSignUpThroughRouter,
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

  if (isSignUp) {
    return acknowledgeSignUp(
      {
        logger,
        // `after()` is the platform's contract for work that must outlive the
        // response. A bare floating promise is the one failure worse than the
        // leak: a serverless invocation can freeze the moment it responds, and
        // the account would never exist.
        schedule: (run) => after(run),
        run: () =>
          runSignUpThroughRouter(
            { handler: (deferred) => auth.handler(deferred), logger },
            request,
            body,
          ),
      },
      body,
      request.headers.get("content-type"),
    );
  }

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

export const GET = authHandler.GET;
export const POST = authHandler.POST;
