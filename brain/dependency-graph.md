# Dependency Graph — 7 Star Car Accessories

Data flow and relationships between modules. Use this to understand impact when modifying code.

---

## Core Dependencies

```
                        ┌─────────────────────────────────────┐
                        │     React Context Store             │
                        │  (useStore hook + useReducer)       │
                        └──────────────┬──────────────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
                ▼                      ▼                      ▼
            Products[]          Customers[]             Invoices[]
              (inventory)       (profiles)             (transactions)
                │                  │                      │
                │                  │                      │
                └──────────────────┬──────────────────────┘
                                   │
                                   ▼
                            DebtPayments[]
                         (repayment ledger)
```

---

## High-Level Data Flows

### 1. Invoice Creation Flow

```
User clicks "Finalize Invoice" (Billing page)
  ↓
dispatch(ADD_INVOICE)
  ├─ Invoice record created
  ├─ Product.stock reduced (for each item)
  ├─ Customer created OR updated
  │  ├─ customer.debt += invoice.dueAmount
  │  ├─ customer.totalSpent += invoice.amountPaid
  │  ├─ customer.visits++
  │  └─ customer.lastVisit = invoice.date
  └─ localStorage persisted
  ↓
Dashboard analytics recalculate (useMemo)
  ├─ Today's revenue updated
  ├─ Top products refreshed
  ├─ Low stock alerts refreshed
  └─ Customer debt list refreshed
```

**Impact:** Changes to ADD_INVOICE reducer affect inventory, customer totals, and dashboard KPIs.

---

### 2. Debt Repayment Flow

```
Customer page: User clicks "Collect Payment"
  ↓
dispatch(RECORD_DEBT_PAYMENT)
  ├─ DebtPayment record added
  ├─ Invoice updated
  │  ├─ invoice.amountPaid += payment.amount
  │  ├─ invoice.dueAmount -= payment.amount
  │  └─ invoice.paymentStatus recalculated
  ├─ Customer updated
  │  └─ customer.debt recalculated from all their invoice.dueAmounts
  └─ localStorage persisted
  ↓
Customer page refreshes
  ├─ Customer debt updated
  ├─ Invoice payment status updated
  └─ Customer high-debt status may change
  ↓
Dashboard analytics update
  ├─ Outstanding debt KPI recalculated
  ├─ High-debt customer list refreshed
```

**Impact:** Changes to RECORD_DEBT_PAYMENT affect invoice status, customer debt, and analytics.

---

### 3. Stock Adjustment Flow

```
Inventory page: User adjusts product stock
  ↓
dispatch(ADJUST_STOCK)
  ├─ product.stock += delta
  └─ localStorage persisted
  ↓
Dashboard refreshes
  ├─ Low stock alerts refreshed
  ├─ Out of stock alerts refreshed
  └─ Inventory value recalculated
  ↓
Billing page refreshes
  ├─ Product availability recalculated
  └─ Out of stock warning shown if relevant
```

**Impact:** Changes to stock only affect dashboard alerts and billing page availability checks.

---

### 4. Customer Profile Update Flow

```
Customer page: User edits customer details
  ↓
dispatch(UPDATE_CUSTOMER)
  ├─ customer record updated
  └─ localStorage persisted
  ↓
Customer detail page refreshes
  ├─ Customer name/phone displayed
  └─ Invoice list reflects customer info
  ↓
Billing page (if customer is selected)
  └─ Customer name/phone auto-filled
```

**Impact:** UPDATE_CUSTOMER only affects customer display, not financial calculations.

---

## Module Dependency Map

