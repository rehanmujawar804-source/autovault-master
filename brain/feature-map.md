# Feature Map — 7 Star Car Accessories

Mapping major features to the files and modules that power them. Use this to find what to edit for a given feature.

---

## Dashboard

**What:** Owner/staff homepage with KPIs, alerts, and business overview.

**Key Files:**
- `app/dashboard/page.tsx` — Main dashboard page component
- `components/StatCard.tsx` — KPI metric cards
- `components/RevenueProfitChart.tsx` — 7-day revenue trend (Recharts)
- `components/PaymentSplitChart.tsx` — Payment method breakdown pie chart
- `lib/store.tsx` — Selectors: getTotalRevenue, getTotalProfit, getTotalOutstandingDebt, getInventoryValue

**Features:**
- Revenue, profit, outstanding debt, inventory value KPIs
- Recent invoices list
- Top-selling products by quantity
- High-debt customer alerts
- Low-stock and out-of-stock product alerts
- Quick customer/invoice search
- 7-day sales trend chart
- Payment method breakdown

**Dependencies:**
- Reads: invoices[], customers[], products[], debtPayments[]
- Writes: None (read-only)

**Edit Here For:**
- Add/remove KPI cards
- Change chart types
- Adjust alert thresholds
- Modify time-range calculations

**Risks:**
- useMemo calculations must be efficient (dashboard is heavy)
- Chart data aggregation must be correct
- Low-stock threshold logic depends on product.lowStockThreshold

---

## Billing / POS

**What:** Invoice creation workstation. Core transaction generation for the shop.

**Key Files:**
- `app/billing/page.tsx` — Main POS page component (very large, ~500 LOC)
- `lib/store.tsx` — Action: addInvoice helper
- `components/PrintableInvoice.tsx` — Invoice print component
- `types/index.ts` — Invoice, CartItem, PaymentMethod types

**Features:**
- Product search and filter by category
- Real-time cart management (add, remove, adjust qty)
- Customer selection (existing or new/walk-in)
- Vehicle details capture
- Discount calculation (percentage)
- Payment method selection (Cash/UPI/Card/Credit)
- Payment status (Paid/Partial/Debt)
- Staff attribution (billed by, collected by)
- Invoice finalization with confirmations
- Printable invoice output

**Dependencies:**
- Reads: products[], customers[]
- Writes: ADD_INVOICE → creates invoice, reduces stock, updates/creates customer

**Edit Here For:**
- Change discount logic
- Add new payment methods
- Modify customer selection flow
- Add vehicle fitment validation
- Adjust validation rules

**Risks:**
- ADD_INVOICE is atomic — all side effects must succeed or none
- Stock reduction happens immediately — can cause overselling if validation fails
- Customer creation from phone could create duplicates if phone matching is wrong
- Discount Math.round() can lose cents

---

## Inventory Management

**What:** Product catalog, stock tracking, and fitment mapping.

**Key Files:**
- `app/inventory/page.tsx` — Product list and search
- `app/inventory/add/page.tsx` — Add product form
- `app/inventory/[id]/page.tsx` — Edit product form
- `lib/store.tsx` — Actions: addProduct, updateProduct, adjustStock
- `types/index.ts` — Product, VehicleFitment types
- `data/brands.ts` — Brand reference list
- `data/categories.ts` — Category reference list
- `data/fitments.ts` — Fitment reference data

**Features:**
- Product CRUD (create, read, update)
- SKU, brand, category metadata
- Stock level tracking with low-stock threshold
- Buy price (owner only) and sell price
- Vehicle fitment mapping
- Stock adjustment (manual count)
- Low-stock alerts

**Dependencies:**
- Reads: products[]
- Writes: ADD_PRODUCT, UPDATE_PRODUCT, ADJUST_STOCK

**Edit Here For:**
- Add new product fields (e.g., warranty, supplier)
- Change fitment structure
- Add bulk import/export
- Modify stock level alerts
- Add barcode scanning

**Risks:**
- Product deletions not possible (would orphan invoices)
- Fitment data not validated during sales
- Stock adjustment doesn't log who did it or why

---

## Invoices

**What:** Invoice history, detail view, and repayment tracking.

**Key Files:**
- `app/invoices/page.tsx` — Invoice list, search, filter
- `app/invoices/[id]/page.tsx` — Invoice detail view with repayment history
- `lib/store.tsx` — Selectors: getInvoiceById, getInvoicesByCustomer, getDebtPaymentsByInvoice
- `types/index.ts` — Invoice, InvoiceItem types

**Features:**
- Invoice list with search/filter
- Invoice details (items, customer, payment status)
- Repayment history per invoice
- View customer profile from invoice
- Print invoice

**Dependencies:**
- Reads: invoices[], debtPayments[]
- Writes: None (read-only, but can navigate to customer for repayment)

**Edit Here For:**
- Change search/filter logic
- Add invoice status indicators
- Modify invoice detail layout
- Add invoice export (PDF)
- Add invoice note editing (future)

**Risks:**
- Invoices are immutable — no way to fix typos after creation
- Invoice-customer link can break if customer is deleted (future)

