import { Pool, type QueryResult, type QueryResultRow } from "pg";

/**
 * Global declaration to preserve connection pool across Next.js Fast Refresh
 * in development, preventing connection exhaustion.
 */
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    return new Pool({
      connectionString,
      max: process.env.NODE_ENV === "production" ? 20 : 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  return new Pool({
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
    database: process.env.POSTGRES_DB || "autovault",
    user: process.env.POSTGRES_USER || "autovault",
    password: process.env.POSTGRES_PASSWORD || "autovault_dev_secret",
    max: process.env.NODE_ENV === "production" ? 20 : 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

/**
 * Singleton database connection pool.
 */
export const pool: Pool = globalThis._pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalThis._pgPool = pool;
}

/**
 * Helper function for executing parameterized SQL queries.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === "development" && process.env.DEBUG_SQL === "true") {
    console.log("[SQL Query]", { text, duration, rows: res.rowCount });
  }

  return res;
}

/**
 * Health check utility to verify database connectivity.
 */
export async function testConnection(): Promise<{ ok: boolean; message: string; version?: string }> {
  try {
    const res = await pool.query("SELECT version();");
    return {
      ok: true,
      message: "Database connection successful",
      version: res.rows[0]?.version,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown connection error",
    };
  }
}
