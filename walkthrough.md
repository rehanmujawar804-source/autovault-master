# 7 Star Car Accessories ERP — Full Product Audit

> **Role:** Senior ERP Architect + Product Manager + Brutally Honest Reviewer  
> **Date:** July 2026  
> **Method:** Full codebase read of every page, store, type, and flow  
> **Verdict:** Strong foundation. Dangerous gaps. Several sprints of critical work remain before this is daily-usable.

---

## Executive Summary

This ERP has excellent architectural bones. The data model is clean, immutable ledger principles are respected, and the UI language is consistent. However, **several core daily workflows are incomplete or broken**, and the system currently has no Finance UI despite a Finance engine already being built. Before any new features are added, the gaps below must be fixed.

---

## Module-by-Module Audit

---

### 1. Dashboard
**Status:** 🟡 Needs Improvement

**What works well:**
- Today's bills count and revenue at a glance
- Low stock + out-of-stock alerts with direct links
- Top 5 products by units sold
- Customer debt leaderboard (owner-only)
- 7-day sales trend SVG chart with hover tooltip
- Quick stock lookup (type to search without navigating away)
- Payment method breakdown (Cash / UPI / Card / Credit)
- Role-based visibility (staff sees less, owner sees all)

**Practical problems:**
- The heading says **"Owner Command Center"** even for staff. Confusing.
- "Warehouse Value" — wrong vocabulary for a single-room shop. Staff will be confused.
- "Client Accounts" — no shopkeeper in India uses this phrase. They say "Customers."
- The chart shows sales revenue only. No profit trend. Owner needs to know: "Did I make money this week?" — not just "Did I sell things?"
- **No supplier outstanding summary on the dashboard.** First thing an owner checks in the morning: "What do I owe suppliers?" This is missing.
- **No today's cash collection summary** broken by payment method.
- Quick Operations grid (4 buttons) — **Suppliers is missing.**
- Chart placeholder appears when zero invoices, then fills with data. When a day has ₹0 sales, the area gradient still fills the bottom — misleads users into thinking revenue existed.

**Over-engineered:**
- Gradient blur "design accents" on the financial card do nothing. Pure visual noise.
- Hand-written SVG path calculation is brittle and will break with edge-case data.

---

### 2. Inventory
**Status:** 🟡 Needs Improvement

**What works well:**
- Full product catalog with search + category + brand + stock + status filters
- 11 sort options
- Add / edit product modal with full validation
- Manual stock adjustment with reason
- Product detail page with 6 tabs: Overview, Stock, Sales, Purchases, Movements, Vehicles
- Stock movement history
- Vehicle fitment per product
- Owner-only cost visibility ✅
- CSV export / import

**Practical problems:**
- **No "Reorder from Supplier" button** on stockout products. The data link exists but the UI path does not.
- **Discontinued products still appear in POS billing.** A discontinued SKU should be hidden from the billing product grid.
- **No barcode field.** Billing search works by name/SKU/brand but cannot accommodate barcode scanning.
- `preferredSupplierId` is defined on Product but never shown or editable in the UI. Dead field.
- The "Purchases" tab on product detail is empty until purchases are recorded from the Suppliers module. No guidance exists for new users.
- **No margin column** on the inventory list. Margin is a sort option but never displayed as a column. Owner cannot see it at a glance.
- CSV import has no sample template download.

**Over-engineered:**
- 5 simultaneous filter dimensions (search, category, brand, stock status, product status) + 11 sort options is too many for a 200-product catalog.
- 6-tab product detail page — most staff will never open tabs 4–6.

---

### 3. Suppliers
**Status:** 🟡 Needs Improvement

**What works well:**
- Supplier list with search + Active/Inactive filter
- Add/Edit modal with full contact fields
- Supplier detail: overview, purchase history, payment ledger, dynamic outstanding ✅
- Add Purchase modal with Paid / Partial / Credit + upfront payment
- Record Payment modal against specific purchase
- Chronological ledger timeline
- Finance transaction auto-created on each payment ✅
- Credit purchases correctly skip finance entries ✅

**Practical problems:**
- **One product per purchase only.** A supplier delivers 10 products on one bill. This requires 10 separate purchase records. This is the biggest daily friction point in the entire ERP.
- **No "Pay All Outstanding" button.** If a supplier has 5 unpaid purchases, the owner must open 5 separate payment modals. In practice, suppliers come to collect a lump sum. This is unusable.
- The `whatsApp` field is stored but there is no click-to-message button. It's dead data.
- "Supplier Bill No." is labelled "Invoice Number" — confusing with customer invoices.
- "Upfront payment" label in the ledger is unclear. Should be "Purchase Payment" or "Opening Payment."
- For pure Credit purchases (₹0 paid), no finance entry is created and there is no visual confirmation that the liability was recorded.

