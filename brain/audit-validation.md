# Audit Validation Matrix — V1 Brutal Audit Cross-Check

**Purpose:** Verify each major audit finding against current codebase state (Confirmed / Fixed / Partial / Outdated)

**Date:** 2026-06-22  
**Method:** Code inspection of src/ directory (store.tsx, pages/, lib/, components/)

---

## Critical Findings (Must Fix Before Production Use)

### 1. Hardcoded Date Bug in Analytics

| Aspect | Finding |
|---|---|
| **Audit Finding** | Line 274: `const now = new Date("2026-06-22");` breaks all date-range calculations after June 2026 |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/analytics/page.tsx:274` |
| **Current Code** | `const now = new Date("2026-06-22");` |
| **Impact** | CRITICAL — After June 2026, Week/Month/Quarter/Year buckets are calculated relative to June 2026, producing completely wrong analytics |
| **Test Case** | Run app in January 2027 → open Analytics → select "This Week" → dates are off by 7+ months |
| **Fix Required** | Replace `new Date("2026-06-22")` with `new Date()` to use system date |
| **Risk if Unfixed** | Owner loses trust in analytics; cannot make data-driven decisions |
| **Priority** | 🔴 BLOCKING |

---

### 2. customer.totalSpent Never Updates on Debt Repayment

| Aspect | Finding |
|---|---|
| **Audit Finding** | totalSpent initialized from amountPaid (₹0 for debt) but never updated when debt is paid |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/lib/store.tsx:180-192` (ADD_INVOICE) and `lines 241-251` (RECORD_DEBT_PAYMENT) |
| **Current Code — ADD_INVOICE** | `totalSpent: inv.amountPaid` (when amountPaid=0 for debt, totalSpent=0) |
| **Current Code — RECORD_DEBT_PAYMENT** | Only updates `customer.debt`, does NOT update `customer.totalSpent` |
| **Example Scenario** | Customer buys ₹10,000 on credit → totalSpent=₹0, debt=₹10,000<br/>Customer pays ₹10,000 → totalSpent=₹0 (WRONG), debt=₹0<br/>Lifetime value is permanently ₹0 (should be ₹10,000) |
| **Impact** | CRITICAL — Customer lifetime value is permanently wrong for all credit customers |
| **Test Case** | Create invoice with Credit payment, amountPaid=0 → pay it back via RECORD_DEBT_PAYMENT → verify totalSpent updates |
| **Fix Required** | In RECORD_DEBT_PAYMENT reducer, add: `totalSpent: c.totalSpent + paymentAmount` after debt recalculation |
| **Risk if Unfixed** | Analytics, customer profiles, and business reports show wrong lifetime values |
| **Priority** | 🔴 BLOCKING |

---

### 3. Five alert() Calls in CSV Import (UX Inconsistency)

| Aspect | Finding |
|---|---|
| **Audit Finding** | CSV import uses 5 `alert()` calls while rest of app uses `showToast()` notifications |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/inventory/page.tsx` (multiple locations in handleCSVImport and validation) |
| **Instances Found** | ~Line 420, ~545, and others in CSV validation logic |
| **Current Behavior** | Browser alert() pops up for: duplicate SKUs, invalid CSV format, missing required fields, import success |
| **Impact** | MEDIUM — Jarring UX inconsistency; alert() breaks flow; no undo if dismissed |
| **Test Case** | Upload CSV with missing required columns → verify alert() appears instead of toast |
| **Fix Required** | Replace all 5 alert() calls with `showToast(message, 'error'/'success'/'info')` |
| **Risk if Unfixed** | Staff confusion on why CSV import uses different notification system |
| **Priority** | 🟠 HIGH (Quality issue, not data integrity) |

---

### 4. Data Persistence Gap (No Backup / No Export)

| Aspect | Finding |
|---|---|
| **Audit Finding** | All data stored in browser localStorage only; no backup, no cloud, no data export beyond inventory CSV |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/lib/store.tsx:365-380` (HYDRATE_STORE), export only for inventory in `src/app/inventory/page.tsx` |
| **Current State** | Data survives browser refresh but lost on: localStorage wipe, device change, browser reinstall, private tab session |
| **Impact** | CRITICAL — One device wipe = complete data loss with zero recovery |
| **Test Case** | Export all data to JSON → delete localStorage manually → verify app offers no recovery option |
| **Fix Required** | Add "Export All Data (JSON)" button in Dashboard / Settings; provide manual backup option |
| **Risk if Unfixed** | Owner loses ALL business data (invoices, customers, payments) on first device incident |
| **Priority** | 🔴 BLOCKING |

---

