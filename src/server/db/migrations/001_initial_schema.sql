-- AUTOVAULT — PostgreSQL 16 Initial Schema Migration
-- Migration: 001_initial_schema.sql
-- Blueprint Authority: AUTOVAULT_FINAL_BACKEND_BLUEPRINT.md
-- Target Database: PostgreSQL 16+

-- Ensure pgcrypto extension is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. CORE ENTITIES
-- ============================================================================

-- 1.1 users
-- Application accounts (Owner / Staff)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT,                                             -- Retained for legacy password hash verification
  legacy_hash   BOOLEAN NOT NULL DEFAULT false,                   -- True if password_hash is from client-side polynomial hash
  role          TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_username_ci ON users (lower(username));

-- 1.2 user_sessions
-- Server-authoritative HTTP-only session tokens
CREATE TABLE user_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,                               -- SHA-256 hash of random session cookie token
  role        TEXT NOT NULL CHECK (role IN ('owner', 'staff')),    -- Cached role for instant middleware evaluation
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- 1.3 shop_settings
-- Single-row configuration matching ShopSettings
CREATE TABLE shop_settings (
  id             TEXT PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  shop_name      TEXT NOT NULL DEFAULT '7 Star Car Accessories',
  owner_name     TEXT NOT NULL DEFAULT 'Owner',
  phone          TEXT NOT NULL DEFAULT '7448138484',
  email          TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT 'Sambhaji Chowk Road, Near Veershav Bank, Ichalkaranji',
  gst_number     TEXT NOT NULL DEFAULT '',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  currency       TEXT NOT NULL DEFAULT '₹',
  show_logo      BOOLEAN NOT NULL DEFAULT true,
  show_gst       BOOLEAN NOT NULL DEFAULT true,
  show_address   BOOLEAN NOT NULL DEFAULT true,
  show_phone     BOOLEAN NOT NULL DEFAULT true,
  footer_message TEXT NOT NULL DEFAULT 'This is a computerized Cash/Credit Memo. Thank you for shopping with us!',
  theme          TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.4 finance_accounts
-- The 3 static core liquid asset accounts ('acc-cash', 'acc-upi', 'acc-bank')
CREATE TABLE finance_accounts (
  id              TEXT PRIMARY KEY,                               -- 'acc-cash', 'acc-upi', 'acc-bank'
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('Cash', 'Bank', 'UPI')),
  opening_balance NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. MASTER ENTITIES (SUPPLIERS, CUSTOMERS, PRODUCTS)
-- ============================================================================

-- 2.1 suppliers
-- Vendor master entity
CREATE TABLE suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  contact_person TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  whatsapp       TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  gst_number     TEXT,
  notes          TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_name ON suppliers(name);
CREATE INDEX idx_suppliers_phone ON suppliers(phone);
CREATE INDEX idx_suppliers_status ON suppliers(status);

-- 2.2 customers
-- Customer entity
CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  visits      INTEGER NOT NULL DEFAULT 0,
  last_visit  DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name ON customers(name);

-- 2.3 products
-- Concrete SKU product master (Product = concrete sellable SKU / variant)
CREATE TABLE products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                   TEXT NOT NULL,
  name                  TEXT NOT NULL,
  brand                 TEXT NOT NULL DEFAULT '',
  category              TEXT NOT NULL DEFAULT '',
  stock                 INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  current_cost          NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (current_cost >= 0), -- Operational WAC
  sell_price            NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
  low_stock_threshold   INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  status                TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Discontinued')),
  is_universal_fit      BOOLEAN NOT NULL DEFAULT false,
  display_group         TEXT,                                                      -- Visual grouping key for variants
  variant_options       JSONB,                                                     -- VariantOptionDefinition[]
  variant_values        JSONB,                                                     -- Record<string, string>
  preferred_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  hsn                   TEXT,
  gst_rate              NUMERIC(5,2) DEFAULT 0 CHECK (gst_rate >= 0 AND gst_rate <= 100),
  location              TEXT,
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_products_sku_ci ON products (lower(sku));
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_display_group ON products(display_group) WHERE display_group IS NOT NULL;
CREATE UNIQUE INDEX idx_products_group_variant_combo ON products (display_group, variant_values) 
  WHERE display_group IS NOT NULL AND variant_values IS NOT NULL;
CREATE INDEX idx_products_brand_cat ON products(brand, category);
CREATE INDEX idx_products_stock_alert ON products(stock, low_stock_threshold);

-- 2.4 product_fitments
-- Vehicle compatibility table for products
CREATE TABLE product_fitments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  vehicle_brand TEXT NOT NULL,
  model         TEXT NOT NULL,
  year_from     TEXT NOT NULL,                                            -- String e.g. "2015"
  year_to       TEXT,                                                     -- Optional end year e.g. "2020"
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_product_fitment UNIQUE (product_id, vehicle_brand, model, year_from)
);

