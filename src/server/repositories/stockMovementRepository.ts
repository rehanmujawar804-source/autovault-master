import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { PaginationParams, NewStockMovementInput } from "./types";
import { StockMovement } from "../../types";

export const stockMovementRepository = {
  /**
   * Creates a new stock movement record.
   */
  async create(
    movement: NewStockMovementInput,
    client: DbClient = pool
  ): Promise<StockMovement> {
    const res = await client.query(
      `INSERT INTO stock_movements (
        product_id, type, delta, description, reference, note
      ) VALUES (
        $1, $2, $3, $4, $5, $6
      ) RETURNING *`,
      [
        movement.productId,
        movement.type,
        movement.delta,
        movement.desc,
        movement.reference,
        movement.note || null
      ]
    );
    return this.mapRowToStockMovement(res.rows[0]);
  },

  /**
   * Lists stock movements for a specific product.
   */
  async listByProduct(
    productId: string,
    pagination: PaginationParams,
    client: DbClient = pool
  ): Promise<{ data: StockMovement[]; total: number }> {
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM stock_movements WHERE product_id = $1`,
      [productId]
    );
    const total = parseInt(countRes.rows[0].total, 10);

    let query = `SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC`;
    const params: any[] = [productId];
    let paramIndex = 2;
    
    if (pagination.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(pagination.limit);
    }
    
    if (pagination.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(pagination.offset);
    }

    const res = await client.query(query, params);
    
    return {
      data: res.rows.map(row => this.mapRowToStockMovement(row)),
      total
    };
  },

  /**
   * Lists recent stock movements across all products.
   */
  async listRecent(
    pagination: PaginationParams,
    client: DbClient = pool
  ): Promise<{ data: StockMovement[]; total: number }> {
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM stock_movements`
    );
    const total = parseInt(countRes.rows[0].total, 10);

    let query = `SELECT * FROM stock_movements ORDER BY created_at DESC`;
    const params: any[] = [];
    let paramIndex = 1;
    
    if (pagination.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(pagination.limit);
    }
    
    if (pagination.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(pagination.offset);
    }

    const res = await client.query(query, params);
    
    return {
      data: res.rows.map(row => this.mapRowToStockMovement(row)),
      total
    };
  },

  mapRowToStockMovement(row: any): StockMovement {
    return {
      id: row.id,
      productId: row.product_id,
      type: row.type,
      delta: parseInt(row.delta, 10),
      date: row.created_at.toISOString(),
      desc: row.description,
      reference: row.reference,
      note: row.note
    };
  }
};
