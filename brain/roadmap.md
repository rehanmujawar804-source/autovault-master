# Roadmap — 7 Star Car Accessories

Feature priorities and next steps, based on the current project state.

---

## Current V1 Status

✅ **Core system operational:**
- POS invoice creation working
- Inventory management functional
- Customer debt tracking accurate
- Basic analytics available
- Owner/staff role separation working

⚠️ **Gaps requiring attention:**
- Demo/owner hardening (UX polish, edge case handling)
- Stabilization & safety (debt audit, backup, error recovery)
- Settings page placeholder (no functionality)
- Print invoice basic (not production-ready)

❌ **Out of scope for V1:**
- Multi-device sync
- Backend server
- API integrations
- Email/SMS

---

## Phase 1: Trust & Stabilization (PRIORITY) (✅ COMPLETED)

**Goal:** Make the app rock-solid for owner demo and daily use.

**Tasks:**
1. **Debt Audit Verification** (✅ COMPLETED)
   - Add audit check: sum(customer.debt) === getTotalOutstandingDebt()
   - Create reconciliation UI (owner can verify/fix drift)
   - Log warnings if drift detected
   
2. **Data Backup & Recovery** (✅ COMPLETED)
   - Implement "Export Data" (download store as JSON including settings)
   - Implement "Import Data" (upload and restore store + settings safely)
   - Test recovery and backward-compatibility workflow

3. **Invoice Correction Workflow** (✅ COMPLETED)
   - Soft-voiding workflow implemented to reverse and void invoices safely
   - Reconcile customer debt, visits, and stock levels cleanly on voiding

4. **Error Handling & Validation** (✅ COMPLETED)
   - Add try/catch around localStorage operations
   - Add duplicate ID and SKU guards to prevent React key collision errors
   - Add validations in POS (e.g. prevent Credit + Paid combination)

5. **Role Flash Prevention (Re-verify)** (✅ COMPLETED)
   - Audit all pages for loading guards (e.g. InventoryPage isOwner check gated with loading check)

6. **Phone Collision Confirmation Modal** (✅ COMPLETED — 2026-06-25)
   - Silent phone-based customer auto-merge removed from POS checkout
   - Two-phase `handleGenerateInvoice` flow: Phase 1 detects collision → shows modal; Phase 2 `generateInvoiceWithCustomer` creates invoice with canonical customer data
   - "Use Existing Customer" canonicalizes to DB record (id, name, phone) before writing invoice
   - "Go Back" closes modal with zero side effects — form remains editable, no customer mutation
   - Modal rendered as first child in billing page return, above all other content (z-[9000])

7. **Centralized Money Rounding — `roundMoney`** (✅ COMPLETED — 2026-06-25)
   - `roundMoney = (n) => Math.round((n + Number.EPSILON) * 100) / 100` exported from `lib/store.tsx`
   - Applied at final write boundary in: billing cart totals (subtotal, discountAmount, total, amountPaid, dueAmount)
   - Applied in: `ADD_INVOICE` reducer (all 4 money fields rounded before store write)
   - Applied in: `VOID_INVOICE` (newDebt, newTotalSpent recalculated with roundMoney)
   - Applied in: `RECORD_DEBT_PAYMENT` (actualAmount, newAmountPaid, newDueAmount, totalDue, totalSpent)
   - Applied in: `RECONCILE_DEBT_CACHE` (correctDebt, correctTotalSpent)
   - Applied in: `getTotalRevenue`, `getTotalProfit`, `getTotalOutstandingDebt`, `getInventoryValue` selectors
   - Applied in: `PrintableInvoice.tsx` and `invoices/[id]/page.tsx` display layer
   - Applied in: WA message builder discount line in billing `InvoiceReceipt`

---

## Phase 2: Owner Hardening for Demo

**Goal:** Polish the demo experience. Owner sees a professional, reliable app.

**Tasks:**
1. **Settings Page Implementation**
   - Business name input
   - Currency preference (INR default)
   - Tax rate (GST) input
   - Demo reset button (bump STORE_VERSION + confirm)
   - Delete all data button (with warning)

2. **Print Invoice Polish**
   - Professional invoice template
   - Company branding (name, address, contact)
   - Receipt vs invoice options
   - QR code for payment (future)
   - Footer with terms/conditions

