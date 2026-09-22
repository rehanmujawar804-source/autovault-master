import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { 
  PaginationParams, 
  POFilter, 
  NewPOInput, 
  NewPOItemInput,
  NewPOActivityInput
} from "./types";
import { PurchaseOrder, PurchaseOrderItem, POActivityLog } from "../../types";

export const purchaseOrderRepository = {
  /**
   * Fetches a PO by ID.
   */
  async findById(
    id: string,
    options?: { forUpdate?: boolean },
    client: DbClient = pool
  ): Promise<PurchaseOrder | null> {
    const lockClause = options?.forUpdate ? " FOR UPDATE" : "";
    const res = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1${lockClause}`,
      [id]
    );
    return res.rows[0] ? this.mapRowToPO(res.rows[0]) : null;
  },

  /**
   * Fetches a PO by number.
   */
  async findByNumber(
    poNumber: string,
    client: DbClient = pool
  ): Promise<PurchaseOrder | null> {
    const res = await client.query(
      `SELECT * FROM purchase_orders WHERE po_number = $1`,
      [poNumber]
    );
    return res.rows[0] ? this.mapRowToPO(res.rows[0]) : null;
  },

  /**
   * Lists POs with filtering and pagination.
   */
  async list(
    filter: POFilter,
    pagination: PaginationParams,
    client: DbClient = pool
  ): Promise<{ data: PurchaseOrder[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.supplierId) {
      conditions.push(`supplier_id = $${paramIndex}`);
      params.push(filter.supplierId);
      paramIndex++;
    }

    if (filter.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filter.status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM purchase_orders ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].total, 10);

    let query = `SELECT * FROM purchase_orders ${whereClause} ORDER BY created_at DESC`;
    
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
      data: res.rows.map(row => this.mapRowToPO(row)),
      total
    };
  },

  /**
   * Gets items for a PO.
   */
  async getItems(
    poId: string,
    client: DbClient = pool
  ): Promise<PurchaseOrderItem[]> {
    const res = await client.query(
      `SELECT * FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY created_at ASC`,
      [poId]
    );
    return res.rows.map(row => this.mapRowToPOItem(row));
  },

  /**
   * Gets activity logs for a PO.
   */
  async getActivityLogs(
    poId: string,
    client: DbClient = pool
  ): Promise<POActivityLog[]> {
    const res = await client.query(
      `SELECT * FROM purchase_order_activity_logs WHERE purchase_order_id = $1 ORDER BY created_at ASC`,
      [poId]
    );
    return res.rows.map(row => this.mapRowToPOActivityLog(row));
  },

  /**
   * Creates a new PO. Pure DB insert.
   */
  async create(
    po: NewPOInput,
    client: DbClient = pool
  ): Promise<PurchaseOrder> {
    const res = await client.query(
      `INSERT INTO purchase_orders (
        po_number, supplier_id, expected_delivery_date, notes, status
      ) VALUES (
        $1, $2, $3, $4, $5
      ) RETURNING *`,
      [
        po.poNumber,
        po.supplierId,
        po.expectedDeliveryDate || null,
        po.notes || "",
        po.status || "Draft"
      ]
    );
    return this.mapRowToPO(res.rows[0]);
  },

  /**
   * Creates a PO item.
   */
  async createItem(
    item: NewPOItemInput,
    client: DbClient = pool
  ): Promise<PurchaseOrderItem> {
    const res = await client.query(
      `INSERT INTO purchase_order_items (
        purchase_order_id, product_id, quantity, expected_buy_price
      ) VALUES (
        $1, $2, $3, $4
      ) RETURNING *`,
      [
        item.purchaseOrderId,
        item.productId,
        item.quantity,
        item.expectedBuyPrice
      ]
    );
    return this.mapRowToPOItem(res.rows[0]);
  },

  /**
   * Updates received quantity of a PO item.
   */
  async updateItemReceivedQuantity(
    poId: string,
    productId: string,
    quantityToAdd: number,
    client: DbClient = pool
  ): Promise<void> {
    await client.query(
      `UPDATE purchase_order_items 
       SET received_quantity = received_quantity + $1 
       WHERE purchase_order_id = $2 AND product_id = $3`,
      [quantityToAdd, poId, productId]
    );
  },

  /**
   * Updates PO status.
   */
  async updateStatus(
    id: string,
    status: string,
    client: DbClient = pool
  ): Promise<void> {
    await client.query(
      `UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, id]
    );
  },

  /**
   * Records a PO activity log.
   */
  async recordActivityLog(
    log: NewPOActivityInput,
    client: DbClient = pool
  ): Promise<POActivityLog> {
    const res = await client.query(
      `INSERT INTO purchase_order_activity_logs (
        purchase_order_id, type, notes, performed_by
      ) VALUES (
        $1, $2, $3, $4
      ) RETURNING *`,
      [
        log.purchaseOrderId,
        log.type,
        log.notes || "",
        log.user || null
      ]
    );
    return this.mapRowToPOActivityLog(res.rows[0]);
  },

  mapRowToPO(row: any): PurchaseOrder {
    return {
      id: row.id,
      poNumber: row.po_number,
      supplierId: row.supplier_id,
      expectedDeliveryDate: row.expected_delivery_date ? new Date(row.expected_delivery_date).toISOString().split('T')[0] : "",
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      items: [],
      activityLog: []
    };
  },

  mapRowToPOItem(row: any): PurchaseOrderItem {
    return {
      id: row.id,
      productId: row.product_id,
      quantity: row.quantity,
      expectedBuyPrice: parseFloat(row.expected_buy_price),
      receivedQuantity: row.received_quantity
    };
  },

  mapRowToPOActivityLog(row: any): POActivityLog {
    return {
      id: row.id,
      type: row.type,
      date: row.created_at.toISOString(),
      notes: row.notes,
      user: row.performed_by
    };
  }
};
