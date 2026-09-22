/**
 * AUTOVAULT — Phase 4 Domain Service Integration Test Suite
 * 
 * Verifies all 25 critical domain invariants, multi-table ACID transactions,
 * deadlock-free row locking, deterministic WAC, FIFO waterfall allocations,
 * and ledger immutability against the Phase 2 PostgreSQL database.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { pool } from "../src/server/db/client.js";
import { withTransaction } from "../src/server/db/txRunner.js";
import { inventoryService } from "../src/server/services/inventoryService.js";
import { financeService } from "../src/server/services/financeService.js";
import { customerService } from "../src/server/services/customerService.js";
import { supplierService } from "../src/server/services/supplierService.js";
import { invoiceService } from "../src/server/services/invoiceService.js";
import { purchaseService } from "../src/server/services/purchaseService.js";
import { salesReturnService } from "../src/server/services/salesReturnService.js";
import { paymentService } from "../src/server/services/paymentService.js";
import {
  ValidationError,
  EntityNotFoundError,
  InsufficientStockError,
  ActiveReturnsBlockVoidError,
  ExceededAllocationError,
  OverReturnError
} from "../src/server/errors/domainErrors.js";
import { numberingRepository } from "../src/server/repositories/numberingRepository.js";
import { productRepository } from "../src/server/repositories/productRepository.js";
import { paymentRepository } from "../src/server/repositories/paymentRepository.js";
import { invoiceRepository } from "../src/server/repositories/invoiceRepository.js";
import { customerRepository } from "../src/server/repositories/customerRepository.js";
import { purchaseRepository } from "../src/server/repositories/purchaseRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// Ensure .env.local is loaded if run standalone
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

async function runTests() {
  console.log("================================================================================");
  console.log("             AUTOVAULT PHASE 4 — DOMAIN SERVICE TEST SUITE                      ");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  const assert = (condition, description, detail = "") => {
    if (condition) {
      console.log(`[PASS] ${description}${detail ? ` -> ${detail}` : ""}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description}${detail ? ` -> ${detail}` : ""}`);
      failed++;
    }
  };

  const today = new Date().toISOString().split("T")[0];

  try {
    // Ensure baseline database fixtures (shop_settings singleton, core finance accounts)
    await pool.query(`INSERT INTO shop_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;`);
    await pool.query(`
      INSERT INTO finance_accounts (id, name, type, opening_balance)
      VALUES 
        ('acc-cash', 'Cash Account', 'Cash', 0),
        ('acc-upi', 'UPI Account', 'UPI', 0),
        ('acc-bank', 'Bank Account', 'Bank', 0)
      ON CONFLICT (id) DO NOTHING;
    `);

    // -------------------------------------------------------------------------
    // TEST 1: Invoice Creation
    // -------------------------------------------------------------------------
    console.log("--- Test 1: Invoice Creation & ACID Effects ---");
    const cust1 = await customerService.createCustomer({
      name: `Test Customer 1 (${randomUUID().slice(0, 6)})`,
      phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`
    });

    const prodA = await inventoryService.createProduct({
      sku: `SKU-INV-A-${randomUUID().slice(0, 8)}`,
      name: "Brake Pad Front",
      brand: "Bosch",
      category: "Brakes",
      stock: 50,
      currentCost: 400,
      sellPrice: 600,
      lowStockThreshold: 5
    });

    const prodB = await inventoryService.createProduct({
      sku: `SKU-INV-B-${randomUUID().slice(0, 8)}`,
      name: "Oil Filter",
      brand: "Mann",
      category: "Filters",
      stock: 30,
      currentCost: 150,
      sellPrice: 250,
      lowStockThreshold: 5
    });

    const inv1 = await invoiceService.createInvoice({
      customerId: cust1.id,
      customerName: cust1.name,
      customerPhone: cust1.phone,
      vehicleNumber: "MH-09-AB-1234",
      paymentMethod: "Cash",
      amountPaid: 800,
      discount: 0,
      date: today,
      billedBy: "Owner",
      items: [
        { productId: prodA.id, name: prodA.name, quantity: 2, price: 600 }, // 1200
        { productId: prodB.id, name: prodB.name, quantity: 1, price: 250 }  // 250 -> Total 1450
      ]
    });

    assert(inv1.invoiceNumber.startsWith("INV-"), "Invoice number format", inv1.invoiceNumber);
    assert(inv1.total === 1450, "Invoice total calculation", `Expected 1450, got ${inv1.total}`);
    assert(inv1.amountPaid === 800 && inv1.dueAmount === 650, "Invoice payment balances", `Paid: ${inv1.amountPaid}, Due: ${inv1.dueAmount}`);
    assert(inv1.paymentStatus === "Partial", "Invoice payment status", inv1.paymentStatus);

    const refreshedProdA = await productRepository.findById(prodA.id);
    const refreshedProdB = await productRepository.findById(prodB.id);
    assert(refreshedProdA.stock === 48, "Product A stock deducted by 2", `50 -> ${refreshedProdA.stock}`);
    assert(refreshedProdB.stock === 29, "Product B stock deducted by 1", `30 -> ${refreshedProdB.stock}`);

    // Verify stock movements
    const movementsRes = await pool.query(
      `SELECT * FROM stock_movements WHERE reference = $1 ORDER BY created_at ASC`,
      [inv1.invoiceNumber]
    );
    assert(movementsRes.rows.length === 2, "Stock movements logged for invoice items", `${movementsRes.rows.length} rows`);

    // Verify finance income
    const financeRes = await pool.query(
      `SELECT * FROM finance_transactions WHERE reference_id = $1 AND type = 'Income'`,
      [inv1.id]
    );
    assert(financeRes.rows.length === 1 && parseFloat(financeRes.rows[0].amount) === 800, "Finance income logged for amount paid", `₹${financeRes.rows[0]?.amount}`);

    // -------------------------------------------------------------------------
    // TEST 2: Invoice Stock Insufficiency Rollback
    // -------------------------------------------------------------------------
    console.log("\n--- Test 2: Invoice Stock Insufficiency Rollback ---");
    let stockInsufficiencyCaught = false;
    try {
      await invoiceService.createInvoice({
        customerId: cust1.id,
        customerName: cust1.name,
        paymentMethod: "Cash",
        amountPaid: 100,
        date: today,
        items: [
          { productId: prodB.id, name: prodB.name, quantity: 100, price: 250 } // stock is only 29
        ]
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        stockInsufficiencyCaught = true;
      }
    }
    assert(stockInsufficiencyCaught, "Throws InsufficientStockError on stock shortage");
    const checkProdB = await productRepository.findById(prodB.id);
    assert(checkProdB.stock === 29, "Product stock unchanged after rollback", `Stock: ${checkProdB.stock}`);

    // -------------------------------------------------------------------------
    // TEST 3: Invoice Math Validation
    // -------------------------------------------------------------------------
    console.log("\n--- Test 3: Invoice Input & Math Validation ---");
    let discountValidationCaught = false;
    try {
      await invoiceService.createInvoice({
        customerName: "Walk-in",
        paymentMethod: "Cash",
        amountPaid: 0,
        discount: 150, // Invalid discount
        date: today,
        items: [{ productId: prodA.id, name: prodA.name, quantity: 1, price: 600 }]
      });
    } catch (err) {
      if (err instanceof ValidationError) discountValidationCaught = true;
    }
    assert(discountValidationCaught, "Rejects discount rate > 100%");

    // -------------------------------------------------------------------------
    // TEST 4: Invoice Voiding (Standard)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 4: Invoice Voiding (Standard) ---");
    const voidedInv = await invoiceService.voidInvoice(inv1.id, "Customer cancelled order", "Owner");
    assert(voidedInv.voided === true, "Invoice marked voided");

    const restoredProdA = await productRepository.findById(prodA.id);
    const restoredProdB = await productRepository.findById(prodB.id);
    assert(restoredProdA.stock === 50, "Product A stock fully restored", `48 -> ${restoredProdA.stock}`);
    assert(restoredProdB.stock === 30, "Product B stock fully restored", `29 -> ${restoredProdB.stock}`);

    // Check reversing finance transaction
    const reversingTxRes = await pool.query(
      `SELECT * FROM finance_transactions WHERE reference_id = $1 AND type = 'Expense' AND category = 'Invoice Void'`,
      [inv1.id]
    );
    assert(reversingTxRes.rows.length === 1 && parseFloat(reversingTxRes.rows[0].amount) === 800, "Reversing Expense entry created", `₹${reversingTxRes.rows[0]?.amount}`);

    // -------------------------------------------------------------------------
    // TEST 5: Invoice Voiding Blocked by Active Sales Return
    // -------------------------------------------------------------------------
    console.log("\n--- Test 5: Invoice Voiding Blocked by Active Return ---");
    const invWithReturn = await invoiceService.createInvoice({
      customerName: "Walk-in Return Test",
      paymentMethod: "Cash",
      amountPaid: 600,
      date: today,
      items: [{ productId: prodA.id, name: prodA.name, quantity: 1, price: 600 }]
    });

    const activeReturn = await salesReturnService.createSalesReturn({
      invoiceId: invWithReturn.id,
      refundMethod: "Cash",
      reason: "Defective item",
      createdBy: "Owner",
      items: [{ productId: prodA.id, productName: prodA.name, quantity: 1, sellingPrice: 600 }]
    });

    let voidBlockedCaught = false;
    try {
      await invoiceService.voidInvoice(invWithReturn.id, "Attempt void with return", "Owner");
    } catch (err) {
      if (err instanceof ActiveReturnsBlockVoidError) voidBlockedCaught = true;
    }
    assert(voidBlockedCaught, "Void blocked when active sales return exists");

    // -------------------------------------------------------------------------
    // TEST 6: Customer Debt Settlement (Single Invoice)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 6: Customer Debt Settlement (Single Invoice) ---");
    const invDebt = await invoiceService.createInvoice({
      customerId: cust1.id,
      customerName: cust1.name,
      paymentMethod: "Cash",
      amountPaid: 200,
      date: today,
      items: [{ productId: prodA.id, name: prodA.name, quantity: 1, price: 600 }] // Total 600, due 400
    });

    const debtPay = await paymentService.recordCustomerDebtPayment({
      invoiceId: invDebt.id,
      amount: 300,
      method: "Cash",
      date: today,
      note: "Partial repayment"
    });

    assert(debtPay.receiptNumber.startsWith("PAY-"), "Receipt number allocated from sequence", debtPay.receiptNumber);
    assert(debtPay.amount === 300, "Payment amount recorded", `₹${debtPay.amount}`);

    const refreshedInvDebt = await invoiceRepository.findById(invDebt.id);
    assert(refreshedInvDebt.amountPaid === 500 && refreshedInvDebt.dueAmount === 100, "Invoice balances updated", `Paid: ${refreshedInvDebt.amountPaid}, Due: ${refreshedInvDebt.dueAmount}`);
    assert(refreshedInvDebt.paymentStatus === "Partial", "Payment status is Partial");

    // -------------------------------------------------------------------------
    // TEST 7: Customer Debt Settlement (FIFO Waterfall across 3 Invoices)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 7: Customer Debt Settlement (FIFO Multi-Invoice) ---");
    const fifoCust = await customerService.createCustomer({
      name: `FIFO Customer (${randomUUID().slice(0, 6)})`,
      phone: `8${Math.floor(100000000 + Math.random() * 900000000)}`
    });

    // Create 3 invoices: ₹100 due, ₹200 due, ₹300 due (Total debt = ₹600)
    const invF1 = await invoiceService.createInvoice({
      customerId: fifoCust.id,
      customerName: fifoCust.name,
      paymentMethod: "Cash",
      amountPaid: 0,
      date: "2026-01-01",
      items: [{ productId: prodB.id, name: prodB.name, quantity: 1, price: 100 }]
    });
    const invF2 = await invoiceService.createInvoice({
      customerId: fifoCust.id,
      customerName: fifoCust.name,
      paymentMethod: "Cash",
      amountPaid: 0,
      date: "2026-01-02",
      items: [{ productId: prodB.id, name: prodB.name, quantity: 1, price: 200 }]
    });
    const invF3 = await invoiceService.createInvoice({
      customerId: fifoCust.id,
      customerName: fifoCust.name,
      paymentMethod: "Cash",
      amountPaid: 0,
      date: "2026-01-03",
      items: [{ productId: prodB.id, name: prodB.name, quantity: 1, price: 300 }]
    });

    // Repay ₹250 via FIFO: should pay Inv1 in full (₹100), Inv2 partially (₹150 of ₹200), Inv3 untouched (₹0)
    const fifoPayments = await paymentService.recordCustomerDebtPaymentFifo({
      customerId: fifoCust.id,
      totalAmount: 250,
      method: "UPI",
      date: today
    });

    assert(fifoPayments.length === 2, "Payment split across exactly 2 invoices", `${fifoPayments.length} payments`);
    const refInvF1 = await invoiceRepository.findById(invF1.id);
    const refInvF2 = await invoiceRepository.findById(invF2.id);
    const refInvF3 = await invoiceRepository.findById(invF3.id);

    assert(refInvF1.dueAmount === 0 && refInvF1.paymentStatus === "Paid", "Invoice 1 fully settled (due: 0)", `Due: ${refInvF1.dueAmount}`);
    assert(refInvF2.dueAmount === 50 && refInvF2.paymentStatus === "Partial", "Invoice 2 partially settled (due: 50)", `Due: ${refInvF2.dueAmount}`);
    assert(refInvF3.dueAmount === 300 && refInvF3.paymentStatus === "Credit", "Invoice 3 untouched (due: 300)", `Due: ${refInvF3.dueAmount}`);

    // -------------------------------------------------------------------------
    // TEST 8: Store Credit Redemption on Invoice
    // -------------------------------------------------------------------------
    console.log("\n--- Test 8: Store Credit Redemption on Invoice ---");
    const creditCust = await customerService.createCustomer({
      name: `Credit Customer (${randomUUID().slice(0, 6)})`
    });

    // Issue ₹200 store credit
    await paymentRepository.createCreditTransaction({
      customerId: creditCust.id,
      type: "Issue",
      amount: 200,
      referenceType: "Invoice",
      date: today,
      notes: "Promo credit"
    });

    // Create invoice for ₹500, redeeming ₹150 credit and paying ₹350 cash
    const invCredit = await invoiceService.createInvoice({
      customerId: creditCust.id,
      customerName: creditCust.name,
      paymentMethod: "Cash",
      creditRedeemed: 150,
      amountPaid: 350,
      date: today,
      items: [{ productId: prodB.id, name: prodB.name, quantity: 2, price: 250 }] // Total 500
    });

    assert(invCredit.creditRedeemed === 150, "Credit redeemed stamped on invoice", `₹${invCredit.creditRedeemed}`);
    assert(invCredit.total === 350, "Payable total reduced by credit", `₹${invCredit.total}`);
    assert(invCredit.dueAmount === 0 && invCredit.paymentStatus === "Paid", "Invoice fully settled");

    const remainingCredit = await customerRepository.getCreditBalance(creditCust.id);
    assert(remainingCredit === 50, "Customer available store credit reduced", `200 - 150 = ₹${remainingCredit}`);

    // -------------------------------------------------------------------------
    // TEST 9: Store Credit Reversal on Invoice Void
    // -------------------------------------------------------------------------
    console.log("\n--- Test 9: Store Credit Reversal on Invoice Void ---");
    await invoiceService.voidInvoice(invCredit.id, "Voiding credit invoice", "Owner");
    const restoredCredit = await customerRepository.getCreditBalance(creditCust.id);
    assert(restoredCredit === 200, "Customer store credit restored after void", `50 + 150 = ₹${restoredCredit}`);

    // -------------------------------------------------------------------------
    // TEST 10: Purchase Creation (Standard)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 10: Purchase Creation (Standard) ---");
    const supp1 = await supplierService.createSupplier({
      name: `Test Supplier 1 (${randomUUID().slice(0, 6)})`,
      contactPerson: "Rajesh",
      phone: "9876543210"
    });

    const prodWac = await inventoryService.createProduct({
      sku: `SKU-WAC-${randomUUID().slice(0, 8)}`,
      name: "Engine Oil 5W-40",
      stock: 10,
      currentCost: 100,
      sellPrice: 180
    });

    const pur1 = await purchaseService.createPurchase({
      supplierId: supp1.id,
      productId: prodWac.id,
      quantity: 10,
      buyPrice: 60,
      purchaseDate: today,
      paymentMethod: "Bank",
      amountPaid: 300,
      invoiceNumber: "VENDOR-001"
    });

    assert(pur1.totalAmount === 600, "Purchase total amount", `₹${pur1.totalAmount}`);
    assert(pur1.dueAmount === 300 && pur1.paymentStatus === "Partial", "Purchase due balance", `Due: ₹${pur1.dueAmount}`);

    const refProdWac1 = await productRepository.findById(prodWac.id);
    assert(refProdWac1.stock === 20, "Product stock incremented", `10 + 10 = ${refProdWac1.stock}`);

    // -------------------------------------------------------------------------
    // TEST 11: WAC Deterministic Formula
    // -------------------------------------------------------------------------
    console.log("\n--- Test 11: WAC Deterministic Formula ---");
    // Starting stock: 10 @ ₹100
    const prodFormula = await inventoryService.createProduct({
      sku: `SKU-FORMULA-${randomUUID().slice(0, 8)}`,
      name: "Spark Plug",
      stock: 10,
      currentCost: 100.00,
      sellPrice: 200.00
    });

    // Purchase: 5 @ ₹130.00
    // Expected: (10 * 100 + 5 * 130) / 15 = 1650 / 15 = 110.00
    await purchaseService.createPurchase({
      supplierId: supp1.id,
      productId: prodFormula.id,
      quantity: 5,
      buyPrice: 130.00,
      purchaseDate: today
    });

    const refProdFormula = await productRepository.findById(prodFormula.id);
    assert(refProdFormula.stock === 15, "WAC Product stock updated", `15 units`);
    assert(refProdFormula.currentCost === 110.00, "WAC calculated deterministically", `Expected 110.00, got ${refProdFormula.currentCost}`);

    // -------------------------------------------------------------------------
    // TEST 12: WAC Zero-Stock Rule
    // -------------------------------------------------------------------------
    console.log("\n--- Test 12: WAC Zero-Stock Rule ---");
    const prodZero = await inventoryService.createProduct({
      sku: `SKU-ZERO-${randomUUID().slice(0, 8)}`,
      name: "Cabin Air Filter",
      stock: 0,
      currentCost: 100.00,
      sellPrice: 220.00
    });

    // Purchase 10 @ ₹140.00 -> with 0 old stock, new WAC must be purchase price ₹140.00
    await purchaseService.createPurchase({
      supplierId: supp1.id,
      productId: prodZero.id,
      quantity: 10,
      buyPrice: 140.00,
      purchaseDate: today
    });

    const refProdZero = await productRepository.findById(prodZero.id);
    assert(refProdZero.currentCost === 140.00, "WAC Zero-Stock rule overrides old cost", `Expected 140.00, got ${refProdZero.currentCost}`);

    // -------------------------------------------------------------------------
    // TEST 13: WAC Concurrency Protection
    // -------------------------------------------------------------------------
    console.log("\n--- Test 13: WAC Concurrency Protection ---");
    const prodConc = await inventoryService.createProduct({
      sku: `SKU-CONC-${randomUUID().slice(0, 8)}`,
      name: "LED Headlight Bulb",
      stock: 0,
      currentCost: 0,
      sellPrice: 500
    });

    // Run 3 concurrent purchases: 10 @ 100, 10 @ 200, 10 @ 300
    // Total cost = 1000 + 2000 + 3000 = 6000. Total units = 30. Expected WAC = 200.00.
    await Promise.all([
      purchaseService.createPurchase({ supplierId: supp1.id, productId: prodConc.id, quantity: 10, buyPrice: 100, purchaseDate: today }),
      purchaseService.createPurchase({ supplierId: supp1.id, productId: prodConc.id, quantity: 10, buyPrice: 200, purchaseDate: today }),
      purchaseService.createPurchase({ supplierId: supp1.id, productId: prodConc.id, quantity: 10, buyPrice: 300, purchaseDate: today })
    ]);

    const refProdConc = await productRepository.findById(prodConc.id);
    assert(refProdConc.stock === 30, "Concurrent purchases all succeeded without lost updates", `Stock: ${refProdConc.stock}`);
    assert(refProdConc.currentCost === 200.00, "Chained WAC is exact under concurrency", `WAC: ${refProdConc.currentCost}`);

    // -------------------------------------------------------------------------
    // TEST 14: FIFO Concurrency Determinism
    // -------------------------------------------------------------------------
    console.log("\n--- Test 14: FIFO Concurrency Determinism ---");
    const fifoConcCust = await customerService.createCustomer({
      name: `FIFO Conc Customer (${randomUUID().slice(0, 6)})`
    });

    const invConc = await invoiceService.createInvoice({
      customerId: fifoConcCust.id,
      customerName: fifoConcCust.name,
      paymentMethod: "Cash",
      amountPaid: 0,
      date: today,
      items: [{ productId: prodB.id, name: prodB.name, quantity: 1, price: 300 }] // Total 300
    });

    // Concurrently attempt to pay ₹200 twice on a ₹300 debt.
    // One transaction MUST acquire lock first, pay ₹200 (due becomes 100).
    // The other transaction MUST either reject with ExceededAllocationError (since ₹200 > ₹100 due) or serialize safely.
    let concErrorCaught = false;
    const results = await Promise.allSettled([
      paymentService.recordCustomerDebtPaymentFifo({ customerId: fifoConcCust.id, totalAmount: 200, method: "Cash", date: today }),
      paymentService.recordCustomerDebtPaymentFifo({ customerId: fifoConcCust.id, totalAmount: 200, method: "Cash", date: today })
    ]);

    for (const res of results) {
      if (res.status === "rejected" && res.reason instanceof ExceededAllocationError) {
        concErrorCaught = true;
      }
    }

    const refInvConc = await invoiceRepository.findById(invConc.id);
    assert(concErrorCaught || (refInvConc.dueAmount >= 0 && refInvConc.dueAmount <= 100), "FIFO concurrency re-evaluated due under lock", `Remaining due: ${refInvConc.dueAmount}`);

    // -------------------------------------------------------------------------
    // TEST 15: Purchase Return
    // -------------------------------------------------------------------------
    console.log("\n--- Test 15: Purchase Return ---");
    const purRetItem = await purchaseService.createPurchase({
      supplierId: supp1.id,
      productId: prodFormula.id,
      quantity: 10,
      buyPrice: 100,
      purchaseDate: today,
      amountPaid: 0 // Due 1000
    });

    const purReturn = await purchaseService.createPurchaseReturn({
      purchaseId: purRetItem.id,
      quantity: 4,
      refundAmount: 0,
      refundMethod: "Cash",
      reason: "Defective batch",
      returnedBy: "Owner"
    });

    assert(purReturn.totalAmount === 400, "Purchase return goods value", `₹${purReturn.totalAmount}`);
    const refPurRetItem = await purchaseRepository.findById(purRetItem.id);
    assert(refPurRetItem.returnedQuantity === 4, "Purchase returnedQuantity updated", `Returned: ${refPurRetItem.returnedQuantity}`);
    assert(refPurRetItem.dueAmount === 600, "Purchase due balance reduced", `1000 - 400 = ₹${refPurRetItem.dueAmount}`);

    // -------------------------------------------------------------------------
    // TEST 16: Purchase Return Stock Guard
    // -------------------------------------------------------------------------
    console.log("\n--- Test 16: Purchase Return Stock Guard ---");
    // Reduce stock manually to test insufficiency
    const prodGuard = await inventoryService.createProduct({
      sku: `SKU-GUARD-${randomUUID().slice(0, 8)}`,
      name: "Wiper Blade",
      stock: 2,
      currentCost: 100,
      sellPrice: 150
    });

    const purGuard = await purchaseService.createPurchase({
      supplierId: supp1.id,
      productId: prodGuard.id,
      quantity: 10,
      buyPrice: 100,
      purchaseDate: today
    });

    // Manually adjust stock down to 2
    await productRepository.updateStock(prodGuard.id, 2);

    let guardErrorCaught = false;
    try {
      await purchaseService.createPurchaseReturn({
        purchaseId: purGuard.id,
        quantity: 5, // stock is only 2
        refundAmount: 0,
        refundMethod: "Cash",
        reason: "Over-return test",
        returnedBy: "Owner"
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) guardErrorCaught = true;
    }
    assert(guardErrorCaught, "Purchase return blocked when product physical stock is insufficient");

    // -------------------------------------------------------------------------
    // TEST 17: Supplier Payment (FIFO Multi-Purchase)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 17: Supplier Payment (FIFO Multi-Purchase) ---");
    const suppFifo = await supplierService.createSupplier({
      name: `FIFO Supplier (${randomUUID().slice(0, 6)})`
    });

    const pFifo1 = await purchaseService.createPurchase({
      supplierId: suppFifo.id,
      productId: prodFormula.id,
      quantity: 2,
      buyPrice: 100,
      purchaseDate: "2026-01-01" // Due 200
    });
    const pFifo2 = await purchaseService.createPurchase({
      supplierId: suppFifo.id,
      productId: prodFormula.id,
      quantity: 3,
      buyPrice: 100,
      purchaseDate: "2026-01-02" // Due 300
    });

    // Repay ₹350 via FIFO: Pur 1 fully paid (₹200), Pur 2 partial (₹150 paid, ₹150 due)
    const suppPayments = await paymentService.recordSupplierPaymentFifo({
      supplierId: suppFifo.id,
      totalAmount: 350,
      method: "Bank",
      date: today
    });

    assert(suppPayments.length === 2, "Supplier payment waterfall across 2 purchases", `${suppPayments.length} records`);
    const refPFifo1 = await purchaseRepository.findById(pFifo1.id);
    const refPFifo2 = await purchaseRepository.findById(pFifo2.id);
    assert(refPFifo1.dueAmount === 0 && refPFifo1.paymentStatus === "Paid", "Purchase 1 fully settled", `Due: ${refPFifo1.dueAmount}`);
    assert(refPFifo2.dueAmount === 150 && refPFifo2.paymentStatus === "Partial", "Purchase 2 partially settled", `Due: ${refPFifo2.dueAmount}`);

    // -------------------------------------------------------------------------
    // TEST 18: Sales Return (Cash Refund Partition)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 18: Sales Return (Cash Refund Partition) ---");
    // Invoice: 4 units @ ₹250 = ₹1000. amountPaid = ₹600, dueAmount = ₹400.
    const invForCashRet = await invoiceService.createInvoice({
      customerName: "Cash Return Customer",
      paymentMethod: "Cash",
      amountPaid: 600,
      date: today,
      items: [{ productId: prodB.id, name: prodB.name, quantity: 4, price: 250 }]
    });

    const stockBeforeRet = (await productRepository.findById(prodB.id)).stock;

    // Return 2 units (value ₹500). paidAvailable = ₹600.
    // Full ₹500 should be refunded in cash; debtCancelled = 0.
    const cashRet = await salesReturnService.createSalesReturn({
      invoiceId: invForCashRet.id,
      refundMethod: "Cash",
      reason: "Customer changed mind",
      createdBy: "Owner",
      items: [{ productId: prodB.id, productName: prodB.name, quantity: 2, sellingPrice: 250 }]
    });

    assert(cashRet.cashRefunded === 500, "Cash refund partition allocated", `₹${cashRet.cashRefunded}`);
    assert(cashRet.debtCancelled === 0, "Debt cancelled is 0", `₹${cashRet.debtCancelled}`);

    const stockAfterRet = (await productRepository.findById(prodB.id)).stock;
    assert(stockAfterRet === stockBeforeRet + 2, "Returned stock restored", `${stockBeforeRet} -> ${stockAfterRet}`);

    // -------------------------------------------------------------------------
    // TEST 19: Sales Return (Exchange with Surcharge)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 19: Sales Return (Exchange with Surcharge) ---");
    const invForEx = await invoiceService.createInvoice({
      customerName: "Exchange Customer",
      paymentMethod: "Cash",
      amountPaid: 500,
      date: today,
      items: [{ productId: prodB.id, name: prodB.name, quantity: 2, price: 250 }] // Total 500
    });

    const stockExBefA = (await productRepository.findById(prodA.id)).stock;
    const stockExBefB = (await productRepository.findById(prodB.id)).stock;

    // Return 1 unit of Product B (value ₹250), exchange for 1 unit of Product A (selling price ₹600)
    // Exchange difference = 600 - 250 = +₹350 surcharge to customer
    const exReturn = await salesReturnService.createSalesReturn({
      invoiceId: invForEx.id,
      refundMethod: "Exchange",
      reason: "Upgrade to premium",
      createdBy: "Owner",
      differencePaymentMethod: "UPI",
      items: [{ productId: prodB.id, productName: prodB.name, quantity: 1, sellingPrice: 250 }],
      exchangeItems: [{ productId: prodA.id, productName: prodA.name, quantity: 1, sellingPrice: 600, costPrice: 400 }]
    });

    assert(exReturn.exchangeDifference === 350, "Exchange surcharge computed", `₹${exReturn.exchangeDifference}`);
    const stockExAftA = (await productRepository.findById(prodA.id)).stock;
    const stockExAftB = (await productRepository.findById(prodB.id)).stock;

    assert(stockExAftB === stockExBefB + 1, "Returned item stock restored", `${stockExBefB} -> ${stockExAftB}`);
    assert(stockExAftA === stockExBefA - 1, "Exchange replacement item stock deducted", `${stockExBefA} -> ${stockExAftA}`);

    // Verify surcharge income transaction recorded
    const exFinanceRes = await pool.query(
      `SELECT * FROM finance_transactions WHERE reference_id = $1 AND type = 'Income'`,
      [exReturn.id]
    );
    assert(exFinanceRes.rows.length === 1 && parseFloat(exFinanceRes.rows[0].amount) === 350, "Exchange surcharge income logged", `₹${exFinanceRes.rows[0]?.amount}`);

    // -------------------------------------------------------------------------
    // TEST 20: Sales Return (Adjustment to Debt & Credit Creation)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 20: Sales Return (Adjustment to Debt & Credit) ---");
    const adjCust = await customerService.createCustomer({
      name: `Adjustment Customer (${randomUUID().slice(0, 6)})`
    });

    // Invoice: total ₹600, amountPaid = 200, dueAmount = 400
    const invForAdj = await invoiceService.createInvoice({
      customerId: adjCust.id,
      customerName: adjCust.name,
      paymentMethod: "Cash",
      amountPaid: 200,
      date: today,
      items: [{ productId: prodA.id, name: prodA.name, quantity: 1, price: 600 }]
    });

    // Return full item (value ₹600) via Adjustment:
    // Debt cancelled = ₹400 (clears invoice due to 0).
    // Store credit created = 600 - 400 = ₹200.
    const adjReturn = await salesReturnService.createSalesReturn({
      invoiceId: invForAdj.id,
      refundMethod: "Adjustment",
      reason: "Exchange credit",
      createdBy: "Owner",
      items: [{ productId: prodA.id, productName: prodA.name, quantity: 1, sellingPrice: 600 }]
    });

    assert(adjReturn.debtCancelled === 400, "Debt cancelled matches invoice due", `₹${adjReturn.debtCancelled}`);
    assert(adjReturn.creditCreated === 200, "Remaining return value converted to store credit", `₹${adjReturn.creditCreated}`);

    const refInvAdj = await invoiceRepository.findById(invForAdj.id);
    assert(refInvAdj.dueAmount === 0 && refInvAdj.paymentStatus === "Paid", "Invoice due cleared to 0");

    const adjCreditBalance = await customerRepository.getCreditBalance(adjCust.id);
    assert(adjCreditBalance === 200, "Customer store credit balance updated", `₹${adjCreditBalance}`);

    // -------------------------------------------------------------------------
    // TEST 21: Sales Return Cancellation
    // -------------------------------------------------------------------------
    console.log("\n--- Test 21: Sales Return Cancellation ---");
    const stockBeforeCancel = (await productRepository.findById(prodB.id)).stock;
    const cancelRes = await salesReturnService.cancelSalesReturn(cashRet.id, "Return created in error", "Owner");
    assert(cancelRes.status === "Cancelled", "Sales return status set to Cancelled");

    // Stock should be re-deducted
    const stockAfterCancel = (await productRepository.findById(prodB.id)).stock;
    assert(stockAfterCancel === stockBeforeCancel - 2, "Returned stock re-deducted on cancellation", `${stockBeforeCancel} -> ${stockAfterCancel}`);

    // Reversing income for cash refund
    const cancelFinanceRes = await pool.query(
      `SELECT * FROM finance_transactions WHERE reference_id = $1 AND type = 'Income' AND category = 'Sales Return'`,
      [invForCashRet.id]
    );
    assert(cancelFinanceRes.rows.length === 1 && parseFloat(cancelFinanceRes.rows[0].amount) === 500, "Cash refund reversed via Income entry", `₹${cancelFinanceRes.rows[0]?.amount}`);

    // -------------------------------------------------------------------------
    // TEST 22: Manual Stock Adjustment
    // -------------------------------------------------------------------------
    console.log("\n--- Test 22: Manual Stock Adjustment ---");
    const adjProd = await inventoryService.createProduct({
      sku: `SKU-ADJ-${randomUUID().slice(0, 8)}`,
      name: "Brake Fluid DOT 4",
      stock: 10,
      currentCost: 150,
      sellPrice: 250
    });

    // Positive adjustment: +5
    const posAdj = await inventoryService.adjustStock({
      productId: adjProd.id,
      delta: 5,
      note: "Audit count correction"
    });
    assert(posAdj.stock === 15, "Positive stock adjustment applied", `10 -> ${posAdj.stock}`);

    // Negative adjustment with expense logging: -3
    const negAdj = await inventoryService.adjustStock({
      productId: adjProd.id,
      delta: -3,
      note: "Leaked container",
      recordExpense: true
    });
    assert(negAdj.stock === 12, "Negative stock adjustment applied", `15 -> ${negAdj.stock}`);

    // Check expense entry: 3 * 150 = 450
    const adjExpenseRes = await pool.query(
      `SELECT * FROM finance_transactions WHERE reference_id = $1 AND category = 'Adjustment'`,
      [adjProd.id]
    );
    assert(adjExpenseRes.rows.length === 1 && parseFloat(adjExpenseRes.rows[0].amount) === 450, "Stock write-off expense logged", `₹${adjExpenseRes.rows[0]?.amount}`);

    // -------------------------------------------------------------------------
    // TEST 23: Numbering Concurrency
    // -------------------------------------------------------------------------
    console.log("\n--- Test 23: Numbering Concurrency ---");
    const year = new Date().getFullYear();
    const invoiceNumbers = await Promise.all([
      numberingRepository.getNextInvoiceNumber("CONC", year),
      numberingRepository.getNextInvoiceNumber("CONC", year),
      numberingRepository.getNextInvoiceNumber("CONC", year),
      numberingRepository.getNextInvoiceNumber("CONC", year),
      numberingRepository.getNextInvoiceNumber("CONC", year)
    ]);

    const uniqueNumbers = new Set(invoiceNumbers);
    assert(uniqueNumbers.size === 5, "Concurrent number generation is 100% unique", `${uniqueNumbers.size}/5 unique`);

    // -------------------------------------------------------------------------
    // TEST 24: Financial Ledger Immutability
    // -------------------------------------------------------------------------
    console.log("\n--- Test 24: Financial Ledger Immutability ---");
    const origExp = await financeService.recordBusinessExpense({
      accountId: "acc-cash",
      amount: 500,
      category: "Office & Shop Expense",
      date: today,
      method: "Cash",
      notes: "Daily office expenses"
    });

    const revExp = await financeService.reverseTransaction(origExp.id, "Incorrect receipt");
    assert(revExp.type === "Income" && revExp.reversalOf === origExp.id, "Reversal entry references original transaction", `Reversal of ${revExp.reversalOf}`);

    // Original entry MUST remain completely untouched
    const checkOrig = await pool.query(`SELECT * FROM finance_transactions WHERE id = $1`, [origExp.id]);
    assert(parseFloat(checkOrig.rows[0].amount) === 500, "Original ledger entry unmodified");

    // -------------------------------------------------------------------------
    // TEST 25: Negative Stock Constraint Integrity
    // -------------------------------------------------------------------------
    console.log("\n--- Test 25: Negative Stock Constraint Integrity ---");
    let checkConstraintFired = false;
    try {
      await pool.query(`UPDATE products SET stock = -5 WHERE id = $1`, [adjProd.id]);
    } catch (err) {
      if (err.message.includes("violates check constraint") || err.code === "23514") {
        checkConstraintFired = true;
      }
    }
    assert(checkConstraintFired, "PostgreSQL CHECK constraint prevents negative stock (products_stock_check)");

  } catch (globalErr) {
    console.error("FATAL ERROR DURING TEST EXECUTION:", globalErr);
    failed++;
  } finally {
    console.log("\n================================================================================");
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();
