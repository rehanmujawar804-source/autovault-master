# AUTOVAULT — PHASE 4 IMPLEMENTATION PLAN: DOMAIN SERVICE ORCHESTRATION

**Status:** Plan Ready for Review  
**Target:** Phase 4 Domain Transaction Services  
**Authoritative References:**  
1. `AUTOVAULT_FINAL_BACKEND_BLUEPRINT.md` (Sections 4, 5, 8, 9, 10, 11, 14, 15)  
2. Verified Phase 2 PostgreSQL Schema (`scripts/migrations/001_initial_schema.sql`, `scripts/validate-schema.mjs`)  
3. Corrected Phase 3 Implementation Plan  
4. `AUTOVAULT_PHASE_3_INDEPENDENT_AUDIT.md` (Passed 100%, 0 Blockers)  
5. Current Workspace Source Code (`src/server/db/*`, `src/server/repositories/*`, `src/lib/store.tsx`)  

---

## REQUIRED CORRECTIONS FROM USER REVIEW (INCORPORATED)

1. **FIFO Concurrency**: Concurrency strategy for customer debt and supplier FIFO explicitly defined. Ordering remains frozen as `COALESCE(created_at, invoice_date::timestamptz), id` and `COALESCE(created_at, purchase_date::timestamptz), id`. Deterministic allocation guaranteed via PostgreSQL `FOR UPDATE` re-evaluations.
2. **Receipt Numbering Delegation**: Application-side counters prohibited. Numbering delegated to PostgreSQL existing sequence functions (e.g. `payment_receipt_seq`).
3. **Idempotency Guarantees**: Voids, cancellations, and reversals are strictly idempotent and reversal-safe. Reversal ledgers explicitly link via `reversal_of`.
4. **Derived Fields vs. Stored Fields**: Strict enforcement that `customer.debt`, `customer.storeCredit`, etc. are NEVER stored in base tables. They are dynamically derived strictly via `view_customer_debt_balances` and `view_customer_credit_balances`.
5. **WAC Zero-Stock Rule**: WAC rule strictly follows deterministic formula: `ROUND((old_stock * old_cost + qty_new * buy_price) / (old_stock + qty_new), 2)`. If `stock == 0`, `new_wac = purchase_price`.
6. **Transaction Boundary Enforcement**: Services strictly own `withTransaction`. Pure repository boundary confirmed. Lock hierarchy explicitly defined (Counter Tables → POs → Invoices → Purchases → Products → Customers/Suppliers) with Products locked `ORDER BY id ASC`.
7. **Expanded Test Plan**: Concurrency test coverage explicitly mandated for FIFO allocations, numbering, and WAC computations.
8. **Phase Boundary Re-confirmation**: Phase 4 boundaries explicitly reaffirmed. NO API routes, NO frontend, NO schema modifications.

---

## 1. GOAL

Design and specify the **Domain Service Layer** for AutoVault ERP.  
The domain services will coordinate the primitive database operations in `src/server/repositories/` into atomic, consistent, isolated, and durable (ACID) business transactions.

The service layer is responsible for:
- Enforcing business invariants and domain validation.
- Managing PostgreSQL transaction boundaries (`withTransaction`).
- Implementing deterministic pessimistic concurrency row locking (`FOR UPDATE`).
- Executing exact Weighted Average Cost (WAC) calculations on qualifying purchases.
- Executing FIFO liability and debt payment waterfall allocations.
- Maintaining atomic synchronization between physical product stock, `stock_movements`, and financial ledgers.
- Managing immutable append-only `finance_transactions` and ledger reversals.
- Delegating document numbering to PostgreSQL sequence/counter stored functions.
- Providing a clean, typed service boundary for future Phase 5 API routes and Phase 7 Server Actions.

---