CREATE INDEX idx_product_fitments_product ON product_fitments(product_id);
CREATE INDEX idx_product_fitments_lookup ON product_fitments(vehicle_brand, model, year_from);

-- ============================================================================
-- 3. PURCHASING & PROCUREMENT
-- ============================================================================

-- 3.1 purchase_orders
-- Purchase order master record
CREATE TABLE purchase_orders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number              TEXT NOT NULL UNIQUE,                             -- e.g. PO-2026-00001
  supplier_id            UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  expected_delivery_date DATE,
  notes                  TEXT NOT NULL DEFAULT '',
  status                 TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN (
    'Draft', 'Sent', 'Supplier Confirmed', 'Partially Delivered', 'Completed', 'Cancelled'
  )),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);

-- 3.2 purchase_order_items
-- Line items for purchase orders
CREATE TABLE purchase_order_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id  UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id         UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity           INTEGER NOT NULL CHECK (quantity > 0),
  expected_buy_price NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (expected_buy_price >= 0),
  received_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_items_po_id ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_po_items_product_id ON purchase_order_items(product_id);

-- 3.3 purchase_order_activity_logs
-- Audit logs for purchase order status transitions
CREATE TABLE purchase_order_activity_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id  UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  type               TEXT NOT NULL CHECK (type IN (
    'Created', 'Edited', 'Sent', 'Confirmed', 'Delivery', 'Completed', 'Cancelled'
  )),
  notes              TEXT NOT NULL DEFAULT '',
  performed_by       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_activity_po_id ON purchase_order_activity_logs(purchase_order_id);

-- 3.4 purchases
-- Inventory inbound purchases (WAC source & supplier liability)
CREATE TABLE purchases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  product_id         UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  purchase_order_id  UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  quantity           INTEGER NOT NULL CHECK (quantity > 0),
  buy_price          NUMERIC(12,4) NOT NULL CHECK (buy_price > 0),         -- Snapshot cost per unit
  total_amount       NUMERIC(12,4) NOT NULL CHECK (total_amount > 0),      -- quantity * buy_price
  amount_paid        NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  due_amount         NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (due_amount >= 0),
  returned_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
  invoice_number     TEXT NOT NULL DEFAULT '',                             -- Vendor invoice reference
  purchase_date      DATE NOT NULL,
  payment_status     TEXT NOT NULL CHECK (payment_status IN ('Paid', 'Partial', 'Credit')),
  notes              TEXT NOT NULL DEFAULT '',
  expected_buy_price NUMERIC(12,4),                                        -- Cost variance analysis
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),                   -- MANDATORY FOR FIFO ORDERING
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX idx_purchases_product_id ON purchases(product_id);
CREATE INDEX idx_purchases_fifo_order ON purchases(supplier_id, created_at, purchase_date);
CREATE INDEX idx_purchases_payment_status ON purchases(payment_status);

-- 3.5 purchase_returns
-- Outbound goods returns to suppliers
CREATE TABLE purchase_returns (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id                 UUID NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  supplier_id                 UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  product_id                  UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity                    INTEGER NOT NULL CHECK (quantity > 0),
  buy_price                   NUMERIC(12,4) NOT NULL CHECK (buy_price > 0),
  total_amount                NUMERIC(12,4) NOT NULL CHECK (total_amount > 0), -- Goods value: qty * buy_price
  refund_amount               NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0), -- Cash refund received
  reason                      TEXT NOT NULL DEFAULT '',
  returned_by                 TEXT NOT NULL CHECK (returned_by IN ('Owner', 'Staff')),
  original_purchase_quantity  INTEGER NOT NULL,                               -- Historical snapshot
  original_purchase_value     NUMERIC(12,4) NOT NULL,                         -- Historical snapshot
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_returns_purchase ON purchase_returns(purchase_id);
CREATE INDEX idx_purchase_returns_supplier ON purchase_returns(supplier_id);