**Missing:**
- Multi-product purchase entry
- Bulk payment against all outstanding
- Supplier return / debit note

---

### 4. Customers
**Status:** 🟡 Needs Improvement

**What works well:**
- Customer list with search + debt filters (All / High Debt / Partial / No Debt)
- Stats: total debt, high debt count, total customers
- Expandable row with invoice history
- Collect Payment modal with invoice selection
- Customer detail page with full history
- Debt derived dynamically from invoice dues ✅
- WhatsApp message link
- Payment history tab

**Practical problems:**
- **No customer edit.** Name and phone typos from billing are permanent. This is the most-reported complaint in ERP usability studies.
- **Collect Payment requires selecting a specific invoice.** Real life: "Customer gave ₹500." Staff does not know which invoice. Should auto-apply to oldest unpaid invoice.
- "Total Spent" on customer detail includes Credit invoices where money was never received. The metric is misleading.
- The Collect Payment CTA is buried: Customer list → filter tab → expand row → find invoice → click button. Too many clicks for a daily action.
- No search within a debt filter tab.

**Missing:**
- Customer edit
- Customer merge (duplicate phones create two accounts)
- Customer statement / printable ledger

---

### 5. Billing / POS
**Status:** ✅ Largely Complete (with gaps)

**What works well:**
- 3-panel POS layout: catalog + cart + checkout
- Search by name, SKU, brand with category filter pills
- Existing customer lookup with debt display
- Qty guard against available stock ✅
- Discount (preset + custom)
- Payment method + status with proper validation
- Vehicle number + model capture
- Billed By required field
- Invoice receipt with print + WhatsApp share

**Practical problems:**
- **No price override per line item.** Negotiated pricing happens on every transaction in Indian shops. The POS locks to `product.sellPrice`. This is a blocking gap for real-world use.
- **No bill hold.** Phone rings mid-bill — cart is lost on page refresh. No way to park a transaction.
- **Billed By "Staff" is a decoration, not accountability.** It's a generic dropdown. No actual staff name is recorded.
- `PaymentMethod = "Credit"` alongside `Cash/UPI/Card` is confusing — one is a deferral, not a payment method. Staff training nightmare.
- Category badge colors are hardcoded for 7 specific categories. Any other category gets a generic grey. New categories will look broken.
- **No void / edit after generating invoice** from the receipt screen. The only option after generating is "New Bill."

**Missing:**
- Price override per line item
- Hold / recall bills
- Barcode scan
- Return / exchange from POS

---

### 6. Invoices
**Status:** 🟡 Needs Improvement

**What works well:**
- Invoice list with search + status filter
- Invoices tab + Repayments tab
- Expandable row with collect payment option
- Print + WhatsApp share
- Invoice detail page

**Practical problems:**
- **No invoice void.** `voided`, `voidedAt`, `voidReason` fields exist in types but there is no void button anywhere in the UI. A billing mistake cannot be corrected. This is a critical omission.
- **No date filter.** With 500 invoices, finding last week's bills requires scrolling. Unusable.
- The Repayments tab has no customer filter. Useless for per-customer tracking.
- Invoice detail page is linked only via a small "Details" link in the list — easily missed.

**Missing:**
- Invoice void / cancel
- Date range filter
- Invoice edit (post-billing method change)
- PDF download

---

### 7. Analytics
**Status:** 🟡 Needs Improvement (partially over-engineered)

**What works well:**
- Time range selector with custom dates
- Revenue, Profit, Transactions, Avg Order, Items Sold summary cards
- Dual-line SVG chart (Sales + Profit)
- Top Products by revenue + units
- Payment method breakdown
- Inventory alert tabs
- CSV export
- Owner-only guard

**Practical problems:**
- **Profit calculation is fundamentally wrong.** `getTotalProfit()` = `(sellPrice - currentCost) × quantity`. `currentCost` is today's cost. If a supplier raised prices, all historical profits are retroactively recalculated. `InvoiceItem` does not store cost-at-sale. This is an accounting error, not a minor bug.
- **Analytics completely ignores FinanceTransactions.** Supplier payments (Expenses), customer debt repayments (Income) — none of this appears. The "Profit" shown is gross margin, not actual profit.
- The "Print Report" opens browser print — it will print navigation bars, filter panels, etc. Not formatted for A4.
- Quarter and Year grouped charts are analytics for a retail chain, not one shop.

