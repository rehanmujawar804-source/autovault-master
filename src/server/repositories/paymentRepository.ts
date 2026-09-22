import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { PaginationParams, NewDebtPaymentInput, NewSupplierPaymentInput, NewCreditTxInput } from "./types";
import { DebtPayment, SupplierPayment, CustomerCreditTransaction } from "../../types";

export const paymentRepository = {
  /**
   * Creates a new debt payment (customer payment on invoice).
   */
  async createDebtPayment(
    payment: NewDebtPaymentInput,
    client: DbClient = pool
  ): Promise<DebtPayment> {
    const res = await client.query(
      `INSERT INTO debt_payments (
        customer_id, invoice_id, amount, payment_date, method, note, collected_by, receipt_number
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      ) RETURNING *`,
      [
        payment.customerId,
        payment.invoiceId,
        payment.amount,
        payment.date,
        payment.method,
        payment.note || null,
        payment.collectedBy,
        payment.receiptNumber || null
      ]
    );
    return this.mapRowToDebtPayment(res.rows[0]);
  },

  /**
   * Gets debt payments for a given invoice.
   */
  async getDebtPaymentsByInvoice(
    invoiceId: string,
    client: DbClient = pool
  ): Promise<DebtPayment[]> {
    const res = await client.query(
      `SELECT * FROM debt_payments WHERE invoice_id = $1 ORDER BY created_at ASC`,
      [invoiceId]
    );
    return res.rows.map(row => this.mapRowToDebtPayment(row));
  },

  /**
   * Fetches a debt payment by ID.
   */
  async findDebtPaymentById(
    id: string,
    options?: { forUpdate?: boolean },
    client: DbClient = pool
  ): Promise<DebtPayment | null> {
    const lockClause = options?.forUpdate ? " FOR UPDATE" : "";
    const res = await client.query(
      `SELECT * FROM debt_payments WHERE id = $1${lockClause}`,
      [id]
    );
    return res.rows[0] ? this.mapRowToDebtPayment(res.rows[0]) : null;
  },

  /**
   * Voids a debt payment.
   */
  async voidDebtPaymentFields(
    id: string,
    voidReason: string,
    voidedBy: string,
    client: DbClient = pool
  ): Promise<void> {
    await client.query(
      `UPDATE debt_payments 
       SET voided = true, void_reason = $1, voided_by = $2, voided_at = NOW() 
       WHERE id = $3`,
      [voidReason, voidedBy, id]
    );
  },

  /**
   * Creates a new supplier payment (payment on purchase).
   */
  async createSupplierPayment(
    payment: NewSupplierPaymentInput,
    client: DbClient = pool
  ): Promise<SupplierPayment> {
    const res = await client.query(
      `INSERT INTO supplier_payments (
        supplier_id, purchase_id, amount, method, is_upfront, note, paid_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      ) RETURNING *`,
      [
        payment.supplierId,
        payment.purchaseId,
        payment.amount,
        payment.method,
        payment.isUpfront || false,
        payment.note || null,
        payment.paidBy
      ]
    );
    return this.mapRowToSupplierPayment(res.rows[0]);
  },

  /**
   * Gets supplier payments for a given purchase.
   */
  async getSupplierPaymentsByPurchase(
    purchaseId: string,
    client: DbClient = pool
  ): Promise<SupplierPayment[]> {
    const res = await client.query(
      `SELECT * FROM supplier_payments WHERE purchase_id = $1 ORDER BY created_at ASC`,
      [purchaseId]
    );
    return res.rows.map(row => this.mapRowToSupplierPayment(row));
  },

  /**
   * Gets all supplier payments for a given supplier.
   */
  async getSupplierPaymentsBySupplier(
    supplierId: string,
    client: DbClient = pool
  ): Promise<any[]> {
    const res = await client.query(
      `SELECT * FROM supplier_payments WHERE supplier_id = $1 ORDER BY created_at ASC`,
      [supplierId]
    );
    // Returning raw rows for statement processing, or mapped? 
    // The service uses res.rows directly. Let's return raw for now, or map it?
    // Wait, let's just return res.rows since supplierService uses it directly as row.
    return res.rows;
  },

  /**
   * Creates a customer credit transaction (store credit).
   */
  async createCreditTransaction(
    tx: NewCreditTxInput,
    client: DbClient = pool
  ): Promise<CustomerCreditTransaction> {
    const res = await client.query(
      `INSERT INTO customer_credit_transactions (
        customer_id, type, amount, reference_type, reference_id, 
        invoice_id, sales_return_id, notes, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING *`,
      [
        tx.customerId,
        tx.type,
        tx.amount,
        tx.referenceType || null,
        tx.referenceId || null,
        tx.invoiceId || null,
        tx.salesReturnId || null,
        tx.notes || null,
        tx.createdBy || null
      ]
    );
    return this.mapRowToCreditTransaction(res.rows[0]);
  },

  /**
   * Gets credit transactions for a customer.
   */
  async getCreditTransactionsByCustomer(
    customerId: string,
    pagination: PaginationParams,
    client: DbClient = pool
  ): Promise<{ data: CustomerCreditTransaction[]; total: number }> {
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM customer_credit_transactions WHERE customer_id = $1`,
      [customerId]
    );
    const total = parseInt(countRes.rows[0].total, 10);

    let query = `SELECT * FROM customer_credit_transactions WHERE customer_id = $1 ORDER BY created_at DESC`;
    const params: any[] = [customerId];
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
      data: res.rows.map(row => this.mapRowToCreditTransaction(row)),
      total
    };
  },

  mapRowToDebtPayment(row: any): DebtPayment {
    return {
      id: row.id,
      receiptNumber: row.receipt_number,
      customerId: row.customer_id,
      invoiceId: row.invoice_id,
      amount: parseFloat(row.amount),
      date: new Date(row.payment_date).toISOString().split('T')[0], // yyyy-mm-dd
      method: row.method,
      note: row.note,
      collectedBy: row.collected_by,
      voided: row.voided,
      voidedAt: row.voided_at ? row.voided_at.toISOString() : undefined,
      voidReason: row.void_reason,
      voidedBy: row.voided_by
    };
  },

  mapRowToSupplierPayment(row: any): SupplierPayment {
    return {
      id: row.id,
      supplierId: row.supplier_id,
      purchaseId: row.purchase_id,
      amount: parseFloat(row.amount),
      date: row.created_at.toISOString(),
      method: row.method,
      note: row.note,
      paidBy: row.paid_by,
      isUpfront: row.is_upfront,
      createdAt: row.created_at.toISOString()
    };
  },

  mapRowToCreditTransaction(row: any): CustomerCreditTransaction {
    return {
      id: row.id,
      customerId: row.customer_id,
      type: row.type,
      amount: parseFloat(row.amount),
      date: row.created_at.toISOString(),
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      invoiceId: row.invoice_id,
      salesReturnId: row.sales_return_id,
      notes: row.notes,
      createdBy: row.created_by
    };
  }
};
