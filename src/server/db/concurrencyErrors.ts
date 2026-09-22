import { ConcurrencyConflictError, DomainError } from "../errors/domainErrors.js";

export const PG_CONCURRENCY_CODES = {
  SERIALIZATION_FAILURE: "40001",
  DEADLOCK_DETECTED: "40P01",
  LOCK_NOT_AVAILABLE: "55P03",
} as const;

export type PgConcurrencyCode =
  typeof PG_CONCURRENCY_CODES[keyof typeof PG_CONCURRENCY_CODES];

const CONCURRENCY_SQLSTATE_SET = new Set<string>(
  Object.values(PG_CONCURRENCY_CODES)
);

/**
 * Checks whether an error is a PostgreSQL concurrency-related error
 * (SQLSTATE 40001, 40P01, or 55P03).
 */
export function isPgConcurrencyError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  // If it is already a DomainError, do not classify it as a raw PG error
  if (error instanceof DomainError) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && CONCURRENCY_SQLSTATE_SET.has(code);
}

/**
 * Converts a PostgreSQL concurrency error (40001, 40P01, 55P03) into a domain
 * ConcurrencyConflictError, preserving the original error as the cause and in details.
 * Non-concurrency errors and existing domain errors are returned completely unmodified.
 */
export function mapConcurrencyError<E>(error: E): E | ConcurrencyConflictError {
  if (!isPgConcurrencyError(error)) {
    return error;
  }

  const pgErr = error as {
    code: string;
    message?: string;
    severity?: string;
    detail?: string;
    table?: string;
    constraint?: string;
  };

  let domainMessage: string;
  switch (pgErr.code) {
    case PG_CONCURRENCY_CODES.SERIALIZATION_FAILURE:
      domainMessage =
        "Concurrency conflict: transaction could not be serialized due to concurrent update (SQLSTATE 40001).";
      break;
    case PG_CONCURRENCY_CODES.DEADLOCK_DETECTED:
      domainMessage =
        "Concurrency conflict: database deadlock detected between concurrent transactions (SQLSTATE 40P01).";
      break;
    case PG_CONCURRENCY_CODES.LOCK_NOT_AVAILABLE:
      domainMessage =
        "Concurrency conflict: lock not available due to concurrent transaction (SQLSTATE 55P03).";
      break;
    default:
      domainMessage = `Concurrency conflict: database operation aborted due to concurrent conflict (SQLSTATE ${pgErr.code}).`;
      break;
  }

  const details: Record<string, unknown> = {
    sqlState: pgErr.code,
  };
  if (pgErr.severity) details.severity = pgErr.severity;
  if (pgErr.detail) details.detail = pgErr.detail;
  if (pgErr.table) details.table = pgErr.table;
  if (pgErr.constraint) details.constraint = pgErr.constraint;

  return new ConcurrencyConflictError(domainMessage, details, { cause: error });
}