-- 3.6 supplier_payments
-- Supplier repayment transaction ledger
CREATE TABLE supplier_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  amount      NUMERIC(12,4) NOT NULL CHECK (amount > 0),
  method      TEXT NOT NULL CHECK (method IN ('Cash', 'UPI', 'Card', 'Bank')),
  is_upfront  BOOLEAN NOT NULL DEFAULT false,
  note        TEXT,
  paid_by     TEXT NOT NULL CHECK (paid_by IN ('Owner', 'Staff')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX idx_supplier_payments_purchase ON supplier_payments(purchase_id);

-- ============================================================================
-- 4. SALES & BILLING
-- ============================================================================

-- 4.1 invoices
-- Sales invoices master record
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT NOT NULL UNIQUE,                                     -- e.g. INV-2026-0001
  customer_id     UUID REFERENCES customers(id) ON DELETE RESTRICT,         -- NULL for walk-in
  customer_name   TEXT NOT NULL DEFAULT 'Walk-in Customer',                 -- Snapshot
  customer_phone  TEXT NOT NULL DEFAULT '',                                 -- Snapshot
  vehicle_number  TEXT NOT NULL DEFAULT '',
  vehicle_model   TEXT NOT NULL DEFAULT '',
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('Cash', 'UPI', 'Card')),
  payment_status  TEXT NOT NULL CHECK (payment_status IN (
    'Paid', 'Partial', 'Credit', 'Paid (Credit Redeemed)', 'Pending', 'Overdue', 'Voided'
  )),
  amount_paid     NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  due_amount      NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (due_amount >= 0),
  subtotal        NUMERIC(12,4) NOT NULL CHECK (subtotal >= 0),
  discount        NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= 100),
  total           NUMERIC(12,4) NOT NULL CHECK (total >= 0),                -- subtotal * (1 - discount/100)
  credit_redeemed NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (credit_redeemed >= 0),
  notes           TEXT NOT NULL DEFAULT '',
  invoice_date    DATE NOT NULL,
  billed_by       TEXT CHECK (billed_by IN ('Owner', 'Staff')),
  voided          BOOLEAN NOT NULL DEFAULT false,
  voided_at       TIMESTAMPTZ,
  void_reason     TEXT,
  voided_by       TEXT,
  shop_snapshot   JSONB,                                                    -- Shop address/phone/GST snapshot
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),                       -- MANDATORY FOR FIFO REPAYMENT
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_date ON invoices(invoice_date);
CREATE INDEX idx_invoices_fifo_order ON invoices(customer_id, created_at, invoice_date);
CREATE INDEX idx_invoices_voided ON invoices(voided);
CREATE INDEX idx_invoices_payment_status ON invoices(payment_status);
CREATE INDEX idx_invoices_date_desc ON invoices(invoice_date DESC);
CREATE INDEX idx_invoices_customer_unpaid ON invoices(customer_id) WHERE due_amount > 0 AND voided = false;

-- 4.2 invoice_items
-- Line items for sales invoices with historical cost and price snapshots
CREATE TABLE invoice_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name      TEXT NOT NULL,                                          -- Snapshot at sale
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  sell_price        NUMERIC(12,4) NOT NULL CHECK (sell_price >= 0),         -- Snapshot sale price
  cost_price        NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (cost_price >= 0), -- Snapshot WAC at sale
  returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0), -- Mutable return cache
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_product ON invoice_items(product_id);

