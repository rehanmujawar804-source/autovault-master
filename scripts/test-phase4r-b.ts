import { randomUUID } from "node:crypto";
import { pool } from "../src/server/db/client.js";
import { financeRepository } from "../src/server/repositories/financeRepository.js";
import { inventoryService } from "../src/server/services/inventoryService.js";
import { financeService } from "../src/server/services/financeService.js";
import { salesReturnService } from "../src/server/services/salesReturnService.js";
import { withTransaction, DbClient } from "../src/server/db/txRunner.js";
import { Decimal } from "decimal.js";
import { 
  TransactionAlreadyReversedError, 
  CannotReverseReversalError,
  InvalidStateTransitionError,
  OverReturnError
} from "../src/server/errors/domainErrors.js";

async function executeSql(sql: string, params: any[] = []) {
  return pool.query(sql, params);
}

// Track entities created by this test run for targeted cleanup
const trackedCustomers: string[] = [];
const trackedProducts: string[] = [];
const trackedInvoices: string[] = [];
const trackedReturns: string[] = [];
const trackedFinanceTxs: string[] = [];

async function ensureFixtures() {
  await pool.query(`INSERT INTO shop_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;`);
  await pool.query(`
    INSERT INTO finance_accounts (id, name, type, opening_balance)
    VALUES 
      ('acc-cash', 'Cash Account', 'Cash', 0),
      ('acc-upi', 'UPI Account', 'UPI', 0),
      ('acc-bank', 'Bank Account', 'Bank', 0)
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function createIsolatedCustomer(name: string): Promise<string> {
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const res = await executeSql(
    `INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id`,
    [`${name} (${randomUUID().slice(0, 6)})`, phone]
  );
  const id = res.rows[0].id;
  trackedCustomers.push(id);
  return id;
}

async function createIsolatedProduct(skuPrefix: string, name: string, cost: number, price: number, stock: number): Promise<string> {
  const sku = `${skuPrefix}-${randomUUID().slice(0, 8)}`;
  const res = await executeSql(
    `INSERT INTO products (sku, name, category, current_cost, sell_price, stock)
     VALUES ($1, $2, 'Accessories', $3, $4, $5) RETURNING id`,
    [sku, name, cost, price, stock]
  );
  const id = res.rows[0].id;
  trackedProducts.push(id);
  return id;
}

async function createIsolatedInvoice(customerId: string, productId: string, productName: string, qty: number, price: number): Promise<{ invoiceId: string; invoiceItemId: string }> {
  const invNumber = `INV-4RB-${randomUUID().slice(0, 8)}`;
  const total = qty * price;
  const invRes = await executeSql(
    `INSERT INTO invoices (invoice_number, customer_id, customer_name, payment_method, payment_status, amount_paid, due_amount, subtotal, discount, total, invoice_date)
     VALUES ($1, $2, 'Test Customer', 'Cash', 'Paid', $3, 0, $3, 0, $3, NOW()) RETURNING id`,
    [invNumber, customerId, total]
  );
  const invoiceId = invRes.rows[0].id;
  trackedInvoices.push(invoiceId);

  const itemRes = await executeSql(
    `INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, sell_price, cost_price)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [invoiceId, productId, productName, qty, price, price]
  );
  const invoiceItemId = itemRes.rows[0].id;
  return { invoiceId, invoiceItemId };
}

