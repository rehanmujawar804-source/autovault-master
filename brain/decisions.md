# Decisions — 7 Star Car Accessories

Engineering and product decisions captured from the current codebase. These explain the "why" behind design choices.

---

## 1. Client-Side Only Architecture

**Decision:** No backend API; all data persists to localStorage only.

**Rationale:** 
- Single shop owner, single device (shop workstation)
- Faster startup, no server setup burden
- Simpler deployment (just ship the app)
- No cloud infrastructure cost
- Offline-capable (works without internet)

**Impact:**
- ✅ Simple to demo and iterate
- ❌ No multi-device sync
- ❌ No cloud backup
- ❌ localStorage quota limits (5-10MB)
- ❌ No audit trail

**Alternative considered:** Add backend API for sync/backup → deferred until needed

---

## 2. React Context + useReducer for State

**Decision:** Central store using React Context + useReducer + localStorage persistence.

**Rationale:**
- No external state library (Redux, Zustand) overhead
- useReducer encapsulates complex state logic cleanly
- Context provides global access via useStore() hook
- localStorage integration is straightforward

**Impact:**
- ✅ Minimal bundle, easy to understand
- ✅ Single source of truth in store.tsx
- ⚠️ No time-travel debugging (Redux DevTools)
- ⚠️ localStorage parsed/serialized on every state change (acceptable for shop size)

**Alternative considered:** Zustand for lighter syntax → useReducer familiar, good enough

---

## 3. Immutable Debt Model (Not Editable After Creation)

**Decision:** Invoices cannot be edited after creation. Debt payments are immutable ledger records.

**Rationale:**
- Prevents accidental data loss / operator mistakes
- Ledger-based repayments are safer than in-place edits
- Audit trail is implicit (all changes tracked as separate records)
- Matches physical invoice workflow (print → no undo)

**Impact:**
- ✅ Data integrity, hard to corrupt
- ✅ Audit-friendly (all changes are separate records)
- ❌ If data error, owner must create correction invoice or manual adjustment
- ❌ User needs to understand "repayment" model, not direct edit

**Safety mechanism:**
- Stock only reduces on ADD_INVOICE (not on payment)
- Debt recalculated from invoice dues (never stored directly as customer property)

---

## 4. Walk-In Customer Detection

**Decision:** If invoice.customer = "Walk-in Customer", no customer profile is created.

