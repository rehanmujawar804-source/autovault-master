# 7 Star Car Accessories — Master Memory

**Project:** Desktop-first car accessories shop management system (Next.js 16, React 19, Tailwind, Recharts)

**Status:** Production-ready for owner/staff use. Seed data empty by design for live demo.

---

## What This Is

Autovault is a **standalone shop POS + inventory + financial management system** for a car accessories retailer. Single-device, localStorage-backed, role-gated for owner vs staff visibility.

**Core Modules:**
- **Dashboard** — KPIs, daily trends, recent invoices, top products, low stock alerts
- **Billing/POS** — Real-time invoice creation, cart management, discount/payment handling
- **Inventory** — Product catalog with SKU, brand, category, fitment data, stock levels
- **Invoices** — Invoice history, retrieval by ID/customer, detail view with repayment tracking
- **Customers** — Customer profiles, outstanding debt per customer, payment history
- **Debt/Repayments** — Track partial payments to specific invoices; customer debt derived from invoice dues
- **Vehicle Fitment** — Map products to vehicle (brand/model/year) compatibility
- **Analytics** — Revenue, profit, debt trends, payment method breakdown, time-range filtering
- **Invoice Print** — Computerized invoice generation (printable format)

---

## Architecture Summary

```
src/
  lib/store.tsx              ← Central state (React Context + useReducer)
  types/index.ts             ← Shared type definitions
  hooks/useRole.ts           ← Auth/role logic (owner/staff/null)
  
  app/                       ← Next.js App Router pages
    layout.tsx               ← AppShell (nav, sidebar)
    login/page.tsx           ← Auth entry
    dashboard/page.tsx       ← Owner/staff dashboard
    billing/page.tsx         ← POS workstation
    invoices/page.tsx        ← Invoice list
    invoices/[id]/page.tsx   ← Invoice detail
    customers/page.tsx       ← Customer list + debt collection
    customers/[id]/page.tsx  ← Customer detail
    inventory/page.tsx       ← Product catalog
    inventory/add/page.tsx   ← Add product
    inventory/[id]/page.tsx  ← Edit product
    analytics/page.tsx       ← Owner-only business intelligence
    vehicle-fitment/page.tsx ← Product-vehicle mapping
    settings/page.tsx        ← App config
  
  components/
    AppShell.tsx             ← Main layout wrapper
    Sidebar.tsx              ← Navigation
    PrintableInvoice.tsx     ← Invoice print component
    StatCard.tsx             ← Dashboard KPI cards
    RevenueProfitChart.tsx   ← Recharts graph
    PaymentSplitChart.tsx    ← Payment method breakdown
    ui/                      ← Reusable: Button, Badge, Table, Card, Input
  
  data/
    customers.ts             ← Static customer seed (mostly unused, overridden by store)
    invoices.ts              ← Static invoice seed
    products.ts              ← Static product seed
    fitments.ts              ← Vehicle fitment reference data
    brands.ts                ← Car brand list
    categories.ts            ← Product categories
```

---

## Store Architecture

**Single source of truth: `useStore()` hook**

- **State:** `AppState { products, customers, invoices, debtPayments }`
- **Persistence:** localStorage (`autovault_store` key) with version tagging
- **Reducer Pattern:** actions mutate state immutably
- **Versioning:** `STORE_VERSION` bumps force localStorage reset for demo/migration safety

**Key Actions:**
1. `ADD_PRODUCT`, `UPDATE_PRODUCT`, `ADJUST_STOCK` — Inventory management
2. `ADD_CUSTOMER`, `UPDATE_CUSTOMER` — Customer profiles
3. `ADD_INVOICE` — Atomic: creates invoice, reduces stock, updates customer totals
4. `RECORD_DEBT_PAYMENT` — Logs repayment, updates invoice due/paid, recalculates customer debt

**Critical Derivations:**
- `getTotalOutstandingDebt()` — Sum of all `invoice.dueAmount` (not customer.debt cache)
- `getTotalRevenue()` — Sum of all `invoice.amountPaid`
- `getTotalProfit()` — Per-item margin × qty, summed
- `calcInvoiceDue()` — Current due = invoice.dueAmount - all_repayments_for_invoice
- Customer.debt is a **cache** — always recalculated from invoice dues when debt is recorded

---

## Data Model Relationships

```
Invoice
  ├─ customerId → Customer (or null for walk-in)
  ├─ items[] → productId → Product
  ├─ dueAmount, amountPaid (from payments)
  └─ paymentStatus → "Paid" | "Partial" | "Debt"

DebtPayment
  ├─ invoiceId → Invoice (specific)
  ├─ customerId → Customer
  ├─ amount, date, method, collectedBy
  └─ Linked to one invoice only

Customer
  ├─ invoiceIds[] → Invoice list
  ├─ debt (derived from sum of their open invoice.dueAmounts)
  ├─ totalSpent (sum of amountPaid across invoices)
  ├─ visits, lastVisit (updated on invoice creation)
  └─ phone (uniqueness constraint for walk-in detection)

Product
  ├─ stock, buyPrice, sellPrice
  ├─ lowStockThreshold
  ├─ brand, category, SKU
  ├─ fitments[] → VehicleFitment[] (brand/model/year compatibility)
  └─ Used in invoices via productId reference
```

---

## Role-Based Access Control

**useRole() hook provides:**
- `role` — "owner" | "staff" | null
- `isOwner`, `isStaff` — boolean shortcuts
- `loading` — prevents flash-of-wrong-content
- `logout()`, `requireOwner()`, `requireAuth()` — guards

**Owner-only pages:**
- `/analytics` — Business intelligence, sensitive financial reports
- `/settings` — App configuration

