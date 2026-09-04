"use client";

import { useSyncExternalStore } from "react";

const neverChanges = () => () => {};

/** False for the server render and the hydrating pass, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}