```
Authentication (useRole hook)
  ↓
Page Access Control
  ├─ /login (public)
  ├─ /dashboard (auth required)
  ├─ /billing (auth required)
  ├─ /invoices (auth required)
  ├─ /customers (auth required)
  ├─ /inventory (auth required)
  ├─ /vehicle-fitment (auth required)
  ├─ /analytics (owner only)
  └─ /settings (owner only)

Store (useStore hook)
  ├─ Used by: Dashboard, Billing, Invoices, Customers, Inventory
  ├─ Dispatches: ADD_INVOICE, RECORD_DEBT_PAYMENT, ADD_PRODUCT, etc.
  └─ Selectors: getTotalRevenue, getTotalOutstandingDebt, etc.

Dashboard
  ├─ Depends on: useStore, useRole
  ├─ Reads: invoices[], customers[], products[]
  ├─ Derives: today's revenue, top products, high-debt customers
  └─ Impact: Shows live KPIs, alerts low stock, debt

Billing (POS)
  ├─ Depends on: useStore
  ├─ Reads: products[], customers[]
  ├─ Dispatches: ADD_INVOICE
  ├─ Side effects: Stock reduction, customer creation/update
  └─ Impact: Core transaction generator

Invoices
  ├─ Depends on: useStore
  ├─ Reads: invoices[], debtPayments[]
  ├─ Dispatches: (read-only, but can navigate to repayment)
  └─ Impact: Invoice history and detail view

Customers
  ├─ Depends on: useStore
  ├─ Reads: customers[], invoices[], debtPayments[]
  ├─ Dispatches: UPDATE_CUSTOMER, RECORD_DEBT_PAYMENT
  ├─ Side effects: Customer debt recalculated
  └─ Impact: Customer profiles, debt collection

Inventory
  ├─ Depends on: useStore
  ├─ Reads: products[]
  ├─ Dispatches: ADD_PRODUCT, UPDATE_PRODUCT, ADJUST_STOCK
  ├─ Side effects: Stock levels changed
  └─ Impact: Product catalog, stock alerts

Analytics (Owner Only)
  ├─ Depends on: useStore, useRole
  ├─ Reads: invoices[], customers[], products[], debtPayments[]
  ├─ Derives: Revenue, profit, debt trends, payment method breakdown
  ├─ Filters: Time range, customer segments
  └─ Impact: Financial reports

Vehicle Fitment
  ├─ Depends on: useStore
  ├─ Reads: products[], fitment reference data
  ├─ Dispatches: (read-only)
  └─ Impact: Vehicle-product mapping (not enforced in POS)

Settings
  ├─ Depends on: useStore, useRole
  ├─ Dispatches: RESET_STORE (future), app config changes
  └─ Impact: App-wide configuration (placeholder)
```

---

## Reverse Dependency: What Changes When...

### If Invoice Schema Changes

**Files affected:**
- `types/index.ts` — Update Invoice interface
- `lib/store.tsx` — Update ADD_INVOICE reducer
- `app/billing/page.tsx` — Update invoice creation form
- `app/invoices/[id]/page.tsx` — Update invoice display
- `components/PrintableInvoice.tsx` — Update print template
- `app/dashboard/page.tsx` — Update invoice-related KPIs

**Risk:** High — Invoices are transactional, changes affect multiple modules

---

### If Product Schema Changes

**Files affected:**
- `types/index.ts` — Update Product interface
- `lib/store.tsx` — Update product-related actions
- `app/inventory/page.tsx` — Update product list
- `app/inventory/[id]/page.tsx` — Update product form
- `app/billing/page.tsx` — Update product display in cart
- `app/dashboard/page.tsx` — Update top products logic

**Risk:** Medium — Products are referenced in invoices, care needed with migrations

---

### If Customer Schema Changes

**Files affected:**
- `types/index.ts` — Update Customer interface
- `lib/store.tsx` — Update customer-related actions
- `app/customers/page.tsx` — Update customer list
- `app/customers/[id]/page.tsx` — Update customer detail
- `app/billing/page.tsx` — Update customer selector
- `app/dashboard/page.tsx` — Update high-debt customer logic

**Risk:** Medium — Customer updates are frequent, need backward compatibility

---

### If DebtPayment Logic Changes

**Files affected:**
- `types/index.ts` — Update DebtPayment interface
- `lib/store.tsx` — Update RECORD_DEBT_PAYMENT reducer, calcInvoiceDue
- `app/customers/page.tsx` — Update payment collection form
- `app/invoices/[id]/page.tsx` — Update repayment history display
- `app/analytics/page.tsx` — Update debt trend calculations

**Risk:** Critical — Debt calculation affects financial reports

---

### If Role Model Changes

