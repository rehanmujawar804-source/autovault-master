# Patterns — 7 Star Car Accessories

Approved implementation patterns discovered in the current codebase. Follow these when making changes to maintain consistency.

---

## State Management Patterns

### 1. Action Dispatch via Helper Methods

✅ **Approved Pattern:**

```tsx
// Use helper methods from useStore(), not direct dispatch
const { addInvoice, addProduct, recordDebtPayment } = useStore();

addInvoice(invoice);
addProduct({ name, sku, brand, category, stock, buyPrice, sellPrice, lowStockThreshold });
recordDebtPayment({ customerId, invoiceId, amount, date, method, collectedBy });
```

❌ **Avoid:**

```tsx
// Don't dispatch directly with complex payloads
dispatch({ type: "ADD_INVOICE", invoice: {...} });
```

**Why:** Helpers encapsulate validation and ID generation; reduces duplication.

---

### 2. Derived Data via Selectors

✅ **Approved Pattern:**

```tsx
const {
  getTotalRevenue,
  getTotalOutstandingDebt,
  getLowStockProducts,
  getDebtPaymentsByInvoice,
} = useStore();

const revenue = getTotalRevenue();
const outstanding = getTotalOutstandingDebt();
const lowStock = getLowStockProducts();
```

❌ **Avoid:**

```tsx
// Don't recalculate in components
const revenue = state.invoices.reduce((s, inv) => s + inv.amountPaid, 0);
```

**Why:** Selectors encapsulate logic; changes in one place fix all uses.

---

### 3. State Hydration with Loading Guard

✅ **Approved Pattern:**

```tsx
export default function ProtectedPage() {
  const { role, loading } = useRole();

  if (loading) return <LoadingSpinner />;
  // Now safe to access role without flash
  return <Content />;
}
```

❌ **Avoid:**

```tsx
// Don't render before loading is complete
return role === "owner" ? <OwnerContent /> : <StaffContent />;
```

**Why:** Prevents flash-of-wrong-content (FOUC) bug; waits for localStorage to load.

---

## Page & Component Patterns

### 4. Page Structure: Data → Derived → Render

✅ **Approved Pattern:**

```tsx
export default function CustomersPage() {
  const { state, recordDebtPayment } = useStore();
  const [search, setSearch] = useState("");

  // Derived data in useMemo
  const filteredCustomers = useMemo(() => {
    return state.customers.filter(c => c.name.includes(search));
  }, [state.customers, search]);

  return (
    <div>
      <input onChange={(e) => setSearch(e.target.value)} />
      <Table data={filteredCustomers} />
    </div>
  );
}
```

**Why:** Clear separation: load store, compute derived data, then render. Easy to trace.

---

### 5. Modal State Management

✅ **Approved Pattern:**

```tsx
const [collectInvoice, setCollectInvoice] = useState<Invoice | null>(null);
const [collectAmount, setCollectAmount] = useState("");
const [collectMethod, setCollectMethod] = useState<PaymentMethod>("Cash");

// Modal open
function handleCollect(invoice: Invoice) {
  setCollectInvoice(invoice);
  setCollectAmount("");
}

// Modal submit
function handleSubmit() {
  recordDebtPayment({
    customerId: collectInvoice.customerId,
    invoiceId: collectInvoice.id,
    amount: parseFloat(collectAmount),
    date: new Date().toISOString().split("T")[0],
    method: collectMethod,
    collectedBy: "Owner",
  });
  setCollectInvoice(null);  // Close modal
}

// Modal render (conditional)
{collectInvoice && (
  <div className="modal">
    <input value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)} />
    <button onClick={handleSubmit}>Confirm</button>
    <button onClick={() => setCollectInvoice(null)}>Cancel</button>
  </div>
)}
```

**Why:** Modal state is colocated with handlers; clear open/close flow.

---

### 6. Search + Filter Pattern

✅ **Approved Pattern:**

```tsx
const [search, setSearch] = useState("");
const [filter, setFilter] = useState<DebtFilter>("All");

const results = useMemo(() => {
  let data = state.customers;

  // Filter by debt level
  if (filter === "High Debt") {
    data = data.filter(c => c.debt >= 5000);
  } else if (filter === "Partial") {
    data = data.filter(c => c.debt > 0 && c.debt < 5000);
  }

  // Search by name or phone
  if (search) {
    data = data.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
    );
  }

  return data;
}, [state.customers, search, filter]);

return (
  <div>
    <input placeholder="Search..." onChange={(e) => setSearch(e.target.value)} />
    <select onChange={(e) => setFilter(e.target.value as DebtFilter)}>
      <option>All</option>
      <option>High Debt</option>
      <option>Partial</option>
      <option>No Debt</option>
    </select>
    <Table data={results} />
  </div>
);
```

