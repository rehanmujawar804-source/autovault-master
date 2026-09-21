# AUTOVAULT — POSTGRESQL SCHEMA & TRANSACTION DESIGN REVIEW

**Review Date:** 2026-09-20  
**Based On:** Forensic Audit + Direct code verification of `src/lib/store.tsx` (4678 lines), `src/types/index.ts` (535 lines), `src/lib/authUtils.ts` (461 lines)  
**Methodology:** Every claim is verified against actual source code, with file:line references.

---

## SECTION 1 — SCHEMA FORENSIC REVIEW

### 1.1 — `products` Table

| Field | Proposed | Verdict | Notes |
|-------|----------|---------|-------|
| `id UUID PK` | `id: string` (prefixed `p-uuid`) | **VERIFIED** | Use native UUID in PG |
| `name TEXT NOT NULL` | `name: string` required | **VERIFIED** | |
| `sku TEXT NOT NULL` | `sku: string` required | **VERIFIED** | |
| `brand TEXT NOT NULL DEFAULT ''` | `brand: string \| ""` | **VERIFIED** | `normalizeProduct()` sets `""` default |
| `category TEXT NOT NULL DEFAULT ''` | `category: string \| ""` | **VERIFIED** | Same |
| `stock INTEGER NOT NULL DEFAULT 0` | `stock: number` | **QUESTIONABLE** | `stock` is integer in practice but the type says `number`. Need to confirm: are fractional quantities possible? Answer: **NO** — all deltas in the reducer use integer arithmetic. Change type to `INTEGER`. |
| `current_cost NUMERIC(12,4)` | `currentCost: number` (WAC) | **VERIFIED** | Precision: WAC is computed with `roundMoney()` (2 decimals). `NUMERIC(12,4)` gives extra headroom. Fine. |
| `sell_price NUMERIC(12,4)` | `sellPrice: number` | **VERIFIED** | |
| `low_stock_threshold INTEGER NOT NULL DEFAULT 5` | `lowStockThreshold: number = 5` | **VERIFIED** | Integer only |
| `status TEXT CHECK (...)` | `status?: "Active"\|"Inactive"\|"Discontinued"` | **VERIFIED** | Default should be `'Active'` — confirmed by `normalizeProduct()` line 284 |
| `is_universal_fit BOOLEAN DEFAULT false` | `isUniversalFit?: boolean` | **VERIFIED** | |
| `display_group TEXT` | `displayGroup?: string` | **VERIFIED** | Nullable — variants share same group name |
| `preferred_supplier_id UUID REFERENCES suppliers` | `preferredSupplierId?: string` | **QUESTIONABLE** | The field is optional and may reference a supplier that has been deleted. Use `ON DELETE SET NULL`. The original `supplier: string` legacy field (free text) should **NOT** be migrated — it's superseded by `preferredSupplierId`. |
| `hsn TEXT` | `hsn?: string` | **VERIFIED** | Nullable |
| `gst_rate NUMERIC(5,2)` | `gst?: number` | **VERIFIED** | Renamed `gst` to `gst_rate` for clarity |
| `location TEXT` | `location?: string` | **VERIFIED** | |
| `description TEXT` | `description?: string` | **VERIFIED** | |
| `created_at TIMESTAMPTZ` | `createdAt?: string` | **VERIFIED** | |
| `updated_at TIMESTAMPTZ` | `updatedAt?: string` | **VERIFIED** | |
| `variant_options JSONB` | (proposed as separate table) | **QUESTIONABLE** | See Section 2 for full variant analysis |
| `variant_values JSONB` | (proposed as separate table) | **QUESTIONABLE** | See Section 2 |
| **MISSING:** `supplier TEXT` legacy field | `supplier?: string` | **UNNECESSARY** | Do NOT migrate. Free-text supplier field is legacy. Only `preferredSupplierId` matters. |

**MISSING from proposed table:**
- No `UNIQUE (sku)` constraint with case-insensitive enforcement. Current code does case-insensitive comparison: `lowerSku = sku.trim().toLowerCase()` (store.tsx:986). Requires `UNIQUE (lower(sku))` or a case-insensitive unique index.
- No trigger to auto-set `updated_at` on UPDATE

**REQUIRED CORRECTIONS:**
```sql
CREATE UNIQUE INDEX idx_products_sku_ci ON products (lower(sku));
-- NOT: CONSTRAINT products_sku_unique UNIQUE (sku)
-- Reason: store.tsx:986 uses .toLowerCase() for comparison
```

---

### 1.2 — `product_fitments` Table

**VERIFIED** — fitments are embedded in `Product.fitments: VehicleFitment[]` (types/index.ts:34). Each `VehicleFitment` has `brand`, `model`, `year`, `yearTo?`. Normalization into a separate table is correct.

| Field | Verdict | Notes |
|-------|---------|-------|
| `vehicle_brand TEXT NOT NULL` | **VERIFIED** | Rename from `brand` to avoid SQL reserved word conflict |
| `model TEXT NOT NULL` | **VERIFIED** | |
| `year_from TEXT NOT NULL` | **VERIFIED** | `year: string` — stored as text (e.g. "2015"), NOT integer |
| `year_to TEXT` | **VERIFIED** | `yearTo?: string` — nullable |
| UNIQUE on `(product_id, vehicle_brand, model, year_from)` | **QUESTIONABLE** | What about duplicate fitments with different `year_to`? The merge logic in `addOrMergeFitment()` (fitmentUtils) handles merging overlapping ranges. The UNIQUE constraint is correct but must allow `year_to` to differ for the same `year_from`. **REMOVE `year_to` from UNIQUE constraint.** |

**CORRECTION:**
```sql
CONSTRAINT product_fitments_unique UNIQUE (product_id, vehicle_brand, model, year_from)
-- This is correct: same product+brand+model+year_from cannot have two fitments
-- year_to is the range end and can vary for different entries on same start year (edge case)
```

---

### 1.3 — `product_variant_options` and `product_variant_values` Tables

**See Section 2 for full analysis.** Short verdict: the proposed separate tables overcomplicate the variant model. JSONB columns on the `products` table match the current usage pattern better.

---

### 1.4 — `suppliers` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `name TEXT NOT NULL` | **VERIFIED** | |
| `contact_person TEXT NOT NULL DEFAULT ''` | **VERIFIED** | `contactPerson: string` — normalized to `""` |
| `phone TEXT NOT NULL DEFAULT ''` | **VERIFIED** | Normalized to 10-digit format by `normalizePhone()` |
| `whatsapp TEXT NOT NULL DEFAULT ''` | **VERIFIED** | Normalized by `normalizeWhatsApp()` |
| `email TEXT NOT NULL DEFAULT ''` | **VERIFIED** | Normalized to lowercase by `normalizeEmail()` |
| `address TEXT NOT NULL DEFAULT ''` | **VERIFIED** | |
| `gst_number TEXT` | **VERIFIED** | `gst?: string` — optional |
| `notes TEXT NOT NULL DEFAULT ''` | **VERIFIED** | |
| `status TEXT CHECK (...)` | **VERIFIED** | `'Active'\|'Inactive'` |

**DANGEROUS ASSUMPTION in original proposal:** Proposed a `UNIQUE` constraint on phone. The current code normalizes phone numbers but does NOT enforce uniqueness at the data layer for suppliers. Duplicate suppliers with the same phone ARE currently possible (though the UI warns). Do NOT add `UNIQUE` constraint on phone — it would break migration.

**MISSING:** No trigger for `updated_at` auto-update on supplier modifications.

---

### 1.5 — `purchases` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `supplier_id UUID NOT NULL` | **VERIFIED** | |
| `product_id UUID NOT NULL` | **VERIFIED** | |
| `quantity INTEGER NOT NULL CHECK (quantity > 0)` | **VERIFIED** | Integer only |
| `buy_price NUMERIC(12,4) NOT NULL` | **VERIFIED** | Snapshot — IMMUTABLE after creation |
| `invoice_number TEXT NOT NULL DEFAULT ''` | **VERIFIED** | `invoiceNumber: string` — empty for purchases without invoice ref |
| `purchase_date DATE NOT NULL` | **VERIFIED** | `date: string (YYYY-MM-DD)` |
| `total_amount NUMERIC(12,4) NOT NULL` | **VERIFIED** | `quantity x buy_price` — IMMUTABLE after creation (migration m002 enforces this) |
| `amount_paid NUMERIC(12,4) NOT NULL DEFAULT 0` | **VERIFIED** | MUTABLE — updated by supplier payments |
| `due_amount NUMERIC(12,4) NOT NULL` | **VERIFIED** | MUTABLE — updated by payments and returns |
| `payment_status TEXT CHECK (...)` | **VERIFIED** | `'Paid'\|'Partial'\|'Credit'` |
| `returned_quantity INTEGER NOT NULL DEFAULT 0` | **VERIFIED** | MUTABLE cache — updated by `ADD_PURCHASE_RETURN` (store.tsx:2461) |
| `purchase_order_id UUID REFERENCES purchase_orders ON DELETE SET NULL` | **VERIFIED** | `purchaseOrderId?: string` — optional |
| `expected_buy_price NUMERIC(12,4)` | **VERIFIED** | `expectedBuyPrice?: number` — for cost variance analysis |

**CRITICAL FINDING:** `created_at` is missing from the proposed schema but IS CRITICAL for FIFO ordering.

**SUPPLIER PAYMENT FIFO ordering** (store.tsx:2355-2358) sorts by `createdAt` falling back to `date`. Without `created_at` the FIFO will be wrong.

**CORRECTION:**
```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- CRITICAL for FIFO ordering
```

**IMMUTABILITY RULES** (verified from migration m002, store.tsx:404-440):
- `buy_price` — IMMUTABLE after insert (historical cost)
- `quantity` — IMMUTABLE after insert
- `total_amount` — IMMUTABLE after insert (= quantity x buy_price, migration m002 enforces this)
- `amount_paid` — MUTABLE (updated by supplier payments)
- `due_amount` — MUTABLE (updated by payments and purchase returns)
- `payment_status` — MUTABLE (derived from amount_paid / due_amount)
- `returned_quantity` — MUTABLE cache (updated by purchase returns)

**DANGEROUS if violated:** Changing `total_amount` after a return payment has been made will corrupt `due_amount` calculations.

---

### 1.6 — `purchase_orders` Table

**VERIFIED** — PurchaseOrder entity is real (types/index.ts:119-130). Table structure is correct.

**MISSING from proposed table:**

`purchase_order_counter` — the system uses a sequential counter stored in `AppState.purchaseOrderCounter` (types/index.ts:459) to generate `PO-2026-00001` style numbers. This counter must be preserved in PostgreSQL, either as a SEQUENCE or a settings row.

---