async function cleanupTrackedData() {
  try {
    for (const returnId of trackedReturns) {
      await executeSql(`DELETE FROM exchange_items WHERE sales_return_id = $1`, [returnId]);
      await executeSql(`DELETE FROM sales_return_items WHERE sales_return_id = $1`, [returnId]);
      await executeSql(`DELETE FROM stock_movements WHERE reference IN (SELECT return_number FROM sales_returns WHERE id = $1)`, [returnId]);
      await executeSql(`DELETE FROM finance_transactions WHERE reference_id = $1`, [returnId]);
      await executeSql(`DELETE FROM sales_returns WHERE id = $1`, [returnId]);
    }
    for (const invId of trackedInvoices) {
      await executeSql(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invId]);
      await executeSql(`DELETE FROM invoices WHERE id = $1`, [invId]);
    }
    for (const txId of trackedFinanceTxs) {
      await executeSql(`DELETE FROM finance_transactions WHERE id = $1 OR reversal_of = $1`, [txId]);
    }
    for (const prodId of trackedProducts) {
      await executeSql(`DELETE FROM stock_movements WHERE product_id = $1`, [prodId]);
      await executeSql(`DELETE FROM finance_transactions WHERE reference_id = $1`, [prodId]);
      await executeSql(`DELETE FROM products WHERE id = $1`, [prodId]);
    }
    for (const custId of trackedCustomers) {
      await executeSql(`DELETE FROM customers WHERE id = $1`, [custId]);
    }
  } catch (err) {
    console.warn("Targeted cleanup warning:", err);
  }
}