**Why:** Single useMemo encapsulates both filter and search; both state updates trigger re-filter.

---

## Invoice Patterns

### 7. Invoice Creation Workflow

✅ **Approved Pattern:**

```tsx
// Step 1: Build cart
const cart: CartItem[] = [{ product, quantity }];

// Step 2: Collect customer details
const customerName = "Rahul Sharma";
const customerPhone = "9876543210";

// Step 3: Collect invoice details
const paymentMethod = "Cash";
const paymentStatus = "Paid";
const discount = 10;  // percentage

// Step 4: Calculate totals
const subtotal = cart.reduce((s, item) => s + item.product.sellPrice * item.quantity, 0);
const discountAmount = Math.round(subtotal * discount / 100);
const total = subtotal - discountAmount;
const amountPaid = paymentStatus === "Paid" ? total : (paymentStatus === "Partial" ? parseFloat(amountPaidInput) : 0);
const dueAmount = total - amountPaid;

// Step 5: Build invoice object
const invoice: Invoice = {
  id: `inv-${Date.now()}`,
  invoiceNumber: getNextInvoiceNumber(),
  customerId: selectedCustomer?.id || null,
  customer: customerName,
  customerPhone,
  vehicleNumber,
  vehicleModel,
  paymentMethod,
  paymentStatus: calcPaymentStatus(dueAmount, total),
  amountPaid,
  dueAmount,
  subtotal,
  discount,
  total,
  notes,
  date: new Date().toISOString().split("T")[0],
  items: cart.map(item => ({
    productId: item.product.id,
    name: item.product.name,
    quantity: item.quantity,
    price: item.product.sellPrice,
  })),
  billedBy: "Owner",
};

// Step 6: Add to store (this triggers stock reduction + customer update)
addInvoice(invoice);
```

**Why:** Clear step-by-step flow; easy to add validation at any step.

---

### 8. Invoice Repayment Workflow

✅ **Approved Pattern:**

```tsx
// When collecting payment from customer on an outstanding invoice:

const invoice = getInvoiceById(invoiceId);
const currentDue = invoice.dueAmount;  // Or calcInvoiceDue() if pedantic

if (repaymentAmount > currentDue) {
  // Cap at due
  repaymentAmount = currentDue;
}

recordDebtPayment({
  customerId: invoice.customerId,
  invoiceId: invoice.id,
  amount: repaymentAmount,
  date: new Date().toISOString().split("T")[0],
  method: paymentMethod,
  collectedBy: "Owner",
});

// Store reducer now:
// 1. Adds payment to debtPayments ledger
// 2. Updates invoice.amountPaid, invoice.dueAmount
// 3. Recalculates customer.debt from all their invoices
```

**Why:** Single store action handles all updates atomically; no manual customer debt updates.

---

## Form & Input Patterns

### 9. Numeric Input Validation

✅ **Approved Pattern:**

```tsx
const [priceInput, setPriceInput] = useState("");

function handlePriceChange(val: string) {
  // Allow digits and one decimal point
  if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
    setPriceInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      // Use the parsed number
      setPrice(num);
    }
  }
}

return <input value={priceInput} onChange={(e) => handlePriceChange(e.target.value)} />;
```

**Why:** Prevents non-numeric input; allows decimal for currency.

---

### 10. Controlled Form Components

✅ **Approved Pattern:**

```tsx
const [formData, setFormData] = useState({
  customerName: "",
  customerPhone: "",
  vehicleNumber: "",
});

return (
  <input
    value={formData.customerName}
    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
    placeholder="Customer name"
  />
);
```

❌ **Avoid:**

```tsx
// Uncontrolled inputs (unless necessary)
<input ref={nameRef} />
```

**Why:** React state synchronizes input and component; easier to validate/submit.

---

## Role & Auth Patterns

### 11. Owner-Only Page Guard

✅ **Approved Pattern:**

```tsx
export default function AnalyticsPage() {
  const { isOwner, loading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isOwner) {
      router.push("/dashboard");
    }
  }, [loading, isOwner, router]);

  if (loading) return <LoadingSpinner />;
  return <AnalyticsContent />;
}
```

**Why:** Waits for role to load, then checks; prevents flash. Redirects non-owners.

---

### 12. Conditional Role-Based Rendering

✅ **Approved Pattern:**

