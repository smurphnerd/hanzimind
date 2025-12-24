"use client";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import {
  createTanstackQueryUtils,
  type RouterUtils,
} from "@orpc/tanstack-query";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createContext, type ReactNode, use, useState } from "react";

import { makeQueryClient } from "@/lib/queryClient";
import type { appRouter } from "@/server/endpoints/router";

let clientQueryClientSingleton: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // React suspense throws away the rendering tree in the browser, hence we need to keep a singleton to prevent an infinite loop
  return (clientQueryClientSingleton ??= makeQueryClient());
}

type ORPCReactUtils = RouterUtils<RouterClient<typeof appRouter>>;

const ORPCContext = createContext<ORPCReactUtils | undefined>(undefined);

export function useORPC(): ORPCReactUtils {
  const orpc = use(ORPCContext);
  if (!orpc) {
    throw new Error("useORPC must be used within a ORPCContext.Provider");
  }
  return orpc;
}

export function ApiClientProvider(props: {
  children: ReactNode;
  baseUrl: string;
}) {
  const queryClient = getQueryClient();
  const [client] = useState<RouterClient<typeof appRouter>>(() =>
    createORPCClient(
      new RPCLink({
        url: `${props.baseUrl}/api/rpc`,
      }),
    ),
  );
  const [orpc] = useState(() => createTanstackQueryUtils(client));

  return (
    <QueryClientProvider client={queryClient}>
      <ReactQueryDevtools />
      <ORPCContext.Provider value={orpc}>{props.children}</ORPCContext.Provider>
    </QueryClientProvider>
  );
}