### 1.7 — `invoices` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `invoice_number TEXT NOT NULL UNIQUE` | **VERIFIED** | Critical — collision detection in `ensureUniqueInvoiceNumber()` (store.tsx:748) |
| `customer_id UUID REFERENCES customers ON DELETE SET NULL` | **VERIFIED** | `null = walk-in customer` (types/index.ts:216) |
| `customer_name TEXT NOT NULL DEFAULT 'Walk-in Customer'` | **VERIFIED** | Historical snapshot — denormalized |
| `customer_phone TEXT NOT NULL DEFAULT ''` | **VERIFIED** | Historical snapshot — denormalized |
| `vehicle_number TEXT NOT NULL DEFAULT ''` | **VERIFIED** | |
| `vehicle_model TEXT NOT NULL DEFAULT ''` | **VERIFIED** | |
| `payment_method TEXT CHECK (...)` | **VERIFIED** | `'Cash'\|'UPI'\|'Card'` |
| `payment_status TEXT CHECK (...)` | **VERIFIED** | 7-value enum |
| `amount_paid NUMERIC(12,4)` | **VERIFIED** | MUTABLE — updated by debt payments, void, returns |
| `due_amount NUMERIC(12,4)` | **VERIFIED** | MUTABLE — updated by debt payments, returns, void |
| `subtotal NUMERIC(12,4)` | **VERIFIED** | IMMUTABLE after creation |
| `discount NUMERIC(5,2)` | **VERIFIED** | Percentage 0-100 — IMMUTABLE after creation |
| `total NUMERIC(12,4)` | **VERIFIED** | `subtotal x (1 - discount/100)` — IMMUTABLE after creation |
| `credit_redeemed NUMERIC(12,4)` | **VERIFIED** | `creditRedeemed?: number` — snapshot at time of invoice |
| `notes TEXT NOT NULL DEFAULT ''` | **VERIFIED** | |
| `invoice_date DATE NOT NULL` | **VERIFIED** | `date: string (YYYY-MM-DD)` |
| `billed_by TEXT CHECK (...)` | **VERIFIED** | `billedBy?: 'Owner'\|'Staff'` |
| `voided BOOLEAN NOT NULL DEFAULT false` | **VERIFIED** | |
| `voided_at TIMESTAMPTZ` | **VERIFIED** | Nullable — only set when voided |
| `void_reason TEXT` | **VERIFIED** | |
| `voided_by TEXT` | **VERIFIED** | |
| `shop_snapshot JSONB` | **VERIFIED** | `shopSnapshot?: InvoiceShopSnapshot` — MUST be JSONB, never FK |
| `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | **VERIFIED** | CRITICAL for FIFO debt payment ordering |

**MISSING from proposed table:**
- `created_at` — **CRITICAL** — FIFO debt ordering uses `createdAt || date` (store.tsx:1445-1447). Without it FIFO breaks.

**DANGEROUS ASSUMPTION:**
- `discount` proposed as `NUMERIC(5,2)` — this means max value is `999.99`. Discount is a percentage 0-100, so `NUMERIC(5,2)` is fine. But add `CHECK (discount >= 0 AND discount <= 100)`.

---

### 1.8 — `invoice_items` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `invoice_id UUID NOT NULL REFERENCES invoices CASCADE` | **VERIFIED** | |
| `product_id UUID NOT NULL REFERENCES products` | **QUESTIONABLE** | If product is deleted, should we allow it? In current code `isProductSafeToDelete()` prevents deletion if product has invoice items. Use `ON DELETE RESTRICT` not `CASCADE`. |
| `product_name TEXT NOT NULL` | **VERIFIED** | Historical snapshot — `item.name` from `InvoiceItem` |
| `quantity INTEGER NOT NULL CHECK (quantity > 0)` | **VERIFIED** | Integer only |
| `sell_price NUMERIC(12,4) NOT NULL` | **VERIFIED** | Historical snapshot — `item.price` (NOT current product.sellPrice) |
| `cost_price NUMERIC(12,4) NOT NULL DEFAULT 0` | **VERIFIED** | Historical snapshot — `item.costPrice` (backfilled by m003 if missing) |
| `returned_quantity INTEGER NOT NULL DEFAULT 0` | **QUESTIONABLE** | This is a mutable CACHE (`item.returnedQuantity`). It is updated by `ADD_SALES_RETURN` (store.tsx:2894-2896) and reversed by `CANCEL_SALES_RETURN` (store.tsx:3103-3109). **DANGEROUS** — it creates a synchronization risk between `invoice_items.returned_quantity` and `sales_return_items`. See Section 7. |

**CRITICAL FINDING:** `invoice_items` has no `id` in the original TypeScript type (`id?: string`). The audit noted items get backfilled with `inv-item-${inv.id}-${idx}`. In PostgreSQL every row MUST have a stable UUID. This is essential because `SalesReturnItem.invoiceItemId` references it.

---

### 1.9 — `debt_payments` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `receipt_number TEXT UNIQUE` | **VERIFIED** | `PAY-000001` sequential — nullable for older records |
| `customer_id UUID NOT NULL REFERENCES customers` | **QUESTIONABLE** | What happens if customer is deleted? Current code: customer deletion is not implemented. Use `ON DELETE RESTRICT` for safety. |
| `invoice_id UUID NOT NULL REFERENCES invoices` | **VERIFIED** | |
| `amount NUMERIC(12,4) NOT NULL CHECK (amount > 0)` | **VERIFIED** | |
| `payment_date DATE NOT NULL` | **VERIFIED** | `date: string (ISO date)` |
| `method TEXT CHECK (...)` | **VERIFIED** | `'Cash'\|'UPI'\|'Card'` |
| `note TEXT` | **VERIFIED** | |
| `collected_by TEXT CHECK (...)` | **VERIFIED** | `collectedBy: 'Owner'\|'Staff'` |
| `voided BOOLEAN NOT NULL DEFAULT false` | **VERIFIED** | |
| `voided_at TIMESTAMPTZ` | **VERIFIED** | |
| `void_reason TEXT` | **VERIFIED** | |
| `voided_by TEXT` | **VERIFIED** | |

**MISSING:** `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — needed for audit trail.

**SEQUENCE DESIGN:** The `paymentReceiptCounter` (types/index.ts:462) is stored in `AppState`. In PostgreSQL, use a dedicated SEQUENCE: `CREATE SEQUENCE payment_receipt_seq`. The receipt number format is `PAY-${seq.padStart(6, '0')}`.

---

### 1.10 — `supplier_payments` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `supplier_id UUID NOT NULL` | **VERIFIED** | |
| `purchase_id UUID NOT NULL` | **VERIFIED** | |
| `amount NUMERIC(12,4) NOT NULL CHECK (amount > 0)` | **VERIFIED** | |
| `payment_date DATE NOT NULL` | **QUESTIONABLE** | The source type `date: string` is an ISO **timestamp** for supplier payments (store.tsx:2163: `purchase.date + "T12:00:00.000Z"`), not just a date. Should be `TIMESTAMPTZ`. |
| `method TEXT CHECK (...)` | **VERIFIED** | |
| `note TEXT` | **VERIFIED** | |
| `paid_by TEXT CHECK (...)` | **VERIFIED** | |
| `is_upfront BOOLEAN NOT NULL DEFAULT false` | **VERIFIED** | `isUpfront?: boolean` — marks payments created alongside purchase creation |
| `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | **MISSING** | Need for audit trail |

---

### 1.11 — `stock_movements` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `product_id UUID NOT NULL REFERENCES products` | **QUESTIONABLE** | `ON DELETE CASCADE` is appropriate ONLY for pure audit records. But current `isProductSafeToDelete()` prevents deletion of products with movements. Use `ON DELETE RESTRICT`. |
| `type TEXT CHECK (...)` | **VERIFIED** | 9 types from `StockMovementType` (types/index.ts:156-165) |
| `delta INTEGER NOT NULL` | **VERIFIED** | Positive = in, Negative = out. Integer only. |
| `description TEXT NOT NULL DEFAULT ''` | **VERIFIED** | `desc: string` (renamed to avoid SQL reserved word) |
| `reference TEXT NOT NULL DEFAULT ''` | **VERIFIED** | Invoice#, PO#, etc. |
| `note TEXT` | **VERIFIED** | `note?: string` — nullable |
| `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | **VERIFIED** | Replaces `date: string` (ISO timestamp) |

**IMPORTANT:** Do NOT use `CASCADE` on `product_id` FK. If a product is deleted, its stock movements should block the deletion (RESTRICT). Only pure audit records that have no business meaning should CASCADE.

---

### 1.12 — `finance_accounts` Table

**VERIFIED** with important clarification:

The three accounts are HARDCODED with fixed IDs `acc-cash`, `acc-upi`, `acc-bank` (store.tsx:98-102). This is a fixed configuration, not user-managed data.

**Proposed:** `id UUID PK` — **QUESTIONABLE**

Current code uses string IDs like `acc-cash`. In PostgreSQL these must either:
1. Be migrated to UUIDs with a remapping table, OR
2. Keep the string IDs but use TEXT as the PK

**Recommendation:** Keep `id TEXT PK` for the three finance accounts. They are effectively an enum with a balance. There will never be more than 3 accounts (in single-shop mode).

```sql
CREATE TABLE finance_accounts (
  id              TEXT PRIMARY KEY,   -- 'acc-cash', 'acc-upi', 'acc-bank'
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('Cash','Bank','UPI')),
  opening_balance NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.13 — `finance_transactions` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `account_id TEXT NOT NULL REFERENCES finance_accounts(id)` | **CORRECTED** | Must be `TEXT` if finance_accounts.id is TEXT |
| `type TEXT CHECK ('Income','Expense')` | **VERIFIED** | |
| `category TEXT NOT NULL` | **VERIFIED** | 22 possible `FinanceCategory` values (types/index.ts:342-362) — add CHECK constraint |
| `reference_id TEXT NOT NULL` | **QUESTIONABLE** | Polymorphic — see Section 11 for full analysis |
| `reversal_of UUID REFERENCES finance_transactions(id)` | **QUESTIONABLE** | See Section 11 — type mismatch if finance_transactions.id is UUID but reference_id is TEXT |
| `supplier_id UUID REFERENCES suppliers` | **VERIFIED** | `ON DELETE SET NULL` |
| `customer_id UUID REFERENCES customers` | **VERIFIED** | `ON DELETE SET NULL` |
| `amount NUMERIC(12,4) NOT NULL CHECK (amount > 0)` | **VERIFIED** | Always positive — type (Income/Expense) determines direction |
| `transaction_date TIMESTAMPTZ NOT NULL` | **VERIFIED** | `date: string` is ISO timestamp in finance transactions |
| `method TEXT CHECK (...)` | **VERIFIED** | |
| `notes TEXT` | **VERIFIED** | |

---

### 1.14 — `sales_returns` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `return_number TEXT NOT NULL UNIQUE` | **VERIFIED** | `SR-2026-00001` sequential |
| `invoice_id UUID NOT NULL REFERENCES invoices` | **VERIFIED** | |
| `customer_id UUID REFERENCES customers` | **VERIFIED** | Nullable for walk-in returns. `SalesReturn.customerId: string` may be empty string. Make NULLABLE. |
| `refund_method TEXT NOT NULL CHECK (...)` | **VERIFIED** | `'Cash'\|'UPI'\|'Bank'\|'Adjustment'\|'Exchange'` — 5 values |
| `total_refund NUMERIC(12,4) NOT NULL DEFAULT 0` | **VERIFIED** | |
| `status TEXT CHECK (...)` | **VERIFIED** | `'Pending'\|'Refunded'\|'Adjusted'\|'Cancelled'` |
| `cash_refunded NUMERIC(12,4) NOT NULL DEFAULT 0` | **VERIFIED** | Computed and stored at creation (store.tsx:2876-2882) — IMMUTABLE |
| `debt_cancelled NUMERIC(12,4) NOT NULL DEFAULT 0` | **VERIFIED** | IMMUTABLE — snapshot at creation |
| `debt_adjusted NUMERIC(12,4) NOT NULL DEFAULT 0` | **VERIFIED** | `debtAdjusted` is alias for `debtCancelled` (types/index.ts:501) — keep both for compatibility |
| `credit_created NUMERIC(12,4) NOT NULL DEFAULT 0` | **VERIFIED** | IMMUTABLE — amount of store credit issued |
| `exchange_difference NUMERIC(12,4)` | **VERIFIED** | Can be NULL (non-exchange returns), positive (customer pays extra) or negative (store refunds) |
| `difference_payment_method TEXT` | **VERIFIED** | `'Cash'\|'UPI'\|'Card'\|'Adjustment'` |
| `cancellation_reason TEXT` | **VERIFIED** | |
| `cancelled_by TEXT` | **VERIFIED** | |
| `cancelled_at TIMESTAMPTZ` | **VERIFIED** | |
| `created_by TEXT` | **VERIFIED** | |
| `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | **VERIFIED** | |

**MISSING:** `notes TEXT` — `SalesReturn.notes?: string` (types/index.ts:495) — was not in proposed table.

---

### 1.15 — `sales_return_items` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `sales_return_id UUID NOT NULL REFERENCES sales_returns CASCADE` | **VERIFIED** | |
| `invoice_item_id UUID REFERENCES invoice_items` | **VERIFIED** | `SalesReturnItem.invoiceItemId: string` — the matching logic in the reducer checks both `ri.invoiceItemId === item.id` AND `(!ri.invoiceItemId && ri.productId === item.productId)` (store.tsx:2802, 2891). Some legacy items have no invoiceItemId. Make NULLABLE. |
| `product_id UUID NOT NULL REFERENCES products` | **VERIFIED** | |
| `product_name TEXT NOT NULL` | **VERIFIED** | Historical snapshot |
| `quantity INTEGER NOT NULL CHECK (quantity > 0)` | **VERIFIED** | |
| `selling_price NUMERIC(12,4) NOT NULL` | **VERIFIED** | `sellingPrice: number` — snapshot |
| `refund_amount NUMERIC(12,4) NOT NULL DEFAULT 0` | **VERIFIED** | `refundAmount: number` |
| `total_amount NUMERIC(12,4) NOT NULL` | **VERIFIED** | `quantity x sellingPrice` — convenience field |

