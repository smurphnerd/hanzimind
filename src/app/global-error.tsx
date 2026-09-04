"use client";

import { ErrorState } from "@/components/error-boundary";
import { requestIdOf } from "@/lib/request-id";

import "./globals.css";

/**
 * The last resort: the root layout itself failed, so this replaces it and has
 * to bring its own document and stylesheet. There is no theme provider here, so
 * it renders in the light palette whatever the visitor picked, and no query
 * client, so retry is Next's segment reset alone.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col justify-center bg-background text-foreground">
        <ErrorState
          title="The page could not be loaded"
          description={error.message}
          requestId={requestIdOf(error)}
          onRetry={reset}
        />
      </body>
    </html>
  );
}
