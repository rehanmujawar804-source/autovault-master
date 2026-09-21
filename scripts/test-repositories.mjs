import { pool } from "../src/server/db/client.js";
import { withTransaction } from "../src/server/db/txRunner.js";
import { productRepository } from "../src/server/repositories/productRepository.js";
import { invoiceRepository } from "../src/server/repositories/invoiceRepository.js";
import { stockMovementRepository } from "../src/server/repositories/stockMovementRepository.js";
import { randomUUID } from "crypto";

async function runTests() {
  console.log("=== Phase 3: PostgreSQL Repository & txRunner Tests ===\n");

  let passed = 0;
  let failed = 0;

  const assert = (condition, msg) => {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  };

  try {
    // 1. Transaction Commit
    console.log("--- Test 1: Transaction Commit ---");
    const testSku = `TEST-SKU-${Date.now()}`;
    const pId = await withTransaction(async (client) => {
      const p = await productRepository.create({
        sku: testSku,
        name: "Tx Commit Test Product",
        brand: "Test",
        category: "Test",
        stock: 10,
        currentCost: 100,
        sellPrice: 150,
        lowStockThreshold: 2
      }, client);

      assert(p.id !== undefined, "Product created inside tx");
      return p.id;
    });

    const found = await productRepository.findById(pId);
    assert(found !== null, "Product persisted after commit");

    // 2. Transaction Rollback
    console.log("\n--- Test 2: Transaction Rollback ---");
    const testSkuFail = `TEST-FAIL-${Date.now()}`;
    try {
      await withTransaction(async (client) => {
        await productRepository.create({
          sku: testSkuFail,
          name: "Tx Rollback Test Product",
          brand: "Test",
          category: "Test",
          stock: 5,
          currentCost: 50,
          sellPrice: 70,
          lowStockThreshold: 2
        }, client);

        // Force error
        throw new Error("Simulated failure");
      });
    } catch (e) {
      assert(e.message === "Simulated failure", "Error propagated");
    }

    const notFound = await productRepository.findBySku(testSkuFail);
    assert(notFound === null, "Product rolled back correctly");

    // 3. Multi-Repository Transaction
    console.log("\n--- Test 3: Multi-Repository Rollback ---");
    const invoiceNum = `INV-TEST-${Date.now()}`;
    const testSkuMulti = `TEST-MULTI-${Date.now()}`;
    try {
      await withTransaction(async (client) => {
        const prod = await productRepository.create({
          sku: testSkuMulti,
          name: "Multi-repo test product",
          brand: "Test",
          category: "Test",
          stock: 10,
          currentCost: 10,
          sellPrice: 20,
          lowStockThreshold: 1
        }, client);

        const inv = await invoiceRepository.create({
          invoiceNumber: invoiceNum,
          customer: "Test Customer",
          customerPhone: "1234567890",
          vehicleNumber: "TEST-01",
          vehicleModel: "Car",
          paymentMethod: "Cash",
          paymentStatus: "Paid",
          amountPaid: 20,
          dueAmount: 0,
          subtotal: 20,
          discount: 0,
          total: 20,
          date: new Date().toISOString().split('T')[0]
        }, client);

        await invoiceRepository.createItem({
          invoiceId: inv.id,
          productId: prod.id,
          name: prod.name,
          quantity: 1,
          price: 20,
          costPrice: 10
        }, client);

        await stockMovementRepository.create({
          productId: prod.id,
          type: "Sale",
          delta: -1,
          desc: "Sale",
          reference: inv.invoiceNumber
        }, client);

        // Simulated crash after DB operations
        throw new Error("Crash after operations");
      });
    } catch (e) {
      assert(e.message === "Crash after operations", "Expected crash caught");
    }

    const multiProd = await productRepository.findBySku(testSkuMulti);
    assert(multiProd === null, "Product rolled back");
    const multiInv = await invoiceRepository.findByNumber(invoiceNum);
    assert(multiInv === null, "Invoice rolled back");

    // 4. Parameterized Query Validation (SQL Injection resistance)
    console.log("\n--- Test 4: Parameterized queries ---");
    const trickyName = "Test'; DROP TABLE users; --";
    const trickyProd = await productRepository.create({
      sku: `TRICKY-${Date.now()}`,
      name: trickyName,
      brand: "Test",
      category: "Test",
      stock: 0,
      currentCost: 0,
      sellPrice: 0,
      lowStockThreshold: 0
    });
    
    const foundTricky = await productRepository.findById(trickyProd.id);
    assert(foundTricky.name === trickyName, "Special characters preserved correctly");

    // Clean up
    await pool.query(`DELETE FROM products WHERE id IN ($1, $2)`, [pId, trickyProd.id]);

  } catch (error) {
    console.error("Test suite failed with unexpected error:", error);
    failed++;
  } finally {
    await pool.end();
  }

  console.log(`\n=== Summary ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