### 5. buyPrice Visible to Staff (Visibility Leak)

| Aspect | Finding |
|---|---|
| **Audit Finding** | Inventory edit form displays buyPrice without isOwner check; any Staff can click Edit and see all cost data |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/inventory/page.tsx` (ProductEditForm, buyPrice input field) |
| **Current Behavior** | Edit button is available to all roles; form renders buyPrice input without permission check |
| **Example** | Staff user clicks "Edit" on a car part → form shows "Buy Price: ₹200" → Staff can now see all product costs |
| **Impact** | MEDIUM — Cost data leaked to staff; visibility violation; business info exposed |
| **Test Case** | Login as Staff → open Inventory → click Edit on any product → verify buyPrice field is visible |
| **Fix Required** | Wrap buyPrice input in `{isOwner && <label>Buy Price...</label>}` conditional; hide from Staff |
| **Risk if Unfixed** | Staff has visibility into sensitive cost data they shouldn't see |
| **Priority** | 🟠 HIGH (Security/Visibility issue) |

---

### 6. Credit + Paid Combination Allowed (Invalid State)

| Aspect | Finding |
|---|---|
| **Audit Finding** | No validation prevents nonsensical "Paid by Credit" state (paymentMethod=Credit, paymentStatus=Paid, dueAmount=0) |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/billing/page.tsx:handleGenerateInvoice()` |
| **Current Logic** | Allowed combinations: (Cash, Paid), (UPI, Paid), (Card, Paid), (Credit, Debt), (Credit, Partial), **BUT ALSO (Credit, Paid)** |
| **Example** | User selects paymentMethod="Credit" + paymentStatus="Paid" → Invoice created as nonsensical record |
| **Impact** | LOW-MEDIUM — Creates logically invalid record; can confuse debt tracking |
| **Test Case** | In Billing, select Credit method + Paid status + fill amount → submit → verify it's allowed (should be prevented) |
| **Fix Required** | Add validation: `if (paymentMethod === "Credit" && paymentStatus === "Paid") throw error("Credit invoices cannot be Paid at creation")` |
| **Risk if Unfixed** | Confusing debt records; inconsistent business logic |
| **Priority** | 🟠 HIGH (Logical error) |

---

## Important Findings (Business-Safety Gaps)

### 7. No Invoice Edit / Void Capability

| Aspect | Finding |
|---|---|
| **Audit Finding** | Once invoice is created, no way to edit, void, or correct it; billing mistake is permanent |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/invoices/page.tsx` (no edit/void button) |
| **Current Behavior** | Invoice detail page shows full details but no "Edit" or "Void" action |
| **Scenario** | Owner creates invoice for wrong customer or wrong amount → only option is to create a new invoice to offset |
| **Impact** | CRITICAL — Business mistake cannot be corrected; contaminates all revenue/debt/profit reports forever |
| **Test Case** | Create invoice, then look for Edit or Void button → find none |
| **Fix Required** | Add "Void Invoice" button (soft-void: marks void, zeroes contribution) or "Create Correction Note" workflow |
| **Risk if Unfixed** | Owner loses confidence; cannot run shop safely |
| **Priority** | 🔴 BLOCKING |

---

### 8. Profit Uses Current buyPrice, Not Historical

| Aspect | Finding |
|---|---|
| **Audit Finding** | Profit calculated by looking up current inventory.buyPrice, not price-at-sale; retroactively unstable |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/analytics/page.tsx` (calculateProfit), `src/lib/store.tsx` (profit derived from invoice items and current inventory) |
| **Current Logic** | `profit = invoice.items.reduce((sum, item) => sum + (item.sellPrice - inventory.find(p => p.id === item.productId).buyPrice) * item.quantity)` |
| **Scenario** | Invoice created with buyPrice=₹200 → later owner changes buyPrice to ₹300 → invoice profit retroactively changes |
| **Impact** | MEDIUM-HIGH — Historical profit figures are unstable; analytics not trustworthy |
| **Test Case** | Create invoice with item (buyPrice=₹200, sellPrice=₹500) → edit product buyPrice to ₹300 → check analytics profit (should be ₹300 but will be ₹200) |
| **Fix Required** | Store `buyPriceAtSale` in InvoiceItem; calculate profit from historical price not current |
| **Risk if Unfixed** | Owner cannot trust profit reports; numbers change unexpectedly |
| **Priority** | 🟠 HIGH |

---

### 9. Invoice Number Collision Risk