---

## Customers

**What:** Customer profiles, debt tracking, and payment collection.

**Key Files:**
- `app/customers/page.tsx` — Customer list with debt filtering and collection UI
- `app/customers/[id]/page.tsx` — Customer detail, invoices, payment history
- `lib/store.tsx` — Actions: addCustomer, updateCustomer, recordDebtPayment; Selectors: getCustomerById, getCustomerOutstandingInvoices, getDebtPaymentsByCustomer
- `types/index.ts` — Customer, DebtPayment types

**Features:**
- Customer list with search and debt filter
- Debt segmentation (High/Partial/No Debt)
- Customer detail page (name, phone, debt, visits, last visit)
- Outstanding invoices per customer
- Payment collection modal (amount, method, collector)
- Payment history per customer
- Customer note field (future)

**Dependencies:**
- Reads: customers[], invoices[], debtPayments[]
- Writes: UPDATE_CUSTOMER, RECORD_DEBT_PAYMENT

**Edit Here For:**
- Add customer note field
- Implement customer groups/tiers
- Add payment reminder scheduling
- Modify debt filter thresholds
- Add bulk payment recording

**Risks:**
- Phone uniqueness assumption can create duplicates
- Debt is derived from invoices; if calculation breaks, stale debt shown
- No audit log for payment recordings
- Customer deletion not possible (would orphan invoices)

---

## Debt / Repayments

**What:** Partial payment tracking and debt collection workflow.

**Key Files:**
- `app/customers/page.tsx` — Debt collection form (inline modal)
- `app/customers/[id]/page.tsx` — Payment history per customer
- `lib/store.tsx` — Action: recordDebtPayment; Helper: calcInvoiceDue
- `types/index.ts` — DebtPayment type

**Features:**
- Record partial payments to specific invoices
- Debt payment ledger (immutable)
- Payment method tracking (Cash/UPI/Card/Credit)
- Collector attribution (Owner/Staff)
- Invoice status auto-update (Paid/Partial/Debt)
- Customer debt recalculation

**Dependencies:**
- Reads: invoices[], debtPayments[], customers[]
- Writes: RECORD_DEBT_PAYMENT → updates invoice, recalculates customer.debt

**Edit Here For:**
- Add payment reversal (undo)
- Add bulk payment recording
- Implement payment receipts
- Add overdue payment alerts
- Modify debt collection workflow

**Risks:**
- RECORD_DEBT_PAYMENT is complex; logic errors cause debt drift (CRITICAL)
- Payment capping logic must match calcInvoiceDue
- No way to undo/edit payment after recording
- Customer debt can drift if recalculation breaks

---

## Analytics / Reports

**What:** Owner-only business intelligence and financial reporting.

**Key Files:**
- `app/analytics/page.tsx` — Analytics page (owner only)
- `components/RevenueProfitChart.tsx` — Revenue trend chart
- `lib/store.tsx` — Selectors: getTotalRevenue, getTotalProfit, getTotalOutstandingDebt, getInventoryValue
- `hooks/useRole.ts` — Role guard: requireOwner()

**Features:**
- Time-range filtering (Today, Week, Month, Quarter, Year, All, Custom)
- Revenue and profit KPIs
- Outstanding debt summary
- 7-day revenue trend (area chart)
- Payment method breakdown (pie chart)
- Inventory value calculation
- Customer debt segmentation
- Top selling products
- Low-stock and out-of-stock product alerts
- Payment method breakdown by revenue

**Dependencies:**
- Reads: invoices[], customers[], products[], debtPayments[]
- Writes: None (read-only)
- Auth: Owner only (requireOwner guard)

**Edit Here For:**
- Add new metrics (COGS, margin%, etc.)
- Change time-range definitions
- Add customer lifetime value analysis
- Implement forecasting
- Add profit by category

**Risks:**
- Charts must calculate correctly (common source of bugs)
- Profit calculation depends on product.buyPrice (owner-only data)
- Time-range filtering logic must handle edge cases (year boundaries, etc.)
- Large datasets (>5000 invoices) may slow down calculations

---

## Vehicle Fitment

**What:** Product-vehicle compatibility mapping (reference, not enforced).

**Key Files:**
- `app/vehicle-fitment/page.tsx` — Fitment mapping UI
- `types/index.ts` — VehicleFitment type
- `data/fitments.ts` — Fitment reference data
- `data/brands.ts` — Vehicle brand list

**Features:**
- Map products to vehicle compatibility
- View all fitments per product
- Search by brand/model
- Add/remove fitment mappings

**Dependencies:**
- Reads: products[], fitment reference data
- Writes: UPDATE_PRODUCT (updating fitments array)

**Edit Here For:**
- Add fitment validation in POS
- Implement fitment suggestions (based on vehicle)
- Add fitment compliance reporting
- Modify fitment data structure (e.g., add engine size)

**Risks:**
- Fitment not enforced in POS; staff can still sell incompatible parts
- Fitment data quality depends on operator maintenance

---

## Authentication & Role-Based Access

