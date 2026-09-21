# Stabilization Plan — 4-Batch Roadmap to Production Trust

**Purpose:** Transform the codebase from "well-polished demo" to "production-grade shop system"

**Overall Verdict:** 3–4 focused development sprints (each ~2 weeks) to address critical trust gaps and business-safety issues

**Approach:** Fix critical gaps first (Batch 1), then business-safety (Batch 2), then quality polish (Batch 3), then optional hardening (Batch 4)

---

## Quick Summary: Fix Priority Matrix

| Batch | Focus | Task Count | Est. Effort | Risk if Skipped |
|---|---|---|---|---|
| **Batch 1** | Trust & Data Safety | 6 tasks | ~8–10 days | Owner loses data; analytics broken |
| **Batch 2** | Business Correctness | 5 tasks | ~10–12 days | Cannot operate safely; permanent mistakes |
| **Batch 3** | UX & Quality | 6 tasks | ~8–10 days | Workflow friction; unprofessional output |
| **Batch 4** | Hardening (Optional) | 4 tasks | ~5–7 days | Future scalability; not blocking |

---

## BATCH 1: Critical Trust Fixes (8–10 Days)

**Mandate:** These 6 tasks must be completed before live shop use. They address data safety, analytics correctness, and UX consistency.

### Task 1.1: Fix Hardcoded Date Bug in Analytics

**Why:** After June 2026, all Week/Month/Quarter/Year analytics calculations are wrong. This breaks the most important reporting feature.

**What:** Replace hardcoded date with system date

**Files Affected:**
- `src/app/analytics/page.tsx:274`

**Current Code:**
```typescript
const now = new Date("2026-06-22");
```

**New Code:**
```typescript
const now = new Date();
```

**Test:**
- Run app in current date
- Open Analytics → select "This Week"
- Verify date range matches actual current week

**Effort:** 5 minutes

**Risk Level:** None (pure fix, no side effects)

---

### Task 1.2: Fix customer.totalSpent Not Updating on Debt Repayment

**Why:** A customer who buys ₹10k on credit and pays it back shows totalSpent=₹0 forever. Lifetime value is permanently wrong.

**What:** Update customer.totalSpent in RECORD_DEBT_PAYMENT reducer when payment is collected

**Files Affected:**
- `src/lib/store.tsx:241-251` (RECORD_DEBT_PAYMENT reducer)

**Current Code (approx):**
```typescript
case "RECORD_DEBT_PAYMENT": {
  const { invoiceId, paymentAmount, paymentMethod } = action.payload;
  const updatedCustomers = state.customers.map(c => {
    // ... recalculate debt
    return { ...c, debt: newDebt };
  });
  return { ...state, customers: updatedCustomers, debtPayments: [...state.debtPayments, payment] };
}
```

**Fix:** After debt recalculation, also update totalSpent:
```typescript
return {
  ...c,
  debt: newDebt,
  totalSpent: c.totalSpent + paymentAmount // ADD THIS LINE
};
```

**Validation:**
- Create invoice: Credit, ₹10,000, amountPaid=₹0
- Customer totalSpent should be ₹0
- Record debt payment: ₹5,000
- Customer totalSpent should be ₹5,000
- Pay remaining ₹5,000
- Customer totalSpent should be ₹10,000

**Effort:** 15 minutes (code change + testing)

**Risk Level:** LOW (adds one line, tested scenario)

---

### Task 1.3: Replace 5 alert() Calls with Toast Notifications in CSV Import

**Why:** CSV import uses browser alert() while rest of app uses toast notifications. Jarring inconsistency.

**What:** Replace all 5 alert() calls in CSV import with showToast() calls

**Files Affected:**
- `src/app/inventory/page.tsx` (~5 locations in handleCSVImport)

**Instances to Replace:**
1. Line ~420: duplicate SKU alert
2. Line ~445: invalid CSV format alert
3. Line ~520: missing required columns alert
4. Line ~545: import success alert
5. Other validation error alerts

