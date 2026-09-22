/**
 * AUTOVAULT — Domain Service Layer Barrel Exports
 * 
 * Re-exports all 8 cohesive domain services, typed DTOs, and domain error classes.
 */

export {
  DomainError,
  ValidationError,
  EntityNotFoundError,
  InsufficientStockError,
  InvalidStateTransitionError,
  ActiveReturnsBlockVoidError,
  ExceededAllocationError,
  OverReturnError,
  ConcurrencyConflictError
} from "../errors/domainErrors";
export * from "./types";
export * from "./inventoryService";
export * from "./financeService";
export * from "./customerService";
export * from "./supplierService";
export * from "./invoiceService";
export * from "./purchaseService";
export * from "./salesReturnService";
export * from "./paymentService";