**Over-engineered:**
- Dual-line SVG chart with Quarter/Year aggregation modes is excessive for single-store.

---

### 8. Vehicle Fitment
**Status:** 🟡 Needs Improvement

**What works well:**
- Derived fitment catalog from product data (smart, no separate database)
- Filter by brand → model → year
- Expandable with compatible products + prices
- Link to product from fitment

**Practical problems:**
- **Read-only page.** To add/edit fitment, staff must navigate to Inventory → find product → edit → add fitment. 4+ clicks with no guidance from this page.
- **No full-text search.** User must know brand before filtering. Cannot search "Swift 2019."
- Fitment year is stored as a `string`. Multi-year fitments ("2018-2022") cannot be parsed or filtered correctly.
- Discontinued product fitment data is lost.

**Over-engineered:**
- Cascading brand → model → year dropdowns is over-engineered for a lookup tool used by staff during customer conversations.

---

### 9. Settings
**Status:** ✅ Largely Complete

**What works well:**
- Shop settings (name, address, prefix, currency, GST)
- JSON backup export + import with validation
- Debt audit panel + reconcile cache
- Store version migration system ✅
- Logout

**Practical problems:**
- Settings stored separately from main store data — fragile restore path.
- **"Debt Audit" panel** (invoice debt vs customer cache) is a developer debugging tool, not an owner setting. It will confuse real users.
- **Role system is localStorage-based.** Anyone who opens DevTools can become Owner. It is a UX convenience, not real security.
- **No user management.** No way to add a staff member, set their access level, or audit what they did.

**Missing:**
- Opening balance entry for Finance accounts
- Real authentication (even a simple PIN)
- Thermal printer configuration

---

### 10. Finance Foundation
**Status:** 🟡 Built but completely invisible

**What exists:**
- `FinanceAccount` (Cash, UPI, Bank) with `openingBalance` ✅
- `FinanceTransaction` with `accountId`, `type`, `category`, `referenceId` ✅
- Auto-entries on: Purchase, Supplier Payment, Invoice Sale, Debt Repayment ✅
- Credit purchases correctly skip finance entries ✅
- 12 selectors: balance by account, today income/expense, monthly, cash flow, by category ✅

**Problems:**
- **Zero UI.** The Finance engine is the most important accounting component in the system and the owner cannot see any of it.
- **Dashboard is completely disconnected from Finance.** Dashboard revenue comes from invoice aggregation. Finance ledger is ignored entirely. Two separate financial systems exist and they are not reconciled in the UI.
- Opening balances are hardcoded to 0 and not configurable. A mid-year migration is impossible.
- `getTodayIncome()` matches by `date.startsWith(today)` using local date string — timezone edge cases can cause entries to appear on the wrong day.

---

## Workflow Audit

### Full Business Flow Test

| Step | Status | Problem |
|---|---|---|
| Add Supplier | ✅ | — |
| Record Purchase | 🟡 | Single product only — no multi-item bill |
| Stock increases | ✅ | — |
| Current Cost updates | ✅ | — |
| Finance Expense created | ✅ | — |
| Bill customer (POS) | 🟡 | No price override, no barcode |
| Invoice created + stock decreases | ✅ | — |
| Finance Income created | ✅ | — |
| Customer debt recorded | ✅ | — |
| Collect debt repayment | 🟡 | Must select specific invoice manually |
| Finance Income on repayment | ✅ | — |
| Record supplier payment | 🟡 | One payment per purchase — no bulk |
| Finance Expense on payment | ✅ | — |
| View Analytics / Profit | 🔴 | Wrong formula. Finance ignored. |
| View Cash Balance | 🔴 | No Finance UI exists |
| Void a billing mistake | 🔴 | No void button exists in any UI |

**Three workflow breaks:**
1. Analytics profit is wrong and untrustworthy
2. Finance ledger is invisible
3. Invoice void is impossible despite the data model supporting it

---

## Data Flow Audit