---

### 1.16 — `exchange_items` Table

**VERIFIED** — `ExchangeItem` (types/index.ts:478-484) has `productId`, `productName`, `quantity`, `sellingPrice`, `costPrice`. All proposed fields are correct.

---

### 1.17 — `customer_credit_transactions` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `customer_id UUID NOT NULL REFERENCES customers` | **VERIFIED** | |
| `type TEXT CHECK (...)` | **VERIFIED** | 5 types: `'Issue'\|'Redeem'\|'IssueReversal'\|'RedeemReversal'\|'Reversal'` |
| `amount NUMERIC(12,4) NOT NULL CHECK (amount > 0)` | **VERIFIED** | Always positive — type determines +/- direction in balance calc |
| `reference_type TEXT` | **VERIFIED** | 6 types (types/index.ts:274-280) |
| `reference_id TEXT` | **VERIFIED** | Polymorphic ref |
| `invoice_id UUID REFERENCES invoices` | **VERIFIED** | |
| `sales_return_id UUID REFERENCES sales_returns` | **VERIFIED** | |
| `notes TEXT` | **VERIFIED** | |
| `created_by TEXT CHECK (...)` | **VERIFIED** | `'Owner'\|'Staff'` |
| `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | **VERIFIED** | `date: string` — ISO timestamp |

---

### 1.18 — `customer_activities` Table

**VERIFIED** — `CustomerActivity` (types/index.ts:241-247) has `id`, `type`, `description`, `reference`, `date`. Currently embedded in `Customer.activities?: CustomerActivity[]`.

`type` values: `'Invoice'\|'Repayment'\|'Void'\|'Return'\|'Credit'`

---

### 1.19 — `shop_settings` Table (Single-Row)

| Field | Verdict | Notes |
|-------|---------|-------|
| All `ShopSettings` fields | **VERIFIED** | `ShopSettings` is defined in `settings/page.tsx:54-68` |
| **MISSING:** `theme ThemeMode` | `theme: "light"\|"dark"\|"system"` | Was NOT in proposed table. Must add `theme TEXT DEFAULT 'light'`. Theme is in `autovault_settings` localStorage — must migrate. |
| **UNNECESSARY:** Full PK `id UUID` | Single-row table | Use `id TEXT PRIMARY KEY DEFAULT 'singleton'` with a `UNIQUE` + `CHECK` to enforce single row |

```sql
-- Single-row enforcement:
ALTER TABLE shop_settings ADD CONSTRAINT single_row CHECK (id = 'singleton');
```

---

### 1.20 — `users` Table

| Field | Verdict | Notes |
|-------|---------|-------|
| `username TEXT NOT NULL UNIQUE` | **VERIFIED** | `UserCredentials.username` — case-insensitive comparison in `validateLogin()` (authUtils.ts:301). Need `UNIQUE (lower(username))`. |
| `password_hash TEXT NOT NULL` | **VERIFIED** | Currently a 32-char hex string from custom `hashPassword()` (authUtils.ts:22-34) |
| `salt TEXT NOT NULL` | **VERIFIED** | |
| `role TEXT CHECK (...)` | **VERIFIED** | `'owner'\|'staff'` |
| `is_active BOOLEAN DEFAULT true` | **MISSING from current** | Not in current system — safe to add as `DEFAULT true` |

**DANGEROUS ASSUMPTION:** The proposed `users` table has `UNIQUE(username)`. But `validateLogin()` does case-insensitive comparison (`toLowerCase()` on both sides). The unique index must be `UNIQUE (lower(username))` not `UNIQUE (username)`.

---

## SECTION 2 — VARIANT MODEL REVIEW

### Current Implementation (Verified)

**Each concrete variant SKU is an independent Product record.** This is verified by:
- `Product.variantValues?: Record<string, string>` (types/index.ts:38) — maps option name to value for THIS specific SKU
- `Product.variantOptions?: VariantOptionDefinition[]` (types/index.ts:37) — defines what options exist at the group level
- `Product.displayGroup?: string` (types/index.ts:36) — groups variants together
- Each variant has its own `id`, `sku`, `stock`, `sellPrice`, `currentCost`, `fitments`

**VERIFIED: There is no variant "parent" entity. Products ARE variants.**

### Can two products in the same displayGroup have different dimensions?

**YES — VERIFIED.** Each product in a `displayGroup` is fully independent. They can have:
- Different `sellPrice`
- Different `currentCost`
- Different `stock`
- Different `fitments`
- Different `lowStockThreshold`
- Different `preferredSupplierId`

The `displayGroup` is purely a display grouping convention. The `variantOptions` on a product describe the option template, and `variantValues` maps this product's specific combination.

### Can one combination exist twice in the same displayGroup?

**NO — the UNIQUE constraint on SKU prevents this by convention**, but there is NO database constraint preventing two products with the same `displayGroup` and identical `variantValues`. The uniqueness guarantee is SKU-level only.

### Safest PostgreSQL Representation

**DO NOT create separate variant tables.** Keep `variant_options` and `variant_values` as `JSONB` columns on the `products` table:

```sql
-- On products table:
variant_options JSONB,   -- VariantOptionDefinition[] — stored as-is
variant_values  JSONB,   -- Record<string, string> — stored as-is
display_group   TEXT,    -- Grouping convention only
```

**Why JSONB over separate tables:**
1. No JOIN overhead for reading a product with its variant info
2. Matches current in-memory structure exactly
3. The variant system is non-relational by design — variants have no shared financial history
4. No business operations query across `variantValues` — queries are only by product ID or SKU
5. Separate tables would require migrating arbitrary option keys (e.g., "Size", "Color") as column names — impossible without dynamic SQL

**How to prevent duplicate combinations in the same displayGroup:**

```sql
-- Partial unique index: if variant_values is not null and display_group is not null,
-- no two products can have the same display_group + variant_values combination
CREATE UNIQUE INDEX idx_products_group_variant_combination
  ON products (display_group, variant_values)
  WHERE display_group IS NOT NULL AND variant_values IS NOT NULL;
```

**Trade-off:** JSONB equality for `variant_values` works correctly in PostgreSQL (`{"Color": "Red", "Size": "M"}` equals `{"Color": "Red", "Size": "M"}`), but key ordering matters. Normalize JSON before storing.

---

## SECTION 3 — INVENTORY MODEL REVIEW

### Current Implementation (Verified)

The app maintains **BOTH** a mutable `Product.stock` balance AND an append-only `StockMovement` ledger. They are NOT kept in sync automatically — the balance is updated eagerly and the movement is appended as an audit record.

**Verified behavior:**
- `ADD_PRODUCT`: sets `product.stock` directly + appends `StockMovement(type="Opening Stock")` (store.tsx:900-918)
- `ADD_PURCHASE`: `product.stock += purchase.quantity` + appends movement (store.tsx:2121-2148)
- `ADD_INVOICE`: `product.stock -= item.quantity` + appends movement (store.tsx:1190-1322)
- `VOID_INVOICE`: `product.stock += unreturnedQty` + appends movement (store.tsx:1846-1872)
- `ADD_SALES_RETURN`: `product.stock += returnedQty - exchangeQty` + appends movement (store.tsx:2912-2953)
- `CANCEL_SALES_RETURN`: reverses the above (store.tsx:3125-3154)
- `ADD_PURCHASE_RETURN`: `product.stock -= returnedQty` + appends movement (store.tsx:2477-2496)
- `ADJUST_STOCK`: `product.stock = Math.max(0, stock + delta)` + appends movement (store.tsx:1092-1101)
- `BULK_IMPORT_PRODUCTS`: updates stock directly + appends movements (store.tsx:1006-1036)

**KEY FINDING:** `Product.stock` is NOT derivable by summing `StockMovement.delta`. The ledger has gaps (e.g., opening stock not always recorded, some migrations backfill incomplete). The ledger is AUDIT-ONLY; the balance is the operational truth.

### Recommended PostgreSQL Model: Option B — BOTH Balance + Ledger

**Reason:** The business needs both:
1. **Fast stock check during billing** — `SELECT stock FROM products WHERE id = ?` (one read)
2. **Audit history** — `SELECT * FROM stock_movements WHERE product_id = ?`

**Consistency Mechanism in PostgreSQL:**

Every stock mutation MUST be a database transaction that updates BOTH in one atomic operation:

```sql
-- Pattern for every stock mutation:
BEGIN;
  UPDATE products SET stock = stock + :delta WHERE id = :product_id;
  INSERT INTO stock_movements (product_id, type, delta, ...) VALUES (:product_id, ...);
COMMIT;
```

**Row-Level Locking Required:**

```sql
BEGIN;
  SELECT stock FROM products WHERE id = :product_id FOR UPDATE;
  -- Validate: enough stock for sale?
  -- Calculate new balance
  UPDATE products SET stock = stock - :qty WHERE id = :product_id;
  INSERT INTO stock_movements ...;
COMMIT;
```

**Idempotency Strategy:**

Each mutation operation should have a unique `reference_id` (e.g., invoice ID, purchase ID). Add a `UNIQUE` constraint on `(product_id, reference_id, type)` for the stock_movements table — but ONLY for types that are deterministic (Sale, Purchase, Invoice Void). Manual adjustments are NOT idempotent by nature.

**Stock Floor:**

The current code uses `Math.max(0, stock - qty)` which silently floors at 0. In PostgreSQL, use:
```sql
CHECK (stock >= 0)
```
This will cause the transaction to fail if stock would go negative — which is the CORRECT behavior. The application layer should validate stock availability before attempting the update.

---

## SECTION 4 — WAC REVIEW

### Exact WAC Formula (Verified from store.tsx:2121-2131)

```typescript
// CURRENT IMPLEMENTATION:
const newStock = p.stock + purchase.quantity;
const newAvgCost = newStock > 0
  ? roundMoney((p.stock * p.currentCost + purchase.quantity * purchase.buyPrice) / newStock)
  : purchase.buyPrice;
```

**Formula:**
```
newStock = oldStock + purchaseQty
newWAC = round((oldStock x oldCost + purchaseQty x purchasePrice) / newStock, 2)
```

**Edge Cases (Verified):**
- `newStock === 0` — impossible since we just added `purchaseQty > 0`. Formula handles it anyway by using `purchase.buyPrice` directly.
- `oldStock === 0` — `newWAC = (0 x oldCost + qty x price) / qty = price`. Correct — first purchase sets WAC = purchase price.
- Negative stock — can occur if stock was manually adjusted below zero (ADJUST_STOCK floor prevents this, but legacy data may have it). Guard in server: if `oldStock < 0`, treat as `0` for WAC purposes.
- `roundMoney()` uses `Math.round((n + Number.EPSILON) * 100) / 100` (store.tsx:251-253). PostgreSQL equivalent: `ROUND(value, 2)`.

**PostgreSQL Transaction Design:**

```sql
BEGIN;

-- 1. Lock the product row for exclusive update (prevents concurrent WAC corruption)
SELECT id, stock, current_cost
  FROM products
  WHERE id = :product_id
  FOR UPDATE;

-- 2. Validate inputs (application layer)
-- purchase_quantity > 0, buy_price > 0

-- 3. Calculate new WAC
-- new_stock = old_stock + purchase_quantity
-- IF new_stock > 0:
--   new_wac = ROUND(
--     (old_stock * old_cost + purchase_quantity * buy_price) / new_stock,
--     2
--   )
-- ELSE:
--   new_wac = buy_price

-- 4. Insert purchase record
INSERT INTO purchases (id, supplier_id, product_id, quantity, buy_price, ...)
  VALUES (:purchase_id, :supplier_id, :product_id, :qty, :buy_price, ...);

-- 5. Update product: stock and WAC
UPDATE products
  SET
    stock = stock + :purchase_quantity,
    current_cost = :new_wac,
    updated_at = NOW()
  WHERE id = :product_id;

-- 6. Insert stock movement
INSERT INTO stock_movements (product_id, type, delta, description, reference, created_at)
  VALUES (:product_id, 'Purchase', :purchase_quantity, 'Purchased from supplier', :supplier_invoice_number, NOW());

-- 7. If upfront payment > 0: create supplier_payment + finance_transaction
-- (see Section 8 for full purchase transaction)