**What:** Login, logout, and role-based visibility.

**Key Files:**
- `app/login/page.tsx` — Login page
- `hooks/useRole.ts` — Role management hook
- `app/layout.tsx` — App shell with sidebar navigation
- `components/Sidebar.tsx` — Navigation menu (role-aware)
- `lib/store.tsx` — No direct auth logic (separate concern)

**Features:**
- Owner/staff/unauth role support
- localStorage role persistence
- Page-level access guards (owner-only pages)
- Conditional UI rendering (owner-only data)
- Logout functionality
- Loading state to prevent flash-of-wrong-content

**Dependencies:**
- Reads: localStorage role
- Writes: localStorage role (on login/logout)
- Used by: All pages

**Edit Here For:**
- Add "manager" or new role
- Change login logic (add password validation)
- Modify sidebar navigation per role
- Add fine-grained permissions

**Risks:**
- Role stored in plain localStorage (no real auth)
- Single-device assumption (no concurrent user sessions)
- Flash-of-wrong-content possible if loading guard missed
- Role can be manually changed in browser DevTools

---

## Settings

**What:** App configuration and administrative functions (placeholder).

**Key Files:**
- `app/settings/page.tsx` — Settings page
- `hooks/useRole.ts` — Owner-only guard

**Features (Planned):**
- Business name configuration
- Currency preference
- Tax rate (GST)
- Demo reset button
- Data export/import
- Audit log viewer

**Current Status:** Mostly placeholder; needs implementation

**Dependencies:**
- Reads: None (configuration not yet stored)
- Writes: Future RESET_STORE, config changes
- Auth: Owner only

**Edit Here For:**
- Implement business config
- Add demo reset
- Add data import/export
- Add backup scheduling

**Risks:**
- STORE_VERSION bump affects all users globally
- No gradual rollout of resets possible

---

## Print / Invoice Output

**What:** Computerized invoice generation and printing.

**Key Files:**
- `components/PrintableInvoice.tsx` — Invoice HTML template
- `app/billing/page.tsx` — Print trigger (window.print())
- `app/invoices/[id]/page.tsx` — Invoice detail view

**Features:**
- HTML-formatted invoice
- Browser print dialog
- Invoice line items
- Customer and payment details
- Company branding (placeholder)

**Current Status:** Basic; not production-ready

**Dependenc ies:**
- Reads: invoice data
- Writes: None (read-only)

**Edit Here For:**
- Professional invoice template
- Add company logo and branding
- Add QR code (payment link)
- Implement receipt vs invoice modes
- Add terms and conditions footer

**Risks:**
- Print styling not fully tested on all browsers
- No PDF export (relies on browser print to PDF)

---

## Quick Reference: Feature → File

| Feature | Primary File | Related Files |
|---------|--------------|---------------|
| Dashboard KPIs | app/dashboard/page.tsx | components/StatCard, RevenueProfitChart |
| POS Invoice Creation | app/billing/page.tsx | lib/store (addInvoice), types |
| Product Catalog | app/inventory/page.tsx | app/inventory/add, [id] |
| Invoice History | app/invoices/page.tsx | app/invoices/[id] |
| Customer Profiles | app/customers/page.tsx | app/customers/[id] |
| Debt Collection | app/customers/page.tsx | lib/store (recordDebtPayment) |
| Financial Reports | app/analytics/page.tsx | components/RevenueProfitChart |
| Vehicle Fitment | app/vehicle-fitment/page.tsx | types (VehicleFitment) |
| Authentication | app/login/page.tsx | hooks/useRole |
| Settings | app/settings/page.tsx | app/layout |
| Invoice Print | components/PrintableInvoice | app/billing, app/invoices/[id] |

---

## Cross-Cutting Concerns

| Concern | Implementation | Files |
|---------|---|---|
| State Management | React Context + useReducer | lib/store.tsx |
| Persistence | localStorage + version tagging | lib/store.tsx |
| Authorization | Role-based UI guards | hooks/useRole.ts, app/layout.tsx |
| Styling | Tailwind CSS (dark mode) | All .tsx files |
| Icons | Lucide React | components, pages |
| Charts | Recharts | components/RevenueProfitChart, PaymentSplitChart |
| Type Safety | TypeScript | types/index.ts |
| Forms | Controlled inputs | All pages with forms |
| Notifications | Toast notifications | lib/store.tsx (toast state) |

---

## How to Use This Map

**I need to add a new feature:**
1. Identify which existing feature it relates to
2. Look at its Primary File
3. Check Related Files for patterns
4. Look at Dependencies section to see what you'll need to read/write

**I need to fix a bug in [feature]:**
1. Find the feature in this map
2. Go to Primary File
3. Check Related Files and Dependencies
4. Use dependency-graph.md to trace impact

**I'm changing the data model:**
1. Update types/index.ts
2. Find all features using that type
3. Check what needs to update
4. Test all related pages

---

## Maintenance Notes

- Update this map when adding new features
- Keep feature-to-file relationships accurate
- Document risk factors for each feature
- Cross-reference with architecture.md and dependency-graph.md