| Data Path | Status | Notes |
|---|---|---|
| Purchase → Product Cost | ✅ | `currentCost` updated |
| Purchase → Stock | ✅ | Stock incremented |
| Purchase → Finance Expense | ✅ | With `accountId` |
| Sale → Stock reduction | ✅ | — |
| Sale → Finance Income | ✅ | — |
| Invoice → Customer Debt | ✅ | Derived from dues |
| Debt Repayment → Invoice Due | ✅ | Reduces correctly |
| Debt Repayment → Finance Income | ✅ | — |
| Supplier Payment → Purchase Due | ✅ | Reduces correctly |
| Supplier Payment → Finance Expense | ✅ | — |
| Finance Transactions → Dashboard | 🔴 | Dashboard ignores Finance |
| Finance Transactions → Analytics | 🔴 | Analytics ignores Finance |
| Finance Transactions → UI | 🔴 | No Finance page exists |
| InvoiceItem cost at time of sale | 🔴 | Not stored — profit calc uses current cost |
| Product → Supplier Link | 🟡 | `preferredSupplierId` field dead in UI |
| Supplier → Products supplied | 🔴 | No catalog view |

---

## Feature Priority

### 🔴 Foundation — Must fix before daily use

1. **Invoice void / cancel** — billing mistakes happen daily
2. **Finance UI** — owner needs daily cash visibility
3. **Correct profit calculation** — store `costAtSale` in `InvoiceItem`
4. **Customer edit** — name/phone typos are unavoidable
5. **Multi-item supplier purchase** — real supplier bills have multiple products
6. **Price override in POS** — negotiated pricing on every transaction
7. **Invoice date range filter** — lists break beyond 200 entries
8. **Opening balance config** — needed for mid-year migration
9. **Discontinued products hidden from POS**

### 🟡 Important — Build after foundation

1. Bulk supplier payment (pay all outstanding at once)
2. Finance Transactions ledger page (list only, no graphs)
3. Supplier return / debit note
4. Customer statement (printable)
5. Auto-apply debt payment to oldest invoice
6. `preferredSupplierId` editable on product form
7. Low Stock → "Reorder" shortcut to supplier purchase

### 🟢 Nice to Have — Useful later

1. WhatsApp click-to-chat on supplier + customer cards
2. CSV sample template download
3. PDF invoice download
4. Vehicle fitment text search
5. Dashboard: today's cash breakdown by payment method
6. Supplier product catalog view
7. Barcode field on products

### 🚫 Avoid — Do not build

1. Multi-currency support
2. Multi-warehouse
3. Complex quarterly/yearly charts (already built — stop adding more)
4. Email integration
5. Automated reorder triggers
6. Customer loyalty points
7. API integrations
8. Advanced per-page role permissions

---

## Final Roadmap

### Phase 4 — Close Critical Gaps
*No new features. Fix what is broken.*

- Invoice void with reason
- Customer edit
- Price override per line item in POS
- Invoice date range filter
- Fix profit: store `costAtSale` in `InvoiceItem` at billing time; update analytics to use it
- Opening balance configuration for Finance accounts
- Finance Transactions ledger page (simple list — no charts)
- Discontinued products hidden from POS grid

### Phase 5 — Complete Supplier Flow
- Multi-item supplier purchase (one form = multiple products)
- Bulk pay all outstanding for one supplier
- Supplier return / debit note
- Reorder shortcut from low-stock inventory

### Phase 6 — Customer Operations
- Auto-apply debt repayment to oldest invoice
- Customer statement printable
- Customer edit
- WhatsApp click-to-chat links

### Phase 7 — Finance Visibility
- Finance page: Income/Expense ledger with date + category filters
- Finance page: Cash / UPI / Bank balance cards
- Dashboard: today's income/expense/cash in hand from Finance ledger (replace invoice-aggregation)
- Analytics: profit derived from FinanceTransactions (not invoice aggregation)

### Phase 8 — Operational Polish
- Barcode field on products
- PDF invoice download
- Hold / recall bills in POS
- Supplier product catalog view
- Dashboard: Supplier outstanding summary card

---

## Final Score

| Module | Score | Critical Gap |
|---|---|---|
| Dashboard | 6/10 | Finance disconnected. No supplier alert. |
| Inventory | 7/10 | Discontinued in POS. No reorder link. |
| Suppliers | 6/10 | Single-item purchase. No bulk pay. |
| Customers | 7/10 | No edit. Collect CTA buried. |
| Billing / POS | 7/10 | No price override. No void from receipt. |
| Invoices | 6/10 | No void. No date filter. |
| Analytics | 5/10 | Wrong profit formula. Finance ignored. |
| Vehicle Fitment | 6/10 | Read-only. No text search. |
| Settings | 7/10 | Dev panel visible. No user management. |
| Finance Foundation | 3/10 | Built. Completely invisible. |

**Overall: 6/10 — Solid foundation, not yet daily-usable.**

The architecture is sound and the ledger principles are correct. The ERP needs Phase 4 completed before it can be trusted with real transactions in a real shop.
