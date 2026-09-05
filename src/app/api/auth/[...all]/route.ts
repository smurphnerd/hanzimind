import { toNextJsHandler } from "better-auth/next-js";

import {
  isLevelledAuthRoute,
  isOversizedBody,
  levelResponseTime,
  MAX_LEVELLED_BODY_BYTES,
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
 * The bucket a levelled route answers in only hides its two paths from each
 * other while both fit inside it, and the caller decides how much work one of
 * them does. So a levelled route's body is measured here, ahead of better-auth,
 * and refused before anything parses it, looks an address up or hashes a
 * password. The refusal is the same 400 for every address and is levelled like
 * any other answer, so neither its content nor its speed says anything.
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