```tsx
const { isOwner } = useRole();

return (
  <div>
    <StatCard label="Revenue" value={revenue} />
    {isOwner && <StatCard label="Profit" value={profit} />}
    {isOwner && <StatCard label="Buy Price Details" value={buyPriceData} />}
  </div>
);
```

**Why:** Owner sees extra data; staff sees safe public stats. Prevents data leakage.

---

## List & Table Patterns

### 13. Expandable List Item

✅ **Approved Pattern:**

```tsx
const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

const customers = state.customers;

return (
  <div className="space-y-2">
    {customers.map(customer => (
      <div key={customer.id} className="border rounded p-3">
        <div
          className="cursor-pointer flex justify-between"
          onClick={() => setExpandedCustomerId(
            expandedCustomerId === customer.id ? null : customer.id
          )}
        >
          <span>{customer.name}</span>
          <ChevronDown className={expandedCustomerId === customer.id ? "rotate-180" : ""} />
        </div>
        {expandedCustomerId === customer.id && (
          <div className="mt-3 border-t pt-3 space-y-2">
            <p>Debt: ₹{customer.debt}</p>
            <p>Visits: {customer.visits}</p>
            {/* Expanded details */}
          </div>
        )}
      </div>
    ))}
  </div>
);
```

**Why:** Single expandedId state; toggling id opens/closes. Clear visual feedback.

---

## Styling Patterns

### 14. Status Badge Colors

✅ **Approved Pattern:**

```tsx
const STATUS_BADGE: Record<PaymentStatus, string> = {
  Paid: "bg-green-50 text-green-700 border border-green-200",
  Partial: "bg-orange-50 text-orange-700 border border-orange-200",
  Debt: "bg-red-50 text-red-600 border border-red-200",
};

const METHOD_COLORS: Record<PaymentMethod, string> = {
  Cash: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPI: "bg-blue-50 text-blue-700 border-blue-200",
  Card: "bg-purple-50 text-purple-700 border-purple-200",
  Credit: "bg-red-50 text-red-600 border-red-200",
};

// Usage
<span className={`px-3 py-1 rounded-full text-sm font-semibold border ${STATUS_BADGE[paymentStatus]}`}>
  {paymentStatus}
</span>
```

**Why:** Centralized color map; changes apply everywhere; semantic meaning clear.

---

### 15. Dark Theme Tailwind Classes

✅ **Approved Pattern:**

```tsx
// Use Tailwind dark mode utilities (app uses slate/navy palette)
<div className="bg-slate-900 text-slate-100 border border-slate-700">
  <h2 className="text-yellow-400">Heading</h2>
  <p className="text-slate-300">Description</p>
</div>

// For backgrounds
<div className="bg-navy-950">  // Darkest background
<div className="bg-navy-900">
<div className="bg-slate-800">
```

**Why:** Consistent dark theme; uses navy/slate palette; good contrast.

---

## Comment & Documentation Patterns

### 16. Minimal Comments

✅ **Approved Pattern:**

```tsx
// Only comment non-obvious logic
function calcPaymentStatus(due: number, total: number): PaymentStatus {
  if (due <= 0) return "Paid";
  if (due < total) return "Partial";  // Something paid but not all
  return "Debt";  // Nothing paid yet
}
```

❌ **Avoid:**

```tsx
// This sets the state
setState(value);  // ← Obvious, don't comment
```

**Why:** Code is self-documenting; comments explain "why", not "what".

---

## Testing Patterns (When Added)

### 17. Unit Test Pattern (Future)

```tsx
// Example for store reducer tests:
describe("RECORD_DEBT_PAYMENT", () => {
  it("should reduce invoice dueAmount by payment amount", () => {
    const state = { invoices: [{ id: "1", dueAmount: 1000 }], debtPayments: [] };
    const action = { type: "RECORD_DEBT_PAYMENT", payment: { invoiceId: "1", amount: 500 } };
    const newState = reducer(state, action);
    expect(newState.invoices[0].dueAmount).toBe(500);
  });
});
```

---

## Version & Storage Patterns

### 18. Version-Tagged localStorage

✅ **Approved Pattern:**

```tsx
const STORE_VERSION = "v3-demo-clean-2026";

// On mount:
const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
if (saved?.__v !== STORE_VERSION) {
  // Version mismatch → fresh start
  localStorage.removeItem(STORAGE_KEY);
} else {
  // Version matches → restore
  dispatch({ type: "HYDRATE_STORE", state: saved });
}

// On save:
localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, __v: STORE_VERSION }));
```

**Why:** Safely reset on schema changes or demo resets; prevents stale data bugs.

---

## Pattern: Defensive Deduplication in useMemo Lists

