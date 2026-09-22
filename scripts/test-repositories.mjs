import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/server/db/client.js";
import { withTransaction } from "../src/server/db/txRunner.js";
import { productRepository } from "../src/server/repositories/productRepository.js";
import { invoiceRepository } from "../src/server/repositories/invoiceRepository.js";
import { stockMovementRepository } from "../src/server/repositories/stockMovementRepository.js";
import { randomUUID } from "crypto";

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

    // 5. Integration Test: Domain Service Rollback
    console.log("\n--- Test 5: Integration Test - Domain Service Rollback ---");
    // Dynamically import invoiceService to avoid circular/early init issues
    const { invoiceService } = await import("../src/server/services/invoiceService.js");
    const { customerRepository } = await import("../src/server/repositories/customerRepository.js");

    const testCustomer = await customerRepository.create({
      name: "Rollback Customer",
      phone: "555-9999",
      creditBalance: 0
    });

    const testSrvProd = await productRepository.create({
      sku: `TEST-SRV-${Date.now()}`,
      name: "Service Test Product",
      brand: "Test",
      category: "Test",
      stock: 5,
      currentCost: 10,
      sellPrice: 20,
      lowStockThreshold: 1
    });

    const originalCreateItem = invoiceRepository.createItem;
    let simulatedErrorCaught = false;
    invoiceRepository.createItem = async (...args) => {
      throw new Error("Simulated insert failure");
    };

    try {
      await invoiceService.createInvoice({
        customerId: testCustomer.id,
        customerName: "Rollback Customer",
        items: [{
          productId: testSrvProd.id,
          name: testSrvProd.name,
          quantity: 2, // Deducts 2 from 5
          price: 20
        }],
        paymentMethod: "Cash",
        amountPaid: 40,
        date: new Date().toISOString().split("T")[0]
      });
    } catch (e) {
      if (e.message === "Simulated insert failure") {
        simulatedErrorCaught = true;
      }
    } finally {
      invoiceRepository.createItem = originalCreateItem; // Restore
    }

    assert(simulatedErrorCaught, "Service propagated the simulated error");

    // Check if the product stock deduction (which happened before createItem) was rolled back
    const rolledBackProd = await productRepository.findById(testSrvProd.id);
    assert(rolledBackProd.stock === 5, "Product stock rollback successful (remains 5, not 3)");

    // Clean up
    await pool.query(`DELETE FROM products WHERE id IN ($1, $2, $3)`, [pId, trickyProd.id, testSrvProd.id]);
    await pool.query(`DELETE FROM customers WHERE id = $1`, [testCustomer.id]);

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
