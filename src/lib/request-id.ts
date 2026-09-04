/**
 * One id per request, so a failure a learner can see and the line the server
 * wrote about it are the same event.
 *
 * An id is only worth carrying if it survives the whole path, so it is minted
 * once at the RPC entry point and then never re-derived. What that buys, exactly:
 *
 * - Every RPC response carries it as `x-request-id`.
 * - Every RPC failure writes exactly one log line under it — including the two
 *   that never reach a procedure, an unmatched path and a body the codec cannot
 *   decode.
 * - Every RPC failure a client can render carries it in the error payload, so
 *   the id on the page and the id in the log are the same string.
 *
 * The one gap left is a 404 for an unmatched path: its body is plain text, not
 * an error a page renders, so the id is in the header and the log only.
 *
 * Client-safe on purpose — the error routes and the error boundary all have to
 * read it back off an error object.
 */

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Always minted here, never taken from the request.
 *
 * Reusing an inbound `x-request-id` would correlate a trace across hops, which
 * is worth having — but only from a proxy you trust. Nothing sits in front of
 * this app that sets one, so honouring the header would let any caller choose
 * its own id, and so pin one, collide with another's, or replay a third. A
 * charset guard stops log injection but none of that.
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The id to show for a failure, or undefined when there is none.
 *
 * Two sources, in the order they are trustworthy. An oRPC error carries the id
 * this app minted, which is the one in the server log. A Next server-render
 * error carries `digest` instead, which `onRequestError` in instrumentation.ts
 * logs — matchable too, just minted by the framework.
 *
 * Nothing is invented when both are missing: an id that matches no log line is
 * decoration, and worse than admitting there is none.
 */
export function requestIdOf(error: unknown): string | undefined {
  if (isRecord(error) && isRecord(error.data)) {
    const minted = error.data.requestId;
    if (typeof minted === "string" && minted.length > 0) return minted;
  }
  return digestOf(error);
}

/** The hash Next assigns a server-side error and reports to `onRequestError`. */
export function digestOf(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.digest === "string" && error.digest.length > 0
    ? error.digest
    : undefined;
}