**Staff-visible pages:**
- `/dashboard` (limited stats, no buy prices/profit)
- `/billing`, `/invoices`, `/customers`, `/inventory` (reduced data)

**Auth flow:**
1. Unauth → redirect to `/login`
2. Staff login → set localStorage role="staff"
3. Owner login → set localStorage role="owner"
4. Logout → clear role + push to `/login`

---

## Billing / POS Workflow

**Autovault's "cash register" for invoices:**

1. **Product Search & Cart** — Filter by category, add items with qty
2. **Customer Selection** — Existing customer (search + select) or new/walk-in
3. **Vehicle Info** — Vehicle number, model (optional, for fitment tracking)
4. **Discount & Payment Details**
   - Discount (0-100%), calculated as percentage of subtotal
   - Payment method: Cash | UPI | Card | Credit
   - Payment status: Paid (full) | Partial | Debt (on credit)
5. **Staff Attribution** — Billed by (Owner/Staff), collected by (Owner/Staff)
6. **Invoice Generation**
   - Auto-assigned invoice number: `INV-{YYYY}-{count:04d}`
   - Total calculated after discount
   - Stock reduced immediately
   - Customer debt/visits updated
7. **Printable Invoice** — Component integrates with browser print

---

## Debt Model (Important)

**How debt tracking works:**

- Invoice has `dueAmount` (amount still owed) and `amountPaid` (collected so far)
- `paymentStatus` = "Debt" | "Partial" | "Paid" based on due vs total
- Repayments are **immutable ledger records** (`DebtPayment[]`)
- Each repayment links to ONE invoice, not a bulk payment
- Customer.debt is **derived**: sum of all their invoice.dueAmounts (not stored directly)
- `getTotalOutstandingDebt()` = authoritative source, sums all invoice.dueAmounts

**Safety:** Debt cannot drift because:
1. Invoice.dueAmount only changes via RECORD_DEBT_PAYMENT
2. Customer.debt recalculated on every repayment
3. Repayments are logged, not deleted

---

## High-Risk Areas (Fragile Points)

1. **Debt Calculation Drift** — If calcInvoiceDue() or RECORD_DEBT_PAYMENT logic breaks, debt reports are wrong
2. **Stock Consistency** — Stock only reduces on invoice creation; if ADD_INVOICE is bypassed, stock stays wrong
3. **Customer Uniqueness** — Walk-in detection depends on customer name check + phone match; edge case now handled via explicit phone collision modal requiring operator confirmation
4. **Discount Rounding** — RESOLVED: centralized `roundMoney` (2-decimal) applied at all write boundaries
5. **localStorage Limits** — Large datasets may exceed quota; no migration/cleanup strategy yet
6. **Role Flash** — If useRole() loading flag is not respected, wrong UI flashes before auth is known
7. **Invoice Immutability** — Invoices cannot be edited after creation; need manual correction if data error
8. **Cross-Module Link Breaks** — If invoice.customerId is deleted/orphaned, invoice still exists but customer is gone

---

## Key Patterns

1. **Centralized Actions** — All state changes via useStore() dispatch, not scattered
2. **Atomic Multi-Update** — ADD_INVOICE updates products, customers, invoices in one action
3. **Derived Caches** — Customer.debt is cache; source of truth is invoice.dueAmount
4. **Ledger Not Journal** — Repayments are immutable records, not editable
5. **Selector Helpers** — getCustomerById(), getLowStockProducts() encapsulate queries
6. **Version-Tagged Storage** — STORE_VERSION prevents stale data on code updates
7. **Role Guard in useEffect** — requireOwner() called in effect to avoid race conditions
8. **Empty Seed Data** — SEED_* are intentionally [] for owner demo workflow

---

## Dashboard Analytics

- **KPIs:** Today's invoices, revenue, profit (owner only), outstanding debt, inventory value
- **Charts:** 7-day revenue trend, payment method breakdown (pie), top products
- **Lists:** Recent invoices, high-debt customers, low-stock products, out-of-stock alerts
- **Search:** Quick lookup of customers, invoices by name/number

---

## Business Rules (Inferred)

1. **Walk-in Detection** — If customer name = "Walk-in Customer", no customer profile created
2. **Low Stock Threshold** — Configurable per product; dashboard alerts < threshold
3. **Payment Method Tracking** — All payments logged (Cash/UPI/Card/Credit) for analytics
4. **Role Visibility** — Owner sees buy prices, profit; staff sees sell prices only
5. **Invoice Immutability** — No edit after creation (safety); use repayments for corrections
6. **Vehicle Fitment** — Optional; used for product compatibility, not order validation
7. **Phone as Customer Identifier** — Unique; collision now requires explicit modal confirmation (no silent merge)
8. **Money Precision** — `roundMoney` applied at all write boundaries; no raw `Math.round` on persisted money fields

---

## Future AI Session Bootstrap

When starting work on this project:

1. Read this file first (master-memory.md)
2. Read `architecture.md` for structural details
3. Read `patterns.md` to match existing coding style
4. Read `decisions.md` to understand "why" behind current design
5. Read `mistakes.md` to avoid known pitfalls
6. Read relevant `feature-map.md` sections for the task
7. Only then inspect code and propose changes

**Do not re-scan the whole codebase if Brain already answers the question.**

---

## Immediate Next Steps

- ✅ Stabilize debt calculation (Completed: audit checks & reconciliation panel in settings)
- ✅ Phone collision confirmation modal (Completed: billing/page.tsx, 2026-06-25)
- ✅ Centralized money rounding with `roundMoney` (Completed: all write boundaries, 2026-06-25)
- Consider invoice edit workflow (or formal "correction invoice" pattern)
- Expand print invoice styling and options
