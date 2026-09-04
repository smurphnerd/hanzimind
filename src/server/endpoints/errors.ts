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
