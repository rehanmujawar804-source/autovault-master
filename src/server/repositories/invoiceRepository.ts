import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { 
  PaginationParams, 
  InvoiceFilter, 
  NewInvoiceInput, 
  NewInvoiceItemInput,
  InvoicePaymentUpdate,
  VoidInvoiceInput
} from "./types";
import { Invoice, InvoiceItem } from "../../types";

export const invoiceRepository = {
  /**
   * Fetches an invoice by ID.
   */
  async findById(
    id: string,
    options?: { forUpdate?: boolean },
    client: DbClient = pool
  ): Promise<Invoice | null> {
    const lockClause = options?.forUpdate ? " FOR UPDATE" : "";
    const res = await client.query(
      `SELECT * FROM invoices WHERE id = $1${lockClause}`,
      [id]
    );
    return res.rows[0] ? this.mapRowToInvoice(res.rows[0]) : null;
  },

  /**
   * Fetches an invoice by number.
   */
  async findByNumber(
    invoiceNumber: string,
    client: DbClient = pool
  ): Promise<Invoice | null> {
    const res = await client.query(
      `SELECT * FROM invoices WHERE invoice_number = $1`,
      [invoiceNumber]
    );
    return res.rows[0] ? this.mapRowToInvoice(res.rows[0]) : null;
  },

  /**
   * Lists invoices with optional filtering and pagination.
   */
  async list(
    filter: InvoiceFilter,
    pagination: PaginationParams,
    client: DbClient = pool
  ): Promise<{ data: Invoice[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.search) {
      conditions.push(`(invoice_number ILIKE $${paramIndex} OR customer_name ILIKE $${paramIndex} OR customer_phone ILIKE $${paramIndex} OR vehicle_number ILIKE $${paramIndex})`);
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    if (filter.customerId) {
      conditions.push(`customer_id = $${paramIndex}`);
      params.push(filter.customerId);
      paramIndex++;
    }

    if (filter.paymentStatus) {
      conditions.push(`payment_status = $${paramIndex}`);
      params.push(filter.paymentStatus);
      paramIndex++;
    }

    if (filter.dateFrom) {
      conditions.push(`invoice_date >= $${paramIndex}`);
      params.push(filter.dateFrom);
      paramIndex++;
    }

    if (filter.dateTo) {
      conditions.push(`invoice_date <= $${paramIndex}`);
      params.push(filter.dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM invoices ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].total, 10);

    let query = `SELECT * FROM invoices ${whereClause} ORDER BY invoice_date DESC, created_at DESC`;
    
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
      data: res.rows.map(row => this.mapRowToInvoice(row)),
      total
    };
  },

  /**
   * Gets all line items for a given invoice.
   */
  async getItems(
    invoiceId: string,
    client: DbClient = pool
  ): Promise<InvoiceItem[]> {
    const res = await client.query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at ASC`,
      [invoiceId]
    );
    return res.rows.map(row => this.mapRowToInvoiceItem(row));
  },

  /**
   * Retrieves unpaid invoices using ORDER BY COALESCE(created_at, invoice_date::timestamptz), id
   * (repository only retrieves ordered records; no FIFO allocation here).
   */
  async getUnpaidInvoicesByCustomer(
    customerId: string,
    options?: { forUpdate?: boolean },
    client: DbClient = pool
  ): Promise<Invoice[]> {
    const lockClause = options?.forUpdate ? " FOR UPDATE" : "";
    const res = await client.query(
      `SELECT * FROM invoices 
       WHERE customer_id = $1 AND due_amount > 0 AND voided = false
       ORDER BY COALESCE(created_at, invoice_date::timestamptz), id${lockClause}`,
      [customerId]
    );
    return res.rows.map(row => this.mapRowToInvoice(row));
  },

  /**
   * Creates a new invoice record. Pure DB insert.
   */
  async create(
    invoice: NewInvoiceInput,
    client: DbClient = pool
  ): Promise<Invoice> {
    const res = await client.query(
      `INSERT INTO invoices (
        invoice_number, customer_id, customer_name, customer_phone, 
        vehicle_number, vehicle_model, payment_method, payment_status, 
        amount_paid, due_amount, subtotal, discount, total, 
        credit_redeemed, notes, invoice_date, billed_by, shop_snapshot
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      ) RETURNING *`,
      [
        invoice.invoiceNumber,
        invoice.customerId || null,
        invoice.customer,
        invoice.customerPhone || "",
        invoice.vehicleNumber || "",
        invoice.vehicleModel || "",
        invoice.paymentMethod,
        invoice.paymentStatus,
        invoice.amountPaid,
        invoice.dueAmount,
        invoice.subtotal,
        invoice.discount,
        invoice.total,
        invoice.creditRedeemed || 0,
        invoice.notes || "",
        invoice.date,
        invoice.billedBy || null,
        invoice.shopSnapshot ? JSON.stringify(invoice.shopSnapshot) : null
      ]
    );
    return this.mapRowToInvoice(res.rows[0]);
  },

  /**
   * Creates an invoice line item.
   */
  async createItem(
    item: NewInvoiceItemInput,
    client: DbClient = pool
  ): Promise<InvoiceItem> {
    const res = await client.query(
      `INSERT INTO invoice_items (
        invoice_id, product_id, product_name, quantity, sell_price, cost_price
      ) VALUES (
        $1, $2, $3, $4, $5, $6
      ) RETURNING *`,
      [
        item.invoiceId,
        item.productId,
        item.name,
        item.quantity,
        item.price,
        item.costPrice || 0
      ]
    );
    return this.mapRowToInvoiceItem(res.rows[0]);
  },

  /**
   * Updates payment fields (e.g. after a debt repayment).
   */
  async updatePayment(
    id: string,
    updates: InvoicePaymentUpdate,
    client: DbClient = pool
  ): Promise<void> {
    await client.query(
      `UPDATE invoices SET 
        amount_paid = $1, 
        due_amount = $2, 
        payment_status = $3,
        updated_at = NOW() 
       WHERE id = $4`,
      [updates.amountPaid, updates.dueAmount, updates.paymentStatus, id]
    );
  },

  /**
   * Updates the returned quantity of an invoice item (used in sales returns).
   */
  async updateItemReturnedQuantity(
    itemId: string,
    returnedQty: number,
    client: DbClient = pool
  ): Promise<void> {
    await client.query(
      `UPDATE invoice_items SET returned_quantity = $1 WHERE id = $2`,
      [returnedQty, itemId]
    );
  },

  /**
   * Pure primitive DB update to mark an invoice voided.
   * No stock or finance logic here. Phase 4 will orchestrate that.
   */
  async updateVoidFields(
    id: string,
    voidData: VoidInvoiceInput,
    client: DbClient = pool
  ): Promise<void> {
    await client.query(
      `UPDATE invoices SET 
        voided = true, 
        voided_at = NOW(),
        void_reason = $1,
        voided_by = $2,
        payment_status = 'Voided',
        updated_at = NOW()
       WHERE id = $3 AND voided = false`,
      [voidData.voidReason, voidData.voidedBy, id]
    );
  },

  mapRowToInvoice(row: any): Invoice {
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      customerId: row.customer_id,
      customer: row.customer_name,
      customerPhone: row.customer_phone,
      vehicleNumber: row.vehicle_number,
      vehicleModel: row.vehicle_model,
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      amountPaid: parseFloat(row.amount_paid),
      dueAmount: parseFloat(row.due_amount),
      subtotal: parseFloat(row.subtotal),
      discount: parseFloat(row.discount),
      total: parseFloat(row.total),
      creditRedeemed: parseFloat(row.credit_redeemed),
      notes: row.notes,
      date: new Date(row.invoice_date).toISOString().split('T')[0], // yyyy-mm-dd
      createdAt: row.created_at.toISOString(),
      billedBy: row.billed_by,
      voided: row.voided,
      voidedAt: row.voided_at ? row.voided_at.toISOString() : undefined,
      voidReason: row.void_reason,
      voidedBy: row.voided_by,
      shopSnapshot: row.shop_snapshot,
      items: [] // Populated separately or via JOIN in Phase 4 if needed
    };
  },

  mapRowToInvoiceItem(row: any): InvoiceItem {
    return {
      id: row.id,
      productId: row.product_id,
      name: row.product_name,
      quantity: row.quantity,
      price: parseFloat(row.sell_price),
      costPrice: parseFloat(row.cost_price),
      returnedQuantity: row.returned_quantity,
    };
  }
};
