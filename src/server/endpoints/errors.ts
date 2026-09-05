import "server-only";

import { ORPCError } from "@orpc/client";

export class NotFoundError extends Error {}

export class InvalidInputError extends Error {}

const INTERNAL_MESSAGE = "Something went wrong";

export function toORPCError(error: unknown): ORPCError<string, unknown> {
  if (error instanceof ORPCError) return error;
  if (error instanceof NotFoundError) {
    return new ORPCError("NOT_FOUND", { message: error.message, cause: error });
  }
  if (error instanceof InvalidInputError) {
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      cause: error,
    });
  }
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message: INTERNAL_MESSAGE,
    cause: error,
  });
}

/**
 * Stamps the request id onto an error on its way to the client, so the page a
 * learner sees names the same id as the one line the server logged.
 *
 * ORPCError is immutable in practice — `data` is read at construction — so this
 * rebuilds it, carrying `defined` across because `isDefinedError` on the client
 * reads that flag and a dropped one turns a handled 401 into an unknown fault.
 *
 * `data` is only merged into when it is absent or a plain object. Nothing in
 * this app's error map declares a data schema, so that is every case today; a
 * future error whose data is an array or a string keeps it intact rather than
 * being flattened for the sake of an id.
 */
export function withRequestId(
  error: ORPCError<string, unknown>,
  requestId: string | undefined,
): ORPCError<string, unknown> {
  if (!requestId) return error;

  const data = error.data;
  const isPlainObject =
    typeof data === "object" && data !== null && !Array.isArray(data);
  if (data !== undefined && !isPlainObject) return error;

  return new ORPCError(error.code, {
    defined: error.defined,
    status: error.status,
    message: error.message,
    data: { ...(data as Record<string, unknown> | undefined), requestId },
    cause: error.cause,
  });
}

/** Postgres reports a foreign-key violation as SQLSTATE 23503, on `error.cause`. */
const PG_FOREIGN_KEY_VIOLATION = "23503";

export function isForeignKeyViolation(error: unknown): boolean {
  return foreignKeyConstraint(error) !== undefined;
}

/**
 * The violated constraint's name, for a table with more than one caller-supplied
 * foreign key. Drizzle names them after the column, so a caller can be told
 * which id was wrong instead of being told about the first one.
 */
export function foreignKeyConstraint(error: unknown): string | undefined {
  if (
    !(error instanceof Error) ||
    typeof error.cause !== "object" ||
    error.cause === null ||
    !("code" in error.cause) ||
    error.cause.code !== PG_FOREIGN_KEY_VIOLATION
  ) {
    return undefined;
  }
  const constraint =
    "constraint" in error.cause ? error.cause.constraint : undefined;
  return typeof constraint === "string" ? constraint : "";
}
