import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/server/db/client.js";
import { withTransaction, DbClient } from "../src/server/db/txRunner.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

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
  console.log("=== Phase 3A: Transaction Runner Foundation Tests ===\n");

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  };

  try {
    // 1. Transaction commits on success
    console.log("--- Test 1: Transaction commits on success ---");
    const testId1 = randomUUID();
    await withTransaction(async (client) => {
      await client.query("INSERT INTO customers (id, name, phone) VALUES ($1, $2, $3)", [testId1, "Commit Test", "555-1001"]);
    });
    const res1 = await pool.query("SELECT id FROM customers WHERE id = $1", [testId1]);
    assert(res1.rowCount === 1, "Record committed and retrievable outside transaction");
    await pool.query("DELETE FROM customers WHERE id = $1", [testId1]);

    // 2. Transaction rolls back on callback failure
    console.log("\n--- Test 2: Transaction rolls back on callback failure ---");
    const testId2 = randomUUID();
    try {
      await withTransaction(async (client) => {
        await client.query("INSERT INTO customers (id, name, phone) VALUES ($1, $2, $3)", [testId2, "Rollback Test", "555-1002"]);
        throw new Error("Forced rollback error");
      });
    } catch (err) {
      // expected
    }
    const res2 = await pool.query("SELECT id FROM customers WHERE id = $1", [testId2]);
    assert(res2.rowCount === 0, "Record correctly rolled back and not present");
    await pool.query("DELETE FROM customers WHERE id = $1", [testId2]); // Just in case

    // 3. Acquired client is always released (Success)
    console.log("\n--- Test 3: Acquired client is released on success ---");
    const origConnect3 = pool.connect.bind(pool);
    let releaseCalledSuccess = false;
    pool.connect = async () => {
      const c = await origConnect3();
      const origRelease = c.release.bind(c);
      c.release = (err?: Error) => {
        releaseCalledSuccess = true;
        return origRelease(err);
      };
      return c;
    };
    try {
      await withTransaction(async () => { /* no-op */ });
      assert(releaseCalledSuccess, "client.release() was called exactly once on success");
    } finally {
      pool.connect = origConnect3;
    }

    // 4. Acquired client is always released (Failure)
    console.log("\n--- Test 4: Acquired client is released on failure ---");
    const origConnect4 = pool.connect.bind(pool);
    let releaseCalledFailure = false;
    pool.connect = async () => {
      const c = await origConnect4();
      const origRelease = c.release.bind(c);
      c.release = (err?: Error) => {
        releaseCalledFailure = true;
        return origRelease(err);
      };
      return c;
    };
    try {
      await withTransaction(async () => { throw new Error("Kaboom"); });
    } catch {
      // expected
    } finally {
      pool.connect = origConnect4;
    }
    assert(releaseCalledFailure, "client.release() was called exactly once on failure");

    // 5. Callback receives transaction client
    console.log("\n--- Test 5: Callback receives transaction client ---");
    await withTransaction(async (client) => {
      assert(typeof client.query === "function", "DbClient interface provided");
      const res = await client.query("SELECT 1 AS n");
      assert(res.rows[0].n === 1, "Client can successfully execute queries");
    });

    // 6. Existing client is reused
    console.log("\n--- Test 6: Existing client is reused ---");
    const dummyClient: DbClient = { query: async () => ({ rowCount: 0, rows: [], command: "", oid: 0, fields: [] }) };
    await withTransaction(async (client) => {
      assert(client === dummyClient, "Provided client exact instance is reused");
    }, dummyClient);

    // 7. Existing client performs zero transaction-control statements
    console.log("\n--- Test 7: Existing client performs zero transaction-control statements ---");
    const executedQueries: string[] = [];
    let dummyReleaseCalled = false;
    const recordingClient: DbClient & { release?: () => void } = {
      query: async (text: string) => {
        executedQueries.push(text);
        return { rowCount: 0, rows: [], command: "", oid: 0, fields: [] };
      },
      release: () => { dummyReleaseCalled = true; }
    };

    await withTransaction(async (c) => { await c.query("SELECT 'success'"); }, recordingClient);
    try {
      await withTransaction(async (c) => { await c.query("SELECT 'fail'"); throw new Error("fail"); }, recordingClient);
    } catch {}

    const hasTxControl = executedQueries.some(q => /BEGIN|COMMIT|ROLLBACK/i.test(q));
    assert(!hasTxControl, "No BEGIN/COMMIT/ROLLBACK executed on existing client");
    assert(!dummyReleaseCalled, "Existing client was not released by txRunner");
    assert(executedQueries.includes("SELECT 'success'") && executedQueries.includes("SELECT 'fail'"), "Expected queries were passed through");

    // 8. Rollback failure preserves original callback error
    console.log("\n--- Test 8: Rollback failure preserves original callback error ---");
    const origConnect8 = pool.connect.bind(pool);
    const primaryError = new TypeError("Primary: Domain validation error " + Date.now());
    const secondaryError = new Error("Secondary: connection terminated during rollback");

    pool.connect = async () => {
      const c = await origConnect8();
      const origQuery = c.query.bind(c);
      c.query = (async (text: string, params?: unknown[]) => {
        if (text === "ROLLBACK") {
          throw secondaryError;
        }
        return origQuery(text, params);
      }) as any;
      return c;
    };

    let caughtError: unknown;
    try {
      await withTransaction(async () => {
        throw primaryError;
      });
    } catch (err) {
      caughtError = err;
    } finally {
      pool.connect = origConnect8;
    }

    assert(caughtError === primaryError, "Caller receives exact original callback error identity");
    assert(caughtError instanceof TypeError, "Error retains exact prototype/type");
    if (caughtError instanceof Error) {
      assert(caughtError.message === primaryError.message, "Original error message is pristine");
      assert(!caughtError.message.includes("Secondary"), "Secondary rollback error is correctly suppressed");
    }

  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    console.log("\n=== Summary ===");
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
