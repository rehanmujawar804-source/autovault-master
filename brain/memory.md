# Project Memory — 7 Star Car Accessories

## Current State

**Version:** 0.1.0 | **Stack:** Next.js 16.2.9, React 19.2.4, Tailwind CSS 4, Recharts 3.8.1

**Project Status:** Substantially complete for single-owner shop management workflow.

---

## What Is Already Complete

### 1. Core System
- ✅ Multi-module Next.js app with App Router
- ✅ React Context + useReducer store (localStorage persistence)
- ✅ Role-based access control (owner/staff/unauth)
- ✅ Responsive desktop-first layout with Sidebar + AppShell
- ✅ Toast notifications (success/error/info)

### 2. Inventory Management
- ✅ Product CRUD (add, edit, delete conceptually via store)
- ✅ Stock tracking with low-stock thresholds
- ✅ Brand, category, SKU metadata
- ✅ Vehicle fitment mapping (brand/model/year)
- ✅ Automatic stock reduction on invoice

### 3. Billing / POS
- ✅ Real-time cart-based invoice creation
- ✅ Product search and filtering by category
- ✅ Discount calculation (percentage-based)
- ✅ Payment method tracking (Cash/UPI/Card/Credit)
- ✅ Customer selection (existing or new/walk-in)
- ✅ Vehicle number/model capture
- ✅ Staff attribution (billed by, collected by)
- ✅ Auto-generated invoice numbering
- ✅ Printable invoice component

### 4. Invoice Management
- ✅ Invoice creation with full item tracking
- ✅ Invoice list view (searchable)
- ✅ Invoice detail view by ID
- ✅ Payment status tracking (Paid/Partial/Debt)
- ✅ Repayment ledger (DebtPayment records)
- ✅ Partial payment recording

### 5. Customer Management
- ✅ Customer profiles
- ✅ Debt tracking per customer (derived from invoice dues)
- ✅ Visit count and last visit date
- ✅ Total spending summary
- ✅ Payment history per customer
- ✅ Debt collection UI (record payments inline)

### 6. Analytics / Reports (Owner Only)
- ✅ Revenue and profit KPIs
- ✅ Outstanding debt summary
- ✅ Inventory value calculation
- ✅ 7-day revenue trend chart
- ✅ Payment method breakdown pie chart
- ✅ Time-range filtering (Today, Week, Month, Quarter, Year, All, Custom)
- ✅ Out-of-stock and low-stock product alerts
- ✅ Customer debt segmentation (High/Partial/No debt)

### 7. Dashboard
- ✅ Owner KPI summary (revenue, profit, debt, inventory)
- ✅ Staff KPI summary (revenue, debt, low stock alerts)
- ✅ Recent invoices list
- ✅ Top selling products by quantity
- ✅ High-debt customer highlights
- ✅ Quick customer/invoice lookup
- ✅ Payment method breakdown

### 8. Authentication
- ✅ Login page with role selection
- ✅ Role-based page guards (owner-only, auth-only)
- ✅ Logout functionality
- ✅ localStorage role persistence

### 9. Settings & System Audits
- ✅ Dynamic shop settings (shop name, owner, phone, address, currency)
- ✅ Customizable invoice prefix preferences
- ✅ System Diagnostics pane for owner-only debt integrity checks and automated reconciliation

### 10. Data Backup & Correction Workflows
- ✅ JSON backup export and import/restore
- ✅ Backward-compatible support for older backup formats
- ✅ Safe invoice soft-voiding workflow with automatic inventory and financial updates
- ✅ Capturing historical item profit with price-at-sale snapshotting

---

## What Is Partially Complete

### 1. Vehicle Fitment
- ⚠️ **Status:** Data structure exists, page exists, but fitment validation in POS is not enforced
- **Need:** Actual fitment validation on purchase (warn if product not fit for vehicle)
- **Impact:** Nice-to-have, not blocking

---

## What Does Not Exist (Out of Scope)

