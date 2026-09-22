/**
 * AUTOVAULT — Inventory & Stock Management Domain Service
 * 
 * Orchestrates product lifecycle, stock movements, manual stock adjustments,
 * vehicle fitments, and stock integrity invariants.
 */

import { withTransaction, DbClient } from "../db/txRunner";
import { pool } from "../db/client";
import { productRepository } from "../repositories/productRepository";
import { stockMovementRepository } from "../repositories/stockMovementRepository";
import { financeRepository } from "../repositories/financeRepository";
import { Decimal } from "decimal.js";
import { 
  ValidationError, 
  EntityNotFoundError, 
  InsufficientStockError 
} from "../errors/domainErrors";
import { 
  NewProductInput, 
  UpdateProductInput, 
  VehicleFitmentInput, 
  AdjustStockInput, 
  ProductFilter, 
  PaginationParams 
} from "./types";
import { Product, VehicleFitment } from "../../types";

export const inventoryService = {
  /**
   * Creates a new product with optional vehicle fitments and initial stock movement log.
   */
  async createProduct(
    data: NewProductInput,
    fitments?: VehicleFitmentInput[]
  ): Promise<Product & { fitments: VehicleFitment[] }> {
    if (!data.sku || data.sku.trim().length === 0) {
      throw new ValidationError("Product SKU is required");
    }
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError("Product name is required");
    }
    if (data.stock < 0) {
      throw new ValidationError("Initial stock cannot be negative");
    }
    if (data.currentCost < 0) {
      throw new ValidationError("Current cost cannot be negative");
    }
    if (data.sellPrice < 0) {
      throw new ValidationError("Selling price cannot be negative");
    }

    return withTransaction(async (client: DbClient) => {
      // Check if SKU already exists
      const existing = await productRepository.findBySku(data.sku, client);
      if (existing) {
        throw new ValidationError(`Product SKU already exists: "${data.sku}"`);
      }

      const product = await productRepository.create(data, client);

      // Save vehicle fitments if provided
      if (fitments && fitments.length > 0) {
        await productRepository.setFitments(product.id, fitments, client);
      }

      // If initial stock is positive, record an Opening Stock movement
      if (product.stock > 0) {
        await stockMovementRepository.create({
          productId: product.id,
          type: "Opening Stock",
          delta: product.stock,
          desc: `Initial stock for ${product.name}`,
          reference: "OPENING_STOCK"
        }, client);
      }

      const savedFitments = await productRepository.getFitments(product.id, client);
      return { ...product, fitments: savedFitments };
    });
  },

  /**
   * Updates an existing product and optionally replaces its vehicle fitments.
   */
  async updateProduct(
    id: string,
    data: UpdateProductInput,
    fitments?: VehicleFitmentInput[]
  ): Promise<Product & { fitments: VehicleFitment[] }> {
    return withTransaction(async (client: DbClient) => {
      const existing = await productRepository.findById(id, undefined, client);
      if (!existing) {
        throw new EntityNotFoundError("Product", id);
      }

      // Check SKU uniqueness if changing
      if (data.sku && data.sku.toLowerCase() !== existing.sku.toLowerCase()) {
        const conflict = await productRepository.findBySku(data.sku, client);
        if (conflict && conflict.id !== id) {
          throw new ValidationError(`Product SKU already in use: "${data.sku}"`);
        }
      }

      const updated = await productRepository.update(id, data, client);

      if (fitments !== undefined) {
        await productRepository.setFitments(id, fitments, client);
      }

      const activeFitments = await productRepository.getFitments(id, client);
      return { ...updated, fitments: activeFitments };
    });
  },

  /**
   * Adjusts stock quantity manually (e.g. damaged goods, audit discrepancy).
   * Enforces stock >= 0 and logs stock_movements and optional expense atomically.
   */
  async adjustStock(input: AdjustStockInput): Promise<Product> {
    if (input.delta === 0) {
      throw new ValidationError("Stock adjustment delta cannot be zero");
    }

    return withTransaction(async (client: DbClient) => {
      // Pessimistic lock on target product
      const product = await productRepository.findById(input.productId, { forUpdate: true }, client);
      if (!product) {
        throw new EntityNotFoundError("Product", input.productId);
      }

      const newStock = product.stock + input.delta;
      if (newStock < 0) {
        throw new InsufficientStockError(product.id, product.name, product.stock, Math.abs(input.delta));
      }

      await productRepository.updateStock(product.id, newStock, client);

      // Log immutable stock movement
      await stockMovementRepository.create({
        productId: product.id,
        type: "Manual Adjustment" as any,
        delta: input.delta,
        desc: input.note || (input.delta > 0 ? "Manual stock increase" : "Manual stock reduction"),
        reference: "MANUAL_ADJUSTMENT",
        note: input.note
      }, client);

      // If stock reduction and recordExpense requested, record financial loss
      if (input.delta < 0 && input.recordExpense) {
        const lossAmount = new Decimal(Math.abs(input.delta))
          .times(new Decimal(product.currentCost))
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toNumber();
        if (lossAmount > 0) {
          await financeRepository.createTransaction({
            accountId: "acc-cash",
            type: "Expense",
            category: "Adjustment",
            amount: lossAmount,
            date: new Date().toISOString().split("T")[0],
            method: "Cash",
            notes: `Stock write-off: ${Math.abs(input.delta)} units of ${product.name} (${input.note || "manual adjustment"})`,
            referenceId: product.id,
            referenceType: "System"
          }, client);
        }
      }

      const refreshed = await productRepository.findById(product.id, undefined, client);
      return refreshed!;
    });
  },

  /**
   * Retrieves a product by ID including its vehicle fitments.
   */
  async getProductById(id: string): Promise<(Product & { fitments: VehicleFitment[] }) | null> {
    const product = await productRepository.findById(id);
    if (!product) return null;
    const fitments = await productRepository.getFitments(id);
    return { ...product, fitments };
  },

  /**
   * Retrieves a product by SKU.
   */
  async getProductBySku(sku: string): Promise<Product | null> {
    return productRepository.findBySku(sku);
  },

  /**
   * Lists products with filtering and pagination.
   */
  async listProducts(
    filter: ProductFilter = {},
    pagination: PaginationParams = {}
  ): Promise<{ data: Product[]; total: number }> {
    return productRepository.list(filter, pagination);
  }
};
