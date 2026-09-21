import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { PaginationParams, FinanceFilter, NewFinanceTxInput } from "./types";
import { FinanceAccount, FinanceTransaction } from "../../types";

export const financeRepository = {
  /**
   * Gets all finance accounts.
   */
  async getAccounts(client: DbClient = pool): Promise<FinanceAccount[]> {
    const res = await client.query(
      `SELECT * FROM finance_accounts ORDER BY id ASC`
    );
    return res.rows.map(row => this.mapRowToAccount(row));
  },

  /**
   * Gets a single finance account by ID.
   */
  async getAccountById(id: string, client: DbClient = pool): Promise<FinanceAccount | null> {
    const res = await client.query(
      `SELECT * FROM finance_accounts WHERE id = $1`,
      [id]
    );
    return res.rows[0] ? this.mapRowToAccount(res.rows[0]) : null;
  },

  /**
   * Computes the current balance of an account: opening_balance + SUM(Income) - SUM(Expense)
   */
  async getAccountBalance(accountId: string, client: DbClient = pool): Promise<number> {
    // We do this in a single query by fetching opening balance and summing transactions
    const res = await client.query(
      `WITH acc AS (
         SELECT opening_balance FROM finance_accounts WHERE id = $1
       ),
       txs AS (
         SELECT 
           SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END) as total_income,
           SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END) as total_expense
         FROM finance_transactions
         WHERE account_id = $1
       )
       SELECT 
         (SELECT opening_balance FROM acc) + 
         COALESCE((SELECT total_income FROM txs), 0) - 
         COALESCE((SELECT total_expense FROM txs), 0) as balance`,
      [accountId]
    );
    
    if (res.rows.length === 0 || res.rows[0].balance === null) {
       // fallback if account not found
       const accRes = await client.query(`SELECT opening_balance FROM finance_accounts WHERE id = $1`, [accountId]);
       if (accRes.rows.length === 0) throw new Error(`Account not found: ${accountId}`);
       return parseFloat(accRes.rows[0].opening_balance);
    }

    return parseFloat(res.rows[0].balance);
  },

  /**
   * Creates a new finance transaction. Pure DB insert.
   */
  async createTransaction(tx: NewFinanceTxInput, client: DbClient = pool): Promise<FinanceTransaction> {
    // Reference Type mapping based on category for simplicity, or we let caller pass it?
    // The schema requires `reference_type`. Let's infer it or require it. 
    // Wait, the DB schema has reference_type NOT NULL. 
    // In our types.ts FinanceTransaction doesn't have reference_type. 
    // We will infer it if not provided in the input, but let's just pass 'System' if unknown.
    let referenceType = "System";
    if (tx.category === "Inventory Purchase" || tx.category === "Purchase Return") referenceType = "Purchase";
    else if (tx.category === "Sale" || tx.category === "Sales Return" || tx.category === "Invoice Void") referenceType = "Invoice";
    else if (tx.category === "Customer Payment" || tx.category === "Payment Void") referenceType = "DebtPayment";
    else referenceType = "BusinessExpense";

    const res = await client.query(
      `INSERT INTO finance_transactions (
        account_id, type, category, reference_type, reference_id, 
        reversal_of, supplier_id, customer_id, amount, method, 
        transaction_date, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING *`,
      [
        tx.accountId,
        tx.type,
        tx.category,
        referenceType,
        tx.referenceId,
        tx.reversalOf || null,
        tx.supplierId || null,
        tx.customerId || null,
        tx.amount,
        tx.method,
        tx.date,
        tx.notes || null
      ]
    );
    return this.mapRowToTransaction(res.rows[0]);
  },

  /**
   * Fetches a transaction by ID.
   */
  async getTransactionById(id: string, client: DbClient = pool): Promise<FinanceTransaction | null> {
    const res = await client.query(
      `SELECT * FROM finance_transactions WHERE id = $1`,
      [id]
    );
    return res.rows[0] ? this.mapRowToTransaction(res.rows[0]) : null;
  },

  /**
   * Lists transactions with optional filtering and pagination.
   */
  async listTransactions(
    filter: FinanceFilter,
    pagination: PaginationParams,
    client: DbClient = pool
  ): Promise<{ data: FinanceTransaction[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.accountId) {
      conditions.push(`account_id = $${paramIndex}`);
      params.push(filter.accountId);
      paramIndex++;
    }

    if (filter.type) {
      conditions.push(`type = $${paramIndex}`);
      params.push(filter.type);
      paramIndex++;
    }

    if (filter.category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(filter.category);
      paramIndex++;
    }

    if (filter.referenceId) {
      conditions.push(`reference_id = $${paramIndex}`);
      params.push(filter.referenceId);
      paramIndex++;
    }

    if (filter.dateFrom) {
      conditions.push(`transaction_date >= $${paramIndex}`);
      params.push(filter.dateFrom);
      paramIndex++;
    }

    if (filter.dateTo) {
      conditions.push(`transaction_date <= $${paramIndex}`);
      params.push(filter.dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM finance_transactions ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].total, 10);

    let query = `SELECT * FROM finance_transactions ${whereClause} ORDER BY transaction_date DESC, created_at DESC`;
    
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
      data: res.rows.map(row => this.mapRowToTransaction(row)),
      total
    };
  },

  mapRowToAccount(row: any): FinanceAccount {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      openingBalance: parseFloat(row.opening_balance),
      createdAt: row.created_at.toISOString(),
    };
  },

  mapRowToTransaction(row: any): FinanceTransaction {
    return {
      id: row.id,
      accountId: row.account_id,
      type: row.type,
      category: row.category,
      referenceId: row.reference_id,
      reversalOf: row.reversal_of,
      supplierId: row.supplier_id,
      customerId: row.customer_id,
      amount: parseFloat(row.amount),
      date: row.transaction_date.toISOString(),
      method: row.method,
      notes: row.notes,
    };
  }
};