3. **Dashboard Enhanced**
   - Add daily closing checklist (today's cash, payments collected)
   - Quick debt collection widget
   - Tomorrow's follow-ups / upcoming deliveries
   - Staff performance metrics (owner visible)

4. **Billing UX Hardening**
   - Confirm dialog before finalize
   - Show duplicate customer warning
   - Vehicle fitment compatibility check (optional)
   - Discount justification field
   - Print preview before final submit

5. **Analytics Enhancements**
   - Monthly cash flow projection
   - Customer lifetime value ranking
   - Top selling categories (not just products)
   - Profit margin by category

**Effort:** 2-3 sessions | **Impact:** Professional appearance

---

## Phase 3: Business Safety

**Goal:** Prevent financial loss and data corruption.

**Tasks:**
1. **Stock Consistency Audit**
   - Physical count entry feature
   - Variance report (system vs physical)
   - Auto-adjust stock after physical count
   - Audit log (who adjusted when)

2. **Debt Collection Enforcement**
   - Overdue payment alerts
   - SMS/email reminder integration (future backend)
   - Collection workflow (follow-up log)
   - Bad debt write-off feature

3. **Invoice Immutability Safeguards**
   - Warn if customer phone looks similar to existing
   - Confirm total before final submit
   - Review screen (last chance to catch errors)
   - Undo within 2 minutes feature (optional)

4. **Financial Reconciliation**
   - Daily closing report (invoices, payments, discounts)
   - Cash drawer reconciliation
   - Payment method breakdown with totals
   - Variance alerts (if math doesn't add up)

5. **Role-Based Visibility Audit**
   - Verify staff cannot access /analytics, /settings
   - Audit all pages for profit/cost data exposure
   - Add owner-only sections in dashboard
   - Document visibility rules in feature-map.md

**Effort:** 2-3 sessions | **Impact:** Financial safety

---

## Phase 4: Nice-to-Have Polish

**Goal:** Improve day-to-day usability.

**Tasks:**
1. **Bulk Operations**
   - CSV product import
   - Bulk price update
   - Bulk discount apply (end-of-season sale)

2. **Customer Management**
   - Customer note field (internal notes)
   - Customer groups / tiers
   - Auto-remind high-debt customers

3. **Reporting**
   - Month-end financial summary (PDF)
   - Customer statement (what they owe, payment history)
   - Inventory valuation report
   - Tax report (GST breakdown)

4. **Mobile Support**
   - Responsive design polish
   - Mobile POS mode (optimized for phone)
   - Barcode/QR scanning (if device supports)

5. **Integrations**
   - WhatsApp API for payment reminders
   - Email receipt sending
   - Auto SMS on invoice creation

**Effort:** 2-3 sessions | **Impact:** Convenience

---

## Phase 5: Future (Post-V1)

**Goal:** Scale beyond single-device model.

**Tasks:**
1. **Backend & Sync**
   - Add Node.js/Firebase backend
   - Multi-device sync
   - Cloud backup

2. **Multi-Location**
   - Multiple shop support
   - Central inventory
   - Consolidated reporting

3. **Advanced Features**
   - Purchase orders (supplier side)
   - Warranty tracking
   - Service history per vehicle
   - Recurring customers / subscriptions

4. **Third-Party Integrations**
   - Accounting software (Tally, QuickBooks)
   - Payment gateway (Razorpay, PayU)
   - SMS / Email services

**Effort:** 3+ sessions | **Impact:** Scalability

---

## 90-Day Roadmap (Suggested)

### Month 1: Stabilization (Weeks 1-4)
- Week 1-2: Debt audit, backup/restore, error handling
- Week 3-4: Invoice correction workflow decision + implementation

### Month 2: Demo Hardening (Weeks 5-8)
- Week 5-6: Settings page, print template, billing UX
- Week 7-8: Dashboard enhancements, analytics polish

### Month 3: Business Safety (Weeks 9-12)
- Week 9-10: Stock audit, debt collection, financial reconciliation
- Week 11-12: Role audit, safeguards, bug fixes

---

## Metrics of Success

**After Phase 1:**
- ✅ Debt audit passing on all states
- ✅ Data export/import working
- ✅ No localStorage quota errors
- ✅ Invoice correction workflow documented

**After Phase 2:**
- ✅ Settings page fully functional
- ✅ Invoice print looks professional
- ✅ Owner demo smooth and impressive
- ✅ No user-visible bugs in daily workflow

**After Phase 3:**
- ✅ Physical stock audit complete
- ✅ Daily closing reconciliation automated
- ✅ No financial data visible to staff
- ✅ Bad debt tracking in place

---

## Known Blockers

1. **Invoice Edit Workflow** — Must decide on "edit vs. correction" before full implementation
2. **Print Template** — Needs design input (company branding)
3. **Backend** — Needed for multi-device sync; out of V1 scope
4. **Audit Trail** — Requires logging layer; nice-to-have for V1

---

## Deferred / Won't Do (V1)

- Multi-device sync (requires backend)
- Email/SMS integration (requires backend + third-party APIs)
- Barcode scanning (hardware dependent)
- Advanced forecasting (requires much larger dataset)
- Multi-location support (single shop only)
- Custom product fields (would complicate data model)

---

## Next Immediate Step

**Start with Phase 1, Task 1: Debt Audit Verification**

This is the highest-risk, highest-impact task. A drift in debt calculations breaks the entire financial model. Getting this right first ensures all downstream features are built on a solid foundation.

**Implementation sketch:**
```tsx
// In store.tsx, add:
function auditDebt(): { isValid: boolean; discrepancies: Array } {
  const reported = getTotalOutstandingDebt();  // Sum invoice.dueAmount
  const cached = state.customers.reduce((s, c) => s + c.debt, 0);  // Sum customer.debt
  
  if (reported !== cached) {
    return {
      isValid: false,
      discrepancies: [{
        type: "TOTAL_MISMATCH",
        reported,
        cached,
        diff: reported - cached,
      }]
    };
  }
  
  return { isValid: true, discrepancies: [] };
}

// Call this after every RECORD_DEBT_PAYMENT in development
if (process.env.NODE_ENV === "development") {
  const audit = auditDebt();
  if (!audit.isValid) console.error("Debt audit failed:", audit);
}
```

**Then:** Create audit UI in settings page to show status to owner.