**Current Code (example):**
```typescript
alert("Duplicate SKU found: " + sku);
```

**New Code:**
```typescript
showToast("Duplicate SKU found: " + sku, "error");
```

**Test:**
- Upload CSV with duplicate SKUs → toast appears (not alert)
- Upload CSV with missing columns → toast appears (not alert)
- Upload valid CSV → toast appears (not alert)

**Effort:** 20 minutes (5 replacements + testing)

**Risk Level:** None (pure UX replacement, no logic change)

---

### Task 1.4: Add Data Export Function (Export All Data as JSON)

**Why:** All data lives in localStorage with zero recovery mechanism. Owner needs manual backup option.

**What:** Add "Export All Data" button in Dashboard; downloads complete store state as JSON

**Files Affected:**
- `src/app/page.tsx` (Dashboard)
- `src/lib/store.tsx` (add export utility)

**Implementation:**
```typescript
// Add in store.tsx
export const exportStoreAsJSON = (state: StoreState) => {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `7star-backup-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
```

**UI:** Add button in Dashboard Action Center or Settings
- Label: "Backup Data (JSON)"
- Click → downloads `7star-backup-YYYY-MM-DD.json`

**Test:**
- Click "Backup Data"
- File downloaded with all invoices, customers, inventory, debt payments
- Can manually restore by opening file (developer console)

**Effort:** 30 minutes (export function + UI button + testing)

**Risk Level:** LOW (read-only, no state changes)

---

### Task 1.5: Add Validation to Prevent Credit + Paid Combination

**Why:** No guard prevents nonsensical "Paid by Credit" state. Invalid data records pollute database.

**What:** Add validation in invoice creation: if paymentMethod is Credit, status must be Debt or Partial

**Files Affected:**
- `src/app/billing/page.tsx:handleGenerateInvoice()`

**Current Logic:**
```typescript
// No validation; allows any combination
```

**New Validation (add before invoice creation):**
```typescript
if (paymentMethod === "Credit" && paymentStatus === "Paid") {
  showToast("Credit invoices cannot be Paid at creation. Select Debt or Partial.", "error");
  return;
}
```

**Test:**
- Billing form: select paymentMethod=Credit + paymentStatus=Paid → error toast
- Cannot submit invoice
- Select Credit + Debt → allows submit ✅
- Select Credit + Partial → allows submit ✅

**Effort:** 10 minutes

**Risk Level:** None (adds validation, prevents bad state)

---

### Task 1.6: Hide buyPrice from Staff in Inventory Edit Form

**Why:** Any Staff member can click Edit on a product and see all cost data (buyPrice). Visibility violation.

**What:** Conditionally render buyPrice input only if user is Owner

**Files Affected:**
- `src/app/inventory/page.tsx` (ProductEditForm component)

**Current Code:**
```typescript
<input label="Buy Price" value={buyPrice} onChange={...} />
```

**New Code:**
```typescript
{isOwner && (
  <input label="Buy Price" value={buyPrice} onChange={...} />
)}
```

**Test:**
- Login as Owner → Edit product → buyPrice visible ✅
- Login as Staff → Edit product → buyPrice hidden ✅

**Effort:** 5 minutes

**Risk Level:** None (pure display guard)

---

## BATCH 2: Business-Safety Fixes (10–12 Days)

**Mandate:** These 5 tasks address core business operations. Without them, the system is unsafe for daily use.

### Task 2.1: Implement Invoice Void / Correction Workflow

**Why:** A billing mistake (wrong customer, wrong amount, wrong item) is permanent and contaminates all reports forever. This is the #1 real-business gap.

**What:** Add "Void Invoice" capability (soft-void: marks invoice void, zeroes its contribution to reports)

**Design Decision:** Soft-void approach (prefer over correction note for simplicity)
- Add `voidedAt` and `voidReason` fields to Invoice
- When void = true, invoice doesn't contribute to:
  - Customer totalSpent
  - Customer debt
  - Inventory cost calculation
  - Analytics (profit, revenue, etc.)
- Original invoice stays in ledger (audit trail)

**Files Affected:**
- `src/lib/store.tsx` (Invoice type, add voidedAt/voidReason)
- `src/lib/store.tsx` (ADD_VOID_INVOICE action)
- `src/app/invoices/[id]/page.tsx` (add Void button + confirmation modal)
- All calculation functions (filter out voided invoices)

**Implementation Checklist:**
- [ ] Add voidedAt, voidReason fields to Invoice type
- [ ] Create VOID_INVOICE reducer action
- [ ] Add "Void This Invoice" button on invoice detail page
- [ ] Show void confirmation modal (reason required)
- [ ] Update calcTotalRevenue, calcTotalProfit, getTotalOutstandingDebt to skip voided
- [ ] Update customer profile to skip voided invoices
- [ ] Add visual indicator on invoice (strikethrough? red badge?)
- [ ] Test: void invoice → verify it doesn't affect reports

**Validation:**
- Create invoice ₹10k → analytics shows ₹10k profit
- Void invoice → analytics shows ₹0 profit ✅
- Void with reason → ledger shows reason ✅
- Unvoided invoices still count ✅

**Effort:** 2–3 days (type changes, reducer, UI, calculation updates)

**Risk Level:** MEDIUM (touches multiple modules, extensive testing needed)

---

### Task 2.2: Store buyPriceAtSale in InvoiceItem (Historical Profit)

**Why:** Profit is calculated using current buyPrice. If owner updates buyPrice, historical profit retroactively changes. Profit figures are untrustworthy.

**What:** Capture buyPrice at invoice creation time; use historical price for profit calculation, not current

**Files Affected:**
- `src/lib/store.tsx` (InvoiceItem type, ADD_INVOICE reducer)
- `src/app/analytics/page.tsx` (profit calculation)
- `src/app/invoices/[id]/page.tsx` (invoice detail, show at-sale price)

**Implementation Checklist:**
- [ ] Add buyPriceAtSale field to InvoiceItem type
- [ ] Capture product.buyPrice at invoice creation time
- [ ] Update ADD_INVOICE to store buyPriceAtSale
- [ ] Update profit calculation: `profit = (sellPrice - buyPriceAtSale) * qty`
- [ ] Show buyPriceAtSale in invoice detail (optional, for transparency)
- [ ] Test: change buyPrice → historical invoices' profit unchanged ✅

**Validation:**
- Create invoice with buyPrice=₹200, sellPrice=₹500 → profit=₹300
- Change product buyPrice to ₹300
- Old invoice still shows ₹300 profit (not ₹200) ✅

**Effort:** 1–2 days (data model change, calculation update, testing)

**Risk Level:** MEDIUM (data model change, needs migration strategy for existing invoices)

---

### Task 2.3: Fix Invoice Number Generation (Collision Risk)

**Why:** Invoice numbers generated as `length + 1`. If store resets, numbers reuse. Collides with existing records.

**What:** Use max(invoiceNumber) + 1 instead of length + 1

**Files Affected:**
- `src/lib/store.tsx:getNextInvoiceNumber()`

**Current Code:**
```typescript
const getNextInvoiceNumber = (invoices: Invoice[]) => {
  const year = new Date().getFullYear();
  return `INV-${year}-${String(invoices.length + 1).padStart(4, '0')}`;
};
```

**New Code:**
```typescript
const getNextInvoiceNumber = (invoices: Invoice[]) => {
  const year = new Date().getFullYear();
  const thisYearInvoices = invoices.filter(i => i.id.includes(`-${year}-`));
  const maxNum = thisYearInvoices.length > 0
    ? Math.max(...thisYearInvoices.map(i => parseInt(i.id.split('-').pop() || '0')))
    : 0;
  return `INV-${year}-${String(maxNum + 1).padStart(4, '0')}`;
};
```

**Test:**
- Create 10 invoices (INV-2026-0001 through INV-2026-0010)
- Reset store version
- Create new invoice → should be INV-2026-0011 (not INV-2026-0001) ✅

**Effort:** 20 minutes

**Risk Level:** LOW (pure formula change)

---

### Task 2.4: Allow Debt Collection for Walk-in Invoices (No customerId)

**Why:** Debt invoices created for walk-ins (no customerId) cannot use "Collect" button. Due is permanently stranded.

**What:** Show Collect button for ANY debt invoice regardless of customerId

**Files Affected:**
- `src/app/invoices/page.tsx` (Collect button conditional)
- `src/lib/store.tsx` (RECORD_DEBT_PAYMENT, handle no customerId)

**Current Logic:**
```typescript
{inv.customerId && (
  <button>Collect Payment</button>
)}
```

**New Logic:**
```typescript
{(inv.paymentStatus === "Debt" || inv.paymentStatus === "Partial") && (
  <button>Collect Payment</button>
)}
```

**Handling Walk-in Payments:**
- If no customerId, skip customer debt recalc (already handles this)
- Store payment in debtPayments array (works for any invoice)
- Show payment in invoice repayment timeline (works for any invoice)

**Test:**
- Create debt invoice for walk-in (no phone/name)
- Open expanded row → Collect button appears ✅
- Record payment → works ✅
- Payment shows in repayment timeline ✅

**Effort:** 30 minutes

**Risk Level:** LOW (extends existing logic)

---

### Task 2.5: Add Invoice Filtering by Date Range

**Why:** Common query ("show invoices from last week") not supported. Owner must manually scroll or search.

**What:** Add date range picker (start date, end date) to invoice list filters

**Files Affected:**
- `src/app/invoices/page.tsx` (filter controls, filtered invoices logic)

**Implementation:**
- Add two date input fields (From Date, To Date)
- Filter: `invoices.filter(i => new Date(i.date) >= fromDate && new Date(i.date) <= toDate)`
- Persist filter state in local component state (or URL search params)

**Test:**
- Open invoice list
- Set From = 2026-06-15, To = 2026-06-22
- Table shows only invoices within that range ✅
- Clear filter → shows all ✅

**Effort:** 1 day (date picker UI + filter logic + testing)

**Risk Level:** LOW (read-only filter, no state changes)

---

## BATCH 3: UX & Quality Polish (8–10 Days)

**Mandate:** These 6 tasks improve workflow efficiency, consistency, and professionalism. Not blocking, but high ROI for daily usability.

### Task 3.1: Fix Print from Invoice List (Navigate to Detail Page)

**Why:** Current: click Print → prints entire Invoices list page (ugly). Should print just the invoice.

**What:** Replace window.print() with navigation to `/invoices/[id]` detail page (has proper PrintableInvoice component)

**Files Affected:**
- `src/app/invoices/page.tsx` (print button in expanded row)

**Current Code:**
```typescript
<button onClick={() => window.print()}>Print Invoice</button>
```

**New Code:**
```typescript
<button onClick={() => navigate(`/invoices/${inv.id}`)}>Print Invoice</button>
```

**Test:**
- Open invoice list
- Click Print on expanded row
- Navigates to detail page (with printable layout) ✅
- User can then Ctrl+P or click Print button on detail page
- Output is clean invoice, not list page ✅

**Effort:** 20 minutes

**Risk Level:** None (pure navigation)

---

### Task 3.2: Localize Invoice Date Display

**Why:** Invoice dates show as "2026-06-22" (ISO format) instead of "22 Jun 2026" (user-friendly).

**What:** Format dates using Intl.DateTimeFormat with Indian locale

**Files Affected:**
- `src/app/invoices/page.tsx` (date column)
- Possibly other date displays in app

**Implementation:**
```typescript
const formatDate = (dateString: string) => {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(dateString));
};
// Then use: {formatDate(inv.date)}
```

**Test:**
- Create invoice on 2026-06-22
- Invoice list shows "22 Jun 2026" (not "2026-06-22") ✅

**Effort:** 30 minutes (utility function + apply to relevant places)

**Risk Level:** None (cosmetic only)

---

### Task 3.3: Add Pagination to Invoice List

**Why:** No pagination; rendering 500+ invoices causes sluggish performance.

**What:** Add pagination (e.g., 25 rows per page) or virtual scrolling to invoice list

**Files Affected:**
- `src/app/invoices/page.tsx` (table rendering)

**Options:**
- Simple pagination: Show page numbers, "Prev/Next" buttons
- Virtual scrolling: Render only visible rows (better UX, more complex)

**Recommendation:** Start with simple pagination (25 rows/page)

**Implementation Checklist:**
- [ ] Add currentPage state
- [ ] Calculate totalPages = Math.ceil(filteredInvoices.length / 25)
- [ ] Slice invoices: `invoices.slice((page - 1) * 25, page * 25)`
- [ ] Render page numbers / Prev/Next buttons
- [ ] Reset page when filters change
- [ ] Test: 100 invoices, page 1 shows 25, page 2 shows next 25 ✅

**Effort:** 1 day (pagination UI + logic + testing)

**Risk Level:** LOW (pure display layer)

---

### Task 3.4: No Sort Capability on Invoice List (Add Sort by Date, Amount, Status)

**Why:** Cannot sort by date, amount, or status. Finding specific invoices is painful.

**What:** Add clickable column headers to sort

**Files Affected:**
- `src/app/invoices/page.tsx` (table header, sort logic)

**Implementation:**
- Add click handler on column headers
- Sort by: Date, Total Amount, Customer Name, Status
- Toggle sort direction (ASC/DESC) on repeated clicks
- Show visual indicator (↑ / ↓ arrow on active column)

**Test:**
- Click "Total" column header → sort by amount descending ✅
- Click again → sort by amount ascending ✅
- Click "Date" → sort by date ✅

**Effort:** 1 day

**Risk Level:** LOW

---

### Task 3.5: "Generate Report" Button Should Auto-Trigger Print

**Why:** Current: click "Generate Report" → shows style → user must manually Ctrl+P. Confusing UX.

**What:** After clicking "Generate Report," automatically trigger browser print dialog

**Files Affected:**
- `src/app/analytics/page.tsx` (Generate Report button)

**Current Code:**
```typescript
<button onClick={() => setShowReport(true)}>Generate Report</button>
```

**New Code:**
```typescript
<button onClick={() => {
  setShowReport(true);
  setTimeout(() => window.print(), 100); // Wait for render
}}>Generate Report</button>
```

**Test:**
- Click "Generate Report"
- Print dialog automatically opens ✅
- User can then print or cancel

**Effort:** 15 minutes

**Risk Level:** None

---

### Task 3.6: No Customer Edit Capability (Add Edit Name/Phone)

**Why:** Typo in customer name or phone is permanent. Cannot be corrected.

**What:** Add Edit mode to customer profile; allow editing name and phone number

**Files Affected:**
- `src/app/customers/[id]/page.tsx` (customer profile)
- `src/lib/store.tsx` (UPDATE_CUSTOMER action)

**Implementation Checklist:**
- [ ] Add UPDATE_CUSTOMER reducer action
- [ ] Add Edit button on customer profile
- [ ] Show inline edit fields for name, phone
- [ ] Validate phone (required for billing)
- [ ] Save → update store
- [ ] Test: edit name → verify update ✅

**Effort:** 1 day

**Risk Level:** LOW (straightforward CRUD)

---

## BATCH 4: Optional Hardening (5–7 Days)

**Mandate:** These tasks improve resilience and scalability but are NOT blocking. Implement after Batch 1–3 if time permits.

### Task 4.1: Add Audit Trail / Repayment Ledger Sorting

**Why:** Repayment ledger has no date sort or filter. Finding "all payments this month" is not possible.

**What:** Add sorting by date (ascending/descending) and filtering by method in repayment ledger

**Files Affected:**
- `src/app/invoices/page.tsx` (Repayments tab)

**Implementation:** Add sort controls similar to Batch 3.4

**Effort:** 1 day

**Risk Level:** LOW

---

### Task 4.2: Add Product Delete Capability (with Confirmation)

**Why:** Cannot delete products. Test/duplicate products accumulate forever.

**What:** Add Delete button with confirmation modal in Inventory

**Files Affected:**
- `src/app/inventory/page.tsx` (product list actions)
- `src/lib/store.tsx` (DELETE_PRODUCT action)

**Implementation Checklist:**
- [ ] Add DELETE_PRODUCT reducer
- [ ] Add Delete button with confirmation ("Are you sure?")
- [ ] If product used in invoices, warn user ("This product appears in X invoices. Delete anyway?")
- [ ] Remove from inventory
- [ ] Test: delete → verify gone ✅

**Effort:** 1 day

**Risk Level:** MEDIUM (data loss, needs caution UX)

---

### Task 4.3: Prevent SKU Duplicates on Manual Product Creation

**Why:** CSV import checks for SKU duplicates, but manual product creation doesn't. Duplicates possible.

**What:** Add validation on product form: if SKU exists, reject or warn

**Files Affected:**
- `src/app/inventory/page.tsx` (product form validation)

**Implementation:**
```typescript
if (state.inventory.some(p => p.sku === newSKU && p.id !== editingProductId)) {
  showToast("SKU already exists", "error");
  return;
}
```

**Effort:** 20 minutes

**Risk Level:** None

---

### Task 4.4: Role-Based Data Visibility at Storage Level (Future)

**Why:** Current role gating is UI-only. Staff with DevTools access can see owner data.

**What:** Implement server-side permission checks (future, requires backend)

**Status:** DEFERRED (requires API layer, not feasible in localStorage-only architecture)

**Note:** Document as future improvement when moving to backend

---

## Effort & Timeline Summary

| Batch | Tasks | Est. Days | Team Size | Realistic Sprint |
|---|---|---|---|---|
| **Batch 1** | 6 | 8–10 | 1 person | Week 1–2 |
| **Batch 2** | 5 | 10–12 | 1 person | Week 2–4 |
| **Batch 3** | 6 | 8–10 | 1 person | Week 4–5 |
| **Batch 4** | 4 | 5–7 | 1 person | Week 6+ (optional) |
| **TOTAL** | 21 | ~31–39 days | 1 person | ~6–8 weeks (1 person) |

**With 2 people:** Parallel work reduces timeline to ~4–5 weeks

---

## Recommended Execution Order

### Sprint 1 (Week 1–2): Batch 1 (Critical Trust Fixes)
- Day 1: Tasks 1.1, 1.2, 1.5, 1.6 (quick wins)
- Day 2–3: Task 1.3 (alert replacements)
- Day 3–4: Task 1.4 (data export)
- Day 4–5: Testing, fix bugs
- End of Sprint: Deploy to staging; owner tests; validate all critical fixes work

### Sprint 2 (Week 2–4): Batch 2 (Business-Safety Fixes)
- Day 1–3: Task 2.1 (invoice void workflow, most complex)
- Day 3–4: Task 2.2 (historical buyPrice)
- Day 4–5: Task 2.3 (invoice number), Task 2.4 (walk-in debt), Task 2.5 (date filter)
- Day 5: Testing, fix bugs
- End of Sprint: Deploy to staging; owner tests critical workflows

### Sprint 3 (Week 4–5): Batch 3 (UX Polish)
- Day 1–2: Tasks 3.1, 3.2 (quick wins)
- Day 2–3: Task 3.3 (pagination)
- Day 3–4: Task 3.4 (sorting)
- Day 4–5: Task 3.5 (auto-print), Task 3.6 (customer edit)
- Day 5: Testing, bug fixes
- End of Sprint: Deploy to production; ready for live shop use

### Sprint 4+ (Week 6+): Batch 4 (Optional Hardening)
- As time permits, implement Tasks 4.1–4.3
- Document Task 4.4 for future backend implementation

---

## Testing Strategy Per Batch

### Batch 1 Testing
- [ ] Run app with system date; analytics correct for current week
- [ ] Create debt invoice, pay back → totalSpent updates ✅
- [ ] Upload CSV → toast (not alert) ✅
- [ ] Click "Export Data" → JSON file downloads ✅
- [ ] Try Credit+Paid → blocked with error ✅
- [ ] Login as Staff → buyPrice hidden ✅

### Batch 2 Testing
- [ ] Create wrong invoice → void → disappears from reports ✅
- [ ] Change buyPrice → old invoices' profit unchanged ✅
- [ ] Create 10 invoices, reset store → next invoice number continues ✅
- [ ] Create walk-in debt → collect button appears ✅
- [ ] Filter invoices by date range ✅

### Batch 3 Testing
- [ ] Click Print from list → navigates to detail page ✅
- [ ] Invoice dates show "22 Jun 2026" format ✅
- [ ] 100 invoices → pagination works ✅
- [ ] Click column headers → sort works ✅
- [ ] Click "Generate Report" → auto-prints ✅
- [ ] Edit customer name → updates ✅

### Batch 4 Testing (if implemented)
- [ ] Sort repayment ledger by date ✅
- [ ] Delete product with confirmation ✅
- [ ] Try duplicate SKU → rejected ✅

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Breaking existing invoices (Batch 2.2) | Add buyPriceAtSale; for old invoices, derive from current buyPrice on first load, then cache |
| Data loss on void (Batch 2.1) | Soft-void only (don't delete); ledger shows voided invoices; reversible |
| Pagination breaks filters (Batch 3.3) | Reset page to 1 when filters change |
| Export data huge (Batch 1.4) | Limit to recent 2 years of invoices; full export available in settings |
| Staff sees buyPrice (Batch 1.6) | Add isOwner check on form render; also hide buyPrice from print if staff |

---

## Post-Batch Checklist

After each batch deployment:
- [ ] Run existing test suite (if any)
- [ ] Manual QA on key workflows
- [ ] Owner tests on staging
- [ ] Document any new issues found
- [ ] Update AGENTS.md with new patterns
- [ ] Update brain/mistakes.md with fixed items
- [ ] Commit with clear message (e.g., "Batch 1: Critical trust fixes")

---

## Definition of "Production Ready"

After all 4 batches, the system is production-ready if:
- ✅ No hardcoded dates in production code
- ✅ Data can be backed up and restored
- ✅ Invoices can be voided (no permanent mistakes)
- ✅ Customer data correct (totalSpent, visits)
- ✅ Analytics profit is historical (not retroactive)
- ✅ All numbers consistent across modules
- ✅ Staff cannot see owner-only data
- ✅ Print outputs are professional
- ✅ Workflows are efficient (sort, filter, search)
- ✅ Owner has tested and approved all fixes

---

## Success Metrics

| Metric | Before | Target |
|---|---|---|
| Data safety | None | Backup + restore working |
| Invoice correctness | Cannot fix mistakes | Can void invoice |
| Analytics trust | Retroactive profit | Historical profit |
| UX efficiency | No sort/filter | Full sort/filter |
| Role isolation | UI-only | Cost data hidden from staff |
| Workflow | 3-4 weeks then breaks | Safe for 6+ months |

---

## Next Steps

1. **Stakeholder Approval:** Owner reviews Batch 1–3 priorities; confirms schedule
2. **Sprint Planning:** Estimate tasks more precisely; assign to developer
3. **Setup Testing:** Create test checklist; prepare staging environment
4. **Start Sprint 1:** Deploy Batch 1 by end of week 2
5. **Monitor & Iterate:** Track progress; adjust as needed
