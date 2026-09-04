/**
 * One id per request, so a failure a learner can see and the line the server
 * wrote about it are the same event.
 *
 * An id is only worth carrying if it survives the whole path, so it is minted
 * once at the RPC entry point and then never re-derived: the RPC route puts it
 * in the response header, `loggingMiddleware` attaches it to the error payload
 * the client renders, and the handler's `onError` logs it. An id generated on
 * the client, or a second one minted deeper in, would match nothing.
 *
 * Client-safe on purpose — the error routes and the error boundary all have to
 * read it back off an error object.
 */

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Ids are echoed into logs and into a page, so an id that came in over the wire
 * is only reused when it is short and boring. Anything else is replaced rather
 * than rejected: a malformed header from a proxy is not the caller's problem.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function newRequestId(): string {
  return crypto.randomUUID();
}

/** An inbound id from a proxy or load balancer, when it is safe to reuse. */
export function acceptRequestId(
  value: string | null | undefined,
): string | undefined {
  return value && REQUEST_ID_PATTERN.test(value) ? value : undefined;
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
  if (!isRecord(error)) return undefined;

  if (isRecord(error.data) && typeof error.data.requestId === "string") {
    return error.data.requestId;
  }
  if (typeof error.digest === "string" && error.digest.length > 0) {
    return error.digest;
  }
  return undefined;
}