**Files affected:**
- `hooks/useRole.ts` — Update role logic
- `app/layout.tsx` — Update page guards
- All pages with `requireOwner()` or `requireAuth()`
- `app/analytics/page.tsx` — Owner-only enforcement
- `app/settings/page.tsx` — Owner-only enforcement

**Risk:** High — Role changes affect all access control

---

## Data Consistency Dependencies

### Invoice Creation Consistency Chain

```
ADD_INVOICE must:
  1. Create invoice record
  2. Reduce stock (THEN check don't go negative)
  3. Create/update customer (THEN update debt)
  4. Add customer.invoiceIds reference
  └─ All MUST succeed atomically
```

**Danger:** If step 3 fails, stock is reduced but customer is not updated → inconsistency

**Current safeguard:** All steps in single reducer action (atomic)

---

### Debt Recalculation Consistency Chain

```
RECORD_DEBT_PAYMENT must:
  1. Add payment to debtPayments[]
  2. Find invoice and cap payment amount
  3. Update invoice.amountPaid, invoice.dueAmount
  4. Recalculate invoice.paymentStatus
  5. Recalculate customer.debt from ALL their invoices
  └─ All MUST succeed atomically
```

**Danger:** If step 5 fails, customer.debt is stale

**Current safeguard:** All steps in single reducer action + selective customer update

---

### Customer Uniqueness Dependency

```
ADD_INVOICE logic:
  1. Check existing customer by customerId
  2. If not found, check by phone (in existing customers)
  3. If found, update existing
  4. If not found, create new
  └─ Phone matching MUST be accurate
```

**Danger:** Typo in phone → duplicate customer created

**Current safeguard:** Explicit "existing customer" selection mode in POS

---

## Selector Dependencies

```
getTotalOutstandingDebt()
  └─ Depends on: invoices[].dueAmount (source of truth)
     NOT on: customers[].debt (cache)

getTotalRevenue()
  └─ Depends on: invoices[].amountPaid

getTotalProfit()
  └─ Depends on: invoices[].items[].price, products[].buyPrice

getCustomerOutstandingInvoices(customerId)
  └─ Depends on: invoices[] filtered by customerId and dueAmount > 0

getDebtPaymentsByInvoice(invoiceId)
  └─ Depends on: debtPayments[] filtered by invoiceId
```

**Implication:** If any of these source data changes, selector results automatically update (React memoization)

---

## localStorage Persistence Dependency

```
Every state change:
  1. Reducer updates state
  2. useEffect triggers
  3. Entire state serialized to JSON
  4. Written to localStorage with __v: STORE_VERSION
  └─ If any step fails, data loss possible

On app startup:
  1. localStorage.getItem("autovault_store")
  2. Parse JSON
  3. Check __v version
  4. If version mismatch, ignore and reset
  5. If version matches, dispatch HYDRATE_STORE
  6. Set hydrated = true
  └─ If parsing fails, app starts fresh
```

**Dependency:** All state mutations depend on localStorage working correctly

---

## Critical Data Flows for Stability

```
Critical Path 1: Debt Calculation
  invoice.dueAmount
    ↓
  getTotalOutstandingDebt()
    ↓
  Analytics debt KPI
    ↓
  Customer high-debt alerts
  
  Risk: If dueAmount calculation breaks, all downstream wrong

Critical Path 2: Stock Consistency
  ADD_INVOICE reduces stock
    ↓
  Dashboard low-stock alerts
    ↓
  POS "out of stock" check
    ↓
  Billing workflow
  
  Risk: If stock not reduced, low-stock alerts fail

Critical Path 3: Customer Totals
  invoice.amountPaid + invoice.dueAmount + debtPayments
    ↓
  customer.debt recalculation
    ↓
  Customer page debt display
    ↓
  Dashboard high-debt customer alerts
  
  Risk: If recalculation breaks, customer debt stale
```

---

## Summary for Future Edits

Before modifying:

1. **State schema** — Check what downstream pages depend on it
2. **Reducer action** — Check what side effects it should have
3. **Selector logic** — Check what data sources it reads
4. **Page component** — Check what store data it reads and dispatches

Use this graph to trace impact before making changes.
