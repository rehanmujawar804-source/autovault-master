# Architecture — 7 Star Car Accessories

## High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Next.js App Router (App Router, no API routes)                │
│  ├─ Layout: AppShell (sidebar + main content)                  │
│  ├─ Pages: /dashboard, /billing, /invoices, /customers, etc.   │
│  └─ Components: Button, Card, Table, Charts, etc.              │
│                                                                 │
│  React Context Store (useStore hook)                           │
│  ├─ Reducer: Actions → State mutations                         │
│  ├─ State: { products, customers, invoices, debtPayments }    │
│  └─ Selectors: getCustomerById(), getTotalRevenue(), etc.      │
│                                                                 │
│  localStorage ("autovault_store")                              │
│  └─ Persisted AppState with version tag                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/
├─ app/                          (Next.js App Router pages)
│  ├─ layout.tsx                 (Root layout, AppShell wrapper)
│  ├─ page.tsx                   (Home/dashboard redirect)
│  ├─ login/page.tsx             (Auth entry point)
│  ├─ dashboard/page.tsx         (Main KPI dashboard, owner/staff)
│  ├─ billing/page.tsx           (POS workstation, invoice creation)
│  ├─ invoices/
│  │  ├─ page.tsx                (Invoice list, search, filter)
│  │  └─ [id]/page.tsx           (Invoice detail, repayment history)
│  ├─ customers/
│  │  ├─ page.tsx                (Customer list, debt filter, collection)
│  │  └─ [id]/page.tsx           (Customer detail, invoices, history)
│  ├─ inventory/
│  │  ├─ page.tsx                (Product catalog, search)
│  │  ├─ add/page.tsx            (Add product form)
│  │  └─ [id]/page.tsx           (Edit product)
│  ├─ analytics/page.tsx         (Owner-only BI, charts, reports)
│  ├─ vehicle-fitment/page.tsx   (Product-vehicle mapping)
│  └─ settings/page.tsx          (App config, placeholder)
│
├─ components/                   (Reusable UI components)
│  ├─ ui/
│  │  ├─ Button.tsx
│  │  ├─ Card.tsx
│  │  ├─ Badge.tsx
│  │  ├─ Input.tsx
│  │  ├─ Table.tsx
│  │  └─ PageHeader.tsx
│  ├─ AppShell.tsx               (Main layout wrapper)
│  ├─ Sidebar.tsx                (Navigation menu)
│  ├─ StatCard.tsx               (KPI metric card)
│  ├─ RevenueProfitChart.tsx     (Recharts area chart)
│  ├─ PaymentSplitChart.tsx      (Pie chart for payment methods)
│  └─ PrintableInvoice.tsx       (Invoice HTML for print)
│
├─ lib/
│  ├─ store.tsx                  (React Context + useReducer, persistence)
│  └─ cn.ts                      (Tailwind className utility)
│
├─ hooks/
│  └─ useRole.ts                 (Role-based access control hook)
│
├─ types/
│  └─ index.ts                   (Shared TypeScript definitions)
│
├─ data/                         (Static reference data)
│  ├─ products.ts
│  ├─ customers.ts
│  ├─ invoices.ts
│  ├─ fitments.ts
│  ├─ brands.ts
│  └─ categories.ts
│
└─ public/                       (Static assets)

brain/                           (Project Brain — this system)
├─ master-memory.md              (Compressed AI memory)
├─ memory.md                     (Broad project summary)
├─ architecture.md               (This file)
├─ patterns.md                   (Approved implementation patterns)
├─ decisions.md                  (Engineering choices & rationale)
├─ mistakes.md                   (Known pitfalls)
├─ roadmap.md                    (Feature priorities)
├─ glossary.md                   (Term definitions)
├─ dependency-graph.md           (Data flow relationships)
└─ feature-map.md                (Feature → File mapping)

AGENTS.md                        (Claude operating protocol)
```

---

## Store Architecture (In-Depth)

### Context Provider: `StoreProvider`

```tsx
interface StoreContextValue {
  state: AppState;                                    // Current data
  dispatch: React.Dispatch<Action>;                   // Direct dispatch

  // Notifications
  toast: { message, type } | null;
  showToast(message, type?): void;

  // Action helpers
  addInvoice(invoice): void;
  addProduct(product): void;
  updateProduct(product): void;
  adjustStock(productId, delta): void;
  addCustomer(customer): void;
  updateCustomer(customer): void;
  recordDebtPayment(payment): void;