-- 4.3 debt_payments
-- Customer repayment transactions
CREATE TABLE debt_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT UNIQUE,                                              -- e.g. PAY-000001
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  invoice_id     UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount         NUMERIC(12,4) NOT NULL CHECK (amount > 0),
  payment_date   DATE NOT NULL,
  method         TEXT NOT NULL CHECK (method IN ('Cash', 'UPI', 'Card')),
  note           TEXT,
  collected_by   TEXT NOT NULL CHECK (collected_by IN ('Owner', 'Staff')),
  voided         BOOLEAN NOT NULL DEFAULT false,
  voided_at      TIMESTAMPTZ,
  void_reason    TEXT,
  voided_by      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_debt_payments_customer ON debt_payments(customer_id);
CREATE INDEX idx_debt_payments_invoice ON debt_payments(invoice_id);
CREATE INDEX idx_debt_payments_voided ON debt_payments(voided);

-- 4.4 sales_returns
-- Customer sales return master record
CREATE TABLE sales_returns (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number              TEXT NOT NULL UNIQUE,                          -- e.g. SR-2026-00001
  invoice_id                 UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  customer_id                UUID REFERENCES customers(id) ON DELETE RESTRICT, -- Nullable for walk-in
  refund_method              TEXT NOT NULL CHECK (refund_method IN ('Cash', 'UPI', 'Bank', 'Adjustment', 'Exchange')),
  total_refund               NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (total_refund >= 0),
  cash_refunded              NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (cash_refunded >= 0),
  debt_cancelled             NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (debt_cancelled >= 0),
  debt_adjusted              NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (debt_adjusted >= 0),
  credit_created             NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (credit_created >= 0),
  exchange_difference        NUMERIC(12,4) DEFAULT 0,                       -- Positive = customer pays, Negative = shop refunds
  difference_payment_method  TEXT CHECK (difference_payment_method IN ('Cash', 'UPI', 'Card', 'Adjustment')),
  reason                     TEXT NOT NULL DEFAULT '',
  notes                      TEXT,
  status                     TEXT NOT NULL DEFAULT 'Refunded' CHECK (status IN ('Pending', 'Refunded', 'Adjusted', 'Cancelled')),
  created_by                 TEXT,
  cancellation_reason        TEXT,
  cancelled_by               TEXT,
  cancelled_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_returns_invoice ON sales_returns(invoice_id);
CREATE INDEX idx_sales_returns_customer ON sales_returns(customer_id);
CREATE INDEX idx_sales_returns_status ON sales_returns(status);

-- 4.5 sales_return_items
-- Line items returned during a sales return
CREATE TABLE sales_return_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_return_id UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  invoice_item_id UUID REFERENCES invoice_items(id) ON DELETE SET NULL,     -- Optional link to original line item
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name    TEXT NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  selling_price   NUMERIC(12,4) NOT NULL CHECK (selling_price >= 0),
  refund_amount   NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  total_amount    NUMERIC(12,4) NOT NULL CHECK (total_amount >= 0),         -- quantity * selling_price
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sri_sales_return ON sales_return_items(sales_return_id);
CREATE INDEX idx_sri_product ON sales_return_items(product_id);

-- 4.6 exchange_items
-- Replacement items issued during an exchange-type sales return
CREATE TABLE exchange_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_return_id UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name    TEXT NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  selling_price   NUMERIC(12,4) NOT NULL CHECK (selling_price >= 0),
  cost_price      NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exchange_items_return ON exchange_items(sales_return_id);
CREATE INDEX idx_exchange_items_product ON exchange_items(product_id);

-- ============================================================================
-- 5. INVENTORY & FINANCE LEDGERS
-- ============================================================================

-- 5.1 stock_movements
-- Immutable audit log of all physical inventory mutations
CREATE TABLE stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  type        TEXT NOT NULL CHECK (type IN (
    'Opening Stock', 'Purchase', 'Purchase Return', 'Sale',
    'Invoice Void', 'Sales Return', 'Manual Adjustment',
    'Return Cancellation', 'Bulk Import'
  )),
  delta       INTEGER NOT NULL CHECK (delta != 0),                         -- Positive (inbound), Negative (outbound)
  description TEXT NOT NULL DEFAULT '',
  reference   TEXT NOT NULL DEFAULT '',                                    -- Invoice#, PO#, or Receipt#
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_created ON stock_movements(created_at);
CREATE INDEX idx_stock_movements_type ON stock_movements(type);
CREATE INDEX idx_stock_movements_prod_date ON stock_movements(product_id, created_at DESC);

-- 5.2 finance_transactions
-- General ledger entries tracking money flow across the three accounts
CREATE TABLE finance_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  type             TEXT NOT NULL CHECK (type IN ('Income', 'Expense')),
  category         TEXT NOT NULL CHECK (category IN (
    'Inventory Purchase', 'Supplier Payment', 'Sale', 'Customer Payment',
    'Invoice Void', 'Payment Void', 'Purchase Return', 'Adjustment',
    'Sales Return', 'Utilities', 'Rent', 'Salaries & Wages',
    'Transport & Fuel', 'Maintenance & Repair', 'Marketing',
    'Office & Shop Expense', 'Other Operating Expense', 'Owner Capital',
    'Expense Refund', 'Other Business Receipt'
  )),
  reference_type   TEXT NOT NULL CHECK (reference_type IN (
    'Invoice', 'Purchase', 'PurchaseReturn', 'DebtPayment', 'BusinessExpense', 'System'
  )),
  reference_id     TEXT NOT NULL,                                           -- Polymorphic reference ID
  reversal_of      UUID REFERENCES finance_transactions(id) ON DELETE RESTRICT, -- Reversal audit link
  supplier_id      UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  amount           NUMERIC(12,4) NOT NULL CHECK (amount > 0),
  method           TEXT NOT NULL CHECK (method IN ('Cash', 'UPI', 'Card', 'Bank')),
  transaction_date TIMESTAMPTZ NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_finance_tx_account ON finance_transactions(account_id);
CREATE INDEX idx_finance_tx_date ON finance_transactions(transaction_date);
CREATE INDEX idx_finance_tx_category ON finance_transactions(category);
CREATE INDEX idx_finance_tx_ref ON finance_transactions(reference_id);
CREATE INDEX idx_finance_tx_reversal ON finance_transactions(reversal_of) WHERE reversal_of IS NOT NULL;
CREATE INDEX idx_finance_tx_account_date ON finance_transactions(account_id, transaction_date DESC);

-- 5.3 customer_credit_transactions
-- Store credit ledger for customer balances
CREATE TABLE customer_credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  type            TEXT NOT NULL CHECK (type IN ('Issue', 'Redeem', 'IssueReversal', 'RedeemReversal', 'Reversal')),
  amount          NUMERIC(12,4) NOT NULL CHECK (amount > 0),
  reference_type  TEXT CHECK (reference_type IN (
    'SalesReturn', 'Invoice', 'DebtSettlement', 'ManualAdjustment', 'InvoiceVoid', 'SalesReturnCancellation'
  )),
  reference_id    TEXT,
  invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
  sales_return_id UUID REFERENCES sales_returns(id) ON DELETE SET NULL,
  notes           TEXT,
  created_by      TEXT CHECK (created_by IN ('Owner', 'Staff')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_tx_customer ON customer_credit_transactions(customer_id);
CREATE INDEX idx_credit_tx_invoice ON customer_credit_transactions(invoice_id);
CREATE INDEX idx_credit_tx_return ON customer_credit_transactions(sales_return_id);
CREATE INDEX idx_credit_tx_cust_date ON customer_credit_transactions(customer_id, created_at DESC);

-- 5.4 customer_activities
-- Timeline audit log for customer events
CREATE TABLE customer_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('Invoice', 'Repayment', 'Void', 'Return', 'Credit')),
  description TEXT NOT NULL DEFAULT '',
  reference   TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_activities_cust ON customer_activities(customer_id);

-- ============================================================================
-- 6. SEQUENTIAL NUMBERING TABLES & SEQUENCES
-- ============================================================================

-- 6.1 invoice_year_counter
CREATE TABLE invoice_year_counter (
  year     INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0
);

-- 6.2 purchase_order_year_counter
CREATE TABLE purchase_order_year_counter (
  year     INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0
);

-- 6.3 sales_return_year_counter
CREATE TABLE sales_return_year_counter (
  year     INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0
);

-- 6.4 payment_receipt_seq
CREATE SEQUENCE payment_receipt_seq START 1;

-- ============================================================================
-- 7. MIGRATION & STORAGE SUPPORT TABLES
-- ============================================================================

-- 7.1 import_reports
CREATE TABLE import_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name             TEXT NOT NULL,
  total_rows            INTEGER NOT NULL,
  added_count           INTEGER NOT NULL,
  updated_count         INTEGER NOT NULL,
  unchanged_count       INTEGER NOT NULL,
  error_count           INTEGER NOT NULL,
  stock_increased_count INTEGER NOT NULL,
  stock_decreased_count INTEGER NOT NULL,
  changes               JSONB NOT NULL DEFAULT '[]',                        -- ImportReportChangeItem[]
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_reports_date ON import_reports(created_at DESC);

-- 7.2 file_attachments
CREATE TABLE file_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_name TEXT NOT NULL,
  object_key  TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  BIGINT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'supplier', 'invoice', 'backup')),
  entity_id   TEXT NOT NULL,                                               -- Polymorphic entity ID
  uploaded_by TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_file_attachments_key UNIQUE (bucket_name, object_key)
);

