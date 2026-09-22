import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/server/db/client.js";
import { withTransaction, DbClient } from "../src/server/db/txRunner.js";
import { ConcurrencyConflictError, DomainError, ValidationError } from "../src/server/errors/domainErrors.js";
import { randomUUID } from "node:crypto";
import { PG_CONCURRENCY_CODES } from "../src/server/db/concurrencyErrors.js";

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
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}
loadEnv();

async function runTests() {
  console.log("================================================================================");
  console.log("             AUTOVAULT PHASE 4R-C — CONCURRENCY ERROR HARDENING               ");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, msg: string, details?: unknown) => {
    if (condition) {
      console.log(`[PASS] ${msg}${details ? ` -> ${details}` : ""}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}${details ? ` -> ${details}` : ""}`);
      failed++;
    }
  };

  try {
    // -------------------------------------------------------------------------
    // C1: 40001 mapping
    // -------------------------------------------------------------------------
    let c1Caught: unknown = null;
    let c1ClientReleased = false;
    const c1TestId = randomUUID();
    
    // Override pool.connect just for this block to test release
    const origConnect1 = pool.connect.bind(pool);
    pool.connect = async () => {
      const c = await origConnect1();
      const origRelease = c.release.bind(c);
      c.release = (err?: Error) => {
        c1ClientReleased = true;
        return origRelease(err);
      };
      return c;
    };

    try {
      await withTransaction(async (client) => {
        await client.query("INSERT INTO customers (id, name, phone) VALUES ($1, $2, $3)", [c1TestId, "C1", "555-001"]);
        await client.query("DO 'BEGIN RAISE EXCEPTION USING errcode = ''40001'', message = ''simulated serialization failure''; END;'");
      });
    } catch (e) {
      c1Caught = e;
    } finally {
      pool.connect = origConnect1; // Restore immediately
    }

    const c1Found = await pool.query("SELECT id FROM customers WHERE id = $1", [c1TestId]);

    assert(
      c1Caught instanceof ConcurrencyConflictError,
      "C1: 40001 error becomes ConcurrencyConflictError",
      `name=${(c1Caught as any)?.name}`
    );
    assert(
      (c1Caught as ConcurrencyConflictError)?.cause !== undefined &&
      ((c1Caught as ConcurrencyConflictError)?.cause as any)?.code === PG_CONCURRENCY_CODES.SERIALIZATION_FAILURE,
      "C1: Original 40001 error preserved as cause"
    );
    assert(
      c1Found.rowCount === 0,
      "C1: Transaction rolled back (mutation not persisted)"
    );
    assert(
      c1ClientReleased,
      "C1: Client acquired from pool is strictly released"
    );


    // -------------------------------------------------------------------------
    // C2: 40P01 mapping
    // -------------------------------------------------------------------------
    let c2Caught: unknown = null;
    try {
      await withTransaction(async (client) => {
        await client.query("DO 'BEGIN RAISE EXCEPTION USING errcode = ''40P01'', message = ''simulated deadlock detected''; END;'");
      });
    } catch (e) {
      c2Caught = e;
    }
    assert(
      c2Caught instanceof ConcurrencyConflictError && ((c2Caught as any).cause as any)?.code === PG_CONCURRENCY_CODES.DEADLOCK_DETECTED,
      "C2: 40P01 error maps to ConcurrencyConflictError with cause preserved"
    );

    // -------------------------------------------------------------------------
    // C3: 55P03 mapping
    // -------------------------------------------------------------------------
    let c3Caught: unknown = null;
    try {
      await withTransaction(async (client) => {
        await client.query("DO 'BEGIN RAISE EXCEPTION USING errcode = ''55P03'', message = ''simulated lock not available''; END;'");
      });
    } catch (e) {
      c3Caught = e;
    }
    assert(
      c3Caught instanceof ConcurrencyConflictError && ((c3Caught as any).cause as any)?.code === PG_CONCURRENCY_CODES.LOCK_NOT_AVAILABLE,
      "C3: 55P03 error maps to ConcurrencyConflictError with cause preserved"
    );

    // -------------------------------------------------------------------------
    // C4: Unrelated PostgreSQL error
    // -------------------------------------------------------------------------
    let c4Caught: unknown = null;
    try {
      await withTransaction(async (client) => {
        // 23505 is unique_violation
        await client.query("DO 'BEGIN RAISE EXCEPTION USING errcode = ''23505'', message = ''simulated unique violation''; END;'");
      });
    } catch (e) {
      c4Caught = e;
    }
    assert(
      !(c4Caught instanceof ConcurrencyConflictError) && ((c4Caught as any)?.code === "23505"),
      "C4: Unrelated PostgreSQL error (23505) is NOT mapped to ConcurrencyConflictError and retains identity"
    );

    // -------------------------------------------------------------------------
    // C5: Existing domain error preservation
    // -------------------------------------------------------------------------
    let c5Caught: unknown = null;
    const c5Error = new ValidationError("Simulated validation error");
    try {
      await withTransaction(async () => {
        throw c5Error;
      });
    } catch (e) {
      c5Caught = e;
    }
    assert(
      c5Caught === c5Error,
      "C5: Existing DomainError thrown inside transaction remains the exact same instance",
      `is same ref=${c5Caught === c5Error}`
    );

    // -------------------------------------------------------------------------
    // C6: Rollback verification (Explicit)
    // -------------------------------------------------------------------------
    let c6Caught: unknown = null;
    const c6TestId = randomUUID();
    try {
      await withTransaction(async (client) => {
        await client.query("INSERT INTO customers (id, name, phone) VALUES ($1, $2, $3)", [c6TestId, "C6", "555-006"]);
        await client.query("DO 'BEGIN RAISE EXCEPTION USING errcode = ''55P03''; END;'");
      });
    } catch (e) {
      c6Caught = e;
    }
    const c6Found = await pool.query("SELECT id FROM customers WHERE id = $1", [c6TestId]);
    assert(
      c6Found.rowCount === 0 && c6Caught instanceof ConcurrencyConflictError,
      "C6: Rollback successfully reverts mutation before concurrency failure"
    );

    // -------------------------------------------------------------------------
    // C7: Client release / Pool reusability (Bounded Stress Test)
    // -------------------------------------------------------------------------
    // We execute 10 consecutive forced concurrency failures. Pool max is 5.
    // If ANY client is leaked, it will exhaust the pool.
    const C7_ITERATIONS = 10;
    let c7SuccessCount = 0;
    for (let i = 0; i < C7_ITERATIONS; i++) {
      try {
        await withTransaction(async (client) => {
          await client.query("DO 'BEGIN RAISE EXCEPTION USING errcode = ''40P01''; END;'");
        });
      } catch (e) {
        if (e instanceof ConcurrencyConflictError) {
          c7SuccessCount++;
        }
      }
    }
    // Verify pool is still usable immediately after
    const c7PostQuery = await pool.query("SELECT 1 AS ok");
    assert(
      c7SuccessCount === C7_ITERATIONS && c7PostQuery.rows[0].ok === 1,
      "C7: Bounded stress test proves no pool exhaustion occurs after 10 consecutive failures",
      `pool waitingCount=${(pool as any).waitingCount}, totalCount=${(pool as any).totalCount}`
    );

    // -------------------------------------------------------------------------
    // C8: Existing-Client propagation
    // -------------------------------------------------------------------------
    let c8Caught: unknown = null;
    const c8TestId = randomUUID();
    
    // We want to verify that an inner withTransaction with existingClient doesn't run BEGIN/COMMIT
    // The easiest way is to observe that the outer boundary successfully catches and maps the inner error,
    // and that the rollback successfully applied.
    try {
      // Outer boundary (owns transaction)
      await withTransaction(async (outerClient) => {
        // Inner boundary (receives outer client)
        await withTransaction(async (innerClient) => {
          await innerClient.query("INSERT INTO customers (id, name, phone) VALUES ($1, $2, $3)", [c8TestId, "C8", "555-008"]);
          await innerClient.query("DO 'BEGIN RAISE EXCEPTION USING errcode = ''40001'', message = ''simulated inner''; END;'");
        }, outerClient);
      });
    } catch (e) {
      c8Caught = e;
    }

    const c8Found = await pool.query("SELECT id FROM customers WHERE id = $1", [c8TestId]);

    // Outer boundary owns the mapping and rollback
    assert(
      c8Caught instanceof ConcurrencyConflictError && ((c8Caught as any).cause as any)?.code === PG_CONCURRENCY_CODES.SERIALIZATION_FAILURE,
      "C8: Error propagated through existingClient is successfully mapped by outer boundary"
    );
    assert(
      c8Found.rowCount === 0,
      "C8: Inner transaction using existingClient rolls back completely via outer boundary"
    );

    // -------------------------------------------------------------------------
    // C10: Real Two-Client PostgreSQL Concurrency Test
    // -------------------------------------------------------------------------
    let c10RejectionReason: unknown = null;
    
    // Create dedicated fixture row to avoid interfering with tests or business data
    const c10TestId = randomUUID();
    await pool.query("INSERT INTO customers (id, name, phone) VALUES ($1, $2, $3)", [c10TestId, "C10 Race", "555-C10"]);

    const clientA = await pool.connect();
    const clientB = await pool.connect();

    try {
      await clientA.query("BEGIN");
      
      // 1. Client A acquires FOR UPDATE lock
      await clientA.query("SELECT id FROM customers WHERE id = $1 FOR UPDATE", [c10TestId]);

      await clientB.query("BEGIN");

      // 2. Client B attempts to acquire lock NOWAIT
      try {
        await clientB.query("SELECT id FROM customers WHERE id = $1 FOR UPDATE NOWAIT", [c10TestId]);
      } catch (errorFromDb) {
        // Here we simulate outer txRunner catching the error and mapping it!
        // We call the mapper directly as if withTransaction did it.
        const mapperModule = await import("../src/server/db/concurrencyErrors.js");
        c10RejectionReason = mapperModule.mapConcurrencyError(errorFromDb);
      } finally {
        await clientB.query("ROLLBACK");
      }
    } finally {
      await clientA.query("ROLLBACK");
      clientA.release();
      clientB.release();
      await pool.query("DELETE FROM customers WHERE id = $1", [c10TestId]);
    }

    assert(
      c10RejectionReason instanceof ConcurrencyConflictError,
      "C10: Real PostgreSQL 55P03 lock rejection is surfaced as ConcurrencyConflictError"
    );
    assert(
      ((c10RejectionReason as any)?.cause as any)?.code === PG_CONCURRENCY_CODES.LOCK_NOT_AVAILABLE,
      "C10: Real PostgreSQL 55P03 error object is preserved as cause",
      `cause code=${((c10RejectionReason as any)?.cause as any)?.code}`
    );
    
    // Quick verify the database is immediately usable
    const c10PostQuery = await pool.query("SELECT 1 AS ok");
    assert(c10PostQuery.rows[0].ok === 1, "C10: Database is completely usable immediately after concurrency conflict");

  } catch (err) {
    console.error("\n[FATAL] Test execution failed:", err);
    failed++;
  } finally {
    console.log("\n================================================================================");
    console.log(`Phase 4R-C Test Results: ${passed} passed, ${failed} failed`);
    console.log("================================================================================");
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
