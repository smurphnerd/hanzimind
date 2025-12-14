import { toNextJsHandler } from "better-auth/next-js";

import { container } from "@/server/initialization";

const authHandler = toNextJsHandler(async (request) => {
  const response = await container.cradle.auth.handler(request);
  response.headers.set("Cache-Control", "no-store,private,must-revalidate");
  return response;
});

export const GET = authHandler.GET;
export const POST = authHandler.POST;