async function runTests() {
  console.log("================================================================================");
  console.log("             AUTOVAULT PHASE 4R-B — DOMAIN & FINANCIAL EDGE-CASES               ");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, description: string, detail: string = "") => {
    if (condition) {
      console.log(`[PASS] ${description}${detail ? ` -> ${detail}` : ""}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description}${detail ? ` -> ${detail}` : ""}`);
      failed++;
    }
  };

  try {
    await ensureFixtures();

    const customerId = await createIsolatedCustomer("Phase4RB Customer");
    const baseProductId = await createIsolatedProduct("BASE-PROD", "Base Product", 100, 150, 20);
    const upgradeProductId = await createIsolatedProduct("UPGRADE-PROD", "Upgrade Product", 200, 300, 20);
    const downgradeProductId = await createIsolatedProduct("DOWNGRADE-PROD", "Downgrade Product", 40, 50, 20);

    const { invoiceId, invoiceItemId } = await createIsolatedInvoice(
      customerId,
      baseProductId,
      "Base Product",
      5,
      150
    );

    // =========================================================================
    // GROUP A: Exchange Difference Tests
    // =========================================================================
    console.log("\n--- GROUP A: Exchange Difference Tests ---");

    // A1: Positive difference creates exactly one Income transaction, reversal_of is NULL
    const returnA1 = await salesReturnService.createSalesReturn({
      invoiceId,
      items: [{ productId: baseProductId, productName: "Base Product", quantity: 1, sellingPrice: 150 }],
      refundMethod: "Exchange",
      exchangeItems: [{ productId: upgradeProductId, productName: "Upgrade Product", quantity: 1, sellingPrice: 300 }],
      reason: "Customer upgrade",
      differencePaymentMethod: "Cash"
    });
    trackedReturns.push(returnA1.id);

    const txsA1 = await executeSql(
      `SELECT * FROM finance_transactions WHERE reference_id = $1`,
      [returnA1.id]
    );
    assert(
      txsA1.rows.length === 1 &&
      txsA1.rows[0].type === "Income" &&
      txsA1.rows[0].category === "Sales Return" &&
      new Decimal(txsA1.rows[0].amount).equals(new Decimal(150)) &&
      txsA1.rows[0].reversal_of === null,
      "Test A1: Positive difference creates exactly 1 Income transaction (150) with reversal_of NULL",
      `txId=${txsA1.rows[0]?.id}, type=${txsA1.rows[0]?.type}, amount=${txsA1.rows[0]?.amount}`
    );

    // A2: Zero difference creates no Income and no Expense
    const equalProductId = await createIsolatedProduct("EQUAL-PROD", "Equal Value Product", 100, 150, 20);
    const returnA2 = await salesReturnService.createSalesReturn({
      invoiceId,
      items: [{ productId: baseProductId, productName: "Base Product", quantity: 1, sellingPrice: 150 }],
      refundMethod: "Exchange",
      exchangeItems: [{ productId: equalProductId, productName: "Equal Value Product", quantity: 1, sellingPrice: 150 }],
      reason: "Equal value swap"
    });
    trackedReturns.push(returnA2.id);

    const txsA2 = await executeSql(
      `SELECT * FROM finance_transactions WHERE reference_id = $1`,
      [returnA2.id]
    );
    assert(
      txsA2.rows.length === 0,
      "Test A2: Zero difference creates 0 finance transactions (no Income, no Expense)",
      `tx count = ${txsA2.rows.length}`
    );

    // A3: Negative difference creates exactly one Expense transaction with positive amount, reversal_of NULL
    const returnA3 = await salesReturnService.createSalesReturn({
      invoiceId,
      items: [{ productId: baseProductId, productName: "Base Product", quantity: 1, sellingPrice: 150 }],
      refundMethod: "Exchange",
      exchangeItems: [{ productId: downgradeProductId, productName: "Downgrade Product", quantity: 1, sellingPrice: 50 }],
      reason: "Customer downgrade",
      differencePaymentMethod: "Cash"
    });
    trackedReturns.push(returnA3.id);

    const txsA3 = await executeSql(
      `SELECT * FROM finance_transactions WHERE reference_id = $1`,
      [returnA3.id]
    );
    assert(
      txsA3.rows.length === 1 &&
      txsA3.rows[0].type === "Expense" &&
      txsA3.rows[0].category === "Sales Return" &&
      new Decimal(txsA3.rows[0].amount).equals(new Decimal(100)) &&
      txsA3.rows[0].reversal_of === null,
      "Test A3: Negative difference creates exactly 1 Expense transaction (100) with positive persisted amount and reversal_of NULL",
      `txId=${txsA3.rows[0]?.id}, type=${txsA3.rows[0]?.type}, amount=${txsA3.rows[0]?.amount}`
    );

    // A4: Forced transaction failure rolls back sales return, stock changes, and exchange Expense atomically
    const stockBeforeA4 = (await executeSql(`SELECT stock FROM products WHERE id = $1`, [downgradeProductId])).rows[0].stock;
    const txCountBeforeA4 = parseInt((await executeSql(`SELECT COUNT(*) FROM finance_transactions`)).rows[0].count, 10);

    let a4ErrorThrown = false;
    try {
      await salesReturnService.createSalesReturn({
        invoiceId,
        items: [{ productId: baseProductId, productName: "Base Product", quantity: 9999, sellingPrice: 150 }], // Over-return
        refundMethod: "Exchange",
        exchangeItems: [{ productId: downgradeProductId, productName: "Downgrade Product", quantity: 1, sellingPrice: 50 }],
        reason: "Forced failure"
      });
    } catch (e: any) {
      a4ErrorThrown = e instanceof OverReturnError;
    }

    const stockAfterA4 = (await executeSql(`SELECT stock FROM products WHERE id = $1`, [downgradeProductId])).rows[0].stock;
    const txCountAfterA4 = parseInt((await executeSql(`SELECT COUNT(*) FROM finance_transactions`)).rows[0].count, 10);
    assert(
      a4ErrorThrown && stockBeforeA4 === stockAfterA4 && txCountBeforeA4 === txCountAfterA4,
      "Test A4: Forced failure rolls back sales return, stock changes, and finance transactions atomically",
      `OverReturn caught: ${a4ErrorThrown}, stock unchanged: ${stockBeforeA4} -> ${stockAfterA4}, txs unchanged`
    );

    // =========================================================================
    // GROUP B: Sales Return Cancellation Reversal
    // =========================================================================
    console.log("\n--- GROUP B: Sales Return Cancellation Reversal ---");

    // B1: Cancel positive exchange surcharge creates exactly one reversal Expense transaction with reversal_of = original.id
    const originalTxA1 = txsA1.rows[0];
    await salesReturnService.cancelSalesReturn(returnA1.id, "Cancelling upgrade return", "Owner");

    const txsAfterB1 = await executeSql(
      `SELECT * FROM finance_transactions WHERE reference_id = $1 ORDER BY created_at ASC`,
      [returnA1.id]
    );
    const reversalB1 = txsAfterB1.rows.find(r => r.reversal_of === originalTxA1.id);

    assert(
      txsAfterB1.rows.length === 2 &&
      reversalB1 !== undefined &&
      reversalB1.type === "Expense" &&
      new Decimal(reversalB1.amount).equals(new Decimal(originalTxA1.amount)) &&
      reversalB1.reversal_of === originalTxA1.id,
      "Test B1: Cancel positive surcharge creates exactly 1 reversal Expense linked to original via reversal_of",
      `reversalId=${reversalB1?.id}, reversalOf=${reversalB1?.reversal_of}, type=${reversalB1?.type}`
    );

    // B2: Cancellation idempotency safety (second attempt rejected with InvalidStateTransitionError, no duplicate reversal)
    let b2Rejected = false;
    try {
      await salesReturnService.cancelSalesReturn(returnA1.id, "Second cancel attempt", "Owner");
    } catch (e: any) {
      b2Rejected = e instanceof InvalidStateTransitionError;
    }
    const txsAfterB2 = await executeSql(
      `SELECT * FROM finance_transactions WHERE reference_id = $1`,
      [returnA1.id]
    );
    assert(
      b2Rejected && txsAfterB2.rows.length === 2,
      "Test B2: Cancellation idempotency rejects second attempt with InvalidStateTransitionError and creates 0 additional reversals",
      `rejected=${b2Rejected}, total txs=${txsAfterB2.rows.length}`
    );

    // B3: Cancel negative exchange difference creates exactly one reversal Income transaction with reversal_of = original.id
    const originalTxA3 = txsA3.rows[0];
    await salesReturnService.cancelSalesReturn(returnA3.id, "Cancelling downgrade return", "Owner");

    const txsAfterB3 = await executeSql(
      `SELECT * FROM finance_transactions WHERE reference_id = $1 ORDER BY created_at ASC`,
      [returnA3.id]
    );
    const reversalB3 = txsAfterB3.rows.find(r => r.reversal_of === originalTxA3.id);

    assert(
      txsAfterB3.rows.length === 2 &&
      reversalB3 !== undefined &&
      reversalB3.type === "Income" &&
      new Decimal(reversalB3.amount).equals(new Decimal(originalTxA3.amount)) &&
      reversalB3.reversal_of === originalTxA3.id,
      "Test B3: Cancel negative difference creates exactly 1 reversal Income linked to original via reversal_of",
      `reversalId=${reversalB3?.id}, reversalOf=${reversalB3?.reversal_of}, type=${reversalB3?.type}`
    );

    // B4: Cancel zero difference return creates no exchange reversal
    await salesReturnService.cancelSalesReturn(returnA2.id, "Cancelling equal return", "Owner");
    const txsAfterB4 = await executeSql(
      `SELECT * FROM finance_transactions WHERE reference_id = $1`,
      [returnA2.id]
    );
    assert(
      txsAfterB4.rows.length === 0,
      "Test B4: Cancel zero difference return creates 0 finance reversals",
      `tx count=${txsAfterB4.rows.length}`
    );

    // =========================================================================
    // GROUP C: Finance Reversal Invariants & Concurrency Guard
    // =========================================================================
    console.log("\n--- GROUP C: Finance Reversal Invariants & Concurrency Guard ---");

    // C1: First reversal succeeds, creates opposite entry with reversal_of
    const origTxC = await financeService.recordBusinessMoneyIn({
      amount: 250,
      category: "Sale",
      method: "Cash",
      notes: "C1 Original Sale"
    });
    trackedFinanceTxs.push(origTxC.id);

    const revC1 = await financeService.reverseTransaction(origTxC.id, "Customer dispute reversal");
    trackedFinanceTxs.push(revC1.id);

    assert(
      revC1.type === "Expense" &&
      revC1.amount === 250 &&
      revC1.reversalOf === origTxC.id,
      "Test C1: First reversal succeeds, creates opposite entry (Expense) with reversal_of link",
      `revId=${revC1.id}, type=${revC1.type}, amount=${revC1.amount}, reversalOf=${revC1.reversalOf}`
    );

    // C2: Duplicate reversal rejected with TransactionAlreadyReversedError
    let c2Rejected = false;
    try {
      await financeService.reverseTransaction(origTxC.id, "Duplicate reversal attempt");
    } catch (e: any) {
      c2Rejected = e instanceof TransactionAlreadyReversedError;
    }
    assert(
      c2Rejected,
      "Test C2: Duplicate reversal rejected with TransactionAlreadyReversedError",
      `rejected=${c2Rejected}`
    );

    // C3: Reversal-of-reversal rejected with CannotReverseReversalError
    let c3Rejected = false;
    try {
      await financeService.reverseTransaction(revC1.id, "Reversing a reversal");
    } catch (e: any) {
      c3Rejected = e instanceof CannotReverseReversalError;
    }
    assert(
      c3Rejected,
      "Test C3: Reversal-of-reversal rejected with CannotReverseReversalError",
      `rejected=${c3Rejected}`
    );

    // C4: Original transaction remains completely unchanged (immutable ledger)
    const origAfterReversal = await financeRepository.getTransactionById(origTxC.id);
    assert(
      origAfterReversal !== null &&
      origAfterReversal.amount === origTxC.amount &&
      origAfterReversal.type === origTxC.type &&
      origAfterReversal.reversalOf === null,
      "Test C4: Original transaction remains completely unchanged (reversal_of is NULL, amount intact)",
      `origAmount=${origAfterReversal?.amount}, origType=${origAfterReversal?.type}, reversalOf=${origAfterReversal?.reversalOf}`
    );

    // C5: Reversal transaction rollback inside outer transaction on downstream failure
    const origForC5 = await financeService.recordBusinessMoneyIn({
      amount: 175,
      category: "Sale",
      method: "UPI",
      notes: "C5 Rollback Sale"
    });
    trackedFinanceTxs.push(origForC5.id);

    let c5Aborted = false;
    try {
      await withTransaction(async (client: DbClient) => {
        // Reverse within active client
        await financeService.reverseTransaction(origForC5.id, "Rollback attempt", client);
        // Downstream failure
        throw new Error("Deliberate downstream failure for C5");
      });
    } catch (e: any) {
      c5Aborted = e.message === "Deliberate downstream failure for C5";
    }

    const c5ReversalFound = await financeRepository.findReversalForTransaction(origForC5.id);
    const origC5After = await financeRepository.getTransactionById(origForC5.id);
    assert(
      c5Aborted && c5ReversalFound === null && origC5After !== null,
      "Test C5: Reversal inside outer transaction rolls back completely on downstream error",
      `aborted=${c5Aborted}, reversalFound=${c5ReversalFound !== null}, origIntact=${origC5After !== null}`
    );

    // C6: Concurrent duplicate reversal using two synchronized connections
    const origForC6 = await financeService.recordBusinessMoneyIn({
      amount: 500,
      category: "Sale",
      method: "Bank",
      notes: "C6 Concurrency Original"
    });
    trackedFinanceTxs.push(origForC6.id);

    let clientALockedResolve!: () => void;
    const clientALocked = new Promise<void>((resolve) => {
      clientALockedResolve = resolve;
    });

    // Task A: acquires transaction, locks row with FOR UPDATE, signals barrier, holds lock briefly, completes reversal
    const taskA = withTransaction(async (clientA: DbClient) => {
      // 1. Acquire FOR UPDATE lock
      await financeRepository.getTransactionById(origForC6.id, { forUpdate: true }, clientA);
      // 2. Signal Task B that row is locked
      clientALockedResolve();
      // 3. Hold lock for 150ms to ensure Task B has sent its query and is blocked waiting on the PG row lock
      await new Promise((res) => setTimeout(res, 150));
      // 4. Complete reversal
      return await financeService.reverseTransaction(origForC6.id, "Race Reversal A", clientA);
    });

    // Task B: waits for Task A's signal, then immediately attempts reverseTransaction (which acquires its own transaction and requests FOR UPDATE)
    const taskB = (async () => {
      await clientALocked;
      return await financeService.reverseTransaction(origForC6.id, "Race Reversal B");
    })();

    const [resA, resB] = await Promise.allSettled([taskA, taskB]);

    const taskASucceeded = resA.status === "fulfilled";
    const taskBRejectedWithAlreadyReversed = 
      resB.status === "rejected" && 
      (resB as PromiseRejectedResult).reason instanceof TransactionAlreadyReversedError;

    const allReversalsC6 = await executeSql(
      `SELECT * FROM finance_transactions WHERE reversal_of = $1`,
      [origForC6.id]
    );

    assert(
      taskASucceeded && taskBRejectedWithAlreadyReversed && allReversalsC6.rows.length === 1,
      "Test C6: Concurrency race serialization via FOR UPDATE ensures exactly 1 reversal and second caller receives TransactionAlreadyReversedError",
      `Task A fulfilled=${taskASucceeded}, Task B rejected=${taskBRejectedWithAlreadyReversed}, reversals in DB=${allReversalsC6.rows.length}`
    );

    // =========================================================================
    // GROUP D: Inventory Precision Tests
    // =========================================================================
    console.log("\n--- GROUP D: Inventory Precision Tests ---");

    // D1: Stock write-off with fractional cost produces exact 2-decimal rounded loss
    const d1ProductId = await createIsolatedProduct("PRECISION-D1", "Precision Prod D1", 123.4567, 200, 10);
    await inventoryService.adjustStock({
      productId: d1ProductId,
      delta: -3,
      note: "Fractional write-off",
      recordExpense: true
    });

    const d1Txs = await executeSql(
      `SELECT * FROM finance_transactions WHERE reference_id = $1`,
      [d1ProductId]
    );
    // 3 * 123.4567 = 370.3701 -> rounded half-up to 370.37
    const expectedLossD1 = new Decimal("3").mul(new Decimal("123.4567")).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const actualLossD1 = new Decimal(d1Txs.rows[0]?.amount || 0);

    assert(
      d1Txs.rows.length === 1 &&
      actualLossD1.equals(expectedLossD1) &&
      actualLossD1.equals(new Decimal("370.37")),
      "Test D1: Fractional cost write-off produces exact 2-decimal rounded loss via Decimal.js (370.37)",
      `expected=${expectedLossD1.toString()}, actual=${actualLossD1.toString()}`
    );

    // D2: Known floating-point precision hazard (3 * 0.14 = 0.42000000000000004 in JS) verified exact with Decimal.js
    const d2ProductId = await createIsolatedProduct("PRECISION-D2", "Precision Prod D2", 0.14, 1, 10);
    await inventoryService.adjustStock({
      productId: d2ProductId,
      delta: -3,
      note: "Float hazard write-off",
      recordExpense: true
    });

    const d2Txs = await executeSql(
      `SELECT * FROM finance_transactions WHERE reference_id = $1`,
      [d2ProductId]
    );
    // Exact business result: Decimal("3").mul(Decimal("0.14")) = 0.42 exactly
    const expectedLossD2 = new Decimal("3").mul(new Decimal("0.14")).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const actualLossD2 = new Decimal(d2Txs.rows[0]?.amount || 0);

    assert(
      d2Txs.rows.length === 1 &&
      actualLossD2.equals(expectedLossD2) &&
      actualLossD2.equals(new Decimal("0.42")),
      "Test D2: Known floating-point precision hazard (3 * 0.14) business result persists exactly 0.42",
      `expected=${expectedLossD2.toString()}, actual=${actualLossD2.toString()}`
    );

    // D3: Standard inventory adjustment behavior verified intact (stock updated, movement logged)
    const stockAfterD1 = (await executeSql(`SELECT stock FROM products WHERE id = $1`, [d1ProductId])).rows[0].stock;
    const movementD1 = await executeSql(`SELECT * FROM stock_movements WHERE product_id = $1`, [d1ProductId]);

    assert(
      stockAfterD1 === 7 && movementD1.rows.length === 1 && movementD1.rows[0].delta === -3,
      "Test D3: Inventory adjustment stock reduction and stock movement logging remain intact",
      `stock=${stockAfterD1}, movement delta=${movementD1.rows[0]?.delta}`
    );

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log("\n================================================================================");
    console.log(`Phase 4R-B Test Results: ${passed} passed, ${failed} failed`);
    console.log("================================================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution encountered an unhandled error:", error);
    process.exit(1);
  } finally {
    console.log("Cleaning up tracked test data...");
    await cleanupTrackedData();
    await pool.end();
  }
}

runTests();
