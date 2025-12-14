import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import { headers } from "next/headers";

import { appRouter } from "@/server/endpoints/router";
import { container } from "@/server/initialization";

const handler = new RPCHandler(appRouter, {
  plugins: [new ResponseHeadersPlugin()],
});

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: {
      headers: await headers(),
      cradle: container.cradle,
    },
  });

  return response ?? new Response("Not found", { status: 404 });
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
