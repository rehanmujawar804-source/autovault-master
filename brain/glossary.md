# Glossary — 7 Star Car Accessories

Shared terminology and definitions used in the app. Use these terms consistently.

---

## Core Business Terms

### Invoice
A document recording a single transaction. Contains items sold, customer details, payment status, and amount. Once created, invoices are immutable; corrections use repayments or correction invoices.

**Related:** POS, Transaction, Sale, Bill

---

### POS (Point of Sale)
The billing/checkout interface where invoices are created. Accessible via `/billing` page. The main workstation for cashier/owner.

**Related:** Billing, Checkout, Workstation

---

### Invoice Number
Auto-generated unique identifier in format `INV-YYYY-0001`. Increments per invoice. Year-based to handle store resets.

**Related:** Invoice ID

---

### Walk-In Customer
A one-time customer, usually not stored in the system. Detected by customer name = "Walk-in Customer". Does not create a customer profile; invoice stands alone.

**Related:** One-Time Transaction, Customer

---

### Debt
Outstanding amount owed by a customer. Derived by summing all their invoice `dueAmount` values. Not stored directly as customer property; recalculated when payments are recorded.

**Example:** Customer has two invoices: INV-001 due ₹5000, INV-002 due ₹3000. Total debt = ₹8000.

**Related:** Outstanding, Due, Payable

---

### Repayment
A partial or full payment against a specific invoice. Each repayment record (DebtPayment) links to one invoice and one customer. Immutable ledger entry.

**Related:** Payment, Collection, Debt Payment

---

### Collection
Act of receiving payment from a customer. Recorded as a DebtPayment. May be partial (pays ₹2000 of ₹5000 owed).

**Related:** Repayment, Collected By

---

### Payment Method
How payment was received: `Cash`, `UPI`, `Card`, or `Credit` (on credit, to be paid later).

**Related:** Payment Status

---

### Payment Status
Current financial state of an invoice:
- **Paid:** Invoice total fully collected
- **Partial:** Some amount paid, some due
- **Debt:** No payment yet, full amount due

**Related:** Due Amount, Amount Paid

---

### Amount Paid
Cumulative cash collected against an invoice so far. Increases with each repayment.

**Formula:** amount_paid + due_amount = invoice.total

---

### Due Amount
Remaining cash owed for an invoice. Decreases with each repayment.

**Formula:** due_amount = total - amount_paid

---

### Discount
Percentage reduction applied to invoice subtotal (0-100%). Stored as percentage, not absolute amount.

**Example:** Subtotal ₹10,000 with 10% discount = ₹1,000 reduction → Total ₹9,000

**Related:** Subtotal, Total

---

### Subtotal
Total of all line items before discount.

**Formula:** subtotal = SUM(price × quantity for each item)

---

### Total
Invoice amount after discount.

**Formula:** total = subtotal - (subtotal × discount%)

---

## Customer & Product Terms

### Customer Profile
Record of a repeat customer. Contains name, phone, debt, total spent, visit count, last visit, and invoice list.

**Related:** Customer ID, Phone, Customer Database

---

### Customer ID
Unique identifier for a customer record. Generated as `c-{timestamp}`.

---

### Phone
Customer contact number. Used as unique identifier for detecting repeat customers. Can cause duplicate profiles if entered incorrectly.

**Related:** Customer Uniqueness, Phone Matching

---

### Stock
Quantity of a product available for sale. Decreases when invoices are created. Can be manually adjusted via `adjustStock()`.

**Related:** Inventory, Available, Quantity

---

### Low Stock Threshold
Product-specific quantity. When stock falls below this, product appears in low-stock alerts on dashboard.

**Example:** Product A has stock 5, threshold 10 → low stock alert shown.

---

### Buy Price
Cost to the shop for a product. Only visible to owner; hidden from staff. Used for profit margin calculation.

**Related:** Cost, COGS

---

### Sell Price
Price charged to customer. Used in invoices. Margin = sell_price - buy_price.

**Related:** Retail Price, MRP

---

### SKU (Stock Keeping Unit)
Unique identifier for a product within the inventory. User-defined, not auto-generated.

**Related:** Product Code, Item Number

---

### Category
Product classification (e.g., "Filters", "Oils", "Batteries"). Used to filter products in POS.

**Related:** Product Type, Group

---

### Brand
Manufacturer of a product (e.g., "Bosch", "Shell", "Exide").

**Related:** Vendor, Manufacturer

---

### Fitment
Vehicle compatibility metadata. Links product to vehicle brand, model, year.

**Example:** Product "Air Filter ABC" fits ["Toyota Fortuner 2020", "Mahindra XUV500 2019"]

**Related:** Compatibility, Vehicle Mapping

---

### Vehicle Fitment Record
Tuple of (brand, model, year) indicating which vehicles a product fits.

**Example:** { brand: "Toyota", model: "Fortuner", year: "2020" }

---

## Owner & Staff Terms

### Owner
Highest privilege role. Can access all pages including analytics, settings, buy prices, profit data. Creates invoices, manages inventory, collects payments.