**Rationale:**
- Reduces customer list bloat for casual purchases
- Distinguishes one-time vs repeat customers
- Simplifies debt tracking (walk-ins can't have outstanding debt)

**Impact:**
- ✅ Clean customer list
- ⚠️ Walk-in invoices don't update any customer totals
- ❌ If operator enters "Walk-in Customer" and actual customer details, profile is lost

**Improvement idea:** Use both name + phone to detect existing customer (already implemented)

---

## 5. Phone as Customer Unique Identifier

**Decision:** Detect existing customers by matching phone number in POS.

**Rationale:**
- Phone is stable, required for contact
- Avoids creating duplicate profiles
- Quick lookup in small customer base

**Impact:**
- ✅ Prevents duplicate customers
- ⚠️ Assumes phone is always entered correctly
- ❌ Multiple people sharing one phone → treated as same customer
- ❌ Typos in phone → creates duplicate customer

**Current safeguard:** Explicit "existing customer" mode in POS; user must search and select

---

## 6. Derived Customer Debt Cache

**Decision:** Customer.debt is a derived property, not stored directly. Recalculated from invoice dues whenever debt is recorded.

**Rationale:**
- Single source of truth: invoice.dueAmount
- Prevents cache invalidation bugs
- Easy to verify: sum all invoice.dueAmounts = customer.debt
- Automatic consistency when repayments are recorded

**Impact:**
- ✅ Debt cannot drift (cache is recalculated)
- ✅ Strong audit trail (all changes via RECORD_DEBT_PAYMENT)
- ⚠️ Recalculation on every repayment (acceptable for small shops)
- ❌ No way to "delete" a payment (immutable ledger)

---

## 7. Payment Status Derived from Due vs Total

**Decision:** paymentStatus (Paid | Partial | Debt) calculated from due and total, not stored separately.

**Rationale:**
- Single source of truth: amountPaid + dueAmount
- No chance of status / amount mismatch
- Status changes automatically as payments are recorded

**Impact:**
- ✅ Status always accurate
- ✅ No manual status updates needed
- ⚠️ Status changes on every repayment (acceptable, expected behavior)

---

## 8. STORE_VERSION Version-Tagged Persistence

**Decision:** Every localStorage save includes __v: STORE_VERSION tag. On load, version mismatch triggers full reset.

**Rationale:**
- Safe schema migration path
- Demo reset possible without code change
- Prevents stale data bugs when app is updated

**Impact:**
- ✅ Demo clean slate (bump STORE_VERSION)
- ✅ Schema change safety
- ⚠️ Version bump = data loss for all users
- ⚠️ No migration pathway (could be added later)

**Current version:** v3-demo-clean-2026

---

## 9. Stock Reduction on Invoice Creation, Not on Payment

**Decision:** Product stock reduces when ADD_INVOICE is dispatched, not when payment is recorded.

**Rationale:**
- Stock represents actual inventory
- Items sold the moment invoice created, regardless of payment
- Prevents double-counting if invoice is split-paid

**Impact:**
- ✅ Stock always reflects sold items
- ✅ Accurate low-stock alerts even with pending payments
- ⚠️ Invoices created but not paid still reduce stock
- ❌ No way to "cancel" invoice without manual stock adjustment

---

## 10. Invoice Immutability (No Edit After Create)

**Decision:** Once an invoice is created, it cannot be edited. Only payments can be recorded.

**Rationale:**
- Matches physical invoice workflow (print → immutable)
- Prevents accidental data loss
- Ledger-based corrections are safer than in-place edits
- Simpler to implement and audit

**Impact:**
- ✅ Hard to corrupt data by accident
- ✅ Clear audit trail (all changes are new records)
- ❌ If data error, owner must create correction invoice
- ❌ Inconvenient for typos (qty, price, customer name)

**Alternative:** Add "correction invoice" pattern (debit/credit notes) in future

---

## 11. Owner-Only Pages (Analytics, Settings) Hidden from Staff

**Decision:** Analytics and Settings pages only accessible to owner role. Staff redirected to dashboard.

**Rationale:**
- Owner sees financial data (profit, buy prices, reports)
- Staff sees limited data (revenue, debt, low stock)
- Prevents operator access to sensitive pricing/profit data

**Impact:**
- ✅ Role-based visibility reduces data exposure
- ✅ Staff cannot see margins or costs
- ⚠️ No granular permission system (all-or-nothing owner)
- ❌ Single-device assumption (no concurrent staff logins)

---

## 12. Payment Method Tracking (Cash | UPI | Card | Credit)

**Decision:** Every invoice and repayment logs the payment method.

**Rationale:**
- Analytics can slice by method (cash vs digital)
- Identifies payment trends
- Required for financial reports

**Impact:**
- ✅ Rich payment analytics
- ✅ Can identify cash flow delays (credit vs cash)
- ⚠️ Categories are fixed (no custom methods)

---

## 13. Role Persistence in localStorage

**Decision:** User role stored in localStorage (role key). No session tokens or server auth.

**Rationale:**
- Single device, trusted environment
- No server backend to validate
- Simple login: pick role, stored locally

**Impact:**
- ✅ Simple, works offline
- ✅ No login server needed
- ❌ No actual authentication (role is self-selected)
- ❌ Anyone with browser access can change role

**Security model:** Assumes device is in locked shop, not shared

---

## 14. Discount as Percentage (Not Absolute)

**Decision:** Discount stored and calculated as percentage (0-100), not absolute amount.

**Rationale:**
- Easier to apply and compare
- Cleaner for analytics
- Matches typical POS workflow

**Impact:**
- ✅ Familiar to shop operators
- ⚠️ Rounding errors possible (Math.round loses cents)
- ❌ Cannot apply flat discounts directly (must calculate percentage)

---

## 15. Empty Seed Data by Default

**Decision:** SEED_PRODUCTS, SEED_CUSTOMERS, SEED_INVOICES are intentionally empty arrays.

**Rationale:**
- App starts blank for owner live demo
- Owner builds dataset during demo
- No confusing dummy data
- Clean slate for new deployments

**Impact:**
- ✅ Owner sees real data they enter
- ✅ No confusion with demo data
- ❌ Owner must add products before first sale
- ❌ No reference dataset for testing

**Alternative:** Ship with sample products → not chosen for demo clarity

---

## 16. Vehicle Fitment as Optional Metadata

**Decision:** Fitment data (brand/model/year) attached to products, not enforced in POS.

**Rationale:**
- Shop may sell universal accessories (not vehicle-specific)
- Avoid complexity during invoice creation
- Fitment is for reference, not validation

**Impact:**
- ✅ No POS slowdown for fitment checks
- ✅ Flexible for mixed inventory
- ⚠️ Staff can sell incompatible parts to vehicle
- ❌ No "warn if not fit" feature

**Future:** Add optional fitment validation in POS

---

## 17. Single-Device, Single-User Assumption

**Decision:** App designed for one shop workstation, one owner/staff at a time.

**Rationale:**
- Solo owner shop
- Single cash register
- Simpler logic (no concurrent transactions)
- localStorage not multi-tab safe

**Impact:**
- ✅ No multi-user conflict resolution needed
- ✅ Simple deployment
- ❌ Cannot scale to multi-location
- ❌ No sync if staff member takes device home

**Future:** Multi-device sync requires backend

---

## 18. SKU Uniqueness and Product Archive State

**Decision:** SKU uniqueness check is performed against ALL products, including archived ones.

**Rationale:**
- Prevents creating an active product with a SKU that is already used by an archived product.
- Prevents duplicate SKUs if an archived product is restored later.
- Ensures consistent lookup by SKU and avoids state corruption.
- Keeps inventory history records referencing that SKU unique.

---

## Summary

These decisions shaped the app's current design. When making changes, consider whether they align with or contradict these decisions. If changing a decision, update this file.
