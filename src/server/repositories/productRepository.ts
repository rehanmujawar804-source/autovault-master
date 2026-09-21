import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { 
  PaginationParams, 
  ProductFilter, 
  NewProductInput, 
  UpdateProductInput,
  VehicleFitmentInput 
} from "./types";
import { Product, VehicleFitment } from "../../types";

export const productRepository = {
  /**
   * Fetches a product by ID.
   */
  async findById(
    id: string,
    options?: { forUpdate?: boolean },
    client: DbClient = pool
  ): Promise<Product | null> {
    const lockClause = options?.forUpdate ? " FOR UPDATE" : "";
    const res = await client.query(
      `SELECT * FROM products WHERE id = $1${lockClause}`,
      [id]
    );
    return res.rows[0] ? this.mapRowToProduct(res.rows[0]) : null;
  },

  /**
   * Case-insensitive lookup via SKU.
   */
  async findBySku(
    sku: string,
    client: DbClient = pool
  ): Promise<Product | null> {
    const res = await client.query(
      `SELECT * FROM products WHERE lower(sku) = lower($1)`,
      [sku]
    );
    return res.rows[0] ? this.mapRowToProduct(res.rows[0]) : null;
  },

  /**
   * Lists products with optional filtering and pagination.
   */
  async list(
    filter: ProductFilter,
    pagination: PaginationParams,
    client: DbClient = pool
  ): Promise<{ data: Product[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex})`);
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    if (filter.category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(filter.category);
      paramIndex++;
    }

    if (filter.brand) {
      conditions.push(`brand = $${paramIndex}`);
      params.push(filter.brand);
      paramIndex++;
    }

    if (filter.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filter.status);
      paramIndex++;
    }

    if (filter.inStockOnly) {
      conditions.push(`stock > 0`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    // Get total count
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM products ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].total, 10);

    // Get paginated data
    let query = `SELECT * FROM products ${whereClause} ORDER BY name ASC, id`;
    
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
      data: res.rows.map(row => this.mapRowToProduct(row)),
      total
    };
  },

  /**
   * Lightweight lookup for POS billing.
   */
  async searchForBilling(
    searchQuery: string,
    limit: number = 20,
    client: DbClient = pool
  ): Promise<Product[]> {
    const res = await client.query(
      `SELECT * FROM products 
       WHERE name ILIKE $1 OR sku ILIKE $1 
       ORDER BY name ASC 
       LIMIT $2`,
      [`%${searchQuery}%`, limit]
    );
    return res.rows.map(row => this.mapRowToProduct(row));
  },

  /**
   * Retrieves vehicle fitments for a product.
   */
  async getFitments(
    productId: string,
    client: DbClient = pool
  ): Promise<VehicleFitment[]> {
    const res = await client.query(
      `SELECT * FROM product_fitments WHERE product_id = $1 ORDER BY vehicle_brand, model, year_from`,
      [productId]
    );
    return res.rows.map(row => ({
      brand: row.vehicle_brand,
      model: row.model,
      year: row.year_from,
      yearTo: row.year_to
    }));
  },

  /**
   * Creates a new product.
   */
  async create(
    data: NewProductInput,
    client: DbClient = pool
  ): Promise<Product> {
    const res = await client.query(
      `INSERT INTO products (
        sku, name, brand, category, stock, current_cost, sell_price, 
        low_stock_threshold, status, is_universal_fit, display_group, 
        variant_options, variant_values, preferred_supplier_id, 
        hsn, gst_rate, location, description
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      ) RETURNING *`,
      [
        data.sku,
        data.name,
        data.brand,
        data.category,
        data.stock,
        data.currentCost,
        data.sellPrice,
        data.lowStockThreshold,
        data.status || "Active",
        data.isUniversalFit || false,
        data.displayGroup || null,
        data.variantOptions ? JSON.stringify(data.variantOptions) : null,
        data.variantValues ? JSON.stringify(data.variantValues) : null,
        data.preferredSupplierId || null,
        data.hsn || null,
        data.gst || 0,
        data.location || null,
        data.description || null
      ]
    );
    return this.mapRowToProduct(res.rows[0]);
  },

  /**
   * Updates an existing product.
   */
  async update(
    id: string,
    data: UpdateProductInput,
    client: DbClient = pool
  ): Promise<Product> {
    const fields: string[] = [];
    const params: any[] = [id];
    let paramIndex = 2;

    const addField = (colName: string, value: any) => {
      if (value !== undefined) {
        fields.push(`${colName} = $${paramIndex++}`);
        params.push(value);
      }
    };

    addField("sku", data.sku);
    addField("name", data.name);
    addField("brand", data.brand);
    addField("category", data.category);
    addField("stock", data.stock);
    addField("current_cost", data.currentCost);
    addField("sell_price", data.sellPrice);
    addField("low_stock_threshold", data.lowStockThreshold);
    addField("status", data.status);
    addField("is_universal_fit", data.isUniversalFit);
    addField("display_group", data.displayGroup);
    
    if (data.variantOptions !== undefined) {
      fields.push(`variant_options = $${paramIndex++}`);
      params.push(data.variantOptions ? JSON.stringify(data.variantOptions) : null);
    }
    
    if (data.variantValues !== undefined) {
      fields.push(`variant_values = $${paramIndex++}`);
      params.push(data.variantValues ? JSON.stringify(data.variantValues) : null);
    }

    addField("preferred_supplier_id", data.preferredSupplierId);
    addField("hsn", data.hsn);
    addField("gst_rate", data.gst);
    addField("location", data.location);
    addField("description", data.description);

    if (fields.length === 0) {
      return this.findById(id, undefined, client) as Promise<Product>;
    }

    fields.push(`updated_at = NOW()`);

    const res = await client.query(
      `UPDATE products SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
      params
    );
    
    if (res.rows.length === 0) throw new Error(`Product not found: ${id}`);
    
    return this.mapRowToProduct(res.rows[0]);
  },

  /**
   * Pure DB update for stock quantity.
   */
  async updateStock(
    id: string,
    newStock: number,
    client: DbClient = pool
  ): Promise<void> {
    await client.query(
      `UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2`,
      [newStock, id]
    );
  },

  /**
   * Pure DB update for WAC (current cost).
   */
  async updateWacCost(
    id: string,
    newCost: number,
    client: DbClient = pool
  ): Promise<void> {
    await client.query(
      `UPDATE products SET current_cost = $1, updated_at = NOW() WHERE id = $2`,
      [newCost, id]
    );
  },

  /**
   * Sets vehicle fitments for a product, replacing any existing ones.
   */
  async setFitments(
    productId: string,
    fitments: VehicleFitmentInput[],
    client: DbClient = pool
  ): Promise<void> {
    // Delete existing fitments
    await client.query(
      `DELETE FROM product_fitments WHERE product_id = $1`,
      [productId]
    );

    // Insert new fitments if any
    if (fitments.length > 0) {
      for (const fit of fitments) {
        await client.query(
          `INSERT INTO product_fitments (product_id, vehicle_brand, model, year_from, year_to) 
           VALUES ($1, $2, $3, $4, $5)`,
          [productId, fit.brand, fit.model, fit.year, fit.yearTo || null]
        );
      }
    }
  },

  /**
   * Maps a DB row to the Domain Product type.
   */
  mapRowToProduct(row: any): Product {
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      brand: row.brand,
      category: row.category,
      stock: row.stock,
      currentCost: parseFloat(row.current_cost),
      sellPrice: parseFloat(row.sell_price),
      lowStockThreshold: row.low_stock_threshold,
      status: row.status,
      isUniversalFit: row.is_universal_fit,
      displayGroup: row.display_group,
      variantOptions: row.variant_options,
      variantValues: row.variant_values,
      preferredSupplierId: row.preferred_supplier_id,
      hsn: row.hsn,
      gst: parseFloat(row.gst_rate),
      location: row.location,
      description: row.description,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
};
