# Mistakes — 7 Star Car Accessories

Known fragile areas, pitfalls, and lessons learned. Use this to avoid repeating them.

---

## 1. Debt Calculation Can Drift (HIGH RISK)

**Issue:** If the logic in `RECORD_DEBT_PAYMENT` breaks, or if customer.debt is modified outside the reducer, debt calculations become unreliable.

**Symptoms:**
- Customer.debt doesn't match sum of their invoice.dueAmounts
- getTotalOutstandingDebt() doesn't match the sum of all customer debts
- Analytics show wrong debt numbers

**Root cause:**
- customer.debt is a cache, but it's mutable; if modified outside of RECORD_DEBT_PAYMENT, it drifts
- calcInvoiceDue() logic must match invoice.dueAmount tracking

**Prevention:**
- ✅ Only modify customer.debt inside RECORD_DEBT_PAYMENT reducer
- ✅ Never update customer.debt directly in a page component
- ✅ Use getTotalOutstandingDebt() (which sums invoice.dueAmounts) to verify customer.debt cache
- ✅ Add a periodic audit check: sum(customers.debt) === getTotalOutstandingDebt()

**Fix if it happens:**
```tsx
// Audit: do this in a utility function
const reportedDebt = store.getTotalOutstandingDebt();
const cachedDebt = store.state.customers.reduce((s, c) => s + c.debt, 0);
if (reportedDebt !== cachedDebt) {
  console.error("Debt drift detected!", { reportedDebt, cachedDebt });
  // Option 1: Recalculate all customer.debt from invoices
  // Option 2: Manual correction via store reset + reimport
}
```

**Current status:** ✅ FIXED — Added owner-only interactive System Diagnostics & Debt Audit utility to Settings page, with manual click-to-repair action that syncs cached debt with actual invoice dues.

---

## 2. Stock Consistency Can Break (HIGH RISK)

**Issue:** Product stock only decreases on ADD_INVOICE. If invoice creation is bypassed or stock is modified manually, inventory becomes unreliable.

**Symptoms:**
- Reported stock doesn't match physical inventory
- getLowStockProducts() returns wrong products
- Out-of-stock products still show as in-stock

**Root cause:**
- Stock is only reduced inside ADD_INVOICE reducer
- If invoices are added via another path, or if stock is modified outside reducer, consistency breaks
- No validation that stock >= 0 before invoice (overselling allowed)

**Prevention:**
- ✅ Always use addInvoice() helper, never dispatch ADD_INVOICE directly
- ✅ Never manually edit product.stock outside of reducer
- ✅ Add visual low-stock warnings during POS checkout
- ✅ Add a periodic physical inventory audit feature

**Fix if it happens:**
```tsx
// Manual reconciliation: update product stock to match physical count
updateProduct({ ...product, stock: physicalCount });
```

**Current status:** ⚠️ PARTIALLY ADDRESSED — Reducer is correct, but no API-level validation for overselling

---

## 3. Customer Uniqueness Depends on Phone (MEDIUM RISK)

**Issue:** Customers are identified by phone number. If two different people share a phone, they're treated as one customer. If phone is entered wrong, duplicate profiles are created.

**Symptoms:**
- Multiple people with same phone treated as one customer
- Typos in phone number create duplicate customer profiles
- Customer debt attributed to wrong person

**Root cause:**
- Phone matching logic in ADD_INVOICE assumes phone is unique and accurate
- No fuzzy matching or phone validation

