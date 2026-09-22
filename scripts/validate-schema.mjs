/**
 * AUTOVAULT — PostgreSQL Schema Validation & Negative Test Suite
 * 
 * Verifies all 30 tables, 1 sequence, 2 views, 4 numbering functions,
 * JSONB data types, foreign key actions, and negative invariant tests.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runMigrations } from "./apply-migrations.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(ROOT_DIR, ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

function getPool(databaseName) {
  const host = process.env.POSTGRES_HOST || "localhost";
  const port = parseInt(process.env.POSTGRES_PORT || "5433", 10);
  const user = process.env.POSTGRES_USER || "autovault";
  const password = process.env.POSTGRES_PASSWORD || "autovault_dev_secret";
  const database = databaseName || process.env.POSTGRES_DB || "autovault";

  return new pg.Pool({
    host,
    port,
    database,
    user,
    password,
    connectionTimeoutMillis: 5000,
  });
}

const EXPECTED_TABLES = [
  "users",
  "user_sessions",
  "shop_settings",
  "finance_accounts",
  "suppliers",
  "customers",
  "products",
  "product_fitments",
  "purchase_orders",
  "purchase_order_items",
  "purchase_order_activity_logs",
  "purchases",
  "purchase_returns",
  "supplier_payments",
  "invoices",
  "invoice_items",
  "debt_payments",
  "sales_returns",
  "sales_return_items",
  "exchange_items",
  "stock_movements",
  "finance_transactions",
  "customer_credit_transactions",
  "customer_activities",
  "invoice_year_counter",
  "purchase_order_year_counter",
  "sales_return_year_counter",
  "import_reports",
  "file_attachments",
  "id_migration_map"
];

const EXPECTED_SEQUENCES = ["payment_receipt_seq"];
const EXPECTED_VIEWS = ["view_customer_debt_balances", "view_customer_credit_balances"];
const EXPECTED_FUNCTIONS = [
  "get_next_invoice_number",
  "get_next_po_number",
  "get_next_sales_return_number",
  "get_next_payment_receipt_number"
];

async function main() {
  console.log("================================================================================");
  console.log("AUTOVAULT — PHASE 2 SCHEMA VALIDATION & NEGATIVE TEST SUITE");
  console.log("================================================================================");
  
  const pool = getPool();
  const client = await pool.connect();
  const testResults = [];

  function recordResult(testName, passed, details) {
    testResults.push({ testName, passed, details });
    const status = passed ? "[PASS]" : "[FAIL]";
    console.log(`${status} ${testName}${details ? ` — ${details}` : ""}`);
  }

  try {
    // 1. Check PostgreSQL Version
    const versionRes = await client.query("SELECT version();");
    const fullVersion = versionRes.rows[0].version;
    console.log(`\n[Database Target] ${fullVersion}`);
    console.log(`[Host/Port] ${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || "5433"}`);
    console.log(`[Database Name] ${process.env.POSTGRES_DB || "autovault"}\n`);

    // 2. Verify Tables
    console.log("--- 1. TABLE CATALOG AUDIT ---");
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != '_migrations'
      ORDER BY table_name;
    `);
    const foundTables = new Set(tableRes.rows.map((r) => r.table_name));

    let allTablesFound = true;
    for (const expected of EXPECTED_TABLES) {
      if (foundTables.has(expected)) {
        recordResult(`Table '${expected}' exists`, true);
      } else {
        recordResult(`Table '${expected}' exists`, false, "Table missing in catalog!");
        allTablesFound = false;
      }
    }
    recordResult("All 30 blueprint tables present", allTablesFound && foundTables.size === EXPECTED_TABLES.length, `Found ${foundTables.size} tables`);

    // 3. Verify Sequence
    console.log("\n--- 2. SEQUENCE AUDIT ---");
    const seqRes = await client.query(`
      SELECT sequencename 
      FROM pg_sequences 
      WHERE schemaname = 'public' AND sequencename = 'payment_receipt_seq';
    `);
    recordResult("Sequence 'payment_receipt_seq' exists", seqRes.rowCount === 1);

    // 4. Verify Views
    console.log("\n--- 3. DERIVED BALANCE VIEWS AUDIT ---");
    const viewRes = await client.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public';
    `);
    const foundViews = new Set(viewRes.rows.map((r) => r.table_name));
    for (const expected of EXPECTED_VIEWS) {
      recordResult(`View '${expected}' exists`, foundViews.has(expected));
    }

    // 5. Verify Functions
    console.log("\n--- 4. NUMBERING GENERATOR FUNCTIONS AUDIT ---");
    const funcRes = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
    `);
    const foundFuncs = new Set(funcRes.rows.map((r) => r.routine_name));
    for (const expected of EXPECTED_FUNCTIONS) {
      recordResult(`Function '${expected}' exists`, foundFuncs.has(expected));
    }

    // 6. Verify JSONB Data Types
    console.log("\n--- 5. JSONB DATA TYPE CATALOG AUDIT ---");
    const jsonbFields = [
      { table: "products", column: "variant_options" },
      { table: "products", column: "variant_values" },
      { table: "invoices", column: "shop_snapshot" },
      { table: "import_reports", column: "changes" },
    ];
    for (const { table, column } of jsonbFields) {
      const colRes = await client.query(`
        SELECT data_type, udt_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2;
      `, [table, column]);
      const dataType = colRes.rows[0]?.udt_name;
      recordResult(`Column '${table}.${column}' is JSONB`, dataType === "jsonb", `Discovered: ${dataType}`);
    }

    // 7. Verify Key Indexes
    console.log("\n--- 6. INDEX INTEGRITY AUDIT ---");
    const indexRes = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public';
    `);
    const indexDefs = new Map(indexRes.rows.map((r) => [r.indexname, r.indexdef]));

    const requiredIndexes = [
      "idx_products_sku_ci",
      "idx_products_group_variant_combo",
      "idx_users_username_ci",
      "idx_user_sessions_token",
      "idx_invoices_customer_unpaid",
      "idx_purchases_fifo_order",
      "idx_invoices_fifo_order"
    ];
    for (const idxName of requiredIndexes) {
      recordResult(`Index '${idxName}' exists`, indexDefs.has(idxName), indexDefs.get(idxName) ? "Verified in pg_indexes" : "Missing");
    }

    // 8. Negative Tests (Executed in transactions with clean rollback)
    console.log("\n--- 7. NEGATIVE INVARIANT TESTS ---");

    // NT-1: Case-insensitive duplicate SKU
    try {
      await client.query("BEGIN;");
      await client.query(`
        INSERT INTO products (sku, name, stock, sell_price)
        VALUES ('SKU-TEST-001', 'Test Product 1', 10, 100);
      `);
      let rejected = false;
      let errorMsg = "";
      try {
        await client.query(`
          INSERT INTO products (sku, name, stock, sell_price)
          VALUES ('sku-test-001', 'Test Product 1 Duplicate', 5, 100);
        `);
      } catch (err) {
        rejected = true;
        errorMsg = err.message;
      }
      await client.query("ROLLBACK;");
      recordResult(
        "NT-1: Duplicate SKU differing only by case is rejected",
        rejected && errorMsg.includes("idx_products_sku_ci"),
        rejected ? `PostgreSQL rejected with: ${errorMsg}` : "Failed to reject duplicate SKU"
      );
    } catch (e) {
      await client.query("ROLLBACK;");
      recordResult("NT-1: Duplicate SKU differing only by case is rejected", false, e.message);
    }

    // NT-2: Negative stock prevention
    try {
      await client.query("BEGIN;");
      let rejected = false;
      let errorMsg = "";
      try {
        await client.query(`
          INSERT INTO products (sku, name, stock, sell_price)
          VALUES ('SKU-NEG-001', 'Negative Stock Product', -5, 100);
        `);
      } catch (err) {
        rejected = true;
        errorMsg = err.message;
      }
      await client.query("ROLLBACK;");
      recordResult(
        "NT-2: Negative stock is rejected by CHECK (stock >= 0)",
        rejected && errorMsg.includes("products_stock_check"),
        rejected ? `PostgreSQL rejected with: ${errorMsg}` : "Failed to reject negative stock"
      );
    } catch (e) {
      await client.query("ROLLBACK;");
      recordResult("NT-2: Negative stock is rejected by CHECK (stock >= 0)", false, e.message);
    }

    // NT-3: Duplicate (display_group, variant_values) combination
    try {
      await client.query("BEGIN;");
      await client.query(`
        INSERT INTO products (sku, name, stock, sell_price, display_group, variant_values)
        VALUES ('SKU-VAR-001', 'Group Product Red', 10, 100, 'T-Shirt Group', '{"color": "Red", "size": "L"}'::jsonb);
      `);
      let rejected = false;
      let errorMsg = "";
      try {
        // Equivalent JSONB with inverted key order to verify JSONB equality handling
        await client.query(`
          INSERT INTO products (sku, name, stock, sell_price, display_group, variant_values)
          VALUES ('SKU-VAR-002', 'Group Product Red Dup', 5, 100, 'T-Shirt Group', '{"size": "L", "color": "Red"}'::jsonb);
        `);
      } catch (err) {
        rejected = true;
        errorMsg = err.message;
      }
      await client.query("ROLLBACK;");
      recordResult(
        "NT-3: Duplicate (display_group, variant_values) combination is rejected",
        rejected && errorMsg.includes("idx_products_group_variant_combo"),
        rejected ? `PostgreSQL rejected with: ${errorMsg}` : "Failed to reject duplicate variant combo"
      );
    } catch (e) {
      await client.query("ROLLBACK;");
      recordResult("NT-3: Duplicate (display_group, variant_values) combination is rejected", false, e.message);
    }

    // NT-4: Partial index allows multiple products with NULL display_group or NULL variant_values
    try {
      await client.query("BEGIN;");
      await client.query(`
        INSERT INTO products (sku, name, stock, sell_price, display_group, variant_values)
        VALUES ('SKU-NULL-001', 'Null Variant 1', 10, 100, NULL, NULL);
      `);
      await client.query(`
        INSERT INTO products (sku, name, stock, sell_price, display_group, variant_values)
        VALUES ('SKU-NULL-002', 'Null Variant 2', 10, 100, NULL, NULL);
      `);
      await client.query(`
        INSERT INTO products (sku, name, stock, sell_price, display_group, variant_values)
        VALUES ('SKU-NULL-003', 'Null Values 3', 10, 100, 'Some Group', NULL);
      `);
      await client.query("ROLLBACK;");
      recordResult(
        "NT-4: Partial index correctly permits multiple products with NULL variant fields",
        true,
        "Successfully inserted products with NULL display_group / variant_values"
      );
    } catch (e) {
      await client.query("ROLLBACK;");
      recordResult("NT-4: Partial index correctly permits multiple products with NULL variant fields", false, e.message);
    }

    // NT-5: Singleton constraint on shop_settings
    try {
      await client.query("BEGIN;");
      await client.query(`
        INSERT INTO shop_settings (id, shop_name)
        VALUES ('singleton', 'Original Shop')
        ON CONFLICT (id) DO NOTHING;
      `);
      let rejected = false;
      let errorMsg = "";
      try {
        await client.query(`
          INSERT INTO shop_settings (id, shop_name)
          VALUES ('other_id', 'Second Shop');
        `);
      } catch (err) {
        rejected = true;
        errorMsg = err.message;
      }
      await client.query("ROLLBACK;");
      recordResult(
        "NT-5: Multiple shop_settings rows rejected (CHECK id = 'singleton')",
        rejected && (errorMsg.includes("shop_settings_id_check") || errorMsg.includes("shop_settings_pkey")),
        rejected ? `PostgreSQL rejected with: ${errorMsg}` : "Failed to reject non-singleton shop_settings"
      );
    } catch (e) {
      await client.query("ROLLBACK;");
      recordResult("NT-5: Multiple shop_settings rows rejected (CHECK id = 'singleton')", false, e.message);
    }

    // NT-6: Invoice discount bounds CHECK (discount >= 0 AND discount <= 100)
    try {
      await client.query("BEGIN;");
      let rejectedNegative = false;
      let rejectedExcess = false;
      try {
        await client.query(`
          INSERT INTO invoices (invoice_number, payment_method, payment_status, subtotal, discount, total, invoice_date)
          VALUES ('INV-TEST-NEG', 'Cash', 'Paid', 100, -5, 105, '2026-09-21');
        `);
      } catch {
        rejectedNegative = true;
      }
      try {
        await client.query(`
          INSERT INTO invoices (invoice_number, payment_method, payment_status, subtotal, discount, total, invoice_date)
          VALUES ('INV-TEST-EXC', 'Cash', 'Paid', 100, 105, 0, '2026-09-21');
        `);
      } catch {
        rejectedExcess = true;
      }
      await client.query("ROLLBACK;");
      recordResult(
        "NT-6: Invoice discount out-of-bounds rejected (CHECK 0 <= discount <= 100)",
        rejectedNegative && rejectedExcess,
        `Rejected negative: ${rejectedNegative}, Rejected >100: ${rejectedExcess}`
      );
    } catch (e) {
      await client.query("ROLLBACK;");
      recordResult("NT-6: Invoice discount out-of-bounds rejected (CHECK 0 <= discount <= 100)", false, e.message);
    }

    // NT-7: Foreign key constraint on finance_transactions
    try {
      await client.query("BEGIN;");
      let rejected = false;
      let errorMsg = "";
      try {
        await client.query(`
          INSERT INTO finance_transactions (
            account_id, type, category, reference_type, reference_id, amount, method, transaction_date
          ) VALUES (
            'acc-nonexistent', 'Expense', 'Utilities', 'BusinessExpense', 'EXP-001', 500, 'Cash', NOW()
          );
        `);
      } catch (err) {
        rejected = true;
        errorMsg = err.message;
      }
      await client.query("ROLLBACK;");
      recordResult(
        "NT-7: Foreign key rejection on invalid finance_accounts reference",
        rejected && errorMsg.includes("finance_transactions_account_id_fkey"),
        rejected ? `PostgreSQL rejected with: ${errorMsg}` : "Failed to reject invalid account_id"
      );
    } catch (e) {
      await client.query("ROLLBACK;");
      recordResult("NT-7: Foreign key rejection on invalid finance_accounts reference", false, e.message);
    }

    // NT-8: ON DELETE RESTRICT on products referenced by invoice_items
    try {
      await client.query("BEGIN;");
      const prodRes = await client.query(`
        INSERT INTO products (sku, name, stock, sell_price)
        VALUES ('SKU-FK-RESTRICT', 'Restricted Product', 10, 100)
        RETURNING id;
      `);
      const prodId = prodRes.rows[0].id;
      const invRes = await client.query(`
        INSERT INTO invoices (invoice_number, payment_method, payment_status, subtotal, total, invoice_date)
        VALUES ('INV-FK-RESTRICT', 'Cash', 'Paid', 100, 100, '2026-09-21')
        RETURNING id;
      `);
      const invId = invRes.rows[0].id;
      await client.query(`
        INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, sell_price)
        VALUES ($1, $2, 'Restricted Product', 1, 100);
      `, [invId, prodId]);

      let rejected = false;
      let errorMsg = "";
      try {
        await client.query("DELETE FROM products WHERE id = $1;", [prodId]);
      } catch (err) {
        rejected = true;
        errorMsg = err.message;
      }
      await client.query("ROLLBACK;");
      recordResult(
        "NT-8: ON DELETE RESTRICT protects product with transaction history from deletion",
        rejected && errorMsg.includes("invoice_items_product_id_fkey"),
        rejected ? `PostgreSQL rejected with: ${errorMsg}` : "Failed to restrict product deletion"
      );
    } catch (e) {
      await client.query("ROLLBACK;");
      recordResult("NT-8: ON DELETE RESTRICT protects product with transaction history from deletion", false, e.message);
    }

    // 9. Numbering Generator Function Execution Tests
    console.log("\n--- 8. NUMBERING GENERATOR FUNCTIONS EXECUTION ---");
    try {
      await client.query("BEGIN;");
      const inv1 = (await client.query("SELECT get_next_invoice_number('INV', 2026) AS num;")).rows[0].num;
      const inv2 = (await client.query("SELECT get_next_invoice_number('INV', 2026) AS num;")).rows[0].num;
      const po1 = (await client.query("SELECT get_next_po_number(2026) AS num;")).rows[0].num;
      const po2 = (await client.query("SELECT get_next_po_number(2026) AS num;")).rows[0].num;
      const sr1 = (await client.query("SELECT get_next_sales_return_number(2026) AS num;")).rows[0].num;
      const sr2 = (await client.query("SELECT get_next_sales_return_number(2026) AS num;")).rows[0].num;
      const pay1 = (await client.query("SELECT get_next_payment_receipt_number() AS num;")).rows[0].num;
      const pay2 = (await client.query("SELECT get_next_payment_receipt_number() AS num;")).rows[0].num;
      await client.query("ROLLBACK;");

      const invSeq1 = parseInt(inv1.split("-")[2], 10);
      const invSeq2 = parseInt(inv2.split("-")[2], 10);
      const poSeq1 = parseInt(po1.split("-")[2], 10);
      const poSeq2 = parseInt(po2.split("-")[2], 10);
      const srSeq1 = parseInt(sr1.split("-")[2], 10);
      const srSeq2 = parseInt(sr2.split("-")[2], 10);

      recordResult("get_next_invoice_number sequential output", invSeq2 === invSeq1 + 1, `${inv1} -> ${inv2}`);
      recordResult("get_next_po_number sequential output", poSeq2 === poSeq1 + 1, `${po1} -> ${po2}`);
      recordResult("get_next_sales_return_number sequential output", srSeq2 === srSeq1 + 1, `${sr1} -> ${sr2}`);
      recordResult("get_next_payment_receipt_number sequential output", pay1.startsWith("PAY-") && pay2.startsWith("PAY-") && pay1 !== pay2, `${pay1} -> ${pay2}`);
    } catch (e) {
      await client.query("ROLLBACK;");
      recordResult("Numbering generator functions execution", false, e.message);
    }

    // 10. Derived Views Calculation Tests
    console.log("\n--- 9. DERIVED VIEWS CALCULATION ---");
    try {
      await client.query("BEGIN;");
      // Seed customer
      const custRes = await client.query(`
        INSERT INTO customers (name, phone)
        VALUES ('Test View Customer', '9876543210')
        RETURNING id;
      `);
      const custId = custRes.rows[0].id;

      // Invoices with debt
      await client.query(`
        INSERT INTO invoices (invoice_number, customer_id, payment_method, payment_status, subtotal, total, amount_paid, due_amount, invoice_date, voided)
        VALUES ('INV-VIEW-01', $1, 'Cash', 'Partial', 1000, 1000, 400, 600, '2026-09-21', false);
      `, [custId]);
      await client.query(`
        INSERT INTO invoices (invoice_number, customer_id, payment_method, payment_status, subtotal, total, amount_paid, due_amount, invoice_date, voided)
        VALUES ('INV-VIEW-02', $1, 'Cash', 'Credit', 500, 500, 0, 500, '2026-09-21', false);
      `, [custId]);
      // Voided invoice (should NOT count in debt)
      await client.query(`
        INSERT INTO invoices (invoice_number, customer_id, payment_method, payment_status, subtotal, total, amount_paid, due_amount, invoice_date, voided)
        VALUES ('INV-VIEW-03', $1, 'Cash', 'Voided', 300, 300, 0, 300, '2026-09-21', true);
      `, [custId]);

      const debtRes = await client.query("SELECT total_debt FROM view_customer_debt_balances WHERE customer_id = $1;", [custId]);
      const calculatedDebt = parseFloat(debtRes.rows[0]?.total_debt);
      recordResult("view_customer_debt_balances excludes voided and sums due amounts", calculatedDebt === 1100, `Expected 1100, got ${calculatedDebt}`);

      // Customer store credit transactions
      await client.query(`
        INSERT INTO customer_credit_transactions (customer_id, type, amount)
        VALUES ($1, 'Issue', 500);
      `, [custId]);
      await client.query(`
        INSERT INTO customer_credit_transactions (customer_id, type, amount)
        VALUES ($1, 'Redeem', 150);
      `, [custId]);

      const creditRes = await client.query("SELECT credit_balance FROM view_customer_credit_balances WHERE customer_id = $1;", [custId]);
      const calculatedCredit = parseFloat(creditRes.rows[0]?.credit_balance);
      recordResult("view_customer_credit_balances calculates net store credit", calculatedCredit === 350, `Expected 350, got ${calculatedCredit}`);

      await client.query("ROLLBACK;");
    } catch (e) {
      await client.query("ROLLBACK;");
      recordResult("Derived views calculation test", false, e.message);
    }

    // 11. Disposable Database Recreation Test (Instruction 5)
    console.log("\n--- 10. RECREATION TEST ON DISPOSABLE DATABASE ---");
    const disposableDbName = "autovault_disposable_val";
    try {
      // Connect to default 'postgres' database to create and drop the disposable test database
      const adminPool = getPool("postgres");
      const adminClient = await adminPool.connect();
      try {
        await adminClient.query(`DROP DATABASE IF EXISTS ${disposableDbName};`);
        await adminClient.query(`CREATE DATABASE ${disposableDbName};`);
        console.log(`[Disposable Test] Created temporary database '${disposableDbName}'`);

        // Run migrations against the disposable database
        const { applied } = await runMigrations(disposableDbName);
        console.log(`[Disposable Test] Successfully applied ${applied.length} migration(s) on '${disposableDbName}'`);

        // Verify catalog on disposable DB
        const dispPool = getPool(disposableDbName);
        const dispClient = await dispPool.connect();
        try {
          const dispTableRes = await dispClient.query(`
            SELECT count(*)::int AS count 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != '_migrations';
          `);
          const dispCount = dispTableRes.rows[0].count;
          recordResult(
            "Recreation test on disposable database succeeds completely",
            dispCount === EXPECTED_TABLES.length,
            `Created all ${dispCount} tables in fresh database`
          );
        } finally {
          dispClient.release();
          await dispPool.end();
        }

        // Clean up disposable database
        await adminClient.query(`DROP DATABASE ${disposableDbName};`);
        console.log(`[Disposable Test] Successfully destroyed temporary database '${disposableDbName}' without touching development DB.`);
      } finally {
        adminClient.release();
        await adminPool.end();
      }
    } catch (err) {
      recordResult("Recreation test on disposable database succeeds completely", false, err.message);
    }

    console.log("\n================================================================================");
    const passedCount = testResults.filter((r) => r.passed).length;
    const failedCount = testResults.filter((r) => !r.passed).length;
    console.log(`SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED out of ${testResults.length} checks.`);
    console.log("================================================================================");

    if (failedCount > 0) {
      process.exit(1);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FATAL ERROR IN VALIDATION SUITE:", err);
  process.exit(1);
});
