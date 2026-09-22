import { pool } from "./client";
import type { QueryResult, QueryResultRow, PoolClient } from "pg";
import { mapConcurrencyError } from "./concurrencyErrors.js";

export interface DbClient {
  query<T extends QueryResultRow = any>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

/**
 * Executes a callback within a database transaction.
 * 
 * If an existingClient is provided, it reuses that client and DOES NOT
 * issue nested BEGIN/COMMIT/ROLLBACK commands. This preserves the outer
 * transaction boundary.
 * 
 * If no existingClient is provided, it acquires a client from the pool,
 * issues BEGIN, executes the callback, issues COMMIT on success or
 * ROLLBACK on error, and finally releases the client back to the pool.
 * 
 * @param callback The function to execute inside the transaction.
 * @param existingClient An optional existing DbClient (PoolClient) from an outer transaction.
 * @returns The result of the callback.
 */
export async function withTransaction<T>(
  callback: (client: DbClient) => Promise<T>,
  existingClient?: DbClient
): Promise<T> {
  if (existingClient) {
    // We are already inside a transaction, reuse the client
    return callback(existingClient);
  }

  // Acquire a new client for a new transaction
  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Suppress rollback failure so original callback error is strictly preserved
    }
    throw mapConcurrencyError(error);
  } finally {
    client.release();
  }
}
