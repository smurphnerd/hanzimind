import { toNextJsHandler } from "better-auth/next-js";

import { levelResponseTime } from "@/server/auth-timing";
import { container } from "@/server/initialization";

const authHandler = toNextJsHandler(async (request) => {
  const startedAt = performance.now();
  const response = await container.cradle.auth.handler(request);
  response.headers.set("Cache-Control", "no-store,private,must-revalidate");
  // Held here rather than inside a handler because the whole request is what an
  // attacker times, not the branch we happened to instrument. See
  // `auth-timing.ts` for which routes this covers and why the rest are left
  // alone.
  await levelResponseTime(
    new URL(request.url).pathname,
    performance.now() - startedAt,
  );
  return response;
});

export const GET = authHandler.GET;
export const POST = authHandler.POST;
