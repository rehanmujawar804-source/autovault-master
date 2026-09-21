import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { 
  PaginationParams, 
  PurchaseFilter, 
  NewPurchaseInput, 
  PurchasePaymentUpdate,
  NewPurchaseReturnInput
} from "./types";
import { Purchase, PurchaseReturn } from "../../types";

export const purchaseRepository = {
  /**
   * Fetches a purchase by ID.
   */
  async findById(
    id: string,
    options?: { forUpdate?: boolean },
    client: DbClient = pool
  ): Promise<Purchase | null> {
    const lockClause = options?.forUpdate ? " FOR UPDATE" : "";
    const res = await client.query(
      `SELECT * FROM purchases WHERE id = $1${lockClause}`,
      [id]
    );
    return res.rows[0] ? this.mapRowToPurchase(res.rows[0]) : null;
  },

  /**
   * Lists purchases with optional filtering and pagination.
   */
  async list(
    filter: PurchaseFilter,
    pagination: PaginationParams,
    client: DbClient = pool
  ): Promise<{ data: Purchase[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.supplierId) {
      conditions.push(`supplier_id = $${paramIndex}`);
      params.push(filter.supplierId);
      paramIndex++;
    }

    if (filter.paymentStatus) {
      conditions.push(`payment_status = $${paramIndex}`);
      params.push(filter.paymentStatus);
      paramIndex++;
    }

    if (filter.dateFrom) {
      conditions.push(`purchase_date >= $${paramIndex}`);
      params.push(filter.dateFrom);
      paramIndex++;
    }

    if (filter.dateTo) {
      conditions.push(`purchase_date <= $${paramIndex}`);
      params.push(filter.dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM purchases ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].total, 10);

    let query = `SELECT * FROM purchases ${whereClause} ORDER BY purchase_date DESC, created_at DESC`;
    
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
      data: res.rows.map(row => this.mapRowToPurchase(row)),
      total
    };
  },

  /**
   * Retrieves unpaid purchases using ORDER BY COALESCE(created_at, purchase_date::timestamptz), id
   * (repository only retrieves ordered records; no FIFO allocation here).
   */
  async getUnpaidPurchasesBySupplier(
    supplierId: string,
    options?: { forUpdate?: boolean },
    client: DbClient = pool
  ): Promise<Purchase[]> {
    const lockClause = options?.forUpdate ? " FOR UPDATE" : "";
    const res = await client.query(
      `SELECT * FROM purchases 
       WHERE supplier_id = $1 AND due_amount > 0 
       ORDER BY COALESCE(created_at, purchase_date::timestamptz), id${lockClause}`,
      [supplierId]
    );
    return res.rows.map(row => this.mapRowToPurchase(row));
  },

  /**
   * Creates a new purchase record. Pure DB insert.
   */
  async create(
    purchase: NewPurchaseInput,
    client: DbClient = pool
  ): Promise<Purchase> {
    const res = await client.query(
      `INSERT INTO purchases (
        supplier_id, product_id, purchase_order_id, quantity, buy_price, 
        total_amount, amount_paid, due_amount, invoice_number, 
        purchase_date, payment_status, notes, expected_buy_price
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      ) RETURNING *`,
      [
        purchase.supplierId,
        purchase.productId,
        purchase.purchaseOrderId || null,
        purchase.quantity,
        purchase.buyPrice,
        purchase.totalAmount,
        purchase.amountPaid,
        purchase.dueAmount,
        purchase.invoiceNumber || "",
        purchase.date,
        purchase.paymentStatus,
        purchase.notes || "",
        purchase.expectedBuyPrice || null
      ]
    );
    return this.mapRowToPurchase(res.rows[0]);
  },

  /**
   * Updates payment fields.
   */
  async updatePayment(
    id: string,
    updates: PurchasePaymentUpdate,
    client: DbClient = pool
  ): Promise<void> {
    await client.query(
      `UPDATE purchases SET 
        amount_paid = $1, 
        due_amount = $2, 
        payment_status = $3,
        updated_at = NOW() 
       WHERE id = $4`,
      [updates.amountPaid, updates.dueAmount, updates.paymentStatus, id]
    );
  },

  /**
   * Creates a purchase return record. Pure DB insert.
   */
  async createReturn(
    ret: NewPurchaseReturnInput,
    client: DbClient = pool
  ): Promise<PurchaseReturn> {
    const res = await client.query(
      `INSERT INTO purchase_returns (
        purchase_id, supplier_id, product_id, quantity, buy_price,
        total_amount, refund_amount, reason, returned_by, 
        original_purchase_quantity, original_purchase_value
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) RETURNING *`,
      [
        ret.purchaseId,
        ret.supplierId,
        ret.productId,
        ret.quantity,
        ret.buyPrice,
        ret.totalAmount,
        ret.refundAmount,
        ret.reason || "",
        ret.returnedBy,
        ret.originalPurchaseQuantity,
        ret.originalPurchaseValue
      ]
    );
    
    // Also update returned_quantity on the purchase
    await client.query(
      `UPDATE purchases SET returned_quantity = returned_quantity + $1, updated_at = NOW() WHERE id = $2`,
      [ret.quantity, ret.purchaseId]
    );

    return this.mapRowToPurchaseReturn(res.rows[0]);
  },

  /**
   * Gets returns for a purchase.
   */
  async getReturnsByPurchase(
    purchaseId: string,
    client: DbClient = pool
  ): Promise<PurchaseReturn[]> {
    const res = await client.query(
      `SELECT * FROM purchase_returns WHERE purchase_id = $1 ORDER BY created_at ASC`,
      [purchaseId]
    );
    return res.rows.map(row => this.mapRowToPurchaseReturn(row));
  },

  mapRowToPurchase(row: any): Purchase {
    return {
      id: row.id,
      supplierId: row.supplier_id,
      productId: row.product_id,
      purchaseOrderId: row.purchase_order_id,
      quantity: row.quantity,
      buyPrice: parseFloat(row.buy_price),
      totalAmount: parseFloat(row.total_amount),
      amountPaid: parseFloat(row.amount_paid),
      dueAmount: parseFloat(row.due_amount),
      returnedQuantity: row.returned_quantity,
      invoiceNumber: row.invoice_number,
      date: new Date(row.purchase_date).toISOString().split('T')[0], // yyyy-mm-dd
      paymentStatus: row.payment_status,
      notes: row.notes,
      expectedBuyPrice: row.expected_buy_price ? parseFloat(row.expected_buy_price) : undefined,
      createdAt: row.created_at.toISOString(),
    };
  },

  mapRowToPurchaseReturn(row: any): PurchaseReturn {
    return {
      id: row.id,
      purchaseId: row.purchase_id,
      supplierId: row.supplier_id,
      productId: row.product_id,
      quantity: row.quantity,
      buyPrice: parseFloat(row.buy_price),
      totalAmount: parseFloat(row.total_amount),
      refundAmount: parseFloat(row.refund_amount),
      reason: row.reason,
      createdAt: row.created_at.toISOString(),
      returnedBy: row.returned_by,
      originalPurchaseQuantity: row.original_purchase_quantity,
      originalPurchaseValue: parseFloat(row.original_purchase_value)
    };
  }
};