COMMIT;
```

**Concurrent Purchase Race Condition:**

Without `FOR UPDATE`, two concurrent purchases of the same product would both read `oldStock = 10, oldCost = 100`, then both compute WAC using the same base. After both commits, the final WAC will be based on whichever thread committed last — not the mathematically correct chained average.

**This corruption is guaranteed without row-level locking.**

**WAC is NOT affected by sales** (selling reduces stock, but does NOT recalculate WAC). This is the Weighted Average Cost method — WAC only changes on purchase.

**WAC IS affected by purchase returns** (store.tsx:2440-2524): purchase returns reduce `returnedQuantity` on the purchase but do NOT recalculate WAC. **VERIFIED: WAC is unchanged by purchase returns in the current implementation.** Do not change this.

---

## SECTION 5 — SALES TRANSACTION REVIEW

### Complete ADD_INVOICE Mutation Chain (Verified from store.tsx:1166-1333)

**Pre-processing (in `addInvoice()` helper, not reducer):**
1. Invoice number generated via `getNextInvoiceNumber()` — reads settings from localStorage and scans all invoices
2. Invoice ID generated with `crypto.randomUUID()`

**In reducer (ADD_INVOICE case):**
1. `ensureUniqueInvoiceNumber()` — collision-safe number assignment (store.tsx:1173)
2. Backfill `costPrice` on each item from current product `currentCost` if missing (store.tsx:1177-1184)
3. Backfill `invoiceItem.id` using `inv-item-${inv.id}-${idx}` pattern (store.tsx:1181)
4. Append invoice to `state.invoices[]`
5. `products.stock -= soldItem.quantity` for each sold item, floor at 0 (store.tsx:1190-1194)
6. Find existing customer by `customerId` OR by `phone` match (store.tsx:1197-1198) — **IMPORTANT: phone-based customer lookup happens here**
7. Process store credit redemption if `creditRedeemed > 0`:
   - Calculate `actualCreditRedeemed = min(requested, available, inv.total)`
   - Insert `CustomerCreditTransaction(type='Redeem')`
8. Update existing customer: `debt += inv.dueAmount`, `storeCredit` recalculated from ledger, `visits += 1`, `lastVisit = inv.date`, `invoiceIds.push(inv.id)`, append CustomerActivity
9. OR create new customer if `inv.customer !== 'Walk-in Customer'`
10. OR no customer update for walk-ins
11. Finance transaction (Income, Sale) if `amountPaid > 0` (store.tsx:1289-1303)
12. Append StockMovement(type='Sale') for each sold item (store.tsx:1305-1322)

### PostgreSQL Transaction Design

```sql
BEGIN;

-- 1. Generate invoice number (server-side, from sequence)
--    See Section 12 for numbering design

-- 2. Validate: all product IDs exist, all quantities > 0
--    SELECT id, stock, current_cost FROM products WHERE id = ANY(:product_ids) FOR UPDATE;
--    -- Verify stock >= quantity for each item (application layer)

-- 3. Insert invoice
INSERT INTO invoices (id, invoice_number, customer_id, customer_name, customer_phone,
                      vehicle_number, vehicle_model, payment_method, payment_status,
                      amount_paid, due_amount, subtotal, discount, total, credit_redeemed,
                      notes, invoice_date, billed_by, shop_snapshot, created_at)
  VALUES (...);

-- 4. Insert invoice_items (one per sold product)
INSERT INTO invoice_items (id, invoice_id, product_id, product_name, quantity, sell_price, cost_price)
  VALUES (gen_random_uuid(), :invoice_id, :product_id, :snapshot_name, :qty, :sell_price, :current_cost);
-- (repeat for each cart item)

-- 5. Update product stock for each sold item
UPDATE products
  SET stock = GREATEST(0, stock - :quantity), updated_at = NOW()
  WHERE id = :product_id;
-- (repeat for each item; rows already locked from step 2)

-- 6. Insert stock movement for each sold item
INSERT INTO stock_movements (id, product_id, type, delta, description, reference, created_at)
  VALUES (gen_random_uuid(), :product_id, 'Sale', -:quantity, 'Sold to ' || :customer_name, :invoice_number, NOW());

-- 7. If amount_paid > 0: insert finance_transaction (Income, Sale)
INSERT INTO finance_transactions (id, account_id, type, category, reference_id, customer_id, amount, transaction_date, method, notes)
  VALUES (gen_random_uuid(), :account_id, 'Income', 'Sale', :invoice_id, :customer_id, :amount_paid, NOW(), :payment_method, 'Invoice ' || :invoice_number);

-- 8. If credit_redeemed > 0: insert customer_credit_transaction (Redeem)
INSERT INTO customer_credit_transactions (id, customer_id, type, amount, reference_type, reference_id, invoice_id, notes, created_by, created_at)
  VALUES (gen_random_uuid(), :customer_id, 'Redeem', :credit_redeemed, 'Invoice', :invoice_id, :invoice_id, 'Store Credit redeemed on ' || :invoice_number, :billed_by, NOW());

-- 9. Update customer: debt, visits, last_visit
--    SELECT id FROM customers WHERE id = :customer_id FOR UPDATE;
UPDATE customers
  SET
    debt = debt + :due_amount,
    visits = visits + 1,
    last_visit = :invoice_date,
    updated_at = NOW()
  WHERE id = :customer_id;

-- 10. Insert customer_activity
INSERT INTO customer_activities (id, customer_id, type, description, reference, created_at)
  VALUES (gen_random_uuid(), :customer_id, 'Invoice', 'Invoice Created', :invoice_number, NOW());

COMMIT;
```

**Failure Rollback:** Any failure in any step rolls back the entire transaction. No partial invoice can exist.

**Locking Order:** To prevent deadlocks, ALWAYS lock in the same order: products then customers then invoices. Never reverse.

---

## SECTION 6 — VOID INVOICE REVIEW

### When Voiding is Allowed (Verified from store.tsx:1817-1829)

1. Invoice must exist
2. Invoice must NOT already be voided (`invoice.voided === false`) — idempotency guard
3. Invoice must have NO active (non-cancelled) SalesReturns

### Full Mutation Chain (store.tsx:1817-1977)

1. Guard: `if (!invoice || invoice.voided) return state` — idempotency
2. Guard: `activeSalesReturns.length > 0` — block void
3. Mark invoice: `voided=true, voidReason, voidedAt, voidedBy`
4. Restore stock for UNRETURNED quantities only: `item.quantity - (item.returnedQuantity || 0)`
5. Append StockMovement(type='Invoice Void') for each unreturned item
6. Find all Redeem credit transactions linked to this invoice — append Reversal credit transaction to restore the credit
7. Recalculate customer `debt` from non-voided invoices
8. Update customer `storeCredit` from ledger
9. Append CustomerActivity(type='Void')
10. Find all Income finance transactions linked to invoice OR to linked debt payments — append reversing Expense transactions
11. Fallback: if no linked finance transactions found, create one Expense based on invoice.amountPaid

### PostgreSQL Transaction Design

```sql
BEGIN;

-- 0. Lock the invoice row
SELECT id, voided, amount_paid, total, customer_id, payment_method
  FROM invoices WHERE id = :invoice_id FOR UPDATE;

-- Guard: already voided?
-- Guard: active sales returns exist?
SELECT COUNT(*) FROM sales_returns
  WHERE invoice_id = :invoice_id AND status != 'Cancelled';
-- If count > 0: ROLLBACK and return error

-- 1. Mark invoice as voided
UPDATE invoices
  SET voided = true, void_reason = :reason, voided_at = NOW(), voided_by = :voided_by
  WHERE id = :invoice_id;

-- 2. Restore stock for unreturned items
--    Lock each product row:
SELECT id, stock FROM products
  WHERE id = ANY(:product_ids_in_invoice) FOR UPDATE;

UPDATE products p
  SET stock = p.stock + (ii.quantity - COALESCE(ii.returned_quantity, 0)), updated_at = NOW()
  FROM invoice_items ii
  WHERE ii.invoice_id = :invoice_id AND ii.product_id = p.id
    AND (ii.quantity - COALESCE(ii.returned_quantity, 0)) > 0;

-- 3. Insert stock movements for restored quantities
INSERT INTO stock_movements (product_id, type, delta, description, reference, created_at)
  SELECT ii.product_id, 'Invoice Void',
    (ii.quantity - COALESCE(ii.returned_quantity, 0)),
    'Stock Restored (Invoice Voided)', :invoice_number, NOW()
  FROM invoice_items ii
  WHERE ii.invoice_id = :invoice_id
    AND (ii.quantity - COALESCE(ii.returned_quantity, 0)) > 0;

-- 4. Reverse credit redemption
INSERT INTO customer_credit_transactions (id, customer_id, type, amount, invoice_id, notes, created_at)
  SELECT gen_random_uuid(), :customer_id, 'Reversal',
    SUM(amount), :invoice_id, 'Store Credit restored from Voided Invoice ' || :invoice_number, NOW()
  FROM customer_credit_transactions
  WHERE invoice_id = :invoice_id AND type = 'Redeem'
  HAVING SUM(amount) > 0;

-- 5. Reverse finance transactions
INSERT INTO finance_transactions (id, account_id, type, category, reference_id, reversal_of, customer_id, amount, transaction_date, method, notes)
  SELECT gen_random_uuid(), account_id,
    'Expense',
    CASE WHEN category = 'Customer Payment' THEN 'Payment Void' ELSE 'Invoice Void' END,
    reference_id, id, customer_id, amount, NOW(), method,
    'Reversal of ' || category || ' (' || :invoice_number || ')'
  FROM finance_transactions
  WHERE (reference_id = :invoice_id OR reference_id IN (
    SELECT id::text FROM debt_payments WHERE invoice_id = :invoice_id
  ))
  AND type = 'Income'
  AND id NOT IN (SELECT reversal_of FROM finance_transactions WHERE reversal_of IS NOT NULL);

-- 6. Update customer debt
UPDATE customers
  SET debt = (
    SELECT COALESCE(SUM(GREATEST(0, due_amount)), 0)
    FROM invoices
    WHERE customer_id = :customer_id AND voided = false
  ), updated_at = NOW()
  WHERE id = :customer_id;

-- 7. Append customer activity
INSERT INTO customer_activities (id, customer_id, type, description, reference, created_at)
  VALUES (gen_random_uuid(), :customer_id, 'Void', 'Invoice Voided', :invoice_number, NOW());

COMMIT;
```

---

## SECTION 7 — SALES RETURN REVIEW

### ADD_SALES_RETURN: Complete Mutation Chain (Verified from store.tsx:2791-3069)

**Guards:**
1. Invoice must exist and not be voided
2. BUG-04 guard: For each return item, `returnedQty <= remainingReturnableQty` (dynamically calculated from active non-cancelled returns)

**Refund Policy Computation:**
```
PRIOR_CASH_REFUNDED = sum(cashRefunded on active non-cancelled returns for this invoice)
PAID_AVAILABLE = max(0, invoice.amountPaid - PRIOR_CASH_REFUNDED)
DUE = invoice.dueAmount
RV = totalRefund

if refundMethod == "Adjustment":
  cashRefunded = 0
  debtCancelled = min(DUE, RV)
  creditCreated = max(0, RV - debtCancelled)

elif refundMethod == "Exchange":
  cashRefunded = 0
  debtCancelled = 0
  creditCreated = 0
  (only exchange difference finance entries)

else (Cash/UPI/Bank):
  cashRefunded = min(RV, PAID_AVAILABLE)
  remainingReturn = RV - cashRefunded
  debtCancelled = min(DUE, remainingReturn)
  creditCreated = max(0, remainingReturn - debtCancelled)
```

**Mutations:**
1. Append SalesReturn record with computed `cashRefunded, debtCancelled, debtAdjusted, creditCreated`
2. Update `invoice_items.returned_quantity` for each returned item (mutable cache)
3. Update `invoice.due_amount -= debtCancelled` (Adjustment method only)
4. Update `invoice.payment_status` (derived)
5. Restore product stock for returned items
6. Deduct product stock for exchange replacement items
7. Append StockMovements (Sales Return type for returns, Sale type for exchange items)
8. Append FinanceTransaction based on method
9. If creditCreated > 0: append CustomerCreditTransaction(type='Issue')
10. Recalculate customer.debt and customer.storeCredit
11. Append CustomerActivity

### Dangerous: Double Return Prevention

The BUG-04 guard in the reducer dynamically re-checks returnable quantity from the `salesReturns` array. In PostgreSQL, this check must happen WITHIN the transaction with locked rows:

```sql
BEGIN;