  // Selector helpers
  getLowStockProducts(): Product[];
  getOutOfStockProducts(): Product[];
  getCustomerById(id): Customer | undefined;
  getInvoiceById(id): Invoice | undefined;
  getInvoicesByCustomer(customerId): Invoice[];
  getCustomerOutstandingInvoices(customerId): Invoice[];
  getDebtPaymentsByInvoice(invoiceId): DebtPayment[];
  getDebtPaymentsByCustomer(customerId): DebtPayment[];
  getTotalRevenue(): number;
  getTotalProfit(): number;
  getTotalOutstandingDebt(): number;
  getInventoryValue(): number;
  getNextInvoiceNumber(): string;
}
```

### Action Types

```tsx
type Action =
  // Products
  | { type: "ADD_PRODUCT"; product: Product }
  | { type: "UPDATE_PRODUCT"; product: Product }
  | { type: "ADJUST_STOCK"; productId; delta }

  // Customers
  | { type: "ADD_CUSTOMER"; customer: Customer }
  | { type: "UPDATE_CUSTOMER"; customer: Customer }

  // Invoices
  | { type: "ADD_INVOICE"; invoice: Invoice }

  // Debt
  | { type: "RECORD_DEBT_PAYMENT"; payment: DebtPayment }

  // Hydration
  | { type: "RESET_STORE" }
  | { type: "HYDRATE_STORE"; state: AppState }
```

### Reducer Logic

**ADD_INVOICE** (most complex):
1. Append invoice to state.invoices
2. Reduce product.stock for each item sold (Math.max 0)
3. Find or create customer
4. Update customer: debt += invoice.dueAmount, totalSpent += invoice.amountPaid, visits++, lastVisit = invoice.date

**RECORD_DEBT_PAYMENT**:
1. Append payment to state.debtPayments
2. Find target invoice, cap payment at current due (calcInvoiceDue)
3. Update invoice: amountPaid += actualAmount, dueAmount -= actualAmount, paymentStatus = recalculated
4. Recalculate all customer invoices due sums, update customer.debt

### Persistence Strategy

```tsx
const STORE_VERSION = "v3-demo-clean-2026";
const STORAGE_KEY = "autovault_store";

// On mount: Load from localStorage
const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
if (saved.__v !== STORE_VERSION) {
  // Version mismatch → wipe old data, start fresh
  localStorage.removeItem(STORAGE_KEY);
  state = INITIAL_STATE;
} else {
  // Version matches → restore saved state
  dispatch({ type: "HYDRATE_STORE", state: saved });
}

// On every state change: Persist to localStorage
localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, __v: STORE_VERSION }));
```

**Why this matters:**
- Bumping STORE_VERSION forces a clean reset across all browsers
- Useful for schema changes, demo resets, or migration
- Prevents stale data bugs

---

## Page Architecture

### Protected Routes

```tsx
// Every protected page uses this pattern:
export default function Page() {
  const { role, loading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !role) {
      router.push("/login");  // Require auth
    }
  }, [loading, role, router]);

  if (loading) return <LoadingSpinner />;
  return <PageContent />;
}
```

### Owner-Only Routes

```tsx
export default function AnalyticsPage() {
  const { isOwner, loading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isOwner) {
      router.push("/dashboard");  // Redirect non-owners
    }
  }, [loading, isOwner, router]);

  if (loading) return <LoadingSpinner />;
  return <AnalyticsContent />;
}
```

---

## Data Types

### Key Interfaces

```tsx
// Invoice
interface Invoice {
  id: string;                    // Unique ID
  invoiceNumber: string;         // INV-YYYY-0001
  customerId: string | null;     // null = walk-in
  customer: string;              // Customer name
  customerPhone: string;
  vehicleNumber: string;         // License plate
  vehicleModel: string;          // e.g., "Mahindra XUV500"
  paymentMethod: PaymentMethod;  // Cash | UPI | Card | Credit
  paymentStatus: PaymentStatus;  // Paid | Partial | Debt
  amountPaid: number;            // Collected so far
  dueAmount: number;             // Still owed
  subtotal: number;              // Before discount
  discount: number;              // Percentage (0-100)
  total: number;                 // subtotal - (subtotal * discount%)
  notes: string;                 // Order notes
  date: string;                  // ISO date
  items: InvoiceItem[];          // Line items
  billedBy?: "Owner" | "Staff";
}