Any `useMemo` that maps `state.products`, `state.invoices`, or `state.customers` into a rendered list **must** deduplicate by ID before returning. This prevents React duplicate key errors if localStorage ever contains corrupted data.

✅ **Approved Pattern:**

```tsx
const filtered = useMemo(() => {
  // Always deduplicate first — render-layer safety net for corrupt localStorage data
  const seen = new Set<string>();
  let list = state.products.filter(
    (p) => !seen.has(p.id) && seen.add(p.id) !== undefined
  );

  // ... rest of filtering logic
  return list;
}, [state.products, ...deps]);
```

❌ **Avoid:**

```tsx
// Mapping raw state.products directly without deduplication
const list = state.products.filter((p) => !p.archived);
// If duplicate IDs exist → React duplicate key warning → UI corruption
```

**Where this pattern is applied:**
- `billing/page.tsx` — `filteredProducts`
- `inventory/page.tsx` — `filtered`
- `analytics/page.tsx` — `data` useMemo's `products` variable
- `invoices/page.tsx` — `filtered`
- `customers/page.tsx` — `filtered`
- `dashboard/page.tsx` — dashboard data `useMemo`

**Why:** localStorage-persisted data can be corrupted by CSV imports (same-millisecond `Date.now()` collisions). The render-layer dedup is a last-resort safety net that keeps UI stable even if corrupted data reaches the component.

The primary fix lives in `store.tsx`:
- `ADD_PRODUCT` reducer skips if duplicate ID
- `HYDRATE_STORE` deduplicates all collections on startup (self-healing)

---

## Pattern: Centralized Money Rounding (`roundMoney`)

All persisted monetary values in this app must be rounded using the single shared helper:

```tsx
// Exported from lib/store.tsx
export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
```

✅ **Approved Pattern:**

```tsx
import { roundMoney } from "@/lib/store";

// Final write boundary — round once before persisting
const subtotal = roundMoney(cart.reduce((sum, item) => sum + item.price * item.qty, 0));
const discountAmount = roundMoney((subtotal * discount) / 100);
const total = roundMoney(subtotal - discountAmount);
const amountPaid = roundMoney(Math.min(rawInput, total));
const dueAmount = roundMoney(total - amountPaid);
```

❌ **Avoid:**

```tsx
// Scattered raw rounding — loses EPSILON correction, prone to drift
const discountAmount = Math.round((subtotal * discount) / 100);
```

**Rounding Policy:**
- Round ONCE at each final output boundary (before storing to localStorage)
- Do NOT round at every intermediate subtraction step (causes double-rounding drift)
- Applies to: `invoice.total`, `invoice.amountPaid`, `invoice.dueAmount`, `invoice.subtotal`, debt payment `amount`, customer `debt` and `totalSpent` caches

**Where applied (as of 2026-06-25):**
- `lib/store.tsx` — `roundMoney` exported; applied in ADD_INVOICE, VOID_INVOICE, RECORD_DEBT_PAYMENT, RECONCILE_DEBT_CACHE reducers and all financial selectors
- `app/billing/page.tsx` — subtotal, discountAmount, total, amountPaid, dueAmount; invoice write boundary; WA message builder
- `app/invoices/[id]/page.tsx` — discountAmount display
- `components/PrintableInvoice.tsx` — discountAmount display

---

## Pattern: Phone Collision Confirmation Modal

When an operator enters a new customer in billing but the phone matches an existing profile, **never silently merge**. Show a confirmation modal.

✅ **Approved Pattern:**

```tsx
// Phase 1: Check BEFORE creating invoice
const colliding = state.customers.find((c) => c.phone === trimmedPhone);
if (colliding) {
  setPhoneCollisionCustomer(colliding); // Show modal, stop here
  return;
}

// Phase 2: generateInvoiceWithCustomer() — called after modal confirm
// "Use Existing Customer" path:
generateInvoiceWithCustomer(existing.id, existing.name, existing.phone);
// Normalizes: invoice.customerId = existing.id, invoice.customer = existing.name (canonical)

// "Go Back" path:
setPhoneCollisionCustomer(null); // No invoice, no customer mutation, form stays editable
```

❌ **Avoid:**

```tsx
// Silent merge — links to existing ID but keeps the typed temporary name
const byPhone = state.customers.find((c) => c.phone === phone);
if (byPhone) { customerId = byPhone.id; finalName = byPhone.name; }
```

**Why:** Mixed state where invoice links to existing `customerId` but stores a typed name different from the profile creates data inconsistency in the customer ledger.

---

## Summary

Follow these patterns to keep the codebase consistent. When introducing new features, ask: "What existing pattern applies here?" before writing new code.
