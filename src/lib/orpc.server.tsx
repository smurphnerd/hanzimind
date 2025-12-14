import "server-only";

import { createRouterClient } from "@orpc/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { cache } from "react";

import { makeQueryClient } from "@/lib/queryClient";
import { appRouter } from "@/server/endpoints/router";
import { container } from "@/server/initialization";

export const orpc = createRouterClient(appRouter, {
  context: async () => ({
    headers: await headers(),
    cradle: container.cradle,
  }),
});

export const getServerQueryClient = cache(makeQueryClient);

export function HydrateClient(props: { children: ReactNode }) {
  return (
    <HydrationBoundary state={dehydrate(getServerQueryClient())}>
      {props.children}
    </HydrationBoundary>
  );
}

