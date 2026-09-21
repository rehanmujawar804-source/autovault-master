/**
 * AUTOVAULT — PostgreSQL Migration Runner
 * 
 * Executes SQL migrations in deterministic order with SHA-256 checksum verification
 * and atomic migration tracking.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// Helper to load .env.local if present
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

function getPool(customDb) {
  const connectionString = process.env.DATABASE_URL;
  if (customDb) {
    // If custom database specified, replace the db name in connection or build config
    const host = process.env.POSTGRES_HOST || "localhost";
    const port = parseInt(process.env.POSTGRES_PORT || "5433", 10);
    const user = process.env.POSTGRES_USER || "autovault";
    const password = process.env.POSTGRES_PASSWORD || "autovault_dev_secret";
    return new pg.Pool({
      host,
      port,
      database: customDb,
      user,
      password,
      connectionTimeoutMillis: 5000,
    });
  }

  if (connectionString) {
    return new pg.Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
    });
  }

  return new pg.Pool({
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5433", 10),
    database: process.env.POSTGRES_DB || "autovault",
    user: process.env.POSTGRES_USER || "autovault",
    password: process.env.POSTGRES_PASSWORD || "autovault_dev_secret",
    connectionTimeoutMillis: 5000,
  });
}

/**
 * Ensures the migration tracking table exists.
 */
async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Computes SHA-256 checksum of string or buffer.
 */
function computeChecksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Runs all pending migrations in deterministic order.
 * @param {string} [customDb] - Optional target database name
 * @returns {Promise<{ applied: string[], skipped: string[] }>}
 */
export async function runMigrations(customDb) {
  const pool = getPool(customDb);
  const client = await pool.connect();
  const applied = [];
  const skipped = [];

  try {
    await ensureMigrationTable(client);

    const migrationsDir = path.join(ROOT_DIR, "src", "server", "db", "migrations");
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found: ${migrationsDir}`);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    console.log(`[Migration Runner] Found ${files.length} migration file(s).`);

    // Fetch existing applied migrations
    const res = await client.query("SELECT name, checksum, applied_at FROM _migrations;");
    const appliedMap = new Map();
    for (const row of res.rows) {
      appliedMap.set(row.name, row);
    }

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");
      const checksum = computeChecksum(sql);

      if (appliedMap.has(file)) {
        const record = appliedMap.get(file);
        if (record.checksum !== checksum) {
          throw new Error(
            `[Migration Checksum Mismatch] Migration '${file}' has been modified after being applied!\n` +
            `Recorded: ${record.checksum}\n` +
            `Current:  ${checksum}`
          );
        }
        console.log(`[Migration Runner] Skipped: ${file} (already applied at ${record.applied_at.toISOString()})`);
        skipped.push(file);
        continue;
      }

      console.log(`[Migration Runner] Applying: ${file}...`);
      await client.query("BEGIN;");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO _migrations (name, checksum) VALUES ($1, $2);",
          [file, checksum]
        );
        await client.query("COMMIT;");
        console.log(`[Migration Runner] Successfully applied: ${file} (checksum: ${checksum.slice(0, 8)})`);
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK;");
        console.error(`[Migration Runner] FAILED applying ${file}:`, err.message);
        throw err;
      }
    }

    return { applied, skipped };
  } finally {
    client.release();
    await pool.end();
  }
}

// Execute directly if run via CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetDb = process.argv[2];
  runMigrations(targetDb)
    .then(({ applied, skipped }) => {
      console.log(`[Migration Runner Complete] Applied: ${applied.length}, Skipped: ${skipped.length}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Migration Runner Fatal]", err);
      process.exit(1);
    });
}