-- Lock invoice and its items
SELECT * FROM invoices WHERE id = :invoice_id FOR UPDATE;
SELECT * FROM invoice_items WHERE invoice_id = :invoice_id FOR UPDATE;

-- Validate returnable quantity for each item
SELECT COALESCE(SUM(sri.quantity), 0) as already_returned
  FROM sales_return_items sri
  JOIN sales_returns sr ON sr.id = sri.sales_return_id
  WHERE sr.invoice_id = :invoice_id
    AND sr.status != 'Cancelled'
    AND sri.product_id = :product_id;

-- If :return_quantity > (original_quantity - already_returned): ROLLBACK

-- ... rest of transaction
COMMIT;
```

### CANCEL_SALES_RETURN: Complete Mutation Chain (Verified from store.tsx:3071-3216)

**Guards:** Return must exist and not already be Cancelled.

**Reversals (opposite of ADD_SALES_RETURN):**
1. Mark return as Cancelled
2. Reverse `invoice_items.returned_quantity` cache (subtract)
3. Restore `invoice.due_amount += debtCancelled` (for Adjustment returns only), capped at `total - amountPaid`
4. Re-deduct product stock for returned items (they go back to "sold" state)
5. Re-add product stock for exchange replacement items (they go back to inventory)
6. Append reversing StockMovements
7. Reverse finance: if cash was refunded, append Income(Sales Return) to cancel the expense
8. If creditCreated was issued (Adjustment returns): append Reversal credit transaction
9. Recalculate customer.debt and storeCredit
10. Append CustomerActivity(type='Void')

---

## SECTION 8 — PURCHASE REVIEW

### Immutability Rules (Verified)

| Field | Immutability | Evidence |
|-------|-------------|---------|
| `buy_price` | **IMMUTABLE** | Never modified after creation; migration m002 confirms (store.tsx:409) |
| `quantity` | **IMMUTABLE** | Never modified after creation |
| `total_amount` | **IMMUTABLE** | = `quantity x buy_price`, migration m002 repairs corrupted values |
| `amount_paid` | **MUTABLE** | Updated by supplier payments (store.tsx:2317) |
| `due_amount` | **MUTABLE** | Updated by payments and purchase returns (store.tsx:2467) |
| `payment_status` | **MUTABLE** | Derived from amount_paid/due_amount |
| `returned_quantity` | **MUTABLE** | Cache updated by purchase returns (store.tsx:2461) |
| `purchase_order_id` | **IMMUTABLE** | Set at creation only |
| `invoice_number` | **MUTABLE** | Can be updated via `UPDATE_PURCHASE` (store.tsx:2241-2291) |
| `date` | **MUTABLE** | Can be updated via `UPDATE_PURCHASE` |
| `notes` | **MUTABLE** | Can be updated via `UPDATE_PURCHASE` |

### `UPDATE_PURCHASE` Allowed Fields (Verified from store.tsx:2240-2291)

Only these three fields can be updated:
- `invoiceNumber` (the supplier's invoice reference number)
- `date` (purchase date)
- `notes`

Financial fields (`buy_price`, `quantity`, `total_amount`, `amount_paid`, `due_amount`) are NEVER updatable after creation.

### `addPurchaseBatch` Payment Distribution (Verified from store.tsx:4094-4151)

For a batch purchase (multiple products on one supplier invoice), the total payment is distributed proportionally:

```
itemPaid = round((itemTotal / grandTotal) x totalPaid, 2)
```

The last item absorbs rounding residual: `lastItemPaid = totalPaid - sum(previousItemPaid)`

**PostgreSQL Implementation:** Batch purchases should call `createPurchase()` once per line item — exactly as the current `addPurchaseBatch()` does internally. Each purchase gets its proportional payment allocation.

### `ADD_PURCHASE_RETURN` Guards (Verified from store.tsx:2440-2524)

1. Purchase must exist
2. `returnedQty <= availableQty` (= `purchase.quantity - purchase.returnedQuantity`)
3. `returnedQty <= product.stock` — cannot return what's already been sold

```sql
BEGIN;
SELECT stock FROM products WHERE id = :product_id FOR UPDATE;
SELECT returned_quantity, quantity FROM purchases WHERE id = :purchase_id FOR UPDATE;
-- Validate: stock >= return_quantity
-- Validate: return_quantity <= (purchase.quantity - purchase.returned_quantity)
-- ... proceed with return
COMMIT;
```

---

## SECTION 9 — CUSTOMER DEBT REVIEW

### What Should Be Stored vs. Derived (Verified)

| Value | Current | Recommendation |
|-------|---------|----------------|
| `Customer.debt` | Mutable cached sum of invoice `dueAmount`s (types/index.ts:253) | **DERIVE** at query time: `SELECT SUM(due_amount) FROM invoices WHERE customer_id = ? AND voided = false` |
| `Customer.storeCredit` | Mutable cached balance from ledger (types/index.ts:258) | **DERIVE** at query time using credit transaction ledger |
| `Customer.totalSpent` | **DEPRECATED** — marked `@deprecated`, no longer written (types/index.ts:254-257) | **DO NOT MIGRATE** |
| `Customer.invoiceIds[]` | Denormalized array | **DO NOT MIGRATE** — derive from `invoices.customer_id` |
| `Customer.visits` | Mutable count incremented per invoice | **STORE** — business metric |
| `Customer.lastVisit` | Mutable date string | **STORE** OR derive as `MAX(invoice_date)` |
| `Invoice.amountPaid` | MUTABLE — updated by payments, void, returns | **STORE** — mutable but needed for fast access |
| `Invoice.dueAmount` | MUTABLE — updated by payments, returns, void | **STORE** — required for FIFO ordering |
| `DebtPayment` records | Source-of-truth ledger | **STORE ALL** — never delete or modify |
| Finance transaction balance | Derived: opening + income - expense | **DERIVE** — PostgreSQL view or function |

### Derived Views

```sql
-- Derived view for customer debt balance:
CREATE VIEW customer_debt_balances AS
  SELECT customer_id, SUM(due_amount) AS total_debt
  FROM invoices
  WHERE voided = false AND due_amount > 0
  GROUP BY customer_id;

-- Derived view for customer credit balance:
CREATE VIEW customer_credit_balances AS
  SELECT
    customer_id,
    GREATEST(0, ROUND(
      SUM(CASE WHEN type IN ('Issue', 'RedeemReversal') THEN amount
               WHEN type IN ('Redeem', 'IssueReversal') THEN -amount
               WHEN type = 'Reversal' THEN
                 CASE WHEN invoice_id IS NOT NULL AND sales_return_id IS NULL THEN amount
                      ELSE -amount
                 END
               ELSE 0 END
      ), 2
    )) AS credit_balance
  FROM customer_credit_transactions
  GROUP BY customer_id;
```

### Void Debt Payment Recalculation (Verified from store.tsx:1722-1814)

When a debt payment is voided:
1. `invoice.amountPaid` is recalculated as `initialPOSPayment + sum(active_repayments)`
2. `initialPOSPayment` is computed as `currentAmountPaid - sum(all_active_repayments_before_void)`
3. `invoice.dueAmount = max(0, invoice.total - newAmountPaid)`

**DANGEROUS:** The formula `initialPOSPayment = invoice.amountPaid - sum(activeRepayments)` makes `invoice.amountPaid` the ground truth, not the debt_payments table. This means `invoice.amountPaid` must be kept accurate at all times or void calculations will be wrong.

---

## SECTION 10 — SUPPLIER FIFO REVIEW

### Exact Ordering Rules (Verified from store.tsx:2353-2358)

```typescript
.sort((a, b) => {
  const timeA = new Date(a.createdAt || a.date).getTime();
  const timeB = new Date(b.createdAt || b.date).getTime();
  return timeA - timeB;
});
```

**FIFO Rule:** Oldest purchase (by `createdAt` timestamp, falling back to `date` if no `createdAt`) is paid first.

**Effective Due Calculation (Verified from store.tsx:2342-2349):**

```typescript
const getEffectiveDue = (pur: Purchase): number => {
  const total = pur.totalAmount ?? (pur.buyPrice * pur.quantity);
  const returns = purchaseReturns.filter(r => r.purchaseId === pur.id);
  const returnedValue = returns.reduce((s, r) => s + r.totalAmount, 0);
  const payments = supplierPayments.filter(sp => sp.purchaseId === pur.id);
  const paid = payments.reduce((s, pay) => s + pay.amount, 0);
  return Math.max(0, round(total - returnedValue - paid));
};
```

**Important:** Effective due uses `purchase_returns.total_amount` (NOT `refund_amount`). The distinction: `total_amount = qty x buy_price` (goods value returned), `refund_amount = actual cash received`. The outstanding liability reduces by the goods value, regardless of how much cash was actually received.

### PostgreSQL FIFO Implementation

```sql
-- Get open purchases for supplier in FIFO order
SELECT p.*,
  p.total_amount
  - COALESCE((SELECT SUM(pr.total_amount) FROM purchase_returns pr WHERE pr.purchase_id = p.id), 0)
  - COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.purchase_id = p.id), 0)
  AS effective_due
FROM purchases p
WHERE p.supplier_id = :supplier_id
HAVING (p.total_amount
  - COALESCE((SELECT SUM(pr.total_amount) FROM purchase_returns pr WHERE pr.purchase_id = p.id), 0)
  - COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.purchase_id = p.id), 0)
) > 0
ORDER BY COALESCE(p.created_at, p.purchase_date::timestamptz) ASC, p.id ASC;
```

**Tie-Breaking:** If two purchases have identical timestamps (possible with `addPurchaseBatch()`), use `purchase.id` as a secondary sort key for determinism.

---

## SECTION 11 — FINANCE TRANSACTION MODEL

### Is Polymorphic `reference_id` Acceptable?

**Current:** `FinanceTransaction.referenceId: string` references different entity types depending on `category`:
- `'Sale'` — `invoices.id`
- `'Customer Payment'` — `invoices.id` (the invoice being paid)
- `'Inventory Purchase'` — `purchases.id`
- `'Supplier Payment'` — `purchases.id`
- `'Purchase Return'` — `purchase_returns.id`
- `'Sales Return'` — `invoices.id`
- `'Invoice Void'` — `invoices.id`
- `'Payment Void'` — `invoices.id`
- `'Adjustment'` — `products.id`
- Business expenses — auto-generated `EXP-YYYYMMDD-XXXX` (no entity)

**Verdict: ACCEPTABLE — do not change.**

Reasons:
1. Finance transactions are immutable audit records. The referenceId is for human traceability, not for JOIN queries.
2. Adding separate FK columns for each entity type would require 8+ nullable FK columns — worse than polymorphic.
3. The category column tells you what type the referenceId points to.

**Proposed Enhancement (without breaking behavior):**

```sql
-- Add a reference_type column to clarify the polymorphic type:
ALTER TABLE finance_transactions ADD COLUMN reference_type TEXT;
-- Values: 'Invoice', 'Purchase', 'PurchaseReturn', 'DebtPayment', 'BusinessExpense', 'System'
```

This allows future queries to be more precise without requiring FK constraints.

---

## SECTION 12 — PAYMENT / INVOICE NUMBERING

### All Sequential Identifiers (Verified)

| Identifier | Format | Current Mechanism | Collision Safe? |
|------------|--------|------------------|-----------------|
| Invoice Number | `{prefix}-{year}-{seq:04d}` e.g. `INV-2026-0001` | Client scans all invoices to find max seq (store.tsx:3973-4006) | **NO** — race condition between two concurrent invoices |
| Payment Receipt | `PAY-{seq:06d}` e.g. `PAY-000001` | Counter stored in `AppState.paymentReceiptCounter` | **NO** — race condition |
| Purchase Order | `PO-{year}-{seq:05d}` e.g. `PO-2026-00001` | Counter in `AppState.purchaseOrderCounter` (store.tsx:2548) | **NO** — race condition |
| Sales Return | `SR-{year}-{seq:05d}` e.g. `SR-2026-00001` | Counter in `AppState.salesReturnCounter` (store.tsx:3061) | **NO** — race condition |

**ALL current numbering mechanisms are race-condition prone** in a multi-request server environment.

### PostgreSQL-Safe Numbering Design

```sql
-- Year-reset approach: use a per-year counter in a table
CREATE TABLE invoice_year_counter (
  year     INTEGER NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (year)
);

