import type { QueryClient } from "@tanstack/react-query";

type Seen = { known: false } | { known: true; userId: string | null };

export function createUserChangeReset(
  queryClient: Pick<QueryClient, "clear">,
): (userId: string | null) => void {
  let seen: Seen = { known: false };
  return (userId) => {
    if (seen.known && seen.userId !== userId) {
      queryClient.clear();
    }
    seen = { known: true, userId };
  };
}