| Aspect | Finding |
|---|---|
| **Audit Finding** | Invoice number generated as `length + 1`; if store resets, numbers reused (INV-2026-0001 again) |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/lib/store.tsx:getNextInvoiceNumber()` |
| **Current Code** | `return \`INV-${year}-\${String(state.invoices.length + 1).padStart(4, '0')}\`` |
| **Scenario** | After 100 invoices, store is reset (version bump) → next invoice is INV-2026-0001 again → collides with old records |
| **Impact** | MEDIUM — Tax/record issues if invoice numbers collide; owner's paper records won't match |
| **Test Case** | Create 50 invoices, reset store version, create new invoice → verify number is lower than previous |
| **Fix Required** | Use `max(invoice.number) + 1` instead of `length + 1` or use timestamp-based numbering |
| **Risk if Unfixed** | Potential invoice number collisions |
| **Priority** | 🟠 HIGH |

---

### 10. Walk-in Debt Invoices Cannot Be Collected

| Aspect | Finding |
|---|---|
| **Audit Finding** | Debt invoices created for walk-ins (no customerId) cannot use "Collect" button; due is permanently stranded |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/invoices/page.tsx:expandedRow` (line ~416: `{inv.customerId && <button>Collect</button>}`) |
| **Scenario** | Walk-in debt invoice created (no customer record) → "Collect" button missing → due amount cannot be collected through UI |
| **Impact** | MEDIUM — Walk-in debt unreachable; workaround is to create customer record retroactively |
| **Test Case** | Create debt invoice with walk-in customer (no phone/name) → look for Collect button in expanded row → button absent |
| **Fix Required** | Change conditional: show Collect for any debt invoice regardless of customerId; handle walk-in payments separately |
| **Risk if Unfixed** | Walk-in debt cannot be collected through normal workflow |
| **Priority** | 🟠 MEDIUM |

---

## Quality / UX Issues

### 11. Print from Invoice List Prints Whole Page

| Aspect | Finding |
|---|---|
| **Audit Finding** | "Print Invoice" button in invoice list expanded row calls window.print() → prints entire page, not just invoice |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/invoices/page.tsx` (print button in expanded row) |
| **Current Behavior** | User clicks "Print" → browser print dialog shows full Invoices list page → output is ugly |
| **Better Flow** | Navigate to `/invoices/[id]` detail page (has <PrintableInvoice> component with proper print styles) |
| **Impact** | MEDIUM — UX issue; print output is unprofessional |
| **Test Case** | Open invoice list, expand row, click Print → see full page in print preview (not just invoice) |
| **Fix Required** | Replace `window.print()` with `navigate(\`/invoices/\${inv.id}\`)` to go to detail page |
| **Risk if Unfixed** | Staff gets ugly print output; undermines professionalism |
| **Priority** | 🟡 MEDIUM |

---

### 12. No Date Filter on Invoice List

| Aspect | Finding |
|---|---|
| **Audit Finding** | Invoice list has filters (status, method, search) but no date range filter |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/invoices/page.tsx` (filter controls) |
| **Scenario** | Owner wants "show me all invoices from last week" → must manually search or scroll through all |
| **Impact** | MEDIUM — UX friction; common query not supported |
| **Test Case** | Open Invoices page → look for "Date from/to" filter controls → not present |
| **Fix Required** | Add date range picker (start date, end date) in filter bar |
| **Risk if Unfixed** | Finding invoices from specific date range is painful |
| **Priority** | 🟡 MEDIUM |

---

### 13. No Date Localization (Shows ISO String)

| Aspect | Finding |
|---|---|
| **Audit Finding** | Invoice date column shows raw ISO string "2026-06-22" instead of localized format |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/invoices/page.tsx` (date column rendering) |
| **Current Display** | "2026-06-22" (ISO format) |
| **Expected Display** | "22 Jun 2026" (Indian date format) or configurable locale |
| **Impact** | MEDIUM — Functional but not user-friendly |
| **Test Case** | Open invoice list → see date column → verify format is not localized |
| **Fix Required** | Use `new Intl.DateTimeFormat('en-IN').format(new Date(inv.date))` or similar |
| **Risk if Unfixed** | Owner sees unfamiliar date format; minor UX friction |
| **Priority** | 🟡 LOW (cosmetic) |

---

### 14. No Pagination on Large Tables