-- Atomic increment with row lock:
INSERT INTO invoice_year_counter (year, last_seq) VALUES (:year, 1)
  ON CONFLICT (year) DO UPDATE
  SET last_seq = invoice_year_counter.last_seq + 1
  RETURNING last_seq;

-- Then construct: prefix || '-' || year || '-' || LPAD(last_seq::text, 4, '0')
```

**For payment receipts (no year reset):**
```sql
CREATE SEQUENCE payment_receipt_seq START 1;
-- receipt_number = 'PAY-' || LPAD(nextval('payment_receipt_seq')::text, 6, '0')
```

**Migration:** Before creating sequences, set start values above current maximums.

---

## SECTION 13 — AUTHENTICATION

### Current Implementation (Verified from authUtils.ts)

| Aspect | Current State | Assessment |
|--------|--------------|------------|
| Credentials storage | `localStorage["autovault_users"]` (authUtils.ts:13) | Client-side only |
| Password algorithm | Custom 4-polynomial `Math.imul` hash (authUtils.ts:24-34) | NOT SHA-256. NOT cryptographic. Brute-forceable. |
| Salt | 8-byte random hex (authUtils.ts:40-45) | Salt exists — but algorithm is still weak |
| Default credentials | `owner123`/`staff123` hardcoded in source (authUtils.ts:48-58) | DANGEROUS — default credentials in source code |
| Session | `localStorage["role"] = "owner"` | Trivially spoofable |
| Lockout | 5 attempts then 30s lockout in localStorage | Bypassed by clearing localStorage |
| Middleware | Does not exist | No server-side auth enforcement |
| RBAC | `localStorage.getItem("role") === "owner"` (store.tsx:879) | Client-side only |

### Target Auth Schema

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,   -- bcrypt hash (60 chars)
  salt          TEXT,            -- kept for migration compat
  role          TEXT NOT NULL CHECK (role IN ('owner','staff')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT users_username_unique UNIQUE (lower(username))
);

CREATE TABLE user_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,   -- hash of session token stored in HTTP-only cookie
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
```

**Migration from current hashes:** The existing `hashPassword()` (authUtils.ts:22-34) is NOT SHA-256 — it's a 32-char hex from 4 polynomial hashes. Cannot verify against bcrypt. Strategy:

1. Migrate `username` and `role` into `users` table
2. Store existing `passwordHash` and `salt` temporarily with flag `legacy_hash = true`
3. On first login after migration: verify against old hash, then immediately re-hash with bcrypt

**Session Design:**
1. Login: verify credentials, generate session token, store hashed token in `user_sessions`, set HTTP-only encrypted cookie
2. Each request in `middleware.ts`: read cookie, hash token, lookup in `user_sessions`, get user+role, pass to Server Component via request context
3. Logout: delete session row, clear cookie

---

## SECTION 14 — STORAGE

### Current File Operations (Verified)

| Operation | Current | Recommendation |
|-----------|---------|----------------|
| Invoice PDF export | `html2pdf.js` browser download | Keep as browser download |
| Inventory Excel export | `ExcelJS` browser download | Keep as browser download |
| JSON full backup | `Blob` browser download (store.tsx:3885) | Keep for now; optional server backup later |
| Product images | **NOT IMPLEMENTED** | Future: Object storage |
| Shop logo | Static file `/public/` | Keep as static; admin upload later |

**Conclusion:** No object storage requirement for the initial migration. All current file operations are browser-side.

### Storage Abstraction Design (Provider-Agnostic)

```typescript
// src/lib/storage/StorageProvider.ts
export interface StorageProvider {
  upload(bucket: string, key: string, data: Buffer, mimeType: string): Promise<string>;
  getSignedReadUrl(bucket: string, key: string, expiresInSeconds?: number): Promise<string>;
  getSignedUploadUrl(bucket: string, key: string, mimeType: string, expiresInSeconds?: number): Promise<string>;
  delete(bucket: string, key: string): Promise<void>;
  exists(bucket: string, key: string): Promise<boolean>;
}

// Local: src/lib/storage/MinIOProvider.ts
// Production (TBD): src/lib/storage/S3Provider.ts
```

```sql
-- File metadata table (for future use):
CREATE TABLE file_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key  TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  BIGINT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'supplier', 'invoice', 'backup')),
  entity_id   TEXT NOT NULL,   -- polymorphic
  uploaded_by TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT file_attachments_object_unique UNIQUE (bucket_name, object_key)
);
```

---

## SECTION 15 — SSR DATA ACCESS DESIGN

### Route-by-Route Server Data Requirements

| Route | Server Queries | Client State Only |
|-------|----------------|-------------------|
| `/dashboard` | products (counts, stock), invoices (revenue summary), customers (debt total), finance (account balances), alerts | Date filter range |
| `/billing` | `products[]` (all active, for search) | Cart, hold bills, customer search, discount input |
| `/inventory` | `products[]` with fitments, categories/brands | Search, filter, sort, modals |
| `/inventory/[id]` | `product`, `stock_movements[]`, `invoice_items[]` history, `purchase_history[]` | Edit modal, chart interactions |
| `/customers` | `customers[]` with derived debt balance | Search, filter |
| `/customers/[id]` | `customer`, `invoices[]`, `debt_payments[]`, `credit_transactions[]`, `activities[]` | Payment modal, filter |
| `/invoices` | `invoices[]` with customer name, count for pagination | Search, filter, date range |
| `/invoices/[id]` | `invoice`, `invoice_items[]` with products, `sales_returns[]`, `debt_payments[]` | Void modal, return modal |
| `/suppliers` | `suppliers[]` with outstanding balance | Search, filter, modals |
| `/suppliers/[id]` | `supplier`, `purchases[]`, `supplier_payments[]`, `purchase_returns[]`, `purchase_orders[]` | Statement date range, payment modal |
| `/finance` | `finance_accounts[]` with balances, `finance_transactions[]` paginated | Date filter, chart |
| `/analytics` | All aggregates: revenue, profit, COGS by period, top products | Chart interactions, period selector |
| `/settings` | `shop_settings` (single row), auth users (username only) | Form state, credential change modal |

### What Should NEVER Be in a Global Client Store Again

The following should be server-queried per page:
- Full product list, Full invoice list, Full customer list, Full supplier list
- All finance transactions, All stock movements, All sales returns
- All credit transactions, Analytics computed values

Client state should only contain:
- Current POS cart, Hold bills, UI state (search/sort/filter/modal)
- Shop settings (loaded once on init), Current user role (from session)

---

## SECTION 16 — GLOBAL STORE DECOMPOSITION MAP

### Reducer Action to Future Domain Service

| Reducer Action | Target Domain Service | Method |
|----------------|----------------------|--------|
| `ADD_PRODUCT` | `InventoryService` | `createProduct(data)` |
| `UPDATE_PRODUCT` | `InventoryService` | `updateProduct(id, data)` |
| `DELETE_PRODUCT` | `InventoryService` | `deleteProduct(id)` |
| `ADJUST_STOCK` | `InventoryService` | `adjustStock(productId, delta, note, recordExpense?)` |
| `BULK_ASSIGN_FITMENT` | `InventoryService` | `assignFitmentsToProducts(productIds, fitment)` |
| `BULK_REMOVE_FITMENT` | `InventoryService` | `removeFitmentsFromProducts(productIds, fitment)` |
| `BULK_IMPORT_PRODUCTS` | `InventoryService` | `bulkImportProducts(toAdd, toUpdate, stockAdjustments)` |
| `ADD_CUSTOMER` | `CustomerService` | `createCustomer(data)` |
| `UPDATE_CUSTOMER` | `CustomerService` | `updateCustomer(id, data)` |
| `ADD_INVOICE` | `BillingService` | `createInvoice(invoice, creditRedeemed?)` |
| `VOID_INVOICE` | `BillingService` | `voidInvoice(invoiceId, reason, voidedBy)` |
| `RECORD_DEBT_PAYMENT` | `DebtService` | `recordDebtPayment(payment)` |
| `RECORD_CUSTOMER_DEBT_PAYMENT_FIFO` | `DebtService` | `recordFIFOPayment(customerId, amount, method, date, note?)` |
| `APPLY_STORE_CREDIT_TO_DEBT` | `DebtService` | `applyCreditToDebt(customerId, amount?)` |
| `VOID_DEBT_PAYMENT` | `DebtService` | `voidDebtPayment(paymentId, reason, voidedBy)` |
| `ADD_SUPPLIER` | `SupplierService` | `createSupplier(data)` |
| `UPDATE_SUPPLIER` | `SupplierService` | `updateSupplier(id, data)` |
| `ADD_PURCHASE` | `PurchaseService` | `createPurchase(data)` — WAC transaction |
| `UPDATE_PURCHASE` | `PurchaseService` | `updatePurchase(id, invoiceNumber, date, notes)` |
| `RECORD_SUPPLIER_PAYMENT` | `PurchaseService` | `recordSupplierPayment(payment)` |
| `RECORD_SUPPLIER_PAYMENT_FIFO` | `PurchaseService` | `recordSupplierFIFOPayment(supplierId, amount, method, date?)` |
| `ADD_PURCHASE_RETURN` | `PurchaseService` | `createPurchaseReturn(record, refundMethod)` |
| `ADD_SALES_RETURN` | `ReturnService` | `createSalesReturn(salesReturn)` |
| `CANCEL_SALES_RETURN` | `ReturnService` | `cancelSalesReturn(returnId, reason, cancelledBy)` |
| `MODIFY_SALES_RETURN` | `ReturnService` | `modifySalesReturn(returnId, refundAmount, notes)` |
| `RECORD_BUSINESS_EXPENSE` | `FinanceService` | `recordExpense(category, amount, method, date?, notes?)` |
| `RECORD_BUSINESS_MONEY_IN` | `FinanceService` | `recordMoneyIn(category, amount, method, date?, notes?)` |
| `SET_OPENING_BALANCES` | `FinanceService` | `setOpeningBalances(cash, bank, upi)` |
| `CREATE_PURCHASE_ORDER` | `ProcurementService` | `createPurchaseOrder(data)` |
| `UPDATE_PURCHASE_ORDER` | `ProcurementService` | `updatePurchaseOrder(id, data)` |
| `DELETE_PURCHASE_ORDER` | `ProcurementService` | `deletePurchaseOrder(id)` |
| `MARK_PURCHASE_ORDER_SENT` | `ProcurementService` | `markPOSent(id)` |
| `MARK_PURCHASE_ORDER_CANCELLED` | `ProcurementService` | `markPOCancelled(id)` |
| `COMPLETE_PURCHASE_ORDER` | `ProcurementService` | `completePO(id)` |
| `CONFIRM_PURCHASE_ORDER` | `ProcurementService` | `confirmPO(id)` |
| `CREATE_HOLD_BILL` | **Client-only** | Session/localStorage — no server needed |
| `UPDATE_HOLD_BILL` | **Client-only** | Session/localStorage |
| `DELETE_HOLD_BILL` | **Client-only** | Session/localStorage |
| `RESET_STORE` | `AdminService` | `factoryReset()` — owner-only with confirmation |
| `HYDRATE_STORE` | **Removed** | No equivalent — replaced by server-side data fetching |
| `RECONCILE_DEBT_CACHE` | **Removed** | No equivalent — debt is derived on demand |

---

## SECTION 17 — SERVER ACTION VS API ROUTE

| Operation | Recommended Pattern | Reason |
|-----------|--------------------|---------| 
| Product CRUD | **Server Action** | Simple mutation; all internal |
| Bulk product import (CSV/Excel) | **Route Handler** | Large file — may need streaming response for progress feedback |
| Invoice creation | **Server Action** | Transaction-heavy but all internal |
| Invoice void | **Server Action** | Internal |
| Invoice PDF export | **Client-side** (keep html2pdf.js) | No server storage needed |
| Debt payment recording | **Server Action** | Internal mutation |
| Supplier CRUD | **Server Action** | Internal |
| Purchase recording | **Server Action** | Internal — WAC transaction |
| Sales return creation | **Server Action** | Internal |
| Customer management | **Server Action** | Internal |
| Finance expense recording | **Server Action** | Internal |
| Analytics data loading | **Server Component** | Read-only aggregations |
| Invoice list | **Server Component** | Read-only with pagination |
| Authentication login | **Route Handler** `/api/auth/login` | Needs to set cookie and return JSON |
| Authentication logout | **Route Handler** `/api/auth/logout` | Needs to clear cookie |
| Session validation | **Middleware** | Must intercept all protected routes |
| Object storage upload URL | **Route Handler** `/api/storage/upload-url` | Returns presigned URL — direct fetch from client |

