import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { 
  PaginationParams, 
  CustomerFilter, 
  NewCustomerInput, 
  UpdateCustomerInput,
  NewCustomerActivityInput
} from "./types";
import { Customer, CustomerActivity } from "../../types";

export const customerRepository = {
  /**
   * Fetches a customer by ID.
   */
  async findById(
    id: string,
    client: DbClient = pool
  ): Promise<Customer | null> {
    const res = await client.query(
      `SELECT * FROM customers WHERE id = $1`,
      [id]
    );
    return res.rows[0] ? this.mapRowToCustomer(res.rows[0]) : null;
  },

  /**
   * Fetches a customer by phone number.
   */
  async findByPhone(
    phone: string,
    client: DbClient = pool
  ): Promise<Customer | null> {
    const res = await client.query(
      `SELECT * FROM customers WHERE phone = $1`,
      [phone]
    );
    return res.rows[0] ? this.mapRowToCustomer(res.rows[0]) : null;
  },

  /**
   * Lists customers with optional filtering and pagination.
   */
  async list(
    filter: CustomerFilter,
    pagination: PaginationParams,
    client: DbClient = pool
  ): Promise<{ data: Customer[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`);
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM customers ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].total, 10);

    let query = `SELECT * FROM customers ${whereClause} ORDER BY name ASC`;
    
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
      data: res.rows.map(row => this.mapRowToCustomer(row)),
      total
    };
  },

  /**
   * Queries the view_customer_debt_balances view.
   */
  async getDebtBalance(
    customerId: string,
    client: DbClient = pool
  ): Promise<number> {
    const res = await client.query(
      `SELECT total_debt FROM view_customer_debt_balances WHERE customer_id = $1`,
      [customerId]
    );
    return res.rows[0] ? parseFloat(res.rows[0].total_debt) : 0;
  },

  /**
   * Queries the view_customer_credit_balances view.
   */
  async getCreditBalance(
    customerId: string,
    client: DbClient = pool
  ): Promise<number> {
    const res = await client.query(
      `SELECT credit_balance FROM view_customer_credit_balances WHERE customer_id = $1`,
      [customerId]
    );
    return res.rows[0] ? parseFloat(res.rows[0].credit_balance) : 0;
  },

  /**
   * Creates a new customer.
   */
  async create(
    data: NewCustomerInput,
    client: DbClient = pool
  ): Promise<Customer> {
    const res = await client.query(
      `INSERT INTO customers (name, phone) 
       VALUES ($1, $2) RETURNING *`,
      [data.name, data.phone]
    );
    return this.mapRowToCustomer(res.rows[0]);
  },

  /**
   * Updates an existing customer.
   */
  async update(
    id: string,
    data: UpdateCustomerInput,
    client: DbClient = pool
  ): Promise<Customer> {
    const fields: string[] = [];
    const params: any[] = [id];
    let paramIndex = 2;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.phone !== undefined) {
      fields.push(`phone = $${paramIndex++}`);
      params.push(data.phone);
    }

    if (fields.length === 0) {
      return this.findById(id, client) as Promise<Customer>;
    }

    fields.push(`updated_at = NOW()`);

    const res = await client.query(
      `UPDATE customers SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
      params
    );
    
    if (res.rows.length === 0) throw new Error(`Customer not found: ${id}`);
    
    return this.mapRowToCustomer(res.rows[0]);
  },

  /**
   * Records a customer activity.
   */
  async recordActivity(
    data: NewCustomerActivityInput & { customerId: string },
    client: DbClient = pool
  ): Promise<CustomerActivity> {
    const res = await client.query(
      `INSERT INTO customer_activities (customer_id, type, description, reference) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.customerId, data.type, data.description, data.reference]
    );
    return {
      id: res.rows[0].id,
      type: res.rows[0].type,
      description: res.rows[0].description,
      reference: res.rows[0].reference,
      date: res.rows[0].created_at.toISOString(),
    };
  },

  /**
   * Retrieves activities for a customer.
   */
  async getActivities(
    customerId: string,
    limit: number = 20,
    client: DbClient = pool
  ): Promise<CustomerActivity[]> {
    const res = await client.query(
      `SELECT * FROM customer_activities WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [customerId, limit]
    );
    return res.rows.map(row => ({
      id: row.id,
      type: row.type,
      description: row.description,
      reference: row.reference,
      date: row.created_at.toISOString(),
    }));
  },

  /**
   * Maps a DB row to the Domain Customer type.
   * Note: debt, storeCredit, and visits/invoiceIds etc are not directly mapped here from the base table.
   * They must be resolved via the views or other repos in Phase 4.
   */
  mapRowToCustomer(row: any): Customer {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      visits: parseInt(row.visits, 10) || 0,
      lastVisit: row.last_visit ? new Date(row.last_visit).toISOString() : "",
      debt: 0, // Should be fetched from view_customer_debt_balances
      storeCredit: 0, // Should be fetched from view_customer_credit_balances
      invoiceIds: [], // Resolved in Phase 4
    };
  }
};
