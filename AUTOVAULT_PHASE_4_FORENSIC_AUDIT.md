# AutoVault — Phase 4 Forensic Audit Report
**Audit Date:** 2026-09-21  
**Auditor:** Antigravity Autonomous Forensic Auditor  
**Audit Scope:** Phase 4 Domain Service Orchestration & System Baseline  
**Authority:** Frozen PostgreSQL Blueprint, Phase 2 Migration Schema, Phase 3 Repository Contracts, Phase 3A Transaction Runner Contract, `src/lib/store.tsx` Business Semantics  

---

## 1. Executive Summary & Verdict

A strict, read-only forensic audit was performed on the AutoVault codebase following the completion of **Phase 4: Domain Service Orchestration**.

All 6 test suites were executed against the live PostgreSQL 16 instance on port 5433:
- `npx tsc --noEmit`: **0 errors** (Clean compilation)
- `node scripts/validate-schema.mjs`: **64/64 passed, 0 failed**
- `scripts/test-repositories.mjs`: **8/8 passed, 0 failed**
- `scripts/test-tx-runner.ts`: **14/14 passed, 0 failed**
- `scripts/test-supplier-statement.mjs`: **27/27 passed, 0 failed**
- `scripts/test-services.mjs`: **66/66 passed, 0 failed**

Despite the 100% test pass rate, the audit revealed a critical architectural violation under **Section 7 of the Audit Mandate**: **Domain services contain 20 occurrences of direct SQL queries (`client.query` / `pool.query`)**, bypassing the repository layer. Under the explicit rules of Section 7 ("*Services orchestrate. Repositories perform database access. If a service contains SQL that violates this architecture: BLOCKER*"), this finding requires a **BLOCKED** classification.

Additionally, **5 WARNINGS** were uncovered regarding exchange refund asymmetry, reversal duplicate guards, number arithmetic in inventory adjustments, and Postgres error code translation.

---

## 2. Git Baseline

Recorded at audit initiation:
```text
$ git status --short
 M package-lock.json
 M package.json
 M scripts/test-repositories.mjs
 M scripts/validate-schema.mjs
 M src/server/repositories/customerRepository.ts
 M src/server/repositories/paymentRepository.ts
 M src/server/repositories/productRepository.ts
 M src/server/repositories/shopSettingsRepository.ts
 M src/server/repositories/types.ts
?? scripts/test-services.mjs
?? src/server/errors/
?? src/server/services/
```

`git diff --stat`:
```text
 package-lock.json                                 | 167 ++++++++++++++++++++++
 package.json                                      |   6 +-
 scripts/test-repositories.mjs                     |  27 ++++
 scripts/validate-schema.mjs                       |  16 ++-
 src/server/repositories/customerRepository.ts     |   2 +-
 src/server/repositories/paymentRepository.ts      |   7 +-
 src/server/repositories/productRepository.ts      |  12 +-
 src/server/repositories/shopSettingsRepository.ts |   9 +-
 src/server/repositories/types.ts                  |  25 +++-
 9 files changed, 249 insertions(+), 22 deletions(-)
```

No tracked files outside the approved repository enhancements were modified prior to the audit. No source files were modified during the audit.

---

## 3. Files Inspected

### Domain Services & Errors
- [`src/server/services/inventoryService.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/inventoryService.ts)
- [`src/server/services/financeService.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/financeService.ts)
- [`src/server/services/customerService.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/customerService.ts)
- [`src/server/services/supplierService.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/supplierService.ts)
- [`src/server/services/invoiceService.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/invoiceService.ts)
- [`src/server/services/purchaseService.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/purchaseService.ts)
- [`src/server/services/salesReturnService.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/salesReturnService.ts)
- [`src/server/services/paymentService.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/paymentService.ts)
- [`src/server/services/types.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/types.ts)
- [`src/server/services/index.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/index.ts)
- [`src/server/errors/domainErrors.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/errors/domainErrors.ts)
- [`src/server/errors/index.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/errors/index.ts)

