import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { 
  PaginationParams, 
  SupplierFilter, 
  NewSupplierInput, 
  UpdateSupplierInput
} from "./types";
import { Supplier } from "../../types";

export const supplierRepository = {
  /**
   * Fetches a supplier by ID.
   */
  async findById(
    id: string,
    client: DbClient = pool
  ): Promise<Supplier | null> {
    const res = await client.query(
      `SELECT * FROM suppliers WHERE id = $1`,
      [id]
    );
    return res.rows[0] ? this.mapRowToSupplier(res.rows[0]) : null;
  },

  /**
   * Lists suppliers with optional filtering and pagination.
   */
  async list(
    filter: SupplierFilter,
    pagination: PaginationParams,
    client: DbClient = pool
  ): Promise<{ data: Supplier[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex} OR contact_person ILIKE $${paramIndex})`);
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    if (filter.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filter.status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM suppliers ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].total, 10);

    let query = `SELECT * FROM suppliers ${whereClause} ORDER BY name ASC`;
    
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
      data: res.rows.map(row => this.mapRowToSupplier(row)),
      total
    };
  },

  /**
   * Creates a new supplier.
   */
  async create(
    data: NewSupplierInput,
    client: DbClient = pool
  ): Promise<Supplier> {
    const res = await client.query(
      `INSERT INTO suppliers (
        name, contact_person, phone, whatsapp, email, address, gst_number, notes, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING *`,
      [
        data.name,
        data.contactPerson || "",
        data.phone || "",
        data.whatsApp || "",
        data.email || "",
        data.address || "",
        data.gst || null,
        data.notes || "",
        data.status || "Active"
      ]
    );
    return this.mapRowToSupplier(res.rows[0]);
  },

  /**
   * Updates an existing supplier.
   */
  async update(
    id: string,
    data: UpdateSupplierInput,
    client: DbClient = pool
  ): Promise<Supplier> {
    const fields: string[] = [];
    const params: any[] = [id];
    let paramIndex = 2;

    const addField = (colName: string, value: any) => {
      if (value !== undefined) {
        fields.push(`${colName} = $${paramIndex++}`);
        params.push(value);
      }
    };

    addField("name", data.name);
    addField("contact_person", data.contactPerson);
    addField("phone", data.phone);
    addField("whatsapp", data.whatsApp);
    addField("email", data.email);
    addField("address", data.address);
    addField("gst_number", data.gst);
    addField("notes", data.notes);
    addField("status", data.status);

    if (fields.length === 0) {
      return this.findById(id, client) as Promise<Supplier>;
    }

    fields.push(`updated_at = NOW()`);

    const res = await client.query(
      `UPDATE suppliers SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
      params
    );
    
    if (res.rows.length === 0) throw new Error(`Supplier not found: ${id}`);
    
    return this.mapRowToSupplier(res.rows[0]);
  },

  /**
   * Maps a DB row to the Domain Supplier type.
   */
  mapRowToSupplier(row: any): Supplier {
    return {
      id: row.id,
      name: row.name,
      contactPerson: row.contact_person,
      phone: row.phone,
      whatsApp: row.whatsapp,
      email: row.email,
      address: row.address,
      gst: row.gst_number,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
};
