import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { 
  PaginationParams, 
  SalesReturnFilter, 
  NewSalesReturnInput, 
  NewSalesReturnItemInput,
  NewExchangeItemInput
} from "./types";
import { SalesReturn, SalesReturnItem, ExchangeItem } from "../../types";

export const salesReturnRepository = {
  /**
   * Fetches a sales return by ID.
   */
  async findById(
    id: string,
    client: DbClient = pool
  ): Promise<SalesReturn | null> {
    const res = await client.query(
      `SELECT * FROM sales_returns WHERE id = $1`,
      [id]
    );
    return res.rows[0] ? this.mapRowToSalesReturn(res.rows[0]) : null;
  },

  /**
   * Fetches a sales return by number.
   */
  async findByNumber(
    returnNumber: string,
    client: DbClient = pool
  ): Promise<SalesReturn | null> {
    const res = await client.query(
      `SELECT * FROM sales_returns WHERE return_number = $1`,
      [returnNumber]
    );
    return res.rows[0] ? this.mapRowToSalesReturn(res.rows[0]) : null;
  },

  /**
   * Lists sales returns with filtering and pagination.
   */
  async list(
    filter: SalesReturnFilter,
    pagination: PaginationParams,
    client: DbClient = pool
  ): Promise<{ data: SalesReturn[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.search) {
      conditions.push(`(return_number ILIKE $${paramIndex})`);
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    if (filter.customerId) {
      conditions.push(`customer_id = $${paramIndex}`);
      params.push(filter.customerId);
      paramIndex++;
    }

    if (filter.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filter.status);
      paramIndex++;
    }

    if (filter.dateFrom) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(filter.dateFrom);
      paramIndex++;
    }

    if (filter.dateTo) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(filter.dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM sales_returns ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].total, 10);

    let query = `SELECT * FROM sales_returns ${whereClause} ORDER BY created_at DESC`;
    
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
      data: res.rows.map(row => this.mapRowToSalesReturn(row)),
      total
    };
  },

  /**
   * Gets return items.
   */
  async getItems(
    returnId: string,
    client: DbClient = pool
  ): Promise<SalesReturnItem[]> {
    const res = await client.query(
      `SELECT * FROM sales_return_items WHERE sales_return_id = $1 ORDER BY created_at ASC`,
      [returnId]
    );
    return res.rows.map(row => this.mapRowToSalesReturnItem(row));
  },

  /**
   * Gets exchange items.
   */
  async getExchangeItems(
    returnId: string,
    client: DbClient = pool
  ): Promise<ExchangeItem[]> {
    const res = await client.query(
      `SELECT * FROM exchange_items WHERE sales_return_id = $1 ORDER BY created_at ASC`,
      [returnId]
    );
    return res.rows.map(row => this.mapRowToExchangeItem(row));
  },

  /**
   * Creates a new sales return record. Pure DB insert.
   */
  async create(
    returnRecord: NewSalesReturnInput,
    client: DbClient = pool
  ): Promise<SalesReturn> {
    const res = await client.query(
      `INSERT INTO sales_returns (
        return_number, invoice_id, customer_id, refund_method, total_refund,
        cash_refunded, debt_cancelled, debt_adjusted, credit_created,
        exchange_difference, difference_payment_method, reason, notes,
        status, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      ) RETURNING *`,
      [
        returnRecord.returnNumber,
        returnRecord.invoiceId,
        returnRecord.customerId || null,
        returnRecord.refundMethod,
        returnRecord.totalRefund,
        returnRecord.cashRefunded || 0,
        returnRecord.debtCancelled || 0,
        returnRecord.debtAdjusted || 0,
        returnRecord.creditCreated || 0,
        returnRecord.exchangeDifference || 0,
        returnRecord.differencePaymentMethod || null,
        returnRecord.reason || "",
        returnRecord.notes || null,
        returnRecord.status || "Refunded",
        returnRecord.createdBy || null
      ]
    );
    return this.mapRowToSalesReturn(res.rows[0]);
  },

  /**
   * Creates a sales return line item.
   */
  async createItem(
    item: NewSalesReturnItemInput,
    client: DbClient = pool
  ): Promise<SalesReturnItem> {
    const res = await client.query(
      `INSERT INTO sales_return_items (
        sales_return_id, invoice_item_id, product_id, product_name,
        quantity, selling_price, refund_amount, total_amount
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      ) RETURNING *`,
      [
        item.salesReturnId,
        item.invoiceItemId,
        item.productId,
        item.productName,
        item.quantity,
        item.sellingPrice,
        item.refundAmount,
        item.totalAmount
      ]
    );
    return this.mapRowToSalesReturnItem(res.rows[0]);
  },

  /**
   * Creates an exchange item.
   */
  async createExchangeItem(
    item: NewExchangeItemInput,
    client: DbClient = pool
  ): Promise<ExchangeItem> {
    const res = await client.query(
      `INSERT INTO exchange_items (
        sales_return_id, product_id, product_name, quantity,
        selling_price, cost_price
      ) VALUES (
        $1, $2, $3, $4, $5, $6
      ) RETURNING *`,
      [
        item.salesReturnId,
        item.productId,
        item.productName,
        item.quantity,
        item.sellingPrice,
        item.costPrice
      ]
    );
    return this.mapRowToExchangeItem(res.rows[0]);
  },

  /**
   * Updates status of sales return.
   */
  async updateStatus(
    id: string,
    status: string,
    client: DbClient = pool
  ): Promise<void> {
    await client.query(
      `UPDATE sales_returns SET status = $1 WHERE id = $2`,
      [status, id]
    );
  },

  mapRowToSalesReturn(row: any): SalesReturn {
    return {
      id: row.id,
      returnNumber: row.return_number,
      invoiceId: row.invoice_id,
      customerId: row.customer_id,
      refundMethod: row.refund_method,
      totalRefund: parseFloat(row.total_refund),
      cashRefunded: parseFloat(row.cash_refunded),
      debtCancelled: parseFloat(row.debt_cancelled),
      debtAdjusted: parseFloat(row.debt_adjusted),
      creditCreated: parseFloat(row.credit_created),
      exchangeDifference: row.exchange_difference ? parseFloat(row.exchange_difference) : undefined,
      differencePaymentMethod: row.difference_payment_method,
      reason: row.reason,
      notes: row.notes,
      status: row.status,
      createdBy: row.created_by,
      cancellationReason: row.cancellation_reason,
      cancelledBy: row.cancelled_by,
      cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : undefined,
      createdAt: row.created_at.toISOString(),
      items: [],
    };
  },

  mapRowToSalesReturnItem(row: any): SalesReturnItem {
    return {
      invoiceItemId: row.invoice_item_id,
      productId: row.product_id,
      productName: row.product_name,
      quantity: row.quantity,
      sellingPrice: parseFloat(row.selling_price),
      refundAmount: parseFloat(row.refund_amount),
      totalAmount: parseFloat(row.total_amount)
    };
  },

  mapRowToExchangeItem(row: any): ExchangeItem {
    return {
      productId: row.product_id,
      productName: row.product_name,
      quantity: row.quantity,
      sellingPrice: parseFloat(row.selling_price),
      costPrice: parseFloat(row.cost_price)
    };
  }
};