**Rule:** Use Server Actions by default. Use Route Handlers only when the response is not a form/redirect, the operation needs to be callable from external systems, or streaming response is needed.

---

## SECTION 18 — MIGRATION SAFETY

### ID Strategy

Current IDs are prefixed strings: `p-uuid`, `c-uuid`, `dp-uuid`, `ft-uuid`, `pur-uuid`, etc.

**Recommendation:** Strip prefix and store native UUID in PostgreSQL. Use a migration map table during transition.

```sql
CREATE TABLE id_migration_map (
  old_id TEXT PRIMARY KEY,
  new_id UUID NOT NULL
);
```

### Migration Table Order (Dependencies First)

```
1. users
2. shop_settings
3. finance_accounts           (3 fixed rows: acc-cash, acc-upi, acc-bank)
4. suppliers
5. customers
6. products                   (FK: preferred_supplier_id -> suppliers SET NULL)
7. product_fitments           (FK: product_id -> products)
8. purchase_orders            (FK: supplier_id -> suppliers)
9. purchase_order_items       (FK: purchase_order_id, product_id)
10. purchase_order_activity_logs (FK: purchase_order_id)
11. purchases                 (FK: supplier_id, product_id, purchase_order_id)
12. purchase_returns          (FK: purchase_id, supplier_id, product_id)
13. supplier_payments         (FK: supplier_id, purchase_id)
14. invoices                  (FK: customer_id -> customers)
15. invoice_items             (FK: invoice_id -> invoices, product_id -> products)
16. debt_payments             (FK: customer_id, invoice_id)
17. sales_returns             (FK: invoice_id, customer_id)
18. sales_return_items        (FK: sales_return_id, invoice_item_id, product_id)
19. exchange_items            (FK: sales_return_id, product_id)
20. stock_movements           (FK: product_id)
21. finance_transactions      (FK: account_id, supplier_id, customer_id, reversal_of)
22. customer_credit_transactions (FK: customer_id, invoice_id, sales_return_id)
23. customer_activities       (FK: customer_id)
24. file_attachments          (polymorphic — no FK constraints)
```

### Migration Gotchas

1. **Invoice item IDs:** `item.id` in localStorage is `inv-item-${inv.id}-${idx}` for old invoices. Must convert to proper UUIDs and remap `SalesReturnItem.invoiceItemId` references.

2. **Finance account IDs:** `acc-cash`, `acc-upi`, `acc-bank` are not UUID format. Keep as TEXT PK.

3. **Duplicate SKU check:** Before migrating, run: `SELECT lower(sku), count(*) FROM products GROUP BY lower(sku) HAVING count(*) > 1`. Any duplicates must be resolved manually.

4. **Settings migration:** `autovault_settings` is in a separate localStorage key. The backup export (store.tsx:3858-3898) includes it as a `settings` key. Ensure both sources are checked.

5. **Counter preservation:** Initialize PostgreSQL sequences at values ABOVE the current maximums of `paymentReceiptCounter`, `salesReturnCounter`, `purchaseOrderCounter`.

6. **NULL customerId:** Walk-in invoices have `customerId: null | ""`. Map to `NULL` in PostgreSQL.

---

## SECTION 19 — FINAL DATABASE BLUEPRINT

### A. FINAL TABLE LIST

| Table | Type | Notes |
|-------|------|-------|
| `users` | Entity | 2 rows: owner + staff |
| `user_sessions` | Auth | HTTP-only session token store |
| `shop_settings` | Config | Single row |
| `finance_accounts` | Config | 3 fixed rows |
| `suppliers` | Entity | |
| `customers` | Entity | |
| `customer_activities` | Audit | Embedded in current Customer.activities |
| `customer_credit_transactions` | Ledger | Immutable |
| `products` | Entity | Includes variant_options/variant_values as JSONB |
| `product_fitments` | Entity | |
| `purchase_orders` | Entity | |
| `purchase_order_items` | Line Items | |
| `purchase_order_activity_logs` | Audit | |
| `purchases` | Entity | |
| `purchase_returns` | Entity | Immutable records |
| `supplier_payments` | Ledger | |
| `invoices` | Entity | |
| `invoice_items` | Line Items | |
| `debt_payments` | Ledger | Soft-voidable |
| `sales_returns` | Entity | |
| `sales_return_items` | Line Items | |
| `exchange_items` | Line Items | |
| `stock_movements` | Audit | Append-only |
| `finance_transactions` | Ledger | Append-only |
| `invoice_year_counter` | Sequence | For collision-safe invoice numbering |
| `file_attachments` | Future | For product images when implemented |

### B. FINAL RELATIONSHIP GRAPH

```
shop_settings (1 row)

users (2 rows)
  └── user_sessions (N per user)

finance_accounts (3 rows)
  └── finance_transactions (N)
        ├── reversal_of → finance_transactions (self)
        ├── supplier_id → suppliers (optional)
        └── customer_id → customers (optional)

suppliers
  ├── purchases (N)
  │   ├── supplier_payments (N)
  │   └── purchase_returns (N)
  └── purchase_orders (N)
        └── purchase_order_items (N) → products

products
  ├── product_fitments (N)
  ├── stock_movements (N)
  ├── invoice_items (N via invoices)
  ├── sales_return_items (N via sales_returns)
  ├── exchange_items (N via sales_returns)
  └── purchases (N)

customers
  ├── invoices (N)
  ├── debt_payments (N)
  ├── customer_credit_transactions (N)
  ├── customer_activities (N)
  └── sales_returns (N)

invoices
  ├── invoice_items (N) → products
  ├── debt_payments (N)
  ├── sales_returns (N)
  └── customer_credit_transactions (N via invoice_id)

sales_returns
  ├── sales_return_items (N) → invoice_items, products
  ├── exchange_items (N) → products
  └── customer_credit_transactions (N via sales_return_id)
```

### C. FINAL CONSTRAINT LIST

| Table | Constraint | Type |
|-------|-----------|------|
| `products` | `lower(sku)` | UNIQUE INDEX |
| `products` | `status IN ('Active','Inactive','Discontinued')` | CHECK |
| `products` | `stock >= 0` | CHECK |
| `products` | `current_cost >= 0` | CHECK |
| `products` | `sell_price >= 0` | CHECK |
| `products` | `(display_group, variant_values) WHERE both NOT NULL` | UNIQUE INDEX (partial) |
| `suppliers` | `status IN ('Active','Inactive')` | CHECK |
| `purchases` | `quantity > 0` | CHECK |
| `purchases` | `buy_price > 0` | CHECK |
| `purchases` | `payment_status IN ('Paid','Partial','Credit')` | CHECK |
| `purchases` | `returned_quantity >= 0` | CHECK |
| `purchases` | `amount_paid >= 0` | CHECK |
| `purchases` | `due_amount >= 0` | CHECK |
| `invoices` | `invoice_number` | UNIQUE |
| `invoices` | `discount >= 0 AND discount <= 100` | CHECK |
| `invoices` | `amount_paid >= 0` | CHECK |
| `invoices` | `due_amount >= 0` | CHECK |
| `invoices` | `payment_method IN ('Cash','UPI','Card')` | CHECK |
| `invoices` | `payment_status IN (7 values)` | CHECK |
| `invoice_items` | `quantity > 0` | CHECK |
| `invoice_items` | `sell_price >= 0` | CHECK |
| `invoice_items` | `cost_price >= 0` | CHECK |
| `invoice_items` | `returned_quantity >= 0` | CHECK |
| `debt_payments` | `receipt_number` | UNIQUE |
| `debt_payments` | `amount > 0` | CHECK |
| `sales_returns` | `return_number` | UNIQUE |
| `sales_returns` | `status IN ('Pending','Refunded','Adjusted','Cancelled')` | CHECK |
| `sales_returns` | `refund_method IN ('Cash','UPI','Bank','Adjustment','Exchange')` | CHECK |
| `users` | `lower(username)` | UNIQUE INDEX |
| `users` | `role IN ('owner','staff')` | CHECK |
| `shop_settings` | `id = 'singleton'` | CHECK |
| `stock_movements` | `type IN (9 values)` | CHECK |
| `finance_transactions` | `type IN ('Income','Expense')` | CHECK |
| `finance_transactions` | `amount > 0` | CHECK |
| `customer_credit_transactions` | `type IN (5 values)` | CHECK |
| `customer_credit_transactions` | `amount > 0` | CHECK |
| `purchase_orders` | `po_number` | UNIQUE |
| `purchase_orders` | `status IN (6 values)` | CHECK |

### D. FINAL INDEX LIST

```sql
-- products
CREATE UNIQUE INDEX idx_products_sku_ci ON products (lower(sku));
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_display_group ON products(display_group);
CREATE INDEX idx_products_status ON products(status);
CREATE UNIQUE INDEX idx_products_group_variant ON products(display_group, variant_values)
  WHERE display_group IS NOT NULL AND variant_values IS NOT NULL;

-- product_fitments
CREATE INDEX idx_product_fitments_product_id ON product_fitments(product_id);

-- purchases
CREATE INDEX idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX idx_purchases_product_id ON purchases(product_id);
CREATE INDEX idx_purchases_purchase_date ON purchases(purchase_date);
CREATE INDEX idx_purchases_created_at ON purchases(created_at);  -- FIFO ordering

-- invoices
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_invoice_date ON invoices(invoice_date);
CREATE INDEX idx_invoices_created_at ON invoices(created_at);    -- FIFO ordering
CREATE INDEX idx_invoices_voided ON invoices(voided);
CREATE INDEX idx_invoices_payment_status ON invoices(payment_status);

-- invoice_items
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_product_id ON invoice_items(product_id);

-- debt_payments
CREATE INDEX idx_debt_payments_customer_id ON debt_payments(customer_id);
CREATE INDEX idx_debt_payments_invoice_id ON debt_payments(invoice_id);
CREATE INDEX idx_debt_payments_voided ON debt_payments(voided);

-- supplier_payments
CREATE INDEX idx_supplier_payments_supplier_id ON supplier_payments(supplier_id);
CREATE INDEX idx_supplier_payments_purchase_id ON supplier_payments(purchase_id);

-- sales_returns
CREATE INDEX idx_sales_returns_invoice_id ON sales_returns(invoice_id);
CREATE INDEX idx_sales_returns_customer_id ON sales_returns(customer_id);
CREATE INDEX idx_sales_returns_status ON sales_returns(status);

-- stock_movements
CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX idx_stock_movements_type ON stock_movements(type);

-- finance_transactions
CREATE INDEX idx_finance_transactions_account_id ON finance_transactions(account_id);
CREATE INDEX idx_finance_transactions_date ON finance_transactions(transaction_date);
CREATE INDEX idx_finance_transactions_category ON finance_transactions(category);
CREATE INDEX idx_finance_transactions_reference ON finance_transactions(reference_id);

-- customer_credit_transactions
CREATE INDEX idx_credit_txs_customer_id ON customer_credit_transactions(customer_id);
CREATE INDEX idx_credit_txs_invoice_id ON customer_credit_transactions(invoice_id);

-- customer_activities
CREATE INDEX idx_customer_activities_customer_id ON customer_activities(customer_id);

-- users / sessions
CREATE UNIQUE INDEX idx_users_username_ci ON users(lower(username));
CREATE INDEX idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
```

### E. TRANSACTION LIST

| Transaction | Tables Involved | Row Locks |
|-------------|----------------|-----------|
| `createInvoice()` | invoices, invoice_items, products, stock_movements, customers, customer_activities, finance_transactions, customer_credit_transactions | products FOR UPDATE, customers FOR UPDATE |
| `voidInvoice()` | invoices, products, stock_movements, customers, customer_activities, finance_transactions, customer_credit_transactions | invoices FOR UPDATE, products FOR UPDATE |
| `createPurchase()` | purchases, products, stock_movements, supplier_payments, finance_transactions, purchase_orders | products FOR UPDATE |
| `createPurchaseReturn()` | purchases, purchase_returns, products, stock_movements, finance_transactions | products FOR UPDATE, purchases FOR UPDATE |
| `recordSupplierPaymentFIFO()` | supplier_payments, purchases, finance_transactions | purchases FOR UPDATE |
| `createSalesReturn()` | sales_returns, sales_return_items, exchange_items, invoices, invoice_items, products, stock_movements, finance_transactions, customer_credit_transactions, customers, customer_activities | invoices FOR UPDATE, invoice_items FOR UPDATE, products FOR UPDATE |
| `cancelSalesReturn()` | Same as createSalesReturn | Same as createSalesReturn |
| `recordFIFODebtPayment()` | invoices, debt_payments, finance_transactions, customers | invoices FOR UPDATE |
| `applyCreditToDebt()` | debt_payments, invoices, customer_credit_transactions, customers | invoices FOR UPDATE |
| `voidDebtPayment()` | debt_payments, invoices, customers, finance_transactions | invoices FOR UPDATE |
| `adjustStock()` | products, stock_movements, finance_transactions | products FOR UPDATE |