- ❌ Backend API / server (fully client-side)
- ❌ Multi-device sync (localStorage only)
- ❌ Cloud backup (manual export only)
- ❌ Email receipts
- ❌ SMS payment reminders
- ❌ Staff timesheets or task management
- ❌ Accounting integration (GST/tax export)
- ❌ Multi-location support

---

## Current Workflows

### 1. Owner Demo Start
1. Owner logs in (owner role)
2. Starts on dashboard (sees all KPIs)
3. Can add products to inventory
4. Can create invoices via billing
5. Can collect debt payments from customers
6. Can view analytics and business metrics
7. Staff login creates limited visibility

### 2. Billing Workflow
1. POS operator selects products, adds to cart
2. Enters customer details (existing or new)
3. Enters vehicle details
4. Applies discount if needed
5. Selects payment method and status
6. Finalizes → invoice created, stock reduced, customer updated
7. Prints invoice

### 3. Debt Collection Workflow
1. View customers page
2. Expand customer to see outstanding invoices
3. Click "Collect Payment" on an invoice
4. Enter amount, method, collector name
5. Payment recorded → invoice updated, customer debt recalculated
6. Debt can be tracked on customer detail page

### 4. Analytics Review
1. Owner accesses /analytics
2. Selects time range
3. Views revenue, profit, outstanding debt trends
4. Reviews payment method breakdown
5. Checks inventory alerts

---

## Business Rules Inferred From Code

1. **Invoices are immutable** — Once created, no edit possible; repayments are the correction mechanism
2. **Debt is derived** — Customer.debt calculated from invoice dues, not stored directly
3. **Walk-in customers** — Not stored if name = "Walk-in Customer"; prevents profile bloat
4. **Stock reduces on invoice** — Not on payment; prevents stock from going negative during partial payment
5. **Payment methods logged** — Used for business analytics (Cash vs UPI vs Card trends)
6. **Repayments link to specific invoices** — Not bulk customer payments; each payment tied to one invoice
7. **Owner sees cost data** — Staff visibility excludes buy prices and profit margins
8. **Role-based UI** — Entire pages (analytics, settings) hidden from staff
9. **Version-tagged storage** — STORE_VERSION bumps force fresh start for demo/migration
10. **Single-device assumption** — No multi-device sync; data lives in browser localStorage only

---

## Known Limitations

1. **localStorage Quota** — ~5-10MB on most browsers; large shops will hit limits
2. **No Audit Log** — Changes not tracked; staff could theoretically manipulate data if they had store access
3. **Phone as UID** — Customer uniqueness depends on phone; duplicate phones could cause confusion
4. **Rounding Issues** — Discount math uses Math.round(), may lose cents over time
5. **No Cloud Data Backup** — Manual JSON export is implemented for data safety, but cloud sync is not supported
6. **No Offline Sync** — Works offline, but changes don't sync if app runs on multiple devices
7. **Invoice Number Collision Risk on Multi-Device** — Sequence-safe numbering is implemented locally, but multiple independent devices could create collisions if offline without central sync

---

## Recent Changes / Current Build State

- **Empty seed data by design** — App starts with blank products/customers/invoices for live owner demo
- **Store version v3-demo-clean-2026** — Forces fresh start on load
- **Debt payment system active** — Repayment ledger fully implemented and tested
- **Role-based visibility working** — Owner/staff split implemented with proper guards
- **Dashboard analytics complete** — All KPIs and charts present

---

## Development Notes

- **No console warnings on build** (eslint configured)
- **Tailwind CSS dark mode used** (navy/slate theme)
- **Recharts for charting** (revenue trend, payment methods)
- **Lucide icons throughout**
- **TypeScript for type safety**
- **No external API calls** (fully client-side)
- **Mobile-responsive CSS**, but designed for desktop shop workstation

---

## Next Feature Priorities

1. **Hardening for owner demo** — Validation, UX polish, error handling
2. **Settings page functionality** — Business name, currency, demo reset
3. **Invoice edit workflow** — Decide on edit vs. correction pattern
4. **Print template polish** — Professional invoice format
5. **Bulk operations** — CSV product import, batch payment recording
6. **localStorage upgrade path** — Handle data migration when schema changes