**Prevention:**
- ✅ Use "existing customer" selection mode in POS (don't rely on auto-detection)
- ✅ Add phone validation (format check) when entering customer
- ✅ Warn operator if phone looks similar to existing customer (fuzzy match)
- ✅ Add manual customer merge feature if duplicates occur

**Fix if it happens:**
```tsx
// Manual merge: assign all invoices from duplicate to primary customer
const primaryCustomerId = "c-correct";
const duplicateId = "c-wrong";
const mergedInvoices = invoices.map(inv =>
  inv.customerId === duplicateId ? { ...inv, customerId: primaryCustomerId } : inv
);
// Then recalculate customer totals
```

**Current status:** ✅ FIXED — Phone collision modal implemented in billing/page.tsx (2026-06-25).
  - When operator enters a phone in "new" mode that matches an existing customer, invoice generation halts.
  - A confirmation modal shows the existing customer profile (name, phone, visits, outstanding debt).
  - "Use Existing Customer" canonicalizes to the DB record (id, name, phone) before creating the invoice.
  - "Go Back" closes the modal with no side effects — form stays editable, no customer created.
  - The old silent auto-merge path is removed entirely.

---

## 4. Discount Rounding Loses Cents (LOW RISK)

**Issue:** Discount calculated as `Math.round(subtotal * discount / 100)`. Over many invoices, rounding errors accumulate.

**Symptoms:**
- Long-term revenue reports are off by a few rupees
- Daily closing cash count doesn't match system

**Root cause:**
- Integer rounding loses fractional cents
- No rounding mode (banker's rounding, always up, etc.)

**Prevention:**
- ✅ Use fixed-point math or BigDecimal for currency (future improvement)
- ✅ Add periodic audit: total from invoices vs sum of amounts paid
- ✅ Log cumulative rounding error for reconciliation

**Current status:** ✅ FIXED — Centralized `roundMoney` helper exported from `lib/store.tsx` (2026-06-25).
  - `roundMoney = (n) => Math.round((n + Number.EPSILON) * 100) / 100` applied at final write boundary.
  - Applied in: billing subtotal, discountAmount, total, amountPaid, dueAmount (all cart totals).
  - Applied in: store.tsx ADD_INVOICE reducer (persisted fields rounded before write).
  - Applied in: RECORD_DEBT_PAYMENT, VOID_INVOICE, RECONCILE_DEBT_CACHE reducers.
  - Applied in: PrintableInvoice.tsx, invoices/[id]/page.tsx display, billing WA message builder.
  - No scatter of raw Math.round on persisted monetary fields remains.

---

## 5. localStorage Quota Limits (MEDIUM RISK)

**Issue:** Most browsers limit localStorage to ~5-10MB. Large shops with many invoices/customers may exceed quota.

**Symptoms:**
- App fails silently when localStorage quota exceeded
- New data doesn't persist
- Old data might be lost

**Root cause:**
- No migration or cleanup strategy
- No warning when approaching quota
- Large JSON serialization per state change

**Prevention:**
- ✅ Monitor localStorage usage: estimate MB = invoices.length * 500 bytes + customers * 200 bytes + products * 300 bytes
- ✅ Add warning when >80% quota used
- ✅ Implement archive/cleanup feature (export old invoices, delete from store)
- ✅ Add try/catch around localStorage.setItem to gracefully handle quota exceeded

**Fix if it happens:**
```tsx
// Emergency: export invoices to JSON, reset store, re-import recent ones
const exported = JSON.stringify(state);
// Download exported JSON to file
// Reset store via STORE_VERSION bump
// Re-import subset of data
```

**Current status:** ⚠️ UNRESOLVED — No quota monitoring or cleanup

---

## 6. Role Flash (FOUC) if Loading Guard Missed (MEDIUM RISK)

**Issue:** If a page renders before useRole() finishes loading, wrong content flashes (owner content shows to staff, etc.).

**Symptoms:**
- User sees brief flash of wrong content on page load
- Brief visibility of sensitive data (profit, buy prices)

**Root cause:**
- Page renders before localStorage role is loaded
- `loading` flag not checked before rendering role-dependent UI

**Prevention:**
- ✅ Always check `if (loading) return <Spinner />;` before using `role`
- ✅ Use useEffect + requireOwner() for owner-only pages
- ✅ Never render role-gated content before loading is complete

**Example (correct):**
```tsx
const { isOwner, loading } = useRole();
if (loading) return <Spinner />;
return isOwner ? <OwnerContent /> : <StaffContent />;
```

**Current status:** ✅ FIXED — All pages correctly guard with loading flag

---

## 7. Invoice Immutability Creates Correction Burden (MEDIUM RISK)

**Issue:** Once invoice is created, it cannot be edited. If operator makes a typo (qty, price, customer name), owner must manually correct.

**Symptoms:**
- Operator enters wrong quantity → invoice shows wrong total
- Operator enters wrong customer name → customer profile has wrong name
- Only workaround is "correction invoice" (debit/credit notes)

**Root cause:**
- Design decision to prevent accidental edits
- No "cancel + reissue" workflow

**Prevention:**
- ✅ Add validation before invoice creation (confirm totals, customer, qty)
- ✅ Implement soft-voiding capability to reverse an invoice safely
- ✅ Reconcile customer debt and visits cleanly on voiding

**Current status:** ✅ FIXED — Soft-voiding capability is fully implemented. Voiding an invoice restores product stock and reverses all financial, debt, and visit metrics from the customer profile.

---

## 8. Cross-Module Link Breaks (LOW RISK)

**Issue:** If a customer is deleted (not yet possible, but if added), invoices and repayments still reference the deleted customerId.

**Symptoms:**
- Invoice shows "Customer ID c-123" but no matching customer record
- Customer page can't load customer details
- Orphaned invoice data

**Root cause:**
- Foreign key integrity not enforced (localStorage-based, no relational DB)
- No cascade delete logic

**Prevention:**
- ✅ Never delete customer directly; use "inactive" flag instead
- ✅ When considering delete: check all invoices referencing that customer first
- ✅ Add validation: no delete if invoices exist

**Current status:** ⚠️ UNRESOLVED — Delete not yet implemented, but should have safeguards

---

## 9. No Audit Log / Change Tracking (MEDIUM RISK)

**Issue:** No record of who changed what, when. Staff could theoretically manipulate data if they accessed store directly.

**Symptoms:**
- Cannot trace who discounted an invoice
- Cannot identify when an error occurred
- No accountability for staff actions

**Root cause:**
- Single-device, trusted environment assumption
- No backend to log changes
- All state changes are local

**Prevention:**
- ✅ Add action logging layer (log every dispatch to a separate ledger)
- ✅ Add staff attribution to every action (who did it)
- ✅ Consider backend audit trail for future versions

**Current status:** ⚠️ UNRESOLVED — No audit log yet

---

## 10. No Data Backup / Recovery (HIGH RISK)

**Issue:** All data stored in browser localStorage. If browser data is cleared (app uninstall, hard reset, cache clear), entire database is lost. No backup mechanism.

**Symptoms:**
- User clears browser cache → all data gone
- Device breaks → all data lost
- No way to recover historical data

**Root cause:**
- Client-side only, no cloud backup
- No manual export/import feature

**Prevention:**
- ✅ Add "Export Data" feature (download JSON)
- ✅ Add "Import Data" feature (upload JSON)
- ✅ Create daily backup reminders
- ✅ Consider optional cloud sync (future backend)

**Current status:** ✅ FIXED — Data backup JSON export and import/restore are fully implemented on the Settings page.

---

## 11. Invoice Number Not Globally Unique (LOW RISK)

**Issue:** Invoice numbers generated as `INV-{YEAR}-{count}`. If localStorage is reset, count starts over, creating duplicate invoice numbers.

**Symptoms:**
- Two invoices with same number after store reset
- Duplicate invoice numbers in exported data

**Root cause:**
- Invoice count is not persisted; derived from invoices.length
- STORE_VERSION bump resets state

**Prevention:**
- ✅ Store last invoice number in state, increment it
- ✅ Never decrement invoice counter
- ✅ Add year to number (already done: INV-2025-0001)

**Current status:** ✅ FIXED — Sequence-safe invoice numbering based on max index in store implemented

---

## 12. Vehicle Fitment Not Validated (LOW RISK)

**Issue:** Fitment data exists but POS doesn't check if product fits vehicle. Staff can sell incompatible parts.

**Symptoms:**
- Customer orders engine part for motorcycle (fitment says car only)
- No warning shown to staff

**Root cause:**
- Fitment is optional metadata
- POS doesn't do compatibility checks

**Prevention:**
- ✅ Add optional fitment validation in billing page
- ✅ Warn if product fitment doesn't match vehicle
- ✅ Allow operator to override warning (some shop sales are intentional mismatches)

**Current status:** ⚠️ UNRESOLVED — Fitment validation not implemented

---

## 13. Payment Method Categories Are Fixed (LOW RISK)

**Issue:** Payment methods (Cash | UPI | Card | Credit) are hardcoded. Shop with different payment types can't track them.

**Symptoms:**
- Shop uses Paytm, but only UPI option exists
- Shop accepts checks, but no option
- Custom methods can't be added

**Root cause:**
- PaymentMethod is a union type, not extensible

**Prevention:**
- ✅ Switch from enum to free-form string (less type safety, more flexibility)
- ✅ Allow custom methods in settings
- ✅ Keep predefined methods but add "Other" option

**Current status:** ⚠️ UNRESOLVED — Acceptable for typical shop, but inflexible

---

## High-Priority Fixes

1. **Add debt audit check** (to prevent drift)
2. **Add localStorage quota monitoring** (to warn before crash)
3. **Implement data export/import** (for safety)
4. **Create "correction invoice" workflow** (for immutability workaround)
5. **Add action logging** (for accountability)

---

## 14. Duplicate Product IDs → React Duplicate Key Errors (HIGH RISK)

**Issue:** The original ID generator used only `Date.now()` as the product ID seed. When CSV imports processed multiple rows in a synchronous loop, many calls to `Date.now()` returned the same millisecond timestamp, producing identical IDs (e.g. `p-1782314767987`). This caused React to throw "Encountered two children with the same key" errors on every page that mapped `state.products`.

**Symptoms:**
- Console: `Warning: Encountered two children with the same key "p-1782314767987"`
- Billing product grid crashes or shows wrong products
- Inventory table rows vanish or merge
- Analytics outOfStock, lowStock, productMargins lists have phantom duplicates
- Dashboard and invoices list also affected

**Root cause:**
- `addProduct()` helper generated IDs with `p-${Date.now()}` — collision possible in tight loops
- `HYDRATE_STORE` passed raw `action.state` through without deduplication — pre-existing bad data was restored from localStorage intact on every reload

**Prevention / Fix (FIXED):**
- ✅ `addProduct()` now uses `p-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` — collision-resistant
- ✅ `ADD_PRODUCT` reducer guards against duplicate IDs: silently skips if same ID exists
- ✅ `HYDRATE_STORE` deduplicates all four collections (products, customers, invoices, debtPayments) by ID on every load — self-healing on next app start
- ✅ `filteredProducts` (billing), `filtered` (inventory, invoices, customers), `data.products` (analytics), dashboard useMemo all deduplicate their local list before rendering — render-layer safety net

**Files changed:**
- `src/lib/store.tsx` — ADD_PRODUCT guard + HYDRATE_STORE deduplication
- `src/app/billing/page.tsx` — filteredProducts dedup
- `src/app/inventory/page.tsx` — filtered dedup
- `src/app/analytics/page.tsx` — data.products dedup (covers outOfStock, lowStock, productMargins)
- `src/app/invoices/page.tsx` — filtered dedup
- `src/app/customers/page.tsx` — filtered dedup
- `src/app/dashboard/page.tsx` — invoices + products dedup

**Current status:** ✅ FIXED — 2026-06-24

---

## 15. InventoryPage Missing `loading` Guard (LOW RISK — FIXED)

**Issue:** `InventoryPage` used `isOwner` from `useRole()` without checking the `loading` flag first. Since `role` initialises as `null`, `isOwner` starts `false` and the "Add Product" / "Import CSV" / "Export CSV" buttons, the Buy Price column, and the margin column would not render on the first paint for the owner — then immediately reappear once `useRole` resolved from localStorage.

**Symptoms:**
- Brief visual flash where Buy Price column is absent then appears
- Inconsistency with AGENTS.md rule: all role-dependent pages must gate on `loading`

**Fix:**
```tsx
// Added before the main return in InventoryPage()
if (loading) return null;
```

**Current status:** ✅ FIXED — 2026-06-24 (Final Pre-Audit Brutal Check)

---

## 16. HTML5 Native Number Input step="any" Missing (LOW RISK — FIXED)

**Issue:** HTML5 `<input type="number">` elements default to a step size of `1` if the `step` attribute is omitted. When users try to type floating-point values (like product pricing or decimal payment amounts), the browser will either prevent form submission with validation warnings, or silently round the value to the nearest integer.

**Symptoms:**
- POS checkouts or collection modals block payment, or round decimal parts.
- Product Sell Price and Buy Price inputs in inventory forms behave erratically when decimal values are entered.

**Fix:**
- ✅ Added `step="any"` to Buy Price, Sell Price, Amount Paid, and repayment amount numeric input fields across all page and modal forms.
- ✅ Adjusted minimum input values from `min="1"` to `min="0.01"` to allow small fractional collections or adjustments.

**Current status:** ✅ FIXED — 2026-06-25

---

## 17. Multi-Stage Debt Repayment Double-Deduction Bug (HIGH RISK — FIXED)

**Issue:** The state reducer updates both `invoice.amountPaid` and `invoice.dueAmount` when a payment is recorded. However, the `calcInvoiceDue()` helper subtracted the sum of all repayments from `invoice.dueAmount` again. Since `dueAmount` was already reduced, this double-subtraction capped subsequent repayments at `0`, preventing customers from making further payments.

**Symptoms:**
- The first repayment against a debt invoice succeeds.
- The second repayment gets capped at `0` (ignored), leaving the customer unable to pay off their remaining debt.

**Fix:**
- ✅ Modified `calcInvoiceDue()` to return `roundMoney(Math.max(0, invoice.dueAmount))` directly. Since `dueAmount` is kept up-to-date by state reducer transactions, it represents the authoritative outstanding balance without needing manual recalculation against repayment history records.

**Current status:** ✅ FIXED — 2026-06-25

---

## Summary

This list is a " gotchas" reference. Before making changes to debt, stock, or customer data, cross-reference this file. When you fix a mistake, update the status from UNRESOLVED → PARTIALLY FIXED → FIXED.
