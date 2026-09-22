/**
 * AUTOVAULT — Domain Error Classes
 * 
 * Authoritative error taxonomy for all Phase 4 domain services.
 * All domain errors inherit from DomainError and carry HTTP status codes,
 * error codes, and structured diagnostic details.
 */

export class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    statusCode: number = 400,
    details?: unknown,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "DomainError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    if (options?.cause !== undefined && (this as any).cause === undefined) {
      (this as any).cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Validation failure (e.g. discount > 100, quantity <= 0, math mismatch).
 */
export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 400, details);
    this.name = "ValidationError";
  }
}

/**
 * Target entity does not exist.
 */
export class EntityNotFoundError extends DomainError {
  constructor(entityName: string, idOrIdentifier: string) {
    super("ENTITY_NOT_FOUND", `${entityName} not found: ${idOrIdentifier}`, 404, { entityName, idOrIdentifier });
    this.name = "EntityNotFoundError";
  }
}

/**
 * Insufficient stock for a sale, exchange item, or return reversal.
 */
export class InsufficientStockError extends DomainError {
  constructor(productId: string, productName: string, available: number, requested: number) {
    super(
      "INSUFFICIENT_STOCK",
      `Insufficient stock for "${productName}" (${productId}): requested ${requested}, available ${available}`,
      409,
      { productId, productName, available, requested }
    );
    this.name = "InsufficientStockError";
  }
}

/**
 * Invalid state transition (e.g. attempting to void already voided invoice, or cancel cancelled return).
 */
export class InvalidStateTransitionError extends DomainError {
  constructor(entityName: string, id: string, currentState: string, targetState: string) {
    super(
      "INVALID_STATE_TRANSITION",
      `Cannot transition ${entityName} (${id}) from "${currentState}" to "${targetState}"`,
      409,
      { entityName, id, currentState, targetState }
    );
    this.name = "InvalidStateTransitionError";
  }
}

/**
 * Attempting to void an invoice that has active (non-cancelled) sales returns.
 */
export class ActiveReturnsBlockVoidError extends DomainError {
  constructor(invoiceId: string, returnCount: number) {
    super(
      "ACTIVE_RETURNS_BLOCK_VOID",
      `Cannot void invoice ${invoiceId} because it has ${returnCount} active sales return(s). Cancel returns first.`,
      409,
      { invoiceId, returnCount }
    );
    this.name = "ActiveReturnsBlockVoidError";
  }
}

/**
 * Payment allocation exceeds outstanding due amount or liability.
 */
export class ExceededAllocationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super("EXCEEDED_ALLOCATION", message, 400, details);
    this.name = "ExceededAllocationError";
  }
}

/**
 * Return quantity exceeds remaining unreturned quantity.
 */
export class OverReturnError extends DomainError {
  constructor(itemOrProductId: string, maxAllowed: number, requested: number) {
    super(
      "OVER_RETURN",
      `Return quantity ${requested} exceeds remaining unreturned quantity of ${maxAllowed} for ${itemOrProductId}`,
      400,
      { itemOrProductId, maxAllowed, requested }
    );
    this.name = "OverReturnError";
  }
}

/**
 * Serialization conflict or deadlock detected in PostgreSQL (e.g. 40P01 or 55P03).
 */
export class ConcurrencyConflictError extends DomainError {
  constructor(message: string, details?: unknown, options?: { cause?: unknown }) {
    super("CONCURRENCY_CONFLICT", message, 409, details, options);
    this.name = "ConcurrencyConflictError";
  }
}

/**
 * Finance transaction has already been reversed.
 */
export class TransactionAlreadyReversedError extends DomainError {
  constructor(transactionId: string) {
    super(
      "TRANSACTION_ALREADY_REVERSED",
      `Finance transaction ${transactionId} has already been reversed.`,
      409,
      { transactionId }
    );
    this.name = "TransactionAlreadyReversedError";
  }
}

/**
 * Attempting to reverse a transaction that is itself a reversal.
 */
export class CannotReverseReversalError extends DomainError {
  constructor(transactionId: string) {
    super(
      "CANNOT_REVERSE_REVERSAL",
      `Cannot reverse finance transaction ${transactionId} because it is already a reversal of another transaction.`,
      409,
      { transactionId }
    );
    this.name = "CannotReverseReversalError";
  }
}
