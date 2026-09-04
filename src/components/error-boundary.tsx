"use client";

import { Component, type ReactNode } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requestIdOf } from "@/lib/request-id";

/**
 * The one error state in the app, shared by this boundary and by the three Next
 * error routes, so a failure looks the same wherever it is caught.
 *
 * Deliberately presentational: `global-error.tsx` renders it outside every
 * provider — no query client, no theme — so it must not reach for a hook or a
 * context of its own. Each caller passes the retry that makes sense where it
 * sits.
 */
export function ErrorState({
  heading = "Something went wrong",
  description,
  requestId,
  onRetry,
  retryLabel = "Try again",
  children,
}: {
  /**
   * The card's heading. `heading` rather than `title` for the reason
   * `page-header.tsx` gives: it keeps the HTML attribute of that name meaning
   * exactly one thing wherever it still appears outside `components/ui`.
   */
  heading?: string;
  description?: string;
  requestId?: string;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <Card className="border-destructive">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive" />
            <CardTitle>{heading}</CardTitle>
          </div>
          <CardDescription>
            {description || "An unexpected error occurred"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {onRetry ? <Button onClick={onRetry}>{retryLabel}</Button> : null}
            {children}
          </div>
          {/* Quoted back by anyone reporting this, and the same id the server
              wrote its one line about the failure under. */}
          {requestId ? (
            <p className="text-xs text-muted-foreground">
              Request id{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {requestId}
              </code>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryInner extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  private retry = () => {
    // Clear react-query's own record of the failure BEFORE re-rendering.
    // A suspense query that has errored re-throws on the next render until it
    // is reset, so without this the boundary would catch again immediately and
    // the button would do nothing.
    this.props.onReset();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorState
          description={this.state.error?.message}
          requestId={requestIdOf(this.state.error)}
          onRetry={this.retry}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Retry refetches the failed query rather than reloading the page: a reload
 * throws away every other query on the screen and the scroll position to fix
 * the one that broke.
 */
export function ErrorBoundary({
  children,
  fallback,
}: Omit<ErrorBoundaryProps, "onReset">) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundaryInner fallback={fallback} onReset={reset}>
          {children}
        </ErrorBoundaryInner>
      )}
    </QueryErrorResetBoundary>
  );
}