## 2. CURRENT ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    CURRENT FRONTEND                         │
│           (React 19 + localStorage in store.tsx)            │
│  * Active source of truth for the browser application       │
│  * Unmodified and completely isolated                       │
└─────────────────────────────────────────────────────────────┘
                               ▲
                               │ [NO CONNECTION YET]
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               PHASE 4: DOMAIN SERVICE LAYER                 │
│              (TO BE BUILT IN src/server/services/)          │
│  * withTransaction coordinator                              │
│  * Business logic, WAC, FIFO, Stock Invariants              │
│  * Multi-repository ACID transactions                       │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               PHASE 3: DATA ACCESS LAYER                    │
│            (src/server/repositories/* + txRunner.ts)        │
│  * 14 dumb, single-table typed repositories                 │
│  * 100% parameterized SQL                                   │
│  * Zero business logic, zero cross-repo dependencies        │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               PHASE 2: POSTGRESQL 16 SCHEMA                 │
│                 (Docker Container on :5433)                 │
│  * 30 tables, 1 sequence, 2 views, 4 stored functions       │
│  * Strict CHECK constraints (stock >= 0, discount 0..100)   │
└─────────────────────────────────────────────────────────────┘
```

- **Phase 1 (Infrastructure):** Docker Compose (PostgreSQL 16 on port 5433, MinIO on 9000/9001). Verified.
- **Phase 2 (Schema & DDL):** 30 tables, 1 sequence (`payment_receipt_seq`), 2 balance views (`view_customer_debt_balances`, `view_customer_credit_balances`), 4 numbering generator functions. Verified.
- **Phase 3 (Repositories & txRunner):** 14 pure data-access repositories, `txRunner.ts` transaction helper. Independently audited and passed with 0 blockers.
- **Phase 4 (Current Scope):** Domain services only. Repositories remain dumb. Schema remains frozen.

---

## 3. ABSOLUTE PHASE 4 BOUNDARY

### In Scope for Phase 4:
- Domain service modules under `src/server/services/`.
- Domain validation and error classes under `src/server/errors/domainErrors.ts`.
- Service DTOs and parameter contracts under `src/server/services/types.ts`.
- Explicit transaction boundaries using `withTransaction` from `src/server/db/txRunner.ts`.
- Deadlock-free row locking (`SELECT FOR UPDATE`).
- Deterministic WAC computation for purchases.
- FIFO waterfall allocation for customer debt and supplier liability.
- Stock ledger integrity (product stock + `stock_movements`).
- Append-only financial ledger entries and reversal chains (`finance_transactions`).
- Integration tests in `scripts/test-services.mjs` verifying ACID transactions, invariants, rollbacks, and concurrency.

### Strictly Forbidden in Phase 4:
- **NO Authentication migration:** No bcrypt, no cookie generation, no session validation middleware. (Actor passed as neutral `actorId?: string`).
- **NO Database schema alterations:** No DDL changes, no table alterations, no new migrations.
- **NO Repository changes:** Repositories remain pure DB primitives; no business logic in repositories.
- **NO Data migration:** No importing of localStorage data into PostgreSQL.
- **NO Object storage implementation:** No MinIO client or S3 SDK integration.
- **NO Frontend store modification:** `src/lib/store.tsx` and `src/lib/authUtils.ts` remain untouched.
- **NO API routes or Server Actions:** No `src/app/api/` routes and no `"use server"` mutations.

---

## 4. EXISTING BUSINESS-RULE MAPPING

By forensically auditing `src/lib/store.tsx`, we have extracted the exact production ERP rules to replicate in the backend services:

| Operation in `store.tsx` | Reducer Location | Key Rules & Ledger Effects | Target Phase 4 Service |
| :--- | :--- | :--- | :--- |
| `ADD_INVOICE` | Lines 1171–1339 | Reduces stock; logs `Sale` stock movement; records `Sale` income for paid portion; clamps and redeems store credit via `CustomerCreditTransaction`; increments customer visit count. | `invoiceService.createInvoice` |
| `VOID_INVOICE` | Lines 1817–1978 | Guard: blocked if active sales returns exist; restores unreturned stock; logs `Invoice Void` stock movement; reverses redeemed store credit (`Reversal`); appends reversing `Expense` entries referencing original income (`reversal_of`). | `invoiceService.voidInvoice` |
| `ADD_PURCHASE` | Lines 2116–2239 | Increments stock; calculates WAC via `ROUND(((old_stock * old_cost) + (qty * price)) / new_stock, 2)`; logs `Purchase` stock movement; logs upfront `SupplierPayment` and `Inventory Purchase` expense; updates PO received quantities. | `purchaseService.createPurchase` |
| `ADD_PURCHASE_RETURN` | Lines 2440–2526 | Guard: `qty <= (pur.qty - returned_qty)` and `qty <= product.stock`; decrements stock; logs `Purchase Return` stock movement; updates purchase `returned_quantity` and reduces due amount; records `Income` if cash refund received. | `purchaseService.createPurchaseReturn` |
| `ADD_SALES_RETURN` | Lines 2791–3070 | Guard: `qty <= (item.qty - already_returned)`; calculates refund partition (`cashRefunded = min(RV, paidAvailable)`, `debtCancelled = min(due, remaining)`, `creditCreated = remaining - debtCancelled`); restores stock (and decrements exchange replacement stock); logs stock movements; records finance transactions; logs customer activity. | `salesReturnService.createSalesReturn` |
| `CANCEL_SALES_RETURN` | Lines 3071–3217 | Guard: status must not be `Cancelled`; reverses invoice item `returned_quantity`; restores invoice due; reverses product stock changes; appends negative stock movements; reverses cash refund via `Income` entry; reverses store credit via `Reversal`. | `salesReturnService.cancelSalesReturn` |
| `RECORD_DEBT_PAYMENT` / FIFO | Lines 1340–1568 | Allocates payment waterfall across customer open invoices ordered by FIFO; stamps receipt number (`PAY-XXXXXX`); updates invoice `amount_paid` and `due_amount`; logs `Income` finance transaction; logs customer activity. | `paymentService.recordCustomerPayment` |
| `RECORD_SUPPLIER_PAYMENT_FIFO` | Lines 2336–2439 | Allocates payment waterfall across supplier open purchases ordered by FIFO; updates purchase `amount_paid` and `due_amount`; logs `Expense` finance transaction (`category = 'Supplier Payment'`). | `paymentService.recordSupplierPayment` |
| `APPLY_STORE_CREDIT_TO_DEBT` | Lines 1569–1721 | Redeems customer store credit via `CustomerCreditTransaction`; distributes credit against unpaid invoices in FIFO order; reduces invoice `due_amount` without finance cash flow. | `paymentService.applyStoreCreditToDebt` |
| `ADJUST_STOCK` | Lines 1053–1103 | Checks `stock + delta >= 0`; updates product stock; logs `Manual Adjustment` stock movement; optionally logs `Adjustment` expense if `delta < 0`. | `inventoryService.adjustStock` |

---

## 5. SERVICE ARCHITECTURE

The service layer is structured into 8 cohesive domain services under `src/server/services/`:

```
src/server/
├── errors/
│   └── domainErrors.ts         <-- Custom domain error classes
├── services/
│   ├── types.ts                <-- Input/Output DTOs for all services
│   ├── invoiceService.ts       <-- Invoice creation, itemization, and voiding
│   ├── purchaseService.ts      <-- Purchases, WAC calculation, purchase returns, PO links
│   ├── salesReturnService.ts   <-- Sales returns (refund, credit, exchange), cancellations
│   ├── paymentService.ts       <-- Customer & supplier debt settlement (Direct & FIFO), store credit
│   ├── inventoryService.ts     <-- Product CRUD, manual stock adjustment, vehicle fitments
│   ├── financeService.ts       <-- Accounts, ledger queries, business expenses/income
│   ├── customerService.ts      <-- Customer management, activity logs, view-derived balances
│   ├── supplierService.ts      <-- Supplier management, statement generation
│   └── index.ts                <-- Barrel export of all domain services
```

### Architectural Principles:
1. **Transaction Boundary Ownership:** Services initiate transactions via `withTransaction(async (client) => { ... })`.
2. **Client Passing:** Services pass `client: DbClient` down to every repository call.
3. **No Direct SQL in Services:** Services orchestrate through repository methods; raw SQL remains in repositories.
4. **Pure Repositories:** Repositories never call services, never call each other, and never initiate transactions.

---

## 6. CRITICAL TRANSACTION FAMILIES

### 6.1 `ADD_INVOICE`
- **Entry Point:** `invoiceService.createInvoice(input, actorId?)`
- **Transaction Boundary:** Mandatory `withTransaction`.
- **Repositories Involved:** `numberingRepository`, `productRepository`, `customerRepository`, `invoiceRepository`, `stockMovementRepository`, `financeRepository`, `paymentRepository`.
- **Lock Ordering Hierarchy:**
  1. `invoice_year_counter` (via stored procedure in `numberingRepository.getNextInvoiceNumber`)
  2. `products` (Locked with `ORDER BY id ASC FOR UPDATE` to avoid deadlocks)
  3. `customers` (Locked with `FOR UPDATE` if customer ID provided)
- **Validation:**
  - Invoice contains at least 1 item; all item quantities > 0 and prices >= 0.
  - Discount is between 0 and 100.
  - Mathematical integrity: `total = round(subtotal * (1 - discount/100)) - creditRedeemed`.
  - Amount paid + due amount == total.
  - For each product: `product.stock >= item.quantity` (enforces no negative stock).
  - If `creditRedeemed > 0`: `customerRepository.getCreditBalance(customerId) >= creditRedeemed`.
- **Operations inside Transaction:**
  1. Generate invoice number: `numberingRepository.getNextInvoiceNumber(shopSettings.invoicePrefix, year, client)`.
  2. Lock and read products: `productRepository.findById(item.productId, { forUpdate: true }, client)`.
  3. Verify stock availability for all line items.
  4. Deduct product stock: `productRepository.updateStock(p.id, p.stock - item.quantity, client)`.
  5. Insert invoice header: `invoiceRepository.create({ ... }, client)`.
  6. Insert invoice items: `invoiceRepository.createItem({ ... }, client)` (cost price stamped from `product.currentCost`).
  7. Insert stock movements: `stockMovementRepository.create({ productId, type: 'Sale', delta: -quantity, reference: invoiceNumber }, client)`.
  8. If `creditRedeemed > 0`: `paymentRepository.createCreditTransaction({ customerId, type: 'Redeem', amount: creditRedeemed, referenceType: 'Invoice', invoiceId }, client)`.
  9. If `amountPaid > 0`: `financeRepository.createTransaction({ accountId, type: 'Income', category: 'Sale', amount: amountPaid, referenceId: invoice.id }, client)`.
  10. If customer linked: `customerRepository.recordActivity({ customerId, type: 'Invoice', reference: invoiceNumber }, client)` and update `last_visit`.
- **Failure / Rollback Behavior:** Insufficient stock, invalid math, or locked customer throws `DomainError`; entire transaction aborts with complete rollback.

---

### 6.2 `VOID_INVOICE`
- **Entry Point:** `invoiceService.voidInvoice(invoiceId, reason, voidedBy)`
- **Transaction Boundary:** Mandatory `withTransaction`.
- **Repositories Involved:** `invoiceRepository`, `salesReturnRepository`, `productRepository`, `stockMovementRepository`, `financeRepository`, `paymentRepository`, `customerRepository`.
- **Lock Ordering Hierarchy:**
  1. `invoices` (`findById` with `forUpdate: true`)
  2. `products` (Locked with `ORDER BY id ASC FOR UPDATE`)
  3. `customers` (Locked with `FOR UPDATE`)
- **Validation:**
  - Invoice exists.
  - Invoice is NOT already voided (`invoice.voided == false`).
  - Active Return Check: `salesReturnRepository.list({ invoiceId, status: 'Refunded' })` must return 0 active returns. If active returns exist, abort with `ActiveReturnsBlockVoidError`.
- **Operations inside Transaction:**
  1. Lock invoice row: `invoiceRepository.findById(invoiceId, { forUpdate: true }, client)`.
  2. Fetch invoice line items: `invoiceRepository.getItems(invoiceId, client)`.
  3. Lock all related products: `productRepository.findById(item.productId, { forUpdate: true }, client)`.
  4. For each item, calculate unreturned quantity: `unreturnedQty = item.quantity - item.returnedQuantity`.
  5. If `unreturnedQty > 0`:
     - Restore stock: `productRepository.updateStock(p.id, p.stock + unreturnedQty, client)`.
     - Log stock movement: `stockMovementRepository.create({ productId, type: 'Invoice Void', delta: +unreturnedQty, reference: invoiceNumber }, client)`.
  6. If store credit was redeemed: insert reversing credit transaction (`type = 'Reversal'`).
  7. Reverse finance transactions: Find all `Income` transactions where `reference_id == invoiceId` or linked debt payments; insert reversing `Expense` entries referencing original entries (`reversal_of = origTx.id`).
  8. Update invoice record: `invoiceRepository.updateVoidFields(invoiceId, { voidReason, voidedBy }, client)`.
  9. Log customer activity: `customerRepository.recordActivity({ customerId, type: 'Void', reference: invoiceNumber }, client)`.
- **Failure / Rollback Behavior:** Already voided or active sales returns throw `DomainError`; full atomic rollback.

---

### 6.3 `ADD_PURCHASE`
- **Entry Point:** `purchaseService.createPurchase(input, actorId?)`
- **Transaction Boundary:** Mandatory `withTransaction`.
- **Repositories Involved:** `purchaseOrderRepository`, `productRepository`, `purchaseRepository`, `stockMovementRepository`, `paymentRepository`, `financeRepository`.
- **Lock Ordering Hierarchy:**
  1. `purchase_orders` (if linked, `findById` with `forUpdate: true`)
  2. `products` (`findById` with `forUpdate: true`)
- **Validation:**
  - `quantity > 0` and `buyPrice >= 0`.
  - `amountPaid >= 0` and `amountPaid <= (quantity * buyPrice)`.
  - Product and supplier exist.
- **Operations inside Transaction:**
  1. Lock product row: `productRepository.findById(productId, { forUpdate: true }, client)`.
  2. Compute deterministic WAC:
     ```typescript
     const oldStock = product.stock;
     const oldCost = product.currentCost;
     const newStock = oldStock + quantity;
     const newWac = newStock > 0
       ? Number(((oldStock * oldCost + quantity * buyPrice) / newStock).toFixed(2))
       : buyPrice;
     ```
  3. Update product:
     - `productRepository.updateStock(productId, newStock, client)`.
     - `productRepository.updateWacCost(productId, newWac, client)`.
  4. Insert purchase record: `purchaseRepository.create({ ... }, client)`.
  5. Log stock movement: `stockMovementRepository.create({ productId, type: 'Purchase', delta: quantity, reference: invoiceNumber || purchase.id }, client)`.
  6. If `amountPaid > 0`:
     - Insert supplier payment: `paymentRepository.createSupplierPayment({ supplierId, purchaseId, amount: amountPaid, isUpfront: true }, client)`.
     - Insert finance transaction: `financeRepository.createTransaction({ accountId, type: 'Expense', category: 'Inventory Purchase', amount: amountPaid, referenceId: purchase.id }, client)`.
  7. If linked to Purchase Order (`purchaseOrderId`):
     - Increment PO item `received_quantity`.
     - Check if all items received; update PO status to `"Completed"` or `"Partially Delivered"`.
     - Record PO activity log.
- **Failure / Rollback Behavior:** Any failure restores old stock and cost; transaction aborts cleanly.

---

### 6.4 `ADD_SALES_RETURN`
- **Entry Point:** `salesReturnService.createSalesReturn(input, actorId?)`
- **Transaction Boundary:** Mandatory `withTransaction`.
- **Repositories Involved:** `numberingRepository`, `salesReturnRepository`, `invoiceRepository`, `productRepository`, `stockMovementRepository`, `financeRepository`, `paymentRepository`, `customerRepository`.
- **Lock Ordering Hierarchy:**
  1. `sales_return_year_counter` (via stored procedure in `numberingRepository.getNextSalesReturnNumber`)
  2. `invoices` (`findById` with `forUpdate: true`)
  3. `products` (All returned products and exchange replacement products, sorted by ID with `forUpdate: true`)
  4. `customers` (Locked with `FOR UPDATE` if customer linked)
- **Validation:**
  - Invoice exists and `voided == false`.
  - For every return item: `quantity > 0` and `quantity <= (originalItem.quantity - item.returnedQuantity)`.
  - If `refundMethod == 'Exchange'`: for every exchange item, `exchangeProduct.stock >= exchangeItem.quantity`.
- **Operations inside Transaction:**
  1. Generate return number: `numberingRepository.getNextSalesReturnNumber(year, client)`.
  2. Lock invoice row and line items.
  3. Calculate Canonical Refund Partition (using explicit Decimal arithmetic):
     - Sum prior cash refunds for this invoice: `priorCashRefunded`.
     - `paidAvailable = Decimal.max(0, new Decimal(invoice.amountPaid).minus(priorCashRefunded))`.
     - `returnVal = new Decimal(calculatedReturnValue)`.
     - If `refundMethod === 'Adjustment'`:
       `cashRefunded = new Decimal(0); debtCancelled = Decimal.min(new Decimal(invoice.dueAmount), returnVal); creditCreated = returnVal.minus(debtCancelled);`
     - If `refundMethod === 'Exchange'`:
       `returnTotal = total monetary value of returned items (Decimal)`
       `exchangeTotal = total monetary value of exchange replacement items (Decimal)`
       `exchangeDifference = exchangeTotal.minus(returnTotal)`
       `cashRefunded = new Decimal(0); debtCancelled = new Decimal(0); creditCreated = new Decimal(0);`
     - If `refundMethod === 'Cash' | 'UPI' | 'Bank'`:
       `cashRefunded = Decimal.min(returnVal, paidAvailable); remainder = returnVal.minus(cashRefunded);`
       `debtCancelled = Decimal.min(new Decimal(invoice.dueAmount), remainder); creditCreated = remainder.minus(debtCancelled);`
  4. Insert sales return header: `salesReturnRepository.create({ ... }, client)`.
  5. Insert sales return line items: `salesReturnRepository.createItem({ ... }, client)`.
  6. Update invoice items: `invoiceRepository.updateItemReturnedQuantity(item.id, item.returnedQuantity + returnItem.quantity, client)`.
  7. Update invoice due: `invoiceRepository.updatePayment(invoice.id, { dueAmount: Math.max(0, Number(new Decimal(invoice.dueAmount).minus(debtCancelled))), ... }, client)`.
  8. Restore product stock for returned items: `productRepository.updateStock(p.id, p.stock + returnItem.quantity, client)`.
  9. Log stock movements: `type = 'Sales Return'`, `delta = +returnItem.quantity`.
  10. If Exchange:
      - Insert exchange line items.
      - Deduct replacement product stock: `productRepository.updateStock(p.id, p.stock - exItem.quantity, client)`.
      - Log stock movements: `type = 'Sale'`, `delta = -exItem.quantity`.
      - If `exchangeDifference.greaterThan(0)`:
        - Validate `differencePaymentMethod` is provided.
        - Create an `Income` finance transaction using the SAME transaction `client`: amount = `exchangeDifference.toNumber()`, type = `"Income"`, category = `"Sale"`, accountId = resolved from `differencePaymentMethod`, referenceId = `salesReturn.id`, referenceType = `"SalesReturn"`.
      - If `exchangeDifference.equals(0)`:
        - No finance difference transaction is created.
      - If `exchangeDifference.lessThan(0)`:
        - Handle strictly according to existing refund-credit semantics (do not invent new accounting behavior; difference is either refunded or added to credit).
  11. If `creditCreated.greaterThan(0)`: `paymentRepository.createCreditTransaction({ customerId, type: 'Issue', amount: creditCreated.toNumber(), salesReturnId }, client)`.
  12. If `cashRefunded.greaterThan(0)`: `financeRepository.createTransaction({ accountId, type: 'Expense', category: 'Sales Return', amount: cashRefunded.toNumber(), referenceId: invoice.id }, client)`.
  13. Log customer activity: `customerRepository.recordActivity({ customerId, type: 'Return', reference: returnNumber }, client)`.
- **Failure / Rollback Behavior:** Over-return or exchange stock insufficiency throws `DomainError`; full rollback.

---

### 6.5 `CANCEL_SALES_RETURN`
- **Entry Point:** `salesReturnService.cancelSalesReturn(returnId, reason, cancelledBy)`
- **Transaction Boundary:** Mandatory `withTransaction`.
- **Repositories Involved:** `salesReturnRepository`, `invoiceRepository`, `productRepository`, `stockMovementRepository`, `financeRepository`, `paymentRepository`, `customerRepository`.
- **Lock Ordering Hierarchy:**
  1. `sales_returns` (`findById` with `forUpdate: true`)
  2. `invoices` (`findById` with `forUpdate: true`)
  3. `products` (Returned and exchange products, sorted by ID with `forUpdate: true`)
  4. `customers` (Locked with `FOR UPDATE`)
- **Validation:**
  - Sales return exists and `status !== 'Cancelled'`.
  - Products returned must have sufficient current stock to be re-deducted (`product.stock >= returnItem.quantity`).
- **Operations inside Transaction:**
  1. Lock sales return record.
  2. Lock invoice and all associated products.
  3. Reverse stock changes:
     - Deduct returned items: `productRepository.updateStock(p.id, p.stock - returnItem.quantity, client)`.
     - If Exchange, restore replacement items: `productRepository.updateStock(p.id, p.stock + exItem.quantity, client)`.
  4. Append reversing stock movements (`type = 'Sales Return'`, `delta = -returnItem.quantity`).
  5. Reverse invoice item returned quantities: `returnedQuantity = returnedQuantity - returnItem.quantity`.
  6. Restore invoice due amount: `dueAmount = min(total - amountPaid, dueAmount + debtCancelled)`.
  7. If store credit was issued: insert reversing credit transaction (`type = 'Reversal'`).
  8. If cash refund was paid: insert reversing `Income` finance transaction (`category = 'Sales Return'`).
  9. Mark sales return cancelled: `salesReturnRepository.updateStatus(returnId, 'Cancelled', client)`.
  10. Log customer activity: `customerRepository.recordActivity({ customerId, type: 'Void', reference: returnNumber }, client)`.
- **Failure / Rollback Behavior:** Insufficient stock to reverse or already cancelled throws `DomainError`; full rollback.

---

## 7. INVENTORY + WAC DESIGN

### Exact Deterministic WAC Formula:
```typescript
const old_stock = new Decimal(product.stock);
const old_cost = new Decimal(product.currentCost);
const qty_new = new Decimal(purchase_quantity);
const buy_price = new Decimal(purchase_price);

let new_wac;
if (old_stock.plus(qty_new).greaterThan(0)) {
  if (old_stock.equals(0)) {
    // WAC Edge Case: Zero-stock rule overrides
    new_wac = buy_price.toNumber();
  } else {
    // Standard Deterministic Formula
    new_wac = old_stock.times(old_cost)
      .plus(qty_new.times(buy_price))
      .div(old_stock.plus(qty_new))
      .toDecimalPlaces(2)
      .toNumber();
  }
} else {
  new_wac = buy_price.toNumber();
}
```

### Architectural Rule: Financial Decimal Precision
**Native JavaScript `Number` arithmetic is strictly prohibited for financial calculations in Phase 4.** `Number` may only be used for non-monetary values where appropriate (or for passing final rounded numeric primitives to the DB driver). All internal monetary calculations (WAC, FIFO remainder, exchange differences, refunds, allocations, etc.) MUST be represented using `decimal.js` inside the domain service layer.

### Invariant Rules:
1. **WAC Mutation Trigger:** Only `purchaseService.createPurchase` calculates and updates WAC.
2. **Sales Operations:** Sales deduct physical stock. `current_cost` is NEVER recalculated.
3. **Returns & Voids:** Neither sales returns, invoice voids, nor purchase returns alter `current_cost`.
4. **Stock Reconciliation Adjustments:** `inventoryService.adjustStock` updates stock quantity only; `current_cost` is untouched.
5. **Pessimistic Concurrency:** `productRepository.findById(productId, { forUpdate: true }, client)` guarantees concurrent purchases of the same SKU serialize, ensuring no lost updates to stock or chained WAC values.
6. **Zero Stock Handling:** If a product has 0 stock and a purchase arrives, `new_wac = purchase_price`.
7. **Negative Quantity Rejection:** Any purchase with `quantity <= 0` or `buyPrice < 0` is rejected prior to database access.

---

## 8. FIFO ALLOCATION DESIGN

FIFO allocations are service-layer waterfall algorithms operating over ordered database records.

### 8.1 Customer Debt FIFO (`paymentService.recordCustomerDebtPaymentFifo`)
- **Ordering Query:** Handled by `invoiceRepository.getUnpaidInvoicesByCustomer`:
  ```sql
  SELECT * FROM invoices 
  WHERE customer_id = $1 AND due_amount > 0 AND voided = false
  ORDER BY COALESCE(created_at, invoice_date::timestamptz), id FOR UPDATE
  ```
- **Allocation Algorithm:**
  ```typescript
  let remaining = new Decimal(totalAmount);
  for (const inv of openInvoices) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const effectiveDue = Decimal.max(0, inv.dueAmount);
    if (effectiveDue.lessThanOrEqualTo(0)) continue;

    const alloc = Decimal.min(remaining, effectiveDue);
    const receiptNum = await numberingRepository.getNextPaymentReceiptNumber(client);

    await paymentRepository.createDebtPayment({
      customerId,
      invoiceId: inv.id,
      amount: alloc.toNumber(),
      receiptNumber: receiptNum,
      // ...
    }, client);

    await invoiceRepository.updatePayment(inv.id, {
      amountPaid: new Decimal(inv.amountPaid).plus(alloc).toNumber(),
      dueAmount: new Decimal(inv.dueAmount).minus(alloc).toNumber(),
      paymentStatus: (new Decimal(inv.dueAmount).minus(alloc).lessThanOrEqualTo(0)) ? 'Paid' : 'Partial'
    }, client);

    await financeRepository.createTransaction({
      accountId: methodToAccountId(method),
      type: 'Income',
      category: 'Customer Payment',
      amount: alloc.toNumber(),
      referenceId: inv.id,
      customerId
    }, client);

    remaining = remaining.minus(alloc);
  }
  ```
- **Validation:** If `totalAmount > customerTotalDebt`, reject with `PaymentExceedsDueError` or clamp according to business preference.

### 8.2 Supplier Liability FIFO (`paymentService.recordSupplierPaymentFifo`)
- **Ordering Query:** Handled by `purchaseRepository.getUnpaidPurchasesBySupplier`:
  ```sql
  SELECT * FROM purchases 
  WHERE supplier_id = $1 AND due_amount > 0 
  ORDER BY COALESCE(created_at, purchase_date::timestamptz), id FOR UPDATE
  ```
- **Allocation Algorithm:**
  ```typescript
  let remaining = new Decimal(totalAmount);
  for (const pur of openPurchases) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const effectiveDue = Decimal.max(0, pur.dueAmount);
    if (effectiveDue.lessThanOrEqualTo(0)) continue;

    const alloc = Decimal.min(remaining, effectiveDue);

    await paymentRepository.createSupplierPayment({
      supplierId,
      purchaseId: pur.id,
      amount: alloc.toNumber(),
      isUpfront: false,
      // ...
    }, client);

    await purchaseRepository.updatePayment(pur.id, {
      amountPaid: new Decimal(pur.amountPaid).plus(alloc).toNumber(),
      dueAmount: new Decimal(pur.dueAmount).minus(alloc).toNumber(),
      paymentStatus: (new Decimal(pur.dueAmount).minus(alloc).lessThanOrEqualTo(0)) ? 'Paid' : 'Partial'
    }, client);

    await financeRepository.createTransaction({
      accountId: methodToAccountId(method),
      type: 'Expense',
      category: 'Supplier Payment',
      amount: alloc.toNumber(),
      referenceId: pur.id,
      supplierId
    }, client);

    remaining = remaining.minus(alloc);
  }
  ```

### 8.3 Concurrency Strategy & Deterministic Allocation
- **Deterministic Allocation:** The service guarantees absolutely deterministic allocation when concurrent payment transactions target the same customer or supplier.
- **Mechanism:** The queries use `SELECT ... FOR UPDATE` which acquires row-level locks on the target invoices/purchases.
- **Race Condition Resolution:** If Transaction A and Transaction B concurrently attempt to pay Customer X's debt, Transaction A acquires the locks first based on the strict frozen FIFO order. Transaction B blocks on the lock. When Transaction A commits, B unblocks and PostgreSQL re-evaluates the query conditions. Transaction B will read the newly updated `due_amount` values (reduced by A), and will only allocate its funds to the remaining unpaid liability. This guarantees perfect FIFO deterministic allocation with zero application-side race conditions.

---

## 9. FINANCE DESIGN

### Immutability, Idempotency & Reversal Ledger:
- The `finance_transactions` table is an append-only accounting ledger.
- Existing records are **never updated or deleted**.
- **Idempotency Guarantees:** All domain void and cancellation operations MUST verify entity state first (e.g. `if (invoice.voided) return invoice`) and either exit cleanly or throw an `InvalidStateTransitionError` to ensure absolute idempotency.
- All adjustments, voids, and cancellations create distinct balancing entries:
  - An original `Income` transaction is reversed by an `Expense` transaction with `reversal_of: originalId`.
  - An original `Expense` transaction is reversed by an `Income` transaction with `reversal_of: originalId`.
  - An original `Expense` transaction is reversed by an `Income` transaction with `reversal_of: originalId`.

### Method-to-Account Mapping (`src/server/services/financeService.ts`):
```typescript
export function methodToAccountId(method: string): string {
  switch (method) {
    case "UPI": return "acc-upi";
    case "Bank":
    case "Card": return "acc-bank";
    case "Cash":
    default: return "acc-cash";
  }
}
```

---

## 10. CUSTOMER DEBT / CREDIT DESIGN

### Authoritative Derived Balances:
1. **Total Debt:** Always queried from PostgreSQL view `view_customer_debt_balances`:
   ```sql
   SELECT total_debt FROM view_customer_debt_balances WHERE customer_id = $1
   ```
2. **Available Store Credit:** Always queried from PostgreSQL view `view_customer_credit_balances`:
   ```sql
   SELECT credit_balance FROM view_customer_credit_balances WHERE customer_id = $1
   ```
3. **Derived vs. Stored Financial Fields:** Obsolete localStorage fields (`c.debt`, `c.storeCredit`, `c.invoiceIds`, `c.totalSpent`) are **strictly prohibited** from being stored or maintained in PostgreSQL base tables. The application MUST derive these fields solely by querying the views (`view_customer_debt_balances` and `view_customer_credit_balances`). Caching or storing duplicate financial state is forbidden.

---

## 11. SUPPLIER SETTLEMENT DESIGN

1. **Deterministic Statement Generation:**
   `supplierService.getSupplierStatement(supplierId, dateRange)` generates statements identical to `scripts/test-supplier-statement.mjs`:
   - Opening balance from transactions prior to `dateFrom`.
   - Chronological ledger of Purchases (Debits), Payments (Credits), and Purchase Returns (Credits).
   - Same-timestamp deterministic sorting: Purchases before Payments before Returns.
   - Closing balance reconciles perfectly with active outstanding debt.

---

## 12. NUMBERING DESIGN

All document numbers are allocated inside the database transaction by calling the PostgreSQL stored functions via `numberingRepository`:

1. **Invoices:** `numberingRepository.getNextInvoiceNumber(prefix, year, client)` executes `SELECT get_next_invoice_number($1, $2)`.
2. **Purchase Orders:** `numberingRepository.getNextPoNumber(year, client)` executes `SELECT get_next_po_number($1)`.
3. **Sales Returns:** `numberingRepository.getNextSalesReturnNumber(year, client)` executes `SELECT get_next_sales_return_number($1)`.
4. **Payment Receipts:** `numberingRepository.getNextPaymentReceiptNumber(client)` executes `SELECT get_next_payment_receipt_number()`. **Application-side counters are strictly prohibited.** All numbering logic is delegated to PostgreSQL existing sequence functions (e.g., `payment_receipt_seq`).

**Concurrency & Rollback Behavior:**
- Counter tables (`invoice_year_counter`, etc.) lock row `WHERE year = :year FOR UPDATE`.
- In the event of a transaction rollback, counter increments are rolled back by PostgreSQL transaction semantics (for counter tables) or advance safely (for `payment_receipt_seq`), preventing duplicate number generation.

---

## 13. CONCURRENCY / LOCKING DESIGN

### Global Deadlock-Free Lock Hierarchy:
To prevent deadlocks between concurrent multi-table transactions, all domain services MUST acquire locks in this strict deterministic order:

```
1. Numbering Counter Tables (invoice_year_counter, sales_return_year_counter)
2. Purchase Orders (purchase_orders)
3. Invoices (invoices)
4. Invoice Items (invoice_items)
5. Purchases (purchases)
6. Sales Returns (sales_returns)
7. Debt Payments (debt_payments)
8. Products (products — ALWAYS sorted by UUID ascending: ORDER BY id ASC)
9. Customers (customers)
10. Suppliers (suppliers)
```

### Mandatory Pessimistic Locks:
- **`ADD_INVOICE`:** Lock products sorted by ID (`ORDER BY id ASC FOR UPDATE`).
- **`ADD_PURCHASE`:** Lock product row (`FOR UPDATE`) to serialize chained WAC calculations.
- **`VOID_INVOICE`:** Lock invoice row (`FOR UPDATE`), then lock unreturned products sorted by ID (`FOR UPDATE`).
- **`ADD_SALES_RETURN`:** Lock invoice (`FOR UPDATE`), then lock return/exchange products sorted by ID (`FOR UPDATE`).
- **`FIFO Allocations`:** Lock open invoices/purchases in FIFO order (`FOR UPDATE`).

---

## 14. ERROR MODEL

All service errors inherit from `DomainError` in `src/server/errors/domainErrors.ts`:

```typescript
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "DomainError";
  }
}
```

### Error Taxonomy:
- `ValidationError`: Invalid input data (e.g. discount > 100, negative quantity).
- `EntityNotFoundError`: Entity missing by ID or SKU.
- `InsufficientStockError`: Product stock insufficient for sale or exchange.
- `InvalidStateTransitionError`: Attempting to void already voided invoice or cancel cancelled return.
- `ActiveReturnsBlockVoidError`: Attempting to void invoice that has active sales returns.
- `ExceededAllocationError`: Payment allocation exceeds open liability/debt.
- `OverReturnError`: Sales return quantity exceeds remaining unreturned quantity.
- `ConcurrencyConflictError`: PostgreSQL serialization failure or lock timeout (code `40P01` or `55P03`).

---

## 15. STATUS TRANSITIONS

| Entity | Allowed Transition | Triggering Method | Invalid Transitions Blocked |
| :--- | :--- | :--- | :--- |
| **Invoice** | `Unpaid` → `Partial` → `Paid` | `paymentService.recordCustomerDebtPayment` | Cannot transition backward unless payment voided |
| **Invoice** | `Unpaid` / `Partial` / `Paid` → `Voided` | `invoiceService.voidInvoice` | `Voided` is terminal. Cannot void if active returns exist. |
| **Purchase** | `Credit` → `Partial` → `Paid` | `paymentService.recordSupplierPayment` | Cannot transition backward unless payment voided |
| **Sales Return** | `Refunded` → `Cancelled` | `salesReturnService.cancelSalesReturn` | `Cancelled` is terminal. Cannot re-cancel. |
| **Purchase Order**| `Draft` → `Sent` → `Confirmed` → `Partially Delivered` → `Completed` | `purchaseService.*` | Cannot complete cancelled PO; cannot revert completed PO |
| **Purchase Order**| `Draft` / `Sent` / `Confirmed` → `Cancelled` | `purchaseService.cancelPO` | `Completed` PO cannot be cancelled |

---

## 16. SERVICE API DEFINITIONS

### 16.1 `invoiceService` (`src/server/services/invoiceService.ts`)
```typescript
export interface CreateInvoiceItemInput {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface CreateInvoiceInput {
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  vehicleNumber?: string;
  vehicleModel?: string;
  paymentMethod: string;
  amountPaid: number;
  discount?: number;
  creditRedeemed?: number;
  notes?: string;
  date: string; // YYYY-MM-DD
  billedBy?: string;
  items: CreateInvoiceItemInput[];
}

export interface InvoiceService {
  createInvoice(input: CreateInvoiceInput, actorId?: string): Promise<Invoice>;
  voidInvoice(invoiceId: string, reason: string, voidedBy: string): Promise<Invoice>;
  getInvoiceById(id: string): Promise<Invoice & { items: InvoiceItem[] }>;
  listInvoices(filter: InvoiceFilter, pagination: PaginationParams): Promise<{ data: Invoice[]; total: number }>;
}
```

### 16.2 `purchaseService` (`src/server/services/purchaseService.ts`)
```typescript
export interface CreatePurchaseInput {
  supplierId: string;
  productId: string;
  quantity: number;
  buyPrice: number;
  purchaseDate: string;
  invoiceNumber?: string;
  paymentMethod?: string;
  amountPaid?: number;
  purchaseOrderId?: string;
  notes?: string;
}

export interface CreatePurchaseReturnInput {
  purchaseId: string;
  quantity: number;
  refundAmount: number;
  refundMethod: string;
  reason: string;
  returnedBy: string;
}

export interface PurchaseService {
  createPurchase(input: CreatePurchaseInput, actorId?: string): Promise<Purchase>;
  updatePurchaseMetadata(purchaseId: string, updates: { invoiceNumber?: string; purchaseDate?: string; notes?: string }): Promise<Purchase>;
  createPurchaseReturn(input: CreatePurchaseReturnInput, actorId?: string): Promise<PurchaseReturn>;
  getPurchaseById(id: string): Promise<Purchase>;
  listPurchases(filter: PurchaseFilter, pagination: PaginationParams): Promise<{ data: Purchase[]; total: number }>;
}
```

### 16.3 `salesReturnService` (`src/server/services/salesReturnService.ts`)
```typescript
export interface CreateSalesReturnInput {
  invoiceId: string;
  items: Array<{ invoiceItemId?: string; productId: string; productName: string; quantity: number; sellingPrice: number }>;
  refundMethod: "Cash" | "UPI" | "Bank" | "Adjustment" | "Exchange";
  reason: string;
  notes?: string;
  createdBy: string;
  exchangeItems?: Array<{ productId: string; productName: string; quantity: number; sellingPrice: number; costPrice: number }>;
  differencePaymentMethod?: string;
}

export interface SalesReturnService {
  createSalesReturn(input: CreateSalesReturnInput, actorId?: string): Promise<SalesReturn>;
  cancelSalesReturn(returnId: string, reason: string, cancelledBy: string): Promise<SalesReturn>;
  getSalesReturnById(id: string): Promise<SalesReturn & { items: SalesReturnItem[]; exchangeItems: ExchangeItem[] }>;
  listSalesReturns(filter: SalesReturnFilter, pagination: PaginationParams): Promise<{ data: SalesReturn[]; total: number }>;
}
```

### 16.4 `paymentService` (`src/server/services/paymentService.ts`)
```typescript
export interface PaymentService {
  recordCustomerDebtPayment(invoiceId: string, amount: number, method: string, date: string, note?: string, collectedBy?: string): Promise<DebtPayment>;
  recordCustomerDebtPaymentFifo(customerId: string, totalAmount: number, method: string, date: string, note?: string, collectedBy?: string): Promise<DebtPayment[]>;
  applyStoreCreditToDebt(customerId: string, requestedAmount?: number): Promise<{ allocatedAmount: number; updatedInvoicesCount: number }>;
  voidDebtPayment(debtPaymentId: string, voidReason: string, voidedBy: string): Promise<DebtPayment>;
  recordSupplierPayment(purchaseId: string, amount: number, method: string, date: string, note?: string, paidBy?: string): Promise<SupplierPayment>;
  recordSupplierPaymentFifo(supplierId: string, totalAmount: number, method: string, date: string, note?: string, paidBy?: string): Promise<SupplierPayment[]>;
}
```

### 16.5 `inventoryService` (`src/server/services/inventoryService.ts`)
```typescript
export interface InventoryService {
  createProduct(data: NewProductInput, fitments?: VehicleFitmentInput[]): Promise<Product>;
  updateProduct(id: string, data: UpdateProductInput, fitments?: VehicleFitmentInput[]): Promise<Product>;
  adjustStock(productId: string, delta: number, note?: string, recordExpense?: boolean, actorId?: string): Promise<Product>;
  getProductById(id: string): Promise<Product & { fitments: VehicleFitment[] }>;
  listProducts(filter: ProductFilter, pagination: PaginationParams): Promise<{ data: Product[]; total: number }>;
}
```

### 16.6 `financeService` (`src/server/services/financeService.ts`)
```typescript
export interface FinanceService {
  getAccounts(): Promise<Array<FinanceAccount & { currentBalance: number }>>;
  recordBusinessExpense(accountId: string, amount: number, category: string, date: string, method: string, notes?: string): Promise<FinanceTransaction>;
  recordBusinessMoneyIn(accountId: string, amount: number, category: string, date: string, method: string, notes?: string): Promise<FinanceTransaction>;
  listTransactions(filter: FinanceFilter, pagination: PaginationParams): Promise<{ data: FinanceTransaction[]; total: number }>;
}
```

### 16.7 `customerService` & `supplierService`
```typescript
export interface CustomerService {
  createCustomer(data: NewCustomerInput): Promise<Customer>;
  updateCustomer(id: string, data: UpdateCustomerInput): Promise<Customer>;
  getCustomerProfile(id: string): Promise<Customer & { debt: number; storeCredit: number; activities: CustomerActivity[] }>;
  listCustomers(filter: CustomerFilter, pagination: PaginationParams): Promise<{ data: Customer[]; total: number }>;
}

export interface SupplierService {
  createSupplier(data: NewSupplierInput): Promise<Supplier>;
  updateSupplier(id: string, data: UpdateSupplierInput): Promise<Supplier>;
  getSupplierStatement(supplierId: string, dateFrom?: string, dateTo?: string): Promise<SupplierStatementReport>;
  listSuppliers(filter: SupplierFilter, pagination: PaginationParams): Promise<{ data: Supplier[]; total: number }>;
}
```

---

## 17. FILE CHANGES

### Files to Create:
1. `src/server/errors/domainErrors.ts`
2. `src/server/services/types.ts`
3. `src/server/services/invoiceService.ts`
4. `src/server/services/purchaseService.ts`
5. `src/server/services/salesReturnService.ts`
6. `src/server/services/paymentService.ts`
7. `src/server/services/inventoryService.ts`
8. `src/server/services/financeService.ts`
9. `src/server/services/customerService.ts`
10. `src/server/services/supplierService.ts`
11. `src/server/services/index.ts`
12. `scripts/test-services.mjs`

### Files Allowed to Modify (Zero or Diagnostic Only):
- `scripts/test-repositories.mjs` (Add `loadEnv()` helper so bare runs locate Docker port 5433 cleanly).
- `package.json` and `package-lock.json` (Add `"test:services"` npm script and `decimal.js` dependency).

### Files Forbidden to Modify:
- `src/lib/store.tsx`
- `src/lib/authUtils.ts`
- All Phase 2 schema & migration files (`scripts/migrations/*`, `scripts/apply-migrations.mjs`, `scripts/validate-schema.mjs`)
- All UI components, routes, and hooks (`src/app/*`, `src/components/*`)

---

## 18. TEST STRATEGY

Create a comprehensive test runner: `scripts/test-services.mjs` using `tsx --env-file=.env.local`.

### Dedicated Test Matrix (24 Test Cases):
1. **Invoice Creation:** Verify stock decrement, `stock_movements`, `invoices`, `invoice_items`, `finance_transactions`.
2. **Invoice Stock Insufficiency:** Verify rollback when item quantity > product stock.
3. **Invoice Math Validation:** Verify rejection of invalid discount, negative price, or miscalculated totals.
4. **Invoice Voiding (Standard):** Verify stock restored, unreturned quantity computed, reversing finance expense created.
5. **Invoice Voiding Blocked by Active Return:** Verify rejection when active sales return exists on invoice.
6. **Customer Debt Settlement (Single Invoice):** Verify invoice payment update, debt payment record, finance income.
7. **Customer Debt Settlement (FIFO Multi-Invoice):** Verify payment waterfall splits across 3 distinct invoices in chronological order.
8. **Store Credit Redemption on Invoice:** Verify customer credit deducted and `CustomerCreditTransaction` logged.
9. **Store Credit Reversal on Void:** Verify credit restored to customer when invoice is voided.
10. **Purchase Creation (Standard):** Verify stock increment, `stock_movements`, purchase creation.
11. **WAC Deterministic Formula:** Starting stock 10 @ ₹100, purchase 5 @ ₹130. Assert new stock == 15, new WAC == ₹110.00.
12. **WAC Zero Stock Boundary:** Starting stock 0 @ ₹100, purchase 10 @ ₹140. Assert new WAC == ₹140.00.
13. **WAC Concurrency Protection:** Simulate concurrent purchases of same SKU; assert serialization and accurate chained WAC.
25. **FIFO Concurrency Determinism:** Simulate concurrent payment transactions targeting the same customer. Assert that transactions lock strictly, evaluate `due_amount` accurately, and do not double-allocate funds.
14. **Purchase Return:** Verify stock deduction, purchase `returned_quantity` update, and finance income.
15. **Purchase Return Stock Guard:** Verify rejection if return quantity > product current stock.
16. **Supplier Payment (FIFO Multi-Purchase):** Verify payment waterfall splits across purchases in chronological order.
17. **Sales Return (Cash Refund):** Verify stock restored, invoice item returned quantity updated, finance expense logged.
18. **Sales Return (Exchange with Surcharge):** Verify returned item stock restored, exchange item stock deducted, exchange difference charged.
19. **Sales Return (Adjustment to Debt & Credit):** Return value exceeds invoice due; verify invoice marked paid and remainder converted to customer store credit.
20. **Sales Return Cancellation:** Verify cancellation reverses returned stock, restores invoice due, and reverses finance/credit entries.
21. **Manual Stock Adjustment:** Positive and negative adjustments verify stock update, movement log, and optional expense.
22. **Numbering Concurrency:** Verify concurrent invoice generations produce strictly unique sequential numbers.
23. **Financial Ledger Immutability:** Verify finance reversal transactions strictly reference `reversal_of`.
24. **Negative Stock Constraint Integrity:** Verify that direct attempts to reduce stock below 0 fail at both service and PostgreSQL CHECK constraint levels.

---

## 19. VERIFICATION COMMANDS

```bash
# 1. Typecheck the entire project including new services
npx tsc --noEmit

# 2. Verify Phase 2 database schema integrity remains 100% intact (64 checks)
node scripts/validate-schema.mjs

# 3. Verify Phase 3 repository regression suite
npx tsx --env-file=.env.local scripts/test-repositories.mjs

# 4. Verify supplier financial statement mathematical invariants (27 scenarios)
node scripts/test-supplier-statement.mjs

# 5. Execute Phase 4 Domain Service Test Suite (all 24 test cases)
npx tsx --env-file=.env.local scripts/test-services.mjs
```

### Expected Output:
- `tsc --noEmit`: 0 errors.
- `validate-schema.mjs`: 64 passed, 0 failed.
- `test-repositories.mjs`: 8 passed, 0 failed.
- `test-supplier-statement.mjs`: 27 passed, 0 failed.
- `test-services.mjs`: 24 passed, 0 failed.

---

## 20. IMPLEMENTATION ORDER

```
Step 1: Domain Errors & Service DTOs
  ├── src/server/errors/domainErrors.ts
  └── src/server/services/types.ts

Step 2: Core Inventory & WAC Service
  └── src/server/services/inventoryService.ts

Step 3: Finance Ledger Service
  └── src/server/services/financeService.ts

Step 4: Customer & Supplier Profile Services
  ├── src/server/services/customerService.ts
  └── src/server/services/supplierService.ts

Step 5: Invoicing Service
  └── src/server/services/invoiceService.ts

Step 6: Purchase & Purchase Return Service
  └── src/server/services/purchaseService.ts

Step 7: Sales Return & Exchange Service
  └── src/server/services/salesReturnService.ts

Step 8: Payment & FIFO Settlement Service
  └── src/server/services/paymentService.ts

Step 9: Barrel Exports
  └── src/server/services/index.ts

Step 10: Phase 4 Test Suite & Regression Execution
  └── scripts/test-services.mjs
```

---

## 21. RISKS AND MITIGATIONS

| Identified Risk | Impact | Forensic Mitigation |
| :--- | :--- | :--- |
| **Deadlock on Multi-SKU Invoicing** | High | Always sort product IDs (`ORDER BY id ASC`) before locking via `productRepository.findById`. |
| **WAC Race Conditions** | Critical | Always acquire `SELECT ... FOR UPDATE` on product row before computing WAC. |
| **Orphaned Financial Ledger Rows** | High | Wrap invoice, payment, and return operations in atomic `withTransaction` blocks. |
| **Double-Voiding Invoices** | Medium | Check `invoice.voided == true` under row lock; abort with `InvalidStateTransitionError`. |
| **Voiding Invoice with Active Returns** | Critical | Query active sales returns under invoice row lock; abort with `ActiveReturnsBlockVoidError`. |
| **Exceeding Stock on Exchange** | High | Lock exchange product rows and verify `stock >= exchangeQty` before committing. |
| **FIFO Over-Allocation** | Medium | Clamp allocation chunk to `min(remaining, effectiveDue)`. |

---

## 22. EXPLICIT NON-GOALS

To maintain absolute architectural discipline, the following items are declared explicit non-goals for Phase 4:
- **No Session / Cookie Handlers:** Session cookie generation belongs to Phase 5.
- **No Route Handlers / API Endpoints:** Next.js route handlers (`src/app/api/*`) belong to Phase 5.
- **No Server Actions:** Server Actions (`"use server"`) belong to Phase 7.
- **No Client Store Migration:** `src/lib/store.tsx` remains the browser source of truth until Phase 8.
- **No Data Migration from LocalStorage:** Exporting browser state to server belongs to Phase 6.
- **No MinIO S3 SDK Implementation:** Object storage belongs to Phase 9.

---

**End of Phase 4 Implementation Plan. Awaiting User Approval before Execution.**