CREATE INDEX idx_file_attachments_entity ON file_attachments(entity_type, entity_id);

-- 7.3 id_migration_map
CREATE TABLE id_migration_map (
  old_id      TEXT PRIMARY KEY,
  new_id      UUID NOT NULL,
  entity_type TEXT NOT NULL
);

-- ============================================================================
-- 8. DERIVED BALANCE VIEWS
-- ============================================================================

-- 8.1 Customer Total Debt View
CREATE OR REPLACE VIEW view_customer_debt_balances AS
  SELECT 
    c.id AS customer_id,
    COALESCE(SUM(i.due_amount), 0) AS total_debt
  FROM customers c
  LEFT JOIN invoices i ON i.customer_id = c.id AND i.voided = false AND i.due_amount > 0
  GROUP BY c.id;

-- 8.2 Customer Store Credit View
CREATE OR REPLACE VIEW view_customer_credit_balances AS
  SELECT
    customer_id,
    GREATEST(0, ROUND(
      SUM(
        CASE 
          WHEN type IN ('Issue', 'RedeemReversal') THEN amount
          WHEN type IN ('Redeem', 'IssueReversal') THEN -amount
          WHEN type = 'Reversal' THEN
            CASE 
              WHEN invoice_id IS NOT NULL AND sales_return_id IS NULL THEN amount
              ELSE -amount
            END
          ELSE 0 
        END
      ), 2
    )) AS credit_balance
  FROM customer_credit_transactions
  GROUP BY customer_id;

