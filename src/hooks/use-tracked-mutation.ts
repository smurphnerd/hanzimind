"use client";

import { useMutation } from "@tanstack/react-query";
import type { UseMutationOptions } from "@tanstack/react-query";
import { useState } from "react";

/**
 * A mutation that can say which rows it is currently writing.
 *
 * Replaces a hand-rolled `savingId` string, which could only ever name one row.
 * Toggling a second row overwrote the first, so a row with a write still in
 * flight re-enabled itself and invited a second, conflicting write; and an
 * unconditional `onSettled` clear meant the first response to land un-greyed
 * whichever row happened to be showing. Measured on trunk with two writes held
 * open, the first row reported itself idle.
 *
 * The variables of every call in flight are kept, not just the latest — which is
 * what `mutation.variables` would give, and is the same defect from the other
 * end. Each is removed by the settle handler for its own call, so responses
 * arriving out of order cannot clear the wrong row.
 */
export function useTrackedMutation<TData, TError, TVariables, TContext>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
) {
  const [inFlight, setInFlight] = useState<TVariables[]>([]);

  type Options = typeof options;

  const mutation = useMutation({
    ...options,
    onMutate: (...args: Parameters<NonNullable<Options["onMutate"]>>) => {
      setInFlight((current) => [...current, args[0]]);

      return options.onMutate?.(...args) as TContext;
    },
    onSettled: (...args: Parameters<NonNullable<Options["onSettled"]>>) => {
      const variables = args[2];

      setInFlight((current) => {
        // By reference, so two writes carrying equal values still balance.
        const at = current.indexOf(variables);
        return at === -1
          ? current
          : [...current.slice(0, at), ...current.slice(at + 1)];
      });

      return options.onSettled?.(...args);
    },
  });

  return {
    ...mutation,
    /** Whether any write matching this predicate is still outstanding. */
    isSaving: (match: (variables: TVariables) => boolean) =>
      inFlight.some(match),
  };
}