// Customer
interface Customer {
  id: string;
  name: string;
  phone: string;                 // Uniqueness constraint
  debt: number;                  // Derived cache
  totalSpent: number;            // Sum of amountPaid
  visits: number;                // Invoice count
  lastVisit: string;             // ISO date
  invoiceIds: string[];
}

// DebtPayment (Repayment Record)
interface DebtPayment {
  id: string;
  customerId: string;
  invoiceId: string;             // Links to ONE specific invoice
  amount: number;                // Repaid
  date: string;                  // ISO date
  method: PaymentMethod;
  note?: string;
  collectedBy: "Owner" | "Staff";
}

// Product
interface Product {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  stock: number;
  buyPrice: number;              // Owner-only
  sellPrice: number;
  lowStockThreshold: number;
  fitments?: VehicleFitment[];
}
```

---

## Component Composition

### AppShell (Root Layout)

```
AppShell
├─ Sidebar (navigation menu)
├─ Main Content
│  ├─ PageHeader (title + breadcrumbs)
│  └─ Page-specific content
└─ Toast notification (fixed bottom-right)
```

### Dashboard Page

```
Dashboard
├─ StatCard × 4 (revenue, profit, debt, inventory)
├─ Charts
│  ├─ RevenueProfitChart (7-day area chart)
│  ├─ PaymentSplitChart (pie chart)
│  └─ Top Products list
├─ Customer Alerts
│  ├─ High-debt customers
│  ├─ Inventory Alerts
│  │  ├─ Out of stock
│  │  └─ Low stock
│  └─ Recent invoices
└─ Quick lookup (search bar)
```

### Billing Page (POS)

```
BillingPage
├─ Left Panel: Product Search
│  ├─ Category filter
│  ├─ Product list (searchable)
│  └─ Add to cart
├─ Right Panel: Invoice Builder
│  ├─ Cart items
│  ├─ Customer selector (existing/new)
│  ├─ Vehicle details
│  ├─ Discount input
│  ├─ Payment details (method, status, amount)
│  ├─ Staff attribution
│  ├─ Totals (subtotal, discount, total)
│  └─ Finalize button
└─ Post-Invoice:
   ├─ PrintableInvoice component (print preview)
   └─ Clear/new invoice button
```

---

## Data Flow Diagram

```
User adds item to cart
  ↓
Cart state updates locally
  ↓
User finalizes invoice
  ↓
dispatch(ADD_INVOICE)
  ↓
Reducer:
  ├─ Append invoice to invoices[]
  ├─ Reduce product stock for each item
  ├─ Create or update customer (totals, debt, visits)
  └─ Update state
  ↓
useStore() consumers re-render
  ↓
localStorage persisted (with version tag)
```

---

## Role & Auth Flow

```
User visits app
  ↓
useRole() loads role from localStorage
  ↓
role = null? → useEffect redirects to /login
role = "staff"? → useEffect redirects from /analytics
role = "owner"? → Page renders fully
  ↓
User logout() → clear localStorage.role → push /login
```

---

## Print Flow

```
User creates invoice
  ↓
PrintableInvoice component mounts with invoice data
  ↓
User clicks "Print" button
  ↓
window.print() opens browser print dialog
  ↓
Prints HTML-formatted invoice
```

---

## Browser Compatibility

- **Tested on:** Modern browsers (Chrome, Firefox, Safari, Edge)
- **localStorage:** Requires ~5-10MB (typical)
- **CSS:** Tailwind v4, uses CSS variables, no IE11 support
- **JS:** ES2020+, TypeScript compiled to compatible JS

---

## Performance Notes

- **No lazy loading:** All pages loaded eagerly (small app)
- **No code splitting:** Single bundle (lighthouse optimization not prioritized)
- **Memo usage:** useMemo in dashboard, billing to prevent unnecessary recalculations
- **localStorage cost:** Parse + stringify on every state change (acceptable for shop size)
- **Charts:** Recharts renders efficiently for small datasets (< 1000 invoices)

---

## Security Assumptions

- **Single-user, single-device:** No multi-user session management
- **No encryption:** localStorage in plain JSON (assumes trusted device)
- **Role-based UI only:** No API-level authorization (frontend auth only)
- **Walk-in transactions:** No PII enforcement; relies on operator discipline
- **No audit log:** Changes cannot be audited after the fact