### F. LOCKING REQUIREMENTS

**Row-Level Locking Order (must be consistent to prevent deadlocks):**
```
1. products     (always first among inventory entities)
2. invoices     (after products)
3. invoice_items (after invoices)
4. purchases    (independent chain — never mix with invoice chain in same transaction)
5. customers    (after invoices)
6. finance_transactions  (last — only inserted, never locked)
```

**Never lock the same table in different orders across different transactions.**

### G. IDEMPOTENCY REQUIREMENTS

| Operation | Idempotency Strategy |
|-----------|---------------------|
| `voidInvoice()` | Check `invoices.voided = true`. If already voided, return success without changes. |
| `voidDebtPayment()` | Check `debt_payments.voided = true`. If already voided, no-op. |
| `cancelSalesReturn()` | Check `sales_returns.status = 'Cancelled'`. If already cancelled, no-op. |
| `createInvoice()` | Invoice number is UNIQUE — duplicate gets constraint violation. Application retries with new number. |
| `recordFIFODebtPayment()` | Not idempotent by design — duplicate payment creates a second record. UI must prevent double-submit. |
| `adjustStock()` | Not idempotent — each call creates a new stock movement. UI deduplication required. |

### H. DERIVED VS STORED FIELDS

| Field | Decision | Reason |
|-------|---------|--------|
| `Customer.debt` | **DERIVE** | Always consistent, no sync risk |
| `Customer.storeCredit` | **DERIVE** | Ledger is source of truth |
| `Customer.totalSpent` | **DO NOT MIGRATE** | Deprecated |
| `Customer.invoiceIds` | **DO NOT MIGRATE** | Derive from `invoices.customer_id` |
| `Customer.visits` | **STORE** | Business metric |
| `Customer.lastVisit` | **STORE** | Or derive as MAX(invoice_date) |
| `Invoice.amountPaid` | **STORE** (mutable) | Required for fast access and void recalculation |
| `Invoice.dueAmount` | **STORE** (mutable) | Required for FIFO ordering |
| `Invoice.paymentStatus` | **STORE** (cached derived) | Required for filtering |
| `Invoice.items[].returnedQuantity` | **STORE** (mutable cache) | Required for void stock calculation |
| `Purchase.amountPaid`, `.dueAmount` | **STORE** (mutable) | Required for FIFO ordering |
| `Purchase.returnedQuantity` | **STORE** (mutable cache) | Required for return quantity guard |
| `Finance account balance` | **DERIVE** from opening + income - expense | Append-only ledger is source of truth |
| `Supplier outstanding balance` | **DERIVE** from purchases - returns - payments | Consistent derivation |
| `WAC (Product.currentCost)` | **STORE** (updated on each purchase) | Required for invoice cost snapshots |

### I. IMMUTABLE VS MUTABLE FIELDS

**IMMUTABLE after INSERT:**
- `purchases.buy_price`, `purchases.quantity`, `purchases.total_amount`
- `invoice_items.sell_price`, `invoice_items.cost_price`, `invoice_items.product_id`
- `invoices.subtotal`, `invoices.discount`, `invoices.total`, `invoices.created_at`, `invoices.invoice_number`
- `sales_returns.cash_refunded`, `sales_returns.debt_cancelled`, `sales_returns.credit_created`
- `debt_payments.amount`, `debt_payments.customer_id`, `debt_payments.invoice_id`
- `stock_movements.*` (append-only audit log)
- `customer_credit_transactions.*` (immutable ledger)
- `finance_transactions.*` (immutable ledger — reversals create new records)
- `purchase_returns.*` (immutable records)

**MUTABLE:**
- `products.stock`, `products.current_cost`, `products.sell_price`, `products.status`, `products.updated_at`
- `invoices.amount_paid`, `invoices.due_amount`, `invoices.payment_status`, `invoices.voided`, `invoices.voided_at`, `invoices.void_reason`, `invoices.voided_by`
- `invoice_items.returned_quantity`
- `purchases.amount_paid`, `purchases.due_amount`, `purchases.payment_status`, `purchases.returned_quantity`, `purchases.invoice_number`, `purchases.purchase_date`, `purchases.notes`
- `customers.debt` (if stored), `customers.visits`, `customers.last_visit`
- `sales_returns.status`, `sales_returns.cancellation_reason`, `sales_returns.cancelled_by`, `sales_returns.cancelled_at`
- `debt_payments.voided`, `debt_payments.voided_at`, `debt_payments.void_reason`, `debt_payments.voided_by`

### J. MIGRATION ORDER

See Section 18 — table creation order is defined there (1-24).

---

## SECTION 20 — RED FLAGS

### CRITICAL — Data Corruption Risks

**1. Stock goes below zero silently:**
Current: `Math.max(0, stock - qty)` floors at 0 without error. A sale of 10 units when stock = 5 succeeds, stock becomes 0, but 10 units were "sold."
Fix: Add `CHECK (stock >= 0)` in PostgreSQL and validate stock >= qty BEFORE the transaction commits.

**2. WAC race condition:**
Two concurrent purchases of the same product both read `oldStock = 10`. Both compute WAC using the same base. Only the last write wins — the mathematically correct chained average is lost.
Fix: `SELECT ... FOR UPDATE` on product row in every purchase transaction.

**3. Invoice number collision under concurrent requests:**
Current sequence generation scans all invoices in JavaScript — not atomic.
Fix: PostgreSQL SEQUENCE via `nextval()` or the `invoice_year_counter` table approach.

**4. Invoice item ID not guaranteed unique across all legacy invoices:**
Format `inv-item-${inv.id}-${idx}` is unique only if `inv.id` is unique. Some legacy records may have gaps.
Fix: Assign UUID to every invoice item during migration. Remap all `SalesReturnItem.invoiceItemId` references.

**5. `customer.debt` cache can drift:**
Any operation that modifies `invoice.dueAmount` without recalculating `customer.debt` causes drift.
Fix: Derive `customer.debt` from `invoices.due_amount` in PostgreSQL. Never store it.

**6. Payment receipt counter race condition:**
`paymentReceiptCounter` is read and incremented in the same JavaScript operation.
Fix: PostgreSQL SEQUENCE for `PAY-` numbers.

**7. `Purchase.totalAmount` corruption:**
Migration m002 corrects corrupted `totalAmount` values. If skipped, `dueAmount` and `paymentStatus` are wrong.
Fix: After migration, validate: `UPDATE purchases SET total_amount = quantity * buy_price WHERE total_amount != ROUND(quantity * buy_price, 4)`.

### HIGH — Financial Mismatch Risks

**8. FIFO ordering depends on `createdAt` which may be missing:**
Some purchases may lack `createdAt` (legacy records). FIFO falls back to `date` (YYYY-MM-DD), which loses intra-day ordering.
Fix: During migration, fill missing `created_at` with `purchase_date::timestamptz + interval '12 hours'`.

**9. Supplier FIFO uses `purchase_returns.total_amount` for effective due (not `refund_amount`):**
This is CORRECT behavior (the goods value reduces liability). Must be preserved exactly in the PostgreSQL query.

**10. Double cash refund on sales return:**
The `PAID_AVAILABLE` check prevents refunding more than was paid, but it reads `invoice.amountPaid` which includes ALL debt repayments. If the customer has made subsequent debt repayments, those amounts become refundable too. This is current behavior — preserve exactly.

**11. Exchange stock direction is double-entry:**
ADD_SALES_RETURN for Exchange: stock IN for returned items, stock OUT for replacement items. CANCEL_SALES_RETURN reverses both. If only one side runs (due to error), stock is inconsistent.
Fix: PostgreSQL transaction ensures atomicity.

### MEDIUM — Inconsistency Risks

**12. `invoice_items.returned_quantity` is a mutable cache that can desync:**
It is updated by both `ADD_SALES_RETURN` and `CANCEL_SALES_RETURN`. VOID_INVOICE uses this cache to calculate unreturnedQty for stock restoration (store.tsx:1849). If wrong, void restores wrong quantity.
Fix: After migration, validate: for each invoice, `SUM(sales_return_items.quantity WHERE NOT cancelled)` should equal `invoice_items.returned_quantity`.

**13. Settings stored separately from AppState:**
`autovault_settings` localStorage key is separate from `autovault_store`. A partial restore may restore one without the other.
Fix: Include settings in PostgreSQL `shop_settings` table — always consistent.

**14. Finance `reversalOf` has no cycle prevention in DB:**
A reversal could theoretically reference another reversal. Current code guards against this (store.tsx:1925), but there's no database constraint.
Fix: Application-level guard — check that target finance transaction does not itself have a `reversal_of` set.

**15. Walk-in customer deduplication:**
ADD_INVOICE creates a new customer if `inv.customer !== 'Walk-in Customer'` even when `customerId` is null. The same person could appear as multiple customer records.
Fix: During migration, deduplicate customers by phone number before applying any UNIQUE constraint.

### SCHEMA GAPS

**16. No audit log for price changes:**
There is no record of when product sell prices or cost prices changed.
Recommendation: Add `product_price_history` table for future auditing (not required for initial migration).

**17. "Bank" and "Card" both map to `acc-bank`:**
`refundMethodToAccountId("Bank") -> "acc-bank"` and `methodToAccountId("Card") -> "acc-bank"` — both share the bank account. This is intentional. Preserve as-is.

**18. Dead dependencies not cleaned up:**
`react-redux`, `redux`, `redux-thunk`, `immer` must be explicitly removed from `package.json` during migration.

---

## SUMMARY: REQUIRED CHANGES TO PROPOSED SCHEMA

| # | Change | Severity |
|---|--------|---------|
| 1 | Add `created_at TIMESTAMPTZ` to `purchases` and `invoices` tables | **CRITICAL** |
| 2 | Replace `UNIQUE (sku)` with `UNIQUE INDEX (lower(sku))` | **CRITICAL** |
| 3 | Change `invoice_items.product_id` FK to `ON DELETE RESTRICT` | **HIGH** |
| 4 | Add `notes TEXT` column to `sales_returns` | **HIGH** |
| 5 | Add `theme TEXT DEFAULT 'light'` to `shop_settings` | **HIGH** |
| 6 | Use `TEXT PRIMARY KEY` for `finance_accounts.id` (to preserve `acc-cash` etc.) | **HIGH** |
| 7 | Remove UNIQUE constraint on `suppliers.phone` | **HIGH** |
| 8 | Change `supplier_payments.payment_date` from DATE to TIMESTAMPTZ | **MEDIUM** |
| 9 | Use JSONB for `variant_options` and `variant_values` on `products` table | **MEDIUM** |
| 10 | Add `reference_type TEXT` column to `finance_transactions` | **MEDIUM** |
| 11 | Add `created_at TIMESTAMPTZ` to `debt_payments` and `supplier_payments` | **MEDIUM** |
| 12 | Add `id = 'singleton'` CHECK constraint on `shop_settings` | **LOW** |
| 13 | Add `discount >= 0 AND discount <= 100` CHECK on `invoices` | **LOW** |
| 14 | Remove `product_variant_options` and `product_variant_values` tables from plan | **MEDIUM** |
| 15 | Make `sales_returns.customer_id` nullable (walk-in returns) | **MEDIUM** |
| 16 | Add unique index on `lower(username)` for `users` table | **HIGH** |
| 17 | Add partial UNIQUE INDEX `(display_group, variant_values)` on `products` WHERE both NOT NULL | **LOW** |
| 18 | Add `invoice_year_counter` table for collision-safe invoice numbering | **HIGH** |

---

*End of AutoVault PostgreSQL Schema and Transaction Design Review*
*All findings verified against actual source code in `c:\Users\rrmss\Desktop\autovault-master-master`*
