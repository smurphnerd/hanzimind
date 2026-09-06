"use client";

import Link from "next/link";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";

import { ErrorState } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { requestIdOf } from "@/lib/request-id";

/**
 * Catches whatever escapes a route's own boundary. It renders inside the root
 * layout, so the header and footer are still there to leave by.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { reset: resetQueries } = useQueryErrorResetBoundary();

  return (
    <ErrorState
      description={error.message}
      requestId={requestIdOf(error)}
      onRetry={() => {
        // Two resets, because they clear different things. react-query holds
        // the failed query in an errored state that re-throws on every render
        // until it is cleared; Next's reset re-renders the segment. Calling
        // only the second re-runs the render that throws again.
        resetQueries();
        reset();
      }}
    >
      <Button variant="outline" asChild>
        <Link href="/">Go home</Link>
      </Button>
    </ErrorState>
  );
}