-- ============================================================================
-- 9. ATOMIC NUMBERING FUNCTIONS
-- ============================================================================

-- 9.1 Invoice Number Generator: INV-YYYY-XXXX
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_prefix TEXT, p_year INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  INSERT INTO invoice_year_counter (year, last_seq)
  VALUES (p_year, 1)
  ON CONFLICT (year) DO UPDATE
  SET last_seq = invoice_year_counter.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN p_prefix || '-' || p_year::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 9.2 Purchase Order Number Generator: PO-YYYY-XXXXX
CREATE OR REPLACE FUNCTION get_next_po_number(p_year INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  INSERT INTO purchase_order_year_counter (year, last_seq)
  VALUES (p_year, 1)
  ON CONFLICT (year) DO UPDATE
  SET last_seq = purchase_order_year_counter.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'PO-' || p_year::TEXT || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- 9.3 Sales Return Number Generator: SR-YYYY-XXXXX
CREATE OR REPLACE FUNCTION get_next_sales_return_number(p_year INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  INSERT INTO sales_return_year_counter (year, last_seq)
  VALUES (p_year, 1)
  ON CONFLICT (year) DO UPDATE
  SET last_seq = sales_return_year_counter.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'SR-' || p_year::TEXT || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- 9.4 Payment Receipt Number Generator: PAY-XXXXXX
CREATE OR REPLACE FUNCTION get_next_payment_receipt_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'PAY-' || LPAD(nextval('payment_receipt_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;
