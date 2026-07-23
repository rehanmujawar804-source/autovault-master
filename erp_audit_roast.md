# AutoVault — Senior ERP Architect Audit
### Anti-Gravity Roast Mode | 25-Year Veteran Assessment

> *"Compilation means nothing. Production readiness is everything."*

---

## Verdict Summary

This is not an ERP. This is a **localStorage-backed POS prototype with aspirational labels.**

It is aesthetically impressive and structurally coherent for a solo build. But if you sold this commercially tomorrow, you would face data loss lawsuits within 6 months. The authentication is bypassable in 10 seconds. The financial data lives in a single browser tab. The accounting has at least 5 categories of incorrect calculations.

Let me show you exactly why, section by section.

---

## CATEGORY 1 — SECURITY: CATASTROPHIC

### DEFECT 1-A: Plaintext Hardcoded Credentials in Source Code

**File:** [`login/page.tsx`](file:///d:/AUTOVAULT/autovault-master/src/app/login/page.tsx#L16-L24)

```js
if (email === "owner@autovault.com" && password === "owner123") {
  localStorage.setItem("role", "owner");
```

This is a **zero-day on day one.** The password is in plain text, in source code, shipped to the browser. Anyone who:
- Opens browser DevTools → Sources tab
- Views the bundled JavaScript in the `.next` directory
- Gets access to the GitHub repository
- Has 10 minutes with an unattended browser

...is now the owner. In a real commercial ERP, credentials are hashed server-side (bcrypt, Argon2), validated via API, and stored as a session token in an HttpOnly cookie. There is no password in client code. Ever.

**Severity: SHIP-STOPPER**

---

### DEFECT 1-B: Role Authentication is Completely Bypassable

**File:** [`hooks/useRole.ts`](file:///d:/AUTOVAULT/autovault-master/src/hooks/useRole.ts#L19-L22)

The authentication system is `localStorage.getItem("role")`. Open DevTools Console, type:
```js
localStorage.setItem("role", "owner")
```
Refresh. You are now the owner. No password required. No server challenge. Nothing.

Every single "Owner Only" gate in the entire application is defeated by a 47-character JavaScript command. Any staff member can see cost prices, analytics, settings, supplier purchase costs, and every financial metric.

**Severity: SHIP-STOPPER**

---

### DEFECT 1-C: isProcurementAllowed() Guards Are Theater

**File:** [`store.tsx`](file:///d:/AUTOVAULT/autovault-master/src/lib/store.tsx#L2132-L2140)

```js
function isProcurementAllowed(): boolean {
  const role = localStorage.getItem("role");
  if (role !== "owner") { return false; }
  return true;
}
```

This guards helper functions like `addSupplier`, `addPurchase`, etc. But `dispatch` itself is exposed directly on the context (`dispatch` in `StoreContextValue`). Any component that calls `useStore()` can call:
```js
dispatch({ type: "ADD_SUPPLIER", supplier: { ... } });
```
...and bypass `isProcurementAllowed` entirely. The guard doesn't exist at the reducer level. It's only in the helper layer. The reducer is wide open.

**Severity: CRITICAL**

---

### DEFECT 1-D: requireOwner() Has a Render Flash Vulnerability

**File:** [`hooks/useRole.ts`](file:///d:/AUTOVAULT/autovault-master/src/hooks/useRole.ts#L36-L39), [`analytics/page.tsx`](file:///d:/AUTOVAULT/autovault-master/src/app/analytics/page.tsx#L72-L74)

```js
useEffect(() => {
  if (!loading && !isOwner) router.push("/dashboard");
}, [loading, isOwner, router]);
```

`useEffect` runs AFTER the render. On the first render, a staff user sees the analytics page in full — all financial data — before the redirect fires. This is a known Next.js vulnerability. Sensitive content must be guarded at the server level, not in a client `useEffect`.

**Severity: HIGH**

---

## CATEGORY 2 — DATA ARCHITECTURE: FATAL FOR PRODUCTION

### DEFECT 2-A: localStorage is Not a Database

This is the single most important architectural flaw in the system. All business data — every invoice, customer, purchase, payment, return — lives in ONE browser's localStorage.

**Consequences:**
| Scenario | Result |
|---|---|
| User clears browser cache | **ALL DATA LOST PERMANENTLY** |
| Laptop dies / stolen | **ALL DATA LOST PERMANENTLY** |
| Owner uses phone, staff uses PC | **Completely different data on each device** |
| Browser storage limit hit (5-10MB) | **Writes silently fail, data truncated** |
| Two staff at two PCs billing simultaneously | **Both see stale data, last-write wins** |

The store already serializes `100KB` of JSON on every state change (line 1903). At 500 invoices, you're at 500KB. At 5000 invoices with items and purchase history, you will hit the 5MB localStorage limit. At that point, line 1905 (`} catch { // storage full or unavailable — silently ignore }`) will silently stop persisting data. The user will see no error. They will lose every transaction after that point.

This is not a fixable refactor. This requires a complete backend build.

**Severity: SHIP-STOPPER for commercial sale**

---

### DEFECT 2-B: Export Backup is Incomplete — salesReturns Data is Lost

**File:** [`store.tsx`](file:///d:/AUTOVAULT/autovault-master/src/lib/store.tsx#L2003-L2037)

The `exportStoreAsJSON` function exports:
```js
const backupData = {
  products, customers, invoices, debtPayments,
  suppliers, purchases, stockMovements, supplierPayments,
  financeAccounts, financeTransactions, holdBills, holdBillsCounter, settings
};
```

**Missing from export:**
- `salesReturns` ❌
- `salesReturnCounter` ❌
- `purchaseReturns` ❌
- `purchaseOrders` ❌
- `purchaseOrderCounter` ❌

If a business exports their data for backup and then re-imports it (or migrates), every sales return, purchase return, and purchase order is permanently destroyed. The customer outstanding balances will also be wrong after import (because `getInvoiceOutstanding` reads from `salesReturns`). This is a **data integrity bomb** disguised as a feature.

**Severity: CRITICAL**

---

### DEFECT 2-C: Invoice Number Generation is Wrong

**File:** [`store.tsx`](file:///d:/AUTOVAULT/autovault-master/src/lib/store.tsx#L2123-L2127)

```js
function getNextInvoiceNumber() {
  const year = new Date().getFullYear();
  const count = state.invoices.length + 1;
  return `INV-${year}-${String(count).padStart(4, "0")}`;
}
```

This is not sequential invoice numbering. This is an approximation that breaks under normal usage:

- You have 10 invoices. State: `length = 10`. Next number: `INV-2026-0011`. ✓
- You void 3 invoices. Voided invoices REMAIN in `state.invoices` (correct for audit). Length is still 10.
- You create a new invoice. Next number: `INV-2026-0011`. ✓ (still works by accident)
- You import data with pre-existing invoices in a different year range.
- Year changes from 2026 to 2027. First invoice of 2027: `INV-2027-0011` — the counter resets to length not 1.
- Multiple users in multi-device scenario (if ever implemented): two invoices get the SAME number.

Real ERP uses an atomic, server-side auto-increment counter that never resets, never has gaps, and never duplicates.

**Severity: HIGH**

---

### DEFECT 2-D: Customer.debt is a Stale Denormalized Cache

**File:** [`types/index.ts`](file:///d:/AUTOVAULT/autovault-master/src/types/index.ts#L216-L217)

```ts
debt: number;      // Derived cache — sum of open invoice dues
```

The comment admits it's a cache. The `RECONCILE_DEBT_CACHE` action exists precisely because this cache gets out of sync. There are now THREE sources of truth for how much a customer owes:
1. `customer.debt` (stale cache)
2. Sum of `invoice.dueAmount` for customer's invoices
3. `getInvoiceOutstanding(inv)` which further subtracts active sales returns

Different parts of the codebase use different sources. The `dashboard/page.tsx` line 327 uses `state.customers.filter((c) => c.debt > 0).length` to show the debt account count, but then uses `getInvoiceOutstanding` for the actual debt amounts. The count and the amounts come from different sources.

**Severity: MEDIUM-HIGH** (accounting inconsistency, not data loss)

---

## CATEGORY 3 — ACCOUNTING: INCORRECT IN PRODUCTION

### DEFECT 3-A: Revenue Does Not Subtract Sales Returns

**File:** [`store.tsx`](file:///d:/AUTOVAULT/autovault-master/src/lib/store.tsx#L2089-L2091)

```js
function getTotalRevenue() {
  return state.invoices.filter((inv) => !inv.voided)
    .reduce((sum, inv) => sum + inv.amountPaid, 0);
}
```

When a customer returns ₹500 worth of goods, the finance ledger gets a `Sales Return` Expense entry. But `getTotalRevenue()` never reads the finance ledger. Revenue stays inflated.

**Scenario:**
- Invoice: ₹2000, Paid: ₹2000
- Sales Return: ₹500 Cash Refund

Expected Revenue: ₹1500  
Displayed Revenue: ₹2000 ❌

The Finance Ledger contains the correct data. The revenue selector ignores it. Every revenue figure shown on the Dashboard and Analytics page is **overstated by the sum of all cash/UPI/bank refunds.**

**Severity: CRITICAL — Misleading financial reporting**

---

### DEFECT 3-B: Profit Uses Current Cost, Not Historical COGS

**File:** [`store.tsx`](file:///d:/AUTOVAULT/autovault-master/src/lib/store.tsx#L2093-L2102)

```js
function getTotalProfit() {
  return state.invoices.filter((inv) => !inv.voided).reduce((sum, inv) => {
    const profit = inv.items.reduce((iSum, item) => {
      const product = state.products.find((p) => p.id === item.productId);
      const currentCost = product?.currentCost ?? 0;
      return iSum + (item.price - currentCost) * item.quantity;
    }, 0);
    return sum + profit;
  }, 0);
}
```

`product.currentCost` is updated on every purchase (`currentCost: purchase.buyPrice` in `ADD_PURCHASE`). So profit for historical invoices is calculated using TODAY's cost price, not the cost at time of sale.

**Scenario:**
- January: Buy Oil Filter at ₹100. Sell at ₹150. Real Profit = ₹50.
- March: Buy same Oil Filter at ₹120 (price increase).
- When you look at January's invoice profit now: `150 - 120 = ₹30`. ❌

Every invoice before a cost price change shows wrong profit. Lifetime profit is wrong. Margin % is wrong. This violates the fundamental accounting principle of **historical cost**.

**Severity: CRITICAL — All profit data is incorrect**

---

### DEFECT 3-C: RECORD_DEBT_PAYMENT Mutates Invoice and Creates Double-Subtraction

**File:** [`store.tsx`](file:///d:/AUTOVAULT/autovault-master/src/lib/store.tsx#L592-L668)

The reducer does two things that conflict:

1. It calls `calcInvoiceDue(inv, state.debtPayments, state.salesReturns)` which SUBTRACTS sales returns from `inv.dueAmount` to get the effective cap.
2. It then DIRECTLY reduces `inv.dueAmount`: `const newDueAmount = Math.max(0, inv.dueAmount - actualAmount)`

After a payment, the raw `invoice.dueAmount` is now permanently smaller. Later, when `getInvoiceOutstanding(invoice)` is called, it AGAIN subtracts the sales returns from this already-reduced `dueAmount`.

**Scenario:**
- Invoice total: ₹1000, dueAmount: ₹1000 (credit sale)
- Sales Return: ₹200 adjustment → `getInvoiceOutstanding` returns ₹800
- Customer pays ₹400 → reducer caps to ₹800, actualAmount = ₹400. New `invoice.dueAmount = 1000 - 400 = 600`
- Now `getInvoiceOutstanding` = `600 - 200 (return) = 400` ✓ OK so far
- Customer pays remaining ₹400 → `calcInvoiceDue` returns `600 - 200 = 400`, OK. New `dueAmount = 600 - 400 = 200`
- Now `getInvoiceOutstanding` = `200 - 200 = 0` ✓ OK

Actually this works in the basic case. But the problem emerges with the `VOID_DEBT_PAYMENT` case, which reconstructs `newDueAmount` as `invoice.total - newAmountPaid` (line 711), ignoring sales returns. If a return was made and then a payment voided, the reconstructed dueAmount will be HIGHER than it should be (ignoring the return's effect), then getInvoiceOutstanding will subtract the return again, potentially showing negative outstanding.

**Severity: HIGH — Edge case accounting corruption**

---

### DEFECT 3-D: "Exchange" Refund Method is Wrongly Classified as Cash Expense

**File:** [`store.tsx`](file:///d:/AUTOVAULT/autovault-master/src/lib/store.tsx#L220-L228)

```js
function refundMethodToAccountId(method: string): string {
  case "Exchange": return "acc-cash";
}
```

When a return is processed as "Exchange" (customer gets a replacement product), the system creates a finance **Expense** entry hitting the Cash account. But no cash leaves the business in an exchange. The customer returns product A and receives product B. This is an inventory swap, not a cash outflow.

Additionally, the replacement product's inventory is never recorded as leaving stock. The returned item enters stock. No item is marked as going out to the customer as replacement. An exchange in this system silently:
- Increases stock (return) ✓
- Creates a fake cash expense ❌
- Never decreases stock for the replacement item ❌

**Severity: HIGH — Incorrect accounting + incomplete inventory**

---

### DEFECT 3-E: GST is Completely Missing from Invoice Calculations

**File:** [`types/index.ts`](file:///d:/AUTOVAULT/autovault-master/src/types/index.ts#L31-L32)

```ts
hsn?: string;
gst?: number;
```

The Product type has GST and HSN fields. They are never used in any invoice calculation. The Billing page, the Invoice type, the totals, the PrintableInvoice — none of them calculate or display GST.

For a commercial ERP sold in India to GST-registered businesses:
- All B2B sales require tax invoices with CGST/SGST/IGST
- GSTR-1 filing requires HSN-wise reporting
- Missing input credit means businesses overpay taxes
- The GST department can issue notices for non-compliant invoices

Selling this to an Indian business as an ERP without GST compliance is not a product gap — it is a **legal liability**.

**Severity: SHIP-STOPPER for Indian commercial sale**

---

## CATEGORY 4 — BUSINESS LOGIC: BROKEN SCENARIOS

### DEFECT 4-A: Void Invoice + Sales Return = Stock Corruption

**File:** [`store.tsx`](file:///d:/AUTOVAULT/autovault-master/src/lib/store.tsx#L796-L820)

When an invoice is voided, stock is restored unconditionally:
```js
return { ...p, stock: p.stock + item.quantity };
```

But if a Sales Return was already processed for that invoice (e.g., customer returned 1 of 2 oil filters), voiding the invoice restores the FULL original quantity (2), not the unreturned quantity (1). The returned oil filter is now counted twice in stock.

**Scenario:**
1. Sell: Oil Filter ×2 → stock -2
2. Return: Oil Filter ×1 → stock +1
3. Void Invoice: Oil Filter +2 → stock +2
4. **Net change: stock +1** instead of 0. You have a ghost unit.

Additionally, `CANCEL_SALES_RETURN` does not check if the invoice is voided. Cancelling a return on a voided invoice will DECREASE stock (restoring the return), even though voiding already restored it. Double deduction.

**Severity: CRITICAL — Inventory integrity failure**

---

### DEFECT 4-B: Walk-in Customer Debt is Untrackable and Lost

**File:** [`types/index.ts`](file:///d:/AUTOVAULT/autovault-master/src/types/index.ts#L181)

```ts
customerId: string | null; // null = walk-in
```

Walk-in customers with `paymentMethod: "Credit"` create invoices with `dueAmount > 0` and `customerId: null`. These are:
- Never associated with a Customer record
- Not visible in the Customers page
- Not counted in total outstanding debt properly (`getTotalOutstandingDebt` iterates `state.invoices` and includes these, but the dashboard "X accounts" counter uses `state.customers.filter(c => c.debt > 0)` which misses walk-ins)
- Uncollectable — no name, no phone, no way to follow up

In a real shop, walk-in credit sales are rare precisely because they can't be recovered. The system should block walk-in credit sales or require at least a phone number.

**Severity: MEDIUM**

---

### DEFECT 4-C: Deletable Completed Purchase Orders

**File:** [`store.tsx`](file:///d:/AUTOVAULT/autovault-master/src/lib/store.tsx#L1320-L1325)

```js
case "DELETE_PURCHASE_ORDER": {
  return {
    ...state,
    purchaseOrders: (state.purchaseOrders || []).filter((po) => po.id !== action.poId),
  };
}
```

No status guard. You can delete a "Completed" PO that has deliveries recorded against it. The purchases remain (linked via `purchaseOrderId`), but the PO is gone. You now have purchases with `purchaseOrderId` pointing to a non-existent PO. Every report that joins purchases to POs will have orphaned records.

In real ERP: completed documents are immutable. You can only archive them.

**Severity: MEDIUM**

---

### DEFECT 4-D: addPurchaseBatch Calls addPurchase N Times, Each With Auth Check

**File:** [`store.tsx`](file:///d:/AUTOVAULT/autovault-master/src/lib/store.tsx#L2238-L2260)

`addPurchaseBatch` internally calls `addPurchase()` for each item. Each call:
1. Checks `isProcurementAllowed()` → reads `localStorage` again
2. Calls `dispatch()` with `ADD_PURCHASE`

For a 10-item batch invoice, this dispatches 10 separate state updates. Each dispatch triggers a React re-render, a `useEffect` persistence run, and a 100KB localStorage.setItem. For a 10-item batch, you're doing **10 full state serializations** when 1 would suffice.

This also means the PO is updated 10 times (once per item's delivery), each time creating a new activity log entry. A 10-item delivery creates 10+ activity log entries instead of 1.

**Severity: MEDIUM-HIGH (performance + UX degradation)**

---

## CATEGORY 5 — PERFORMANCE: WILL COLLAPSE AT SCALE

### DEFECT 5-A: O(n×m) Operations in Reducers

Every time `ADD_INVOICE`, `VOID_INVOICE`, or `ADD_SALES_RETURN` fires, the reducer does:
```js
state.invoices.map(inv => {
  state.salesReturns.filter(r => r.invoiceId === inv.id)  // O(n×m)
    .reduce(...)
})
```

At 5,000 invoices and 500 returns, this is 2.5 million operations — **per dispatch.** Every billing action triggers this for customer debt recalculation. The UI will stutter visibly at 1,000 invoices.

### DEFECT 5-B: useMemo Dependencies are Incomplete — Stale Dashboard

**File:** [`dashboard/page.tsx`](file:///d:/AUTOVAULT/autovault-master/src/app/dashboard/page.tsx#L154)

```js
}, [state.invoices, state.customers, state.products, today]);
```

`state.salesReturns` is NOT in the dependency array. The `highDebtCustomers` calculation uses `getInvoiceOutstanding` which reads `state.salesReturns`. When a new return is recorded, the dashboard will NOT recompute. It will show stale outstanding debt values until some OTHER state changes.

### DEFECT 5-C: No Pagination Anywhere

All invoices, all customers, all products, all purchases render in full. 10,000 invoices = 10,000 DOM nodes. This will freeze the browser. Real ERPs paginate, virtualize, or lazy-load.

### DEFECT 5-D: Full State Serialization on Every Keystroke

**File:** [`store.tsx`](file:///d:/AUTOVAULT/autovault-master/src/lib/store.tsx#L1898-L1908)

The persistence `useEffect` runs whenever `state` changes. State changes on every React dispatch. When you type in the billing search box, if that typing modifies any store state, you get a full `JSON.stringify(entireStore)` + `localStorage.setItem` on every character typed. This is not hypothetical — `CREATE_HOLD_BILL` and `UPDATE_HOLD_BILL` are dispatched from the billing page during normal usage.

---

## CATEGORY 6 — MISSING ENTERPRISE REQUIREMENTS

These are not bugs. These are the gaps between "prototype" and "commercial ERP":

| Feature | Status | Enterprise Requirement |
|---|---|---|
| GST Invoice Calculation | ❌ Missing | Mandatory for India |
| GSTR-1 / GSTR-3B Export | ❌ Missing | Legally required for GST registered |
| Server-side Database | ❌ Missing | Multi-device, multi-user, backup |
| Real Authentication | ❌ Missing | JWT/session, server-validated |
| Role-Based Access Control | ❌ Faked | Server-enforced, not localStorage |
| Audit Log for all mutations | ❌ Partial | Required for financial compliance |
| P&L Statement | ❌ Missing | Basic financial reporting |
| Balance Sheet | ❌ Missing | Basic financial reporting |
| Cash Flow Statement | ❌ Missing | Basic financial reporting |
| Multi-user concurrency | ❌ Missing | Multi-device/staff usage |
| Credit Limit Enforcement | ❌ Missing | Bad debt prevention |
| FIFO/Weighted-Avg COGS | ❌ Missing | Accurate profit calculation |
| Automated Backup | ❌ Missing | Data safety |
| Invoice Email/WhatsApp | ❌ Missing (partial) | Customer delivery |
| Product Lot/Batch Tracking | ❌ Missing | Defect tracing |
| Price History | ❌ Missing | Historical COGS accuracy |
| User Management | ❌ Missing | Real multi-staff |
| Return Policy Enforcement | ❌ Missing | e.g., 30-day return window |

---

## WHAT IS ACTUALLY GOOD

In fairness, before you throw your laptop:

✅ **The reducer pattern is clean and append-only** — Finance ledger never deletes, only appends reversals. This is correct.

✅ **`getInvoiceOutstanding` is architecturally sound** — Computing outstanding dynamically from `salesReturns` rather than mutating `invoice.dueAmount` is the right design.

✅ **The migration system is real** — Idempotent, versioned, one-time run. Most solo builds don't have this.

✅ **SalesReturn at the item level is correct** — Partial item-level returns with quantity tracking is how it should work.

✅ **Stock movement ledger is append-only** — Every delta is recorded. Inventory history is traceable.

✅ **The UI is genuinely excellent** — Better than most commercial ERPs in visual quality.

✅ **TypeScript is used seriously** — Type coverage is good. The type system reflects real domain concepts.

✅ **`roundMoney` is used consistently** — Float arithmetic is handled correctly throughout.

---

## PRIORITY REMEDIATION ROADMAP

### P0 — Fix Before Any Commercial Deployment

1. **Replace localStorage with a real backend** (Supabase, Firebase, Postgres + API)
2. **Replace localStorage auth with JWT/session-based auth** (NextAuth, Supabase Auth)
3. **Add GST calculation engine** to billing and invoicing
4. **Fix `exportStoreAsJSON`** to include all collections
5. **Fix `getTotalRevenue`** to subtract sales return refunds

### P1 — Fix Before Beta Customers

6. **Fix `getTotalProfit`** to use COGS at time of sale (snapshot in InvoiceItem)
7. **Fix Void Invoice + Sales Return stock interaction** (check and subtract already-returned quantities)
8. **Fix Invoice Number Generation** (use a dedicated atomic counter, not array length)
9. **Add pagination** to Invoices, Customers, Products pages
10. **Fix useMemo dependency arrays** (add `state.salesReturns`)

### P2 — Required for V1 Commercial Release

11. **Remove `dispatch` from context** (or make it protected) — force all mutations through type-safe helpers
12. **Add P&L, Balance Sheet reports**
13. **Add server-side role enforcement**
14. **Add credit limit management**
15. **Implement FIFO COGS tracking** (snapshot `item.cost` at billing time)

---

## Final Verdict

**Commercial readiness: 2/10**

This is a 8/10 prototype that thinks it's a 10/10 product. The frontend quality is real. The business logic intuitions are mostly right. The architecture intentions are sound.

But there is no database. There is no real authentication. The accounting has silent errors. The inventory has ghost-unit bugs. The backup loses critical data.

If you sell this today to a business that runs 6 months of operations on it, and then their browser auto-clears cache in a routine update, you will receive a call about **years of invoices, customers, and payment records gone forever.** That is not a bug. That is an architectural failure.

Fix the foundation before decorating the walls further.