| Aspect | Finding |
|---|---|
| **Audit Finding** | Invoice list has no pagination; rendering 500+ invoices causes sluggish performance |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/invoices/page.tsx` (renders all filtered invoices without limit) |
| **Scenario** | Over time, invoice list grows to 500+ rows → table becomes slow |
| **Impact** | MEDIUM — Performance degradation as data grows |
| **Test Case** | Create 500+ invoices → open invoice list → measure render time / scroll performance |
| **Fix Required** | Add pagination (e.g., 25 rows per page) or virtual scrolling |
| **Risk if Unfixed** | Invoice list becomes sluggish with large datasets |
| **Priority** | 🟡 MEDIUM |

---

### 15. Customer totalSpent Can Diverge From Invoice History

| Aspect | Finding |
|---|---|
| **Audit Finding** | Customer stats panel shows cached totalSpent/visits; invoice history tab derives from invoices; can show contradictory numbers |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/customers/[id]/page.tsx` (shows customer.totalSpent vs getInvoicesByCustomer) |
| **Scenario** | Customer has 2 invoices in history but totalSpent cache shows different amount → contradiction |
| **Impact** | MEDIUM — Data divergence; undermine trust in customer data |
| **Test Case** | Create invoices, edit totalSpent cache, verify mismatch with invoice history count |
| **Fix Required** | Derive totalSpent from actual invoices (don't cache) or keep cache in sync with all updates |
| **Risk if Unfixed** | Customer profile shows contradictory information |
| **Priority** | 🟡 MEDIUM |

---

### 16. No Customer Edit Capability

| Aspect | Finding |
|---|---|
| **Audit Finding** | No way to edit customer name or phone; typo is permanent |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/customers/[id]/page.tsx` (no Edit button) |
| **Scenario** | Owner enters customer phone wrong (1234567890 instead of 1234567891) → cannot fix |
| **Impact** | MEDIUM — Cannot correct customer data errors |
| **Test Case** | Open customer profile → look for Edit button → not present |
| **Fix Required** | Add Edit mode to customer profile (edit name, phone, optional notes) |
| **Risk if Unfixed** | Customer data errors are permanent |
| **Priority** | 🟡 MEDIUM |

---

### 17. No Product Delete Capability

| Aspect | Finding |
|---|---|
| **Audit Finding** | Products cannot be deleted; test/duplicate products accumulate forever |
| **Status** | ✅ **CONFIRMED UNRESOLVED** |
| **Code Location** | `src/app/inventory/page.tsx` (no Delete button in product list) |
| **Scenario** | Owner creates test product by mistake → cannot delete → inventory list gets cluttered |
| **Impact** | LOW — Cleanup issue, not a blocker |
| **Test Case** | Open inventory → look for Delete product option → not present |
| **Fix Required** | Add Delete button with confirmation dialog |
| **Risk if Unfixed** | Inventory list can become cluttered with unwanted products |
| **Priority** | 🟡 LOW |

---

## Outdated / Already Fixed Findings

(None identified in current codebase)

---

## Summary by Severity

### 🔴 CRITICAL (Must Fix)
- [x] Hardcoded date bug (analytics)
- [x] customer.totalSpent not updated (repayment)
- [x] No invoice edit/void
- [x] No data backup/export
- [x] Credit + Paid validation missing

### 🟠 HIGH (Business-Safety)
- [x] alert() in CSV import
- [x] buyPrice visible to Staff
- [x] buyPrice retroactively unstable (profit)
- [x] Invoice number collision risk
- [x] Walk-in debt unreachable

### 🟡 MEDIUM (UX/Quality)
- [x] Print from list prints whole page
- [x] No date filter on invoice list
- [x] No pagination on large tables
- [x] Customer stats diverge from history
- [x] No customer edit
- [x] No product delete

### 🟢 COMPLETE / NO ACTION NEEDED
(All audit findings are unresolved; no pre-existing fixes found)

---

## Validation Confidence Levels

| Finding | Code Spot-Check | Scope Estimate | Confidence |
|---|---|---|---|
| Hardcoded date | ✅ Verified line 274 | 1 line change | 100% confirmed |
| totalSpent bug | ✅ Verified ADD_INVOICE + RECORD_DEBT_PAYMENT | ~3-5 line change | 100% confirmed |
| alert() calls | ✅ Found 5+ instances | ~5 replacements | 100% confirmed |
| Data backup | ✅ No export beyond CSV | ~20-30 lines | 100% confirmed |
| buyPrice visibility | ✅ No isOwner check in form | ~3-5 guards | 95% confirmed |
| Credit+Paid | ✅ No validation found | ~5 line guard | 95% confirmed |
| Invoice edit/void | ✅ No button/reducer | Feature gap | 100% confirmed |
| Historical profit | ✅ Derives from current buyPrice | Feature gap | 100% confirmed |
| Invoice numbering | ✅ Uses length+1 | 1 formula | 100% confirmed |

---

## Next Steps

1. **Create stabilization-plan.md** with 4 fix batches
2. **Prioritize Batch 1** with critical trust fixes
3. **Estimate effort** for each batch
4. **Plan sprints** for implementation