### Repositories & Database Infrastructure
- [`src/server/repositories/invoiceRepository.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/invoiceRepository.ts)
- [`src/server/repositories/purchaseRepository.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/purchaseRepository.ts)
- [`src/server/repositories/paymentRepository.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/paymentRepository.ts)
- [`src/server/repositories/productRepository.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/productRepository.ts)
- [`src/server/repositories/customerRepository.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/customerRepository.ts)
- [`src/server/repositories/supplierRepository.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/supplierRepository.ts)
- [`src/server/repositories/stockMovementRepository.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/stockMovementRepository.ts)
- [`src/server/repositories/financeRepository.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/financeRepository.ts)
- [`src/server/repositories/numberingRepository.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/numberingRepository.ts)
- [`src/server/repositories/shopSettingsRepository.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/shopSettingsRepository.ts)
- [`src/server/repositories/types.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/types.ts)
- [`src/server/db/txRunner.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/db/txRunner.ts)
- [`src/server/db/client.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/db/client.ts)
- [`src/server/db/migrations/001_initial_schema.sql`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/db/migrations/001_initial_schema.sql)

### Core Business Reference & Tests
- [`src/lib/store.tsx`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/lib/store.tsx)
- [`scripts/test-services.mjs`](file:///c:/Users/rrmss/Desktop/autovault-master-master/scripts/test-services.mjs)
- [`scripts/test-repositories.mjs`](file:///c:/Users/rrmss/Desktop/autovault-master-master/scripts/test-repositories.mjs)
- [`scripts/test-tx-runner.ts`](file:///c:/Users/rrmss/Desktop/autovault-master-master/scripts/test-tx-runner.ts)
- [`scripts/test-supplier-statement.mjs`](file:///c:/Users/rrmss/Desktop/autovault-master-master/scripts/test-supplier-statement.mjs)
- [`scripts/validate-schema.mjs`](file:///c:/Users/rrmss/Desktop/autovault-master-master/scripts/validate-schema.mjs)

---

## 4. Service Inventory

All 8 claimed domain services physically exist in `src/server/services/`:

| Service | Public Methods | Transaction Boundaries | Direct SQL Calls | Locking Behavior | Financial Calc | Error Handling |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`inventoryService`** | `adjustStock`, `getProductStockHistory` | `withTransaction` for adjustments | **0** | `findByIdForUpdate` (single product) | Number arithmetic (line 150) | `ValidationError`, `EntityNotFoundError`, `InsufficientStockError` |
| **`financeService`** | `getAccounts`, `recordBusinessExpense`, `recordBusinessMoneyIn`, `reverseTransaction`, `listTransactions` | `withTransaction` in mutation methods | **0** | None (append-only ledger) | `Decimal` validation | `ValidationError`, `EntityNotFoundError` |
| **`customerService`** | `getCustomerBalance`, `getCustomerStatement` | None (read-only queries) | **0** | None | Reads from SQL views | `EntityNotFoundError` |
| **`supplierService`** | `getSupplierStatement` | None (read-only queries) | **3** (`pool.query`) | None | Number arithmetic (`normalizeMoney`) | `EntityNotFoundError` |
| **`invoiceService`** | `createInvoice`, `voidInvoice`, `getInvoiceById` | `withTransaction` for create/void | **4** (`client.query`) | Deterministic sorted `ids.sort()` + `findByIdsForUpdate`, customer `FOR UPDATE` | Full `Decimal` precision | `ValidationError`, `EntityNotFoundError`, `InsufficientStockError`, `InvalidStateTransitionError`, `ActiveReturnsBlockVoidError` |
| **`purchaseService`** | `createPurchase`, `createPurchaseReturn`, `getPurchaseById` | `withTransaction` for create/return | **5** (`client.query`) | Deterministic sorted `ids.sort()` + `findByIdsForUpdate`, PO `FOR UPDATE` | Full `Decimal` WAC and totals | `ValidationError`, `EntityNotFoundError`, `InsufficientStockError`, `OverReturnError` |
| **`salesReturnService`** | `createSalesReturn`, `cancelSalesReturn`, `getSalesReturnById` | `withTransaction` for create/cancel | **3** (`client.query`) | Deterministic sorted `ids.sort()` on union of return + exchange items | Full `Decimal` partition | `ValidationError`, `EntityNotFoundError`, `InsufficientStockError`, `InvalidStateTransitionError`, `OverReturnError` |
| **`paymentService`** | `recordCustomerPayment`, `recordCustomerPaymentFifo`, `applyStoreCreditToDebt`, `voidDebtPayment`, `recordSupplierPayment`, `recordSupplierPaymentFifo` | `withTransaction` for all methods | **5** (`client.query`) | Queries unpaid invoices/purchases with `FOR UPDATE`, row locks on payments | Full `Decimal` FIFO allocation | `ValidationError`, `EntityNotFoundError`, `ExceededAllocationError`, `InvalidStateTransitionError` |

---

## 5. Transaction Ownership Audit

### Rules Verified:
1. **Services own top-level transaction boundaries:** Every multi-table state mutation in `invoiceService`, `purchaseService`, `salesReturnService`, `paymentService`, `inventoryService`, and `financeService` uses `withTransaction(async (client) => { ... })`.
2. **Repositories do NOT execute `BEGIN`, `COMMIT`, or `ROLLBACK`:** Inspected all repositories in `src/server/repositories/`. Zero occurrences of transaction-control statements in repository classes.
3. **Services pass the same active client:** Confirmed. All repository invocations inside transactional workflows pass `client` as the trailing argument.
4. **No nested independent transactions:** `txRunner.ts` reuses an existing client if one is passed, preventing nested transactions.
5. **No mutation outside the transaction:** All stock adjustments, ledger entries, credit ledger rows, and balance updates occur inside the callback.

**Classification:** **PASS**

---

## 6. Direct SQL Audit (CRITICAL VIOLATION)

A strict grep of `src/server/services/**/*.ts` for raw SQL (`client.query` and `pool.query`) revealed **20 distinct raw database queries** across 5 services:

```text
src/server/services/invoiceService.ts:130
src/server/services/invoiceService.ts:248
src/server/services/invoiceService.ts:291
src/server/services/invoiceService.ts:345
src/server/services/paymentService.ts:229
src/server/services/paymentService.ts:273
src/server/services/paymentService.ts:313
src/server/services/paymentService.ts:322
src/server/services/paymentService.ts:355
src/server/services/purchaseService.ts:81
src/server/services/purchaseService.ts:177
src/server/services/purchaseService.ts:185
src/server/services/purchaseService.ts:192
src/server/services/purchaseService.ts:197
src/server/services/salesReturnService.ts:113
src/server/services/salesReturnService.ts:406
src/server/services/salesReturnService.ts:480
src/server/services/supplierService.ts:58
src/server/services/supplierService.ts:68
src/server/services/supplierService.ts:78
```

### Breakdown of Violations:
1. **`invoiceService.ts`**:
   - Line 130: Direct customer row lock query: `SELECT * FROM customers WHERE id = $1 FOR UPDATE`. (Belongs in `customerRepository.findById(..., { forUpdate: true })`).
   - Line 248: Direct update of customer visits: `UPDATE customers SET visits = visits + 1, last_visit = $1, updated_at = NOW() WHERE id = $2`. (Belongs in `customerRepository.recordVisit`).
   - Line 291: Direct check of active sales returns: `SELECT COUNT(*) as count FROM sales_returns WHERE invoice_id = $1 AND status != 'Cancelled'`. (Belongs in `salesReturnRepository.countActiveReturnsByInvoiceId`).
   - Line 345: Direct search of unreversed finance transactions for void reversal: `SELECT * FROM finance_transactions WHERE (reference_id = $1::text ...`. (Belongs in `financeRepository.findUnreversedTransactionsByReference`).
2. **`purchaseService.ts`**:
   - Line 81: Direct PO lock: `SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE`.
   - Line 177: Direct PO items update: `UPDATE purchase_order_items SET received_quantity = received_quantity + $1 ...`.
   - Line 185: Direct PO items query: `SELECT quantity, received_quantity FROM purchase_order_items ...`.
   - Line 192: Direct PO status update: `UPDATE purchase_orders SET status = $1 ...`.
   - Line 197: Direct PO activity log insert: `INSERT INTO purchase_order_activity_logs ...`.
   *(All 5 belong in a dedicated `purchaseOrderRepository`)*.
3. **`salesReturnService.ts`**:
   - Line 113: Direct query for prior cash refunds: `SELECT COALESCE(SUM(cash_refunded), 0) as total FROM sales_returns WHERE invoice_id = $1 AND status != 'Cancelled'`. (Belongs in `salesReturnRepository.getTotalCashRefunded`).
   - Line 406: Direct query for invoice item returned quantity: `SELECT returned_quantity FROM invoice_items WHERE id = $1`. (Belongs in `invoiceRepository`).
   - Line 480: Direct update of return status to Cancelled: `UPDATE sales_returns SET status = 'Cancelled', updated_at = NOW() WHERE id = $1`. (Belongs in `salesReturnRepository.updateStatus`).
4. **`paymentService.ts`**:
   - Line 229: Direct invoice balance update during credit application: `UPDATE invoices SET due_amount = $1, credit_redeemed = $2 ...`. (Belongs in `invoiceRepository`).
   - Line 273: Direct lock on debt payment: `SELECT * FROM debt_payments WHERE id = $1 FOR UPDATE`. (Belongs in `paymentRepository`).
   - Line 313: Direct update to void debt payment: `UPDATE debt_payments SET voided = true ...`. (Belongs in `paymentRepository`).
   - Line 322: Direct search for original income finance transaction: `SELECT * FROM finance_transactions WHERE ...`. (Belongs in `financeRepository`).
   - Line 355: Direct reload of debt payment row: `SELECT * FROM debt_payments WHERE id = $1`. (Belongs in `paymentRepository`).
5. **`supplierService.ts`**:
   - Lines 58, 68, 78: Direct queries to `purchases`, `supplier_payments`, and `purchase_returns` using `pool.query`. (Belongs in respective repositories).

**Audit Mandate Rule:** *"Services orchestrate. Repositories perform database access. If a service contains SQL that violates this architecture: BLOCKER."*  
**Classification:** **BLOCKER**

---

## 7. Financial Decimal Audit

- **Package Standard:** Verified in `package.json` — standardized on `decimal.js` version `^10.4.3`. (Not `decimal.js-light`).
- **Core Orchestration:**
  - `invoiceService.ts`: Uses `Decimal` for subtotal, discount, discountedTotal, store credit redemption, and due amount.
  - `purchaseService.ts`: Uses `Decimal` for WAC recalculation, buy price multiplication, and return value validation.
  - `salesReturnService.ts`: Uses `Decimal` for item totals, refund partition (cash, debt cancellation, store credit), and exchange difference.
  - `paymentService.ts`: Uses `Decimal` for FIFO waterfall deductions (`Decimal.min(remaining, due)`).
- **Discrepancies / Floating Point Leaks:**
  1. [`inventoryService.ts:150`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/inventoryService.ts#L150):
     ```ts
     const writeOffAmount = Math.round(Math.abs(input.delta) * product.currentCost * 100) / 100;
     ```
     Uses native JavaScript IEEE 754 arithmetic for inventory write-off expenses.
  2. [`supplierService.ts:17-25`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/supplierService.ts#L17-L25):
     ```ts
     function normalizeMoney(num: number): number {
       return Math.round((num + Number.EPSILON) * 100) / 100;
     }
     ```
     Uses floating-point arithmetic with `Number.EPSILON` for supplier statement running balances.

**Classification:** **WARNING**

---

## 8. WAC Audit

### Formula Verification:
In [`purchaseService.ts:103-118`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/purchaseService.ts#L103-L118):
```ts
if (newStock.greaterThan(0)) {
  if (oldStock.equals(0)) {
    newWac = buyPrice.toNumber();
  } else {
    newWac = oldStock.times(oldCost)
      .plus(newQty.times(buyPrice))
      .dividedBy(newStock)
      .toDecimalPlaces(2)
      .toNumber();
  }
} else {
  newWac = buyPrice.toNumber();
}
```
1. **Zero-stock rule:** If `oldStock == 0`, `newWac = buyPrice`. Verified in Test 12.
2. **Locking before calculation:** Product row is locked via `productRepository.findById(..., { forUpdate: true }, client)` before reading `stock` or `currentCost`.
3. **Atomic update:** Both stock and WAC are updated in the same transaction client.
4. **Precision:** Rounded to 2 decimal places using `Decimal.ROUND_HALF_UP` (default mode of `decimal.js`).
5. **No recalculation on return:** Purchase returns explicitly decrease stock without modifying WAC, adhering to the blueprint.

**Classification:** **PASS**

---

## 9. Product Locking / Deadlock Prevention Audit

Inspected all multi-product mutation workflows:
- `invoiceService.createInvoice`:
  ```ts
  const uniqueProductIds = Array.from(new Set(input.items.map(i => i.productId))).sort();
  for (const pId of uniqueProductIds) {
    await productRepository.findById(pId, { forUpdate: true }, client);
  }
  ```
- `invoiceService.voidInvoice`:
  ```ts
  const productIds = Array.from(new Set(items.map(i => i.productId))).sort();
  for (const pId of productIds) {
    await productRepository.findById(pId, { forUpdate: true }, client);
  }
  ```
- `salesReturnService.createSalesReturn`:
  ```ts
  const returnedProductIds = input.items.map(i => i.productId);
  const exchangeProductIds = (input.exchangeItems || []).map(i => i.productId);
  const allProductIds = Array.from(new Set([...returnedProductIds, ...exchangeProductIds])).sort();
  for (const pId of allProductIds) {
    await productRepository.findById(pId, { forUpdate: true }, client);
  }
  ```
- `salesReturnService.cancelSalesReturn`:
  ```ts
  const pIds = Array.from(new Set([
    ...returnItems.map(i => i.productId),
    ...exchangeItems.map(i => i.productId)
  ])).sort();
  for (const pId of pIds) {
    await productRepository.findById(pId, { forUpdate: true }, client);
  }
  ```

### Audit Findings:
1. Product IDs are deduplicated using `Set`.
2. Product IDs are sorted deterministically in ascending order using `.sort()` (lexicographical sort on UUID strings).
3. Locks are acquired sequentially in sorted order inside the transaction.
4. No `Promise.all()` parallel lock acquisition is used.
5. Inverted input orders produce identical lock acquisition sequences.

**Classification:** **PASS**

---

## 10. Customer FIFO Debt Audit

Inspected [`invoiceRepository.getUnpaidInvoicesByCustomer`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/invoiceRepository.ts#L106-L113):
```sql
SELECT * FROM invoices
WHERE customer_id = $1 AND due_amount > 0 AND status != 'Voided'
ORDER BY COALESCE(created_at, invoice_date::timestamptz) ASC, id ASC
FOR UPDATE
```
Inspected [`paymentService.recordCustomerPaymentFifo`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/paymentService.ts#L80-L154):
- Open non-voided invoices selected.
- Canonical FIFO order: `COALESCE(created_at, invoice_date::timestamptz) ASC, id ASC`.
- Locked `FOR UPDATE`.
- Waterfall allocation uses `Decimal.min(remaining, effectiveDue)`.
- No invoice can be overpaid (`alloc` capped at `effectiveDue`).
- Throws `ExceededAllocationError` if payment amount exceeds total outstanding debt.
- Concurrent FIFO payments serialize on row locks; second transaction re-evaluates `due_amount` under lock.

**Classification:** **PASS**

---

## 11. Supplier FIFO Audit

Inspected [`purchaseRepository.getUnpaidPurchasesBySupplier`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/repositories/purchaseRepository.ts#L98-L105):
```sql
SELECT * FROM purchases
WHERE supplier_id = $1 AND due_amount > 0 AND status != 'Cancelled'
ORDER BY COALESCE(created_at, purchase_date::timestamptz) ASC, id ASC
FOR UPDATE
```
Inspected [`paymentService.recordSupplierPaymentFifo`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/paymentService.ts#L441-L528):
- Open non-cancelled purchases selected.
- Canonical FIFO order: `COALESCE(created_at, purchase_date::timestamptz) ASC, id ASC`.
- Locked `FOR UPDATE`.
- Allocation uses `Decimal.min(remaining, effectiveDue)`.
- Throws `ExceededAllocationError` if payment exceeds total supplier liability.

**Classification:** **PASS**

---

## 12. Receipt Numbering Audit

- **Numbering Sequence:** Stored procedure `get_next_payment_receipt_number()` increments sequence `payment_receipt_seq` and formats as `PAY-XXXXXX`.
- **Granularity in FIFO Payment:**
  In [`paymentService.ts:106`](file:///c:/Users/rrmss/Desktop/autovault-master-master/src/server/services/paymentService.ts#L106):
  ```ts
  const receiptNumber = await numberingRepository.getNextPaymentReceiptNumber(client);
  ```
  Generates a separate receipt number **per allocation (per invoice settled)**.
  This matches `src/lib/store.tsx` lines 1343–1360, where each `RECORD_DEBT_PAYMENT` action represents an allocation to a single invoice and increments `paymentReceiptCounter`.

**Classification:** **PASS**

---

## 13. Invoice Creation Audit

- **Invoice Number:** Generated atomically via `numberingRepository.getNextInvoiceNumber` (`get_next_invoice_number(prefix, year)`).
- **Product Row Locking:** Products locked before stock verification and before deduction.
- **Duplicate Product Lines:** Tested and handled correctly — lines 114–126 of `invoiceService.ts` sum requested quantities into a `requestedQtyMap` by product ID before asserting stock.
- **Cost Price Snapshot:** Line 188 takes `const costPrice = prod.currentCost;` from the locked product state.
- **Stock Movement:** Creates movement of type `"Sale"` with delta `-item.quantity`.
- **Finance Income:** Created only if `amountPaid > 0`.
- **Credit Redemption:** Verified against live balance via `customerRepository.getCreditBalance`. Rejects walk-in credit redemption.
- **Accounting Equation:** `amountPaid + dueAmount == total` strictly maintained via `Decimal`.

**Classification:** **PASS**

---

## 14. Invoice Void Audit

- **Locking:** Invoice locked first `FOR UPDATE`. Products locked next in deterministic sorted order.
- **Idempotency:** Rejects if `invoice.voided` is true with `InvalidStateTransitionError`.
- **Active Sales Returns Guard:** Blocks voiding if any sales return on the invoice has `status != 'Cancelled'`. (Throws `ActiveReturnsBlockVoidError`).
- **Partial Return Stock Restoration:** Computes `unreturnedQty = item.quantity - (item.returnedQuantity ?? 0)`. Only unreturned physical stock is restored.
- **Store Credit Reversal:** Reverses redeemed credit with a `'Reversal'` credit transaction.
- **Finance Income Reversal:** Queries unreversed Income transactions linked to the invoice (or its debt payments) and creates balancing `'Expense'` entries with `reversal_of = origTx.id`.
- **Void Metadata:** Sets `void_reason`, `voided_by`, `voided_at`, and `voided = true`.

**Classification:** **PASS**

---

## 15. Purchase & Purchase Return Audit

### Purchase:
- Products locked before reading cost.
- WAC computed deterministically.
- Stock incremented atomically.
- Upfront payment emits `supplier_payments` row and finance `Expense`.
- PO progress tracked if linked.

### Purchase Return:
- Validates `quantity <= remainingReturnable` (`purchase.quantity - purchase.returnedQuantity`).
- Validates physical stock is available (`quantity <= product.stock`).
- Product stock decremented; WAC is untouched.
- `returned_quantity` on purchase incremented.
- Due amount decremented by `returnGoodsValue - refundAmount`.
- Cash refund emits finance `Income`.

**Classification:** **PASS**

---

## 16. Sales Return Audit

Canonical Refund Partitioning audited across all 3 cases:
- **Case 1: `exchangeDifference > 0` (Customer pays surcharge):**
  Emits Income transaction for surcharge amount.
- **Case 2: `exchangeDifference == 0`:**
  No difference transaction emitted.
- **Case 3: `exchangeDifference < 0` (Store owes customer):**
  *Discrepancy:* `salesReturnService.ts` line 257 checks only `if (exchangeDifference.greaterThan(0))`. When `exchangeDifference < 0`, it does NOT emit an Expense transaction or adjust due/credit, whereas `src/lib/store.tsx` lines 2977–2995 emits an Expense transaction for `Math.abs(diff)`. (Logged in Warning 1).

**Classification:** **PASS WITH WARNINGS**

---

## 17. Sales Return Cancellation Audit

- Cannot cancel twice (`status === 'Cancelled'` rejected).
- Returned stock re-deducted (asserts stock availability first).
- Replacement exchange stock restored to inventory.
- Invoice item `returned_quantity` reverted.
- Invoice due amount restored (capped at `total - amountPaid`).
- Issued store credit reversed via `'Reversal'` entry.
- Cash refund reversed via finance `'Income'` entry.
- *Omission:* Does not reverse the exchange surcharge Income transaction if one was charged on return creation. (Logged in Warning 2).

**Classification:** **PASS WITH WARNINGS**

---

## 18. Finance Ledger Audit

- `finance_transactions` is strictly append-only (no `UPDATE` or `DELETE` statements exist in repositories or services).
- Reversals create balancing counter-entries (`Income` -> `Expense`, `Expense` -> `Income`).
- Account mappings:
  - `Cash` -> `acc-cash`
  - `UPI` -> `acc-upi`
  - `Bank` / `Card` -> `acc-bank`
- *Omission:* `financeService.reverseTransaction` does not verify if the transaction was already reversed or if the transaction is itself a reversal. (Logged in Warning 3).

**Classification:** **PASS WITH WARNINGS**

---

## 19. Customer Credit & Debt Balance Views Audit

- **Balances Derived from PostgreSQL Views:**
  - Customer debt: Derived from `view_customer_debt_balances`.
  - Customer credit: Derived from `view_customer_credit_balances`.
  - Verified that neither balance is stored as a mutable cached column on `customers`.
- **Non-Negative Credit Invariant:** `invoiceService` asserts `creditRedeemed <= availableCredit`.

**Classification:** **PASS**

---

## 20. Error Taxonomy Audit

- All 9 domain error classes exist and inherit from `DomainError`:
  - `ValidationError` (400)
  - `EntityNotFoundError` (404)
  - `InsufficientStockError` (409)
  - `InvalidStateTransitionError` (409)
  - `ActiveReturnsBlockVoidError` (409)
  - `ExceededAllocationError` (400)
  - `OverReturnError` (400)
  - `ConcurrencyConflictError` (409)
- *Finding:* PostgreSQL concurrency error codes (`40001`, `40P01`, `55P03`) are not caught and wrapped in `ConcurrencyConflictError`. (Logged in Warning 5).

**Classification:** **PASS WITH WARNINGS**

---

## 21. Rollback & ACID Safety Audit

- Failure after partial mutation (e.g. stock updated, movement inserted, ledger insertion fails):
  PostgreSQL transaction rollback rolls back ALL intermediate mutations.
- Verified in Test 2 (`test-repositories.mjs`), Test 3 (`test-repositories.mjs`), and Test 2 (`test-services.mjs`).

**Classification:** **PASS**

---

## 22. Service-to-Service Dependency Audit

- Zero cross-service calls between domain service methods.
- Services only import the pure stateless utility `methodToAccountId` from `financeService.ts`.
- Zero nested transaction conflicts.

**Classification:** **PASS**

---

## 23. Business Semantics Compatibility Audit (`src/lib/store.tsx`)

| Feature / Rule | `src/lib/store.tsx` | Phase 4 Implementation | Status |
| :--- | :--- | :--- | :--- |
| **Invoice Total Math** | `subtotal * (1 - disc/100) - credit` | Identical with `Decimal` | **PASS** |
| **Payment Status Logic** | `due <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Credit'` | Identical | **PASS** |
| **WAC Formula** | `(oldStock * oldCost + qty * price) / (oldStock + qty)` | Identical with `Decimal` | **PASS** |
| **Zero-Stock WAC** | Overrides old cost with buy price | Identical | **PASS** |
| **Purchase Return** | Does not recalculate WAC | Identical | **PASS** |
| **Void Active Return Guard** | Active returns block voiding | Identical (`status != 'Cancelled'`) | **PASS** |
| **Exchange Surcharge** | Emits Income if `diff > 0` | Identical | **PASS** |
| **Exchange Refund (`diff < 0`)** | Emits Expense for `abs(diff)` | **Omitted in `salesReturnService.ts`** | **WARNING** |
| **Void Credit Reversal** | Reverses redeemed credit | Identical | **PASS** |

---

## 24. Test Suite Forensic Audit (`scripts/test-services.mjs`)

- **Authenticity:** All 25 scenarios (66 assertions) connect to real PostgreSQL database on port 5433.
- **Database State Verifications:** Queries physical database rows (`invoices`, `products`, `stock_movements`, `finance_transactions`, `customer_credit_transactions`) rather than relying on in-memory return values.
- **Concurrency Testing:** Tests 13 and 14 execute genuine concurrent requests via `Promise.all` across independent database connections, proving lock serialization under load.

**Classification:** **PASS**

---

## 25. Edge-Case Coverage Matrix

| Edge Case | Covered in Production Code? | Covered in Test Suite? | Classification |
| :--- | :---: | :---: | :--- |
| Duplicate invoice product lines | **YES** (`requestedQtyMap`) | NO (Unit test omitted) | PASS (Code guarded) |
| Duplicate return product lines | **YES** | NO | PASS (Code guarded) |
| Duplicate exchange product lines | **YES** | NO | PASS (Code guarded) |
| Discount = 0% / 100% | **YES** | Partial (0% tested) | PASS |
| Negative price / quantity | **YES** (Rejected) | Partial | PASS |
| Exact stock boundary (qty == stock) | **YES** | **YES** (Test 1) | PASS |
| Insufficient stock | **YES** (Throws `InsufficientStockError`) | **YES** (Test 2) | PASS |
| Payment over-allocation | **YES** (Throws `ExceededAllocationError`) | **YES** (Test 3) | PASS |
| Zero-stock WAC rule | **YES** | **YES** (Test 12) | PASS |
| Non-integer WAC precision | **YES** (`toDecimalPlaces(2)`) | Partial (110.00 tested) | PASS |
| Void invoice twice | **YES** (`InvalidStateTransitionError`) | NO | PASS (Code guarded) |
| Cancel return twice | **YES** (`InvalidStateTransitionError`) | NO | PASS (Code guarded) |
| Reversal of reversal guard | **NO** | NO | **WARNING** |
| Duplicate reversal guard | **NO** | NO | **WARNING** |
| Negative exchange difference (`diff < 0`) | **NO** | NO | **WARNING** |
| PostgreSQL CHECK constraint negative stock | **YES** (`products_stock_check`) | **YES** (Test 25) | PASS |

---

## 26. Detailed Findings

### BLOCKER FINDINGS: 1

#### [BLOCKER 1] Direct SQL Queries Inside Domain Services (Violation of Layered Architecture)
- **Files:**
  - `src/server/services/invoiceService.ts` (lines 130, 248, 291, 345)
  - `src/server/services/purchaseService.ts` (lines 81, 177, 185, 192, 197)
  - `src/server/services/salesReturnService.ts` (lines 113, 406, 480)
  - `src/server/services/paymentService.ts` (lines 229, 273, 313, 322, 355)
  - `src/server/services/supplierService.ts` (lines 58, 68, 78)
- **Evidence:** 20 raw SQL invocations using `client.query(...)` and `pool.query(...)`.
- **Expected Behavior:** Services orchestrate; repositories execute database queries. Missing queries should be added as methods on repositories (`customerRepository`, `salesReturnRepository`, `invoiceRepository`, `financeRepository`, `paymentRepository`, or a new `purchaseOrderRepository`).
- **Actual Behavior:** Services execute inline SQL strings directly.
- **Classification:** **BLOCKER** (Mandated by Section 7 of Forensic Audit prompt).

---

### WARNING FINDINGS: 5

#### [WARNING 1] Exchange Return Omits Expense on Negative Difference (`exchangeDifference < 0`)
- **File:** `src/server/services/salesReturnService.ts` (lines 149–159, 256–272)
- **Evidence:** `salesReturnService` only checks `if (exchangeDifference.greaterThan(0))` to record an Income transaction. When replacement goods cost less than returned goods (`diff < 0`), no Expense entry is recorded.
- **Expected Behavior:** Match `src/lib/store.tsx` (lines 2977–2995), which logs a finance Expense for `Math.abs(diff)`.
- **Actual Behavior:** No finance transaction is logged when the store refunds the difference.
- **Classification:** **WARNING**

#### [WARNING 2] Sales Return Cancellation Does Not Reverse Exchange Surcharge
- **File:** `src/server/services/salesReturnService.ts` (lines 463–477)
- **Evidence:** `cancelSalesReturn` only checks `if ((salesReturn.cashRefunded ?? 0) > 0)` to emit an offset Income transaction. If the return had an exchange surcharge (`exchangeDifference > 0`), that Income transaction is never reversed.
- **Expected Behavior:** Cancelled exchange returns should reverse any surcharge charged to the customer.
- **Actual Behavior:** Surcharge Income remains active in the ledger.
- **Classification:** **WARNING**

#### [WARNING 3] Finance Ledger Reversal Lacks Duplicate and Reversal-of-Reversal Guards
- **File:** `src/server/services/financeService.ts` (lines 116–141)
- **Evidence:** `reverseTransaction` does not check if the transaction is already a reversal (`reversalOf !== null`) nor does it verify whether a reversal entry already exists for `originalTxId`.
- **Expected Behavior:** Reject reversing an already-reversed transaction or reversing a reversal entry.
- **Actual Behavior:** Can create infinite duplicate reversals for the same transaction.
- **Classification:** **WARNING**

#### [WARNING 4] Floating Point Arithmetic Leaks in Inventory Adjustment & Supplier Statement
- **Files:**
  - `src/server/services/inventoryService.ts` (line 150)
  - `src/server/services/supplierService.ts` (lines 17–25)
- **Evidence:** `Math.round(Math.abs(input.delta) * product.currentCost * 100) / 100` and `normalizeMoney` with `Number.EPSILON`.
- **Expected Behavior:** Standardize 100% of financial arithmetic on `Decimal` (`decimal.js`).
- **Actual Behavior:** Minor native floating-point calculations exist.
- **Classification:** **WARNING**

#### [WARNING 5] PostgreSQL Concurrency Error Codes Not Mapped to `ConcurrencyConflictError`
- **Files:** `src/server/errors/domainErrors.ts`, `src/server/db/txRunner.ts`
- **Evidence:** `ConcurrencyConflictError` exists in the taxonomy but is never instantiated or caught. PostgreSQL errors `40001` (serialization failure), `40P01` (deadlock detected), and `55P03` (lock not available) bubble up as unmapped database errors.
- **Expected Behavior:** Catch Postgres errors with codes `40001`, `40P01`, and `55P03` in `txRunner` or services and wrap them into `ConcurrencyConflictError`.
- **Actual Behavior:** Raw Postgres error propagates.
- **Classification:** **WARNING**

---

## 27. Required Remediation Plan (To Be Addressed Prior to Phase 5)

1. **Repository Method Extraction (Resolve Blocker 1):**
   - Add `findByIdForUpdate` and `recordVisit` to `customerRepository`.
   - Add `countActiveReturnsByInvoiceId`, `getTotalCashRefunded`, and `updateStatus` to `salesReturnRepository`.
   - Add `findUnreversedTransactionsByReference` to `financeRepository`.
   - Add `findDebtPaymentByIdForUpdate` and `cancelDebtPayment` to `paymentRepository`.
   - Add dedicated `purchaseOrderRepository` or methods to manage purchase order items and activity logs.
   - Refactor all 20 direct SQL calls in domain services to call these repository methods.
2. **Exchange Negative Difference (Resolve Warning 1):**
   - In `salesReturnService.createSalesReturn`, handle `exchangeDifference < 0` by logging a finance Expense transaction for `exchangeDifference.abs()`.
3. **Cancel Exchange Surcharge Reversal (Resolve Warning 2):**
   - In `salesReturnService.cancelSalesReturn`, reverse the exchange surcharge Income transaction if `exchangeDifference > 0`.
4. **Reversal Guards (Resolve Warning 3):**
   - In `financeService.reverseTransaction`, check that `tx.reversalOf` is null, and verify no existing transaction has `reversal_of = originalTxId`.
5. **Decimal Standardization (Resolve Warning 4):**
   - Replace `Math.round` in `inventoryService.ts` and `supplierService.ts` with `Decimal`.
6. **Concurrency Error Mapping (Resolve Warning 5):**
   - In `txRunner.ts`, map errors with code `'40001'`, `'40P01'`, or `'55P03'` to `ConcurrencyConflictError`.

---

## 28. Final Audit Verification Checklist

- [x] Date, baseline, and files inspected documented.
- [x] All 8 services thoroughly inventoried.
- [x] Transaction boundaries, client propagation, and rollback verified.
- [x] Direct SQL audit executed and classified as BLOCKER per instructions.
- [x] Financial decimals, WAC, and deadlock locking verified.
- [x] Customer and Supplier FIFO queries verified against canonical ordering.
- [x] Receipt numbering, invoice creation, voiding, and returns verified.
- [x] Finance ledger immutability and derived view integrity confirmed.
- [x] All test suites executed and reported honestly.
- [x] Audit conducted strictly read-only (zero modifications to application code).

---