**Related:** Admin, Management

---

### Staff
Limited privilege role. Can access POS, customers, invoices (view only), but NOT analytics, settings, or cost data.

**Related:** Operator, Cashier, Employee

---

### Billed By
Who created the invoice (Owner or Staff). Recorded on invoice for accountability.

**Related:** Created By, Invoice Creator

---

### Collected By
Who received the payment (Owner or Staff). Recorded on repayment for accountability.

**Related:** Collector, Payment Taker

---

### Role
User's access level: `"owner"`, `"staff"`, or `null` (logged out).

---

## Financial Terms

### Revenue
Total cash collected from all invoices. Sum of all `invoice.amountPaid`.

**Formula:** revenue = SUM(invoice.amountPaid for all invoices)

---

### Profit
Total margin earned. Calculated per-item as (sell_price - buy_price) × quantity, summed.

**Formula:** profit = SUM((item.price - product.buyPrice) × item.quantity for all items in all invoices)

---

### Profit Margin
Percentage profit on a sale.

**Formula:** margin% = (sell_price - buy_price) / sell_price × 100

---

### Outstanding Debt / Outstanding Balance
Total amount customers owe across all open invoices. Same as total debt.

**Formula:** outstanding = SUM(invoice.dueAmount for all invoices)

---

### Inventory Value
Total worth of all products in stock at buy price.

**Formula:** inventory_value = SUM(product.buyPrice × product.stock for all products)

---

### Repayment Ledger
Immutable log of all debt payments received. Each record links to a customer and specific invoice.

---

## Time & Date Terms

### Invoice Date
Date the invoice was created (ISO format: YYYY-MM-DD). Not editable after creation.

---

### Last Visit
Date of customer's most recent invoice. Updated when invoice is created.

---

### Visit Count
Number of invoices associated with a customer. Incremented on each invoice creation.

---

## System Terms

### Store / App State
The entire application data (products, customers, invoices, debtPayments). Managed by React Context + useReducer.

**Related:** State, Database, Data Model

---

### localStorage
Browser's client-side storage API. Used to persist store state to disk. ~5-10MB limit.

---

### Reducer
Function that takes current state + action, returns new state. Handles all state mutations atomically.

**Example:** ADD_INVOICE reducer creates invoice, reduces stock, updates customer totals.

---

### Action
Instruction to the reducer describing what to do. Has a `type` and optional payload.

**Example:** { type: "ADD_INVOICE", invoice: {...} }

---

### Dispatch
Trigger an action in the reducer. Called via `store.dispatch(action)` or via helper methods.

---

### Selector / Selector Helper
Function that queries store state and returns derived data.

**Examples:** `getTotalRevenue()`, `getLowStockProducts()`, `getCustomerOutstandingInvoices()`

---

### useStore Hook
React hook to access store context. Returns store value with state, dispatch, helpers, and selectors.

**Usage:** `const { state, addInvoice, getTotalRevenue } = useStore();`

---

### useRole Hook
React hook to access user role and auth state. Returns role, isOwner, isStaff, loading, logout, requireOwner.

**Usage:** `const { role, isOwner, loading } = useRole();`

---

### STORE_VERSION
Version string for localStorage data (e.g., "v3-demo-clean-2026"). Version mismatch triggers full reset.

**Purpose:** Safe schema migrations and demo resets.

---

### Hydration
Process of loading persisted state from localStorage into the store on app startup.

---

## Transaction States

### Completed Transaction
Invoice created, items sold, customer debt updated, stock reduced. Transaction is finalized.

---

### Partial Payment
Customer paid part of invoice. Remaining due amount tracked. Payment status = "Partial".

---

### Full Payment
Customer paid invoice total. No due amount. Payment status = "Paid".

---

### Credit Sale
Invoice created with payment status "Debt". No payment received yet. Customer owes full amount.

---

## Common Abbreviations

| Abbr | Full Term |
|------|-----------|
| POS | Point of Sale |
| SKU | Stock Keeping Unit |
| ID | Identifier |
| COGS | Cost of Goods Sold |
| UPI | Unified Payments Interface |
| INR | Indian Rupee |
| GST | Goods and Services Tax |
| FOUC | Flash of Unstyled Content (or wrong content) |

---

## Style Guide

When writing code or documentation for this project:

1. **Use singular when referring to types:** "Invoice", "Customer", "Product"
2. **Use plural when referring to collections:** "invoices", "customers", "products"
3. **Use "customer debt" (lowercase) when referring to the amount:** "Customer's debt is ₹5000"
4. **Use "Due Amount" (capitalized) when referring to the field:** "invoice.dueAmount"
5. **Use "repayment" for payment records:** "Record a repayment of ₹2000"
6. **Use "debt collection" as a verb:** "Collecting debt from customers"

---

## Cross-Reference

- For patterns using these terms, see `patterns.md`
- For architectural context, see `architecture.md`
- For business logic reasons, see `decisions.md`
