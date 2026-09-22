/**
 * AUTOVAULT — Purchasing & Procurement Domain Service
 * 
 * Manages inventory procurement, exact Weighted Average Cost (WAC) calculations,
 * stock replenishment, supplier liabilities, PO receiving, and purchase returns.
 */

import Decimal from "decimal.js";
import { withTransaction, DbClient } from "../db/txRunner";
import { pool } from "../db/client";
import { purchaseRepository } from "../repositories/purchaseRepository";
import { productRepository } from "../repositories/productRepository";
import { supplierRepository } from "../repositories/supplierRepository";
import { stockMovementRepository } from "../repositories/stockMovementRepository";
import { paymentRepository } from "../repositories/paymentRepository";
import { financeRepository } from "../repositories/financeRepository";
import { purchaseOrderRepository } from "../repositories/purchaseOrderRepository";
import { 
  ValidationError, 
  EntityNotFoundError, 
  InsufficientStockError, 
  OverReturnError 
} from "../errors/domainErrors";
import { 
  CreatePurchaseInput, 
  CreatePurchaseReturnInput, 
  PurchaseFilter, 
  PaginationParams 
} from "./types";
import { methodToAccountId } from "./financeService";
import { Purchase, PurchaseReturn } from "../../types";

export const purchaseService = {
  /**
   * Creates an inbound purchase record atomically:
   * - Serializes concurrent updates to product via SELECT ... FOR UPDATE.
   * - Executes deterministic WAC recalculation.
   * - Increments physical stock and emits stock_movements.
   * - Emits upfront supplier payment and finance expense if amountPaid > 0.
   * - Synchronizes linked Purchase Order items and status.
   */
  async createPurchase(
    input: CreatePurchaseInput,
    actorId?: string
  ): Promise<Purchase> {
    if (input.quantity <= 0 || !Number.isInteger(input.quantity)) {
      throw new ValidationError("Purchase quantity must be a positive integer");
    }
    if (input.buyPrice < 0) {
      throw new ValidationError("Purchase buy price cannot be negative");
    }

    const totalAmount = new Decimal(input.quantity).times(new Decimal(input.buyPrice)).toDecimalPlaces(2).toNumber();
    const amountPaid = input.amountPaid ? new Decimal(input.amountPaid).toDecimalPlaces(2).toNumber() : 0;

    if (amountPaid < 0) {
      throw new ValidationError("Amount paid cannot be negative");
    }
    if (amountPaid > totalAmount) {
      throw new ValidationError(`Amount paid (₹${amountPaid}) cannot exceed purchase total (₹${totalAmount})`);
    }

    const dueAmount = Math.max(0, totalAmount - amountPaid);
    let paymentStatus: Purchase["paymentStatus"];
    if (dueAmount === 0) {
      paymentStatus = "Paid";
    } else if (amountPaid > 0) {
      paymentStatus = "Partial";
    } else {
      paymentStatus = "Credit";
    }

    return withTransaction(async (client: DbClient) => {
      // 1. Verify Supplier exists
      const supplier = await supplierRepository.findById(input.supplierId, client);
      if (!supplier) {
        throw new EntityNotFoundError("Supplier", input.supplierId);
      }

      // 2. Lock Purchase Order if linked
      if (input.purchaseOrderId) {
        const po = await purchaseOrderRepository.findById(input.purchaseOrderId, { forUpdate: true }, client);
        if (!po) {
          throw new EntityNotFoundError("PurchaseOrder", input.purchaseOrderId);
        }
      }

      // 3. Lock Product Row for deterministic WAC calculation
      const product = await productRepository.findById(input.productId, { forUpdate: true }, client);
      if (!product) {
        throw new EntityNotFoundError("Product", input.productId);
      }

      // 4. Deterministic WAC Formula
      const oldStock = new Decimal(product.stock);
      const oldCost = new Decimal(product.currentCost);
      const newQty = new Decimal(input.quantity);
      const buyPrice = new Decimal(input.buyPrice);
      const newStock = oldStock.plus(newQty);

      let newWac: number;
      if (newStock.greaterThan(0)) {
        if (oldStock.equals(0)) {
          // Zero-stock rule overrides
          newWac = buyPrice.toNumber();
        } else {
          // Standard Weighted Average Cost
          newWac = oldStock.times(oldCost)
            .plus(newQty.times(buyPrice))
            .dividedBy(newStock)
            .toDecimalPlaces(2)
            .toNumber();
        }
      } else {
        newWac = buyPrice.toNumber();
      }

      // 5. Update Product Stock and WAC Cost
      await productRepository.updateStock(product.id, newStock.toNumber(), client);
      await productRepository.updateWacCost(product.id, newWac, client);

      // 6. Insert Purchase Record
      const purchase = await purchaseRepository.create({
        supplierId: input.supplierId,
        productId: input.productId,
        purchaseOrderId: input.purchaseOrderId,
        quantity: input.quantity,
        buyPrice: input.buyPrice,
        totalAmount,
        amountPaid,
        dueAmount,
        invoiceNumber: input.invoiceNumber || "",
        date: input.purchaseDate,
        paymentStatus,
        notes: input.notes || ""
      }, client);

      // 7. Log Stock Movement
      await stockMovementRepository.create({
        productId: product.id,
        type: "Purchase",
        delta: input.quantity,
        desc: `Purchase from ${supplier.name} (Inv: ${input.invoiceNumber || purchase.id})`,
        reference: input.invoiceNumber || purchase.id
      }, client);

      // 8. If upfront payment made, record Supplier Payment and Finance Expense
      if (amountPaid > 0) {
        const method = input.paymentMethod || "Cash";
        await paymentRepository.createSupplierPayment({
          supplierId: input.supplierId,
          purchaseId: purchase.id,
          amount: amountPaid,
          method: method as any,
          isUpfront: true,
          note: `Upfront payment for purchase ${input.invoiceNumber || purchase.id}`,
          paidBy: (actorId === "Staff" ? "Staff" : "Owner")
        }, client);

        await financeRepository.createTransaction({
          accountId: methodToAccountId(method),
          type: "Expense",
          category: "Inventory Purchase",
          amount: amountPaid,
          date: input.purchaseDate,
          method: method as any,
          notes: `Inventory Purchase from ${supplier.name} (${input.invoiceNumber || purchase.id})`,
          referenceId: purchase.id,
          supplierId: input.supplierId
        }, client);
      }

      // 9. Update Purchase Order receiving progress if linked
      if (input.purchaseOrderId) {
        await purchaseOrderRepository.updateItemReceivedQuantity(input.purchaseOrderId, input.productId, input.quantity, client);

        // Check if all items in PO are completely received
        const items = await purchaseOrderRepository.getItems(input.purchaseOrderId, client);
        const allCompleted = items.every(r => (r.receivedQuantity ?? 0) >= r.quantity);
        const nextPoStatus = allCompleted ? "Completed" : "Partially Delivered";

        await purchaseOrderRepository.updateStatus(input.purchaseOrderId, nextPoStatus, client);

        await purchaseOrderRepository.recordActivityLog({
          purchaseOrderId: input.purchaseOrderId,
          type: "Delivery",
          notes: `Received ${input.quantity} units of ${product.name}`,
          user: actorId || "Owner"
        }, client);
      }

      return purchase;
    });
  },

  /**
   * Creates an outbound goods return to a supplier:
   * - Decrements physical stock and asserts stock >= return quantity.
   * - Decrements purchase outstanding due balance.
   * - Emits 'Purchase Return' stock movements.
   * - Logs Finance Income if cash refund was received from the supplier.
   */
  async createPurchaseReturn(
    input: CreatePurchaseReturnInput,
    actorId?: string
  ): Promise<PurchaseReturn> {
    if (input.quantity <= 0 || !Number.isInteger(input.quantity)) {
      throw new ValidationError("Return quantity must be a positive integer");
    }
    if (input.refundAmount < 0) {
      throw new ValidationError("Refund amount cannot be negative");
    }

    return withTransaction(async (client: DbClient) => {
      // 1. Lock Purchase Row
      const purchase = await purchaseRepository.findById(input.purchaseId, { forUpdate: true }, client);
      if (!purchase) {
        throw new EntityNotFoundError("Purchase", input.purchaseId);
      }

      // 2. Lock Product Row
      const product = await productRepository.findById(purchase.productId, { forUpdate: true }, client);
      if (!product) {
        throw new EntityNotFoundError("Product", purchase.productId);
      }

      // 3. Validate Return Quantities
      const remainingReturnable = purchase.quantity - (purchase.returnedQuantity ?? 0);
      if (input.quantity > remainingReturnable) {
        throw new OverReturnError(`Purchase ${purchase.id}`, remainingReturnable, input.quantity);
      }
      if (input.quantity > product.stock) {
        throw new InsufficientStockError(product.id, product.name, product.stock, input.quantity);
      }

      const returnGoodsValue = new Decimal(input.quantity).times(new Decimal(purchase.buyPrice)).toDecimalPlaces(2).toNumber();
      if (input.refundAmount > returnGoodsValue) {
        throw new ValidationError(`Refund amount (₹${input.refundAmount}) cannot exceed returned goods value (₹${returnGoodsValue})`);
      }

      // 4. Decrement Product Stock (WAC is NEVER recalculated on returns)
      await productRepository.updateStock(product.id, product.stock - input.quantity, client);

      // 5. Log Stock Movement
      await stockMovementRepository.create({
        productId: product.id,
        type: "Purchase Return",
        delta: -input.quantity,
        desc: `Purchase return: ${input.reason} (Ref: ${purchase.invoiceNumber || purchase.id})`,
        reference: purchase.invoiceNumber || purchase.id
      }, client);

      // 6. Insert Purchase Return Record (Repository also increments returned_quantity on purchase)
      const purchaseReturn = await purchaseRepository.createReturn({
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        productId: purchase.productId,
        quantity: input.quantity,
        buyPrice: purchase.buyPrice,
        totalAmount: returnGoodsValue,
        refundAmount: input.refundAmount,
        reason: input.reason,
        returnedBy: input.returnedBy || "Owner",
        originalPurchaseQuantity: purchase.quantity,
        originalPurchaseValue: purchase.totalAmount
      }, client);

      // 7. Adjust Purchase Due Amount
      // Due amount reduces by goods value minus any immediate cash refund received
      const debtAdjustment = Math.max(0, returnGoodsValue - input.refundAmount);
      const newDue = Math.max(0, purchase.dueAmount - debtAdjustment);
      let newPaymentStatus: Purchase["paymentStatus"];
      if (newDue === 0) {
        newPaymentStatus = "Paid";
      } else if (purchase.amountPaid > 0) {
        newPaymentStatus = "Partial";
      } else {
        newPaymentStatus = "Credit";
      }

      await purchaseRepository.updatePayment(purchase.id, {
        amountPaid: purchase.amountPaid,
        dueAmount: newDue,
        paymentStatus: newPaymentStatus
      }, client);

      // 8. If cash refund received, record Finance Income
      if (input.refundAmount > 0) {
        const method = (input.refundMethod as any) || "Cash";
        await financeRepository.createTransaction({
          accountId: methodToAccountId(method),
          type: "Income",
          category: "Purchase Return",
          amount: input.refundAmount,
          date: new Date().toISOString().split("T")[0],
          method,
          notes: `Cash refund from supplier for Purchase Return #${purchaseReturn.id}`,
          referenceId: purchase.id,
          supplierId: purchase.supplierId
        }, client);
      }

      return purchaseReturn;
    });
  },

  /**
   * Fetches a purchase by ID.
   */
  async getPurchaseById(id: string): Promise<Purchase | null> {
    return purchaseRepository.findById(id);
  },

  /**
   * Lists purchases with filtering and pagination.
   */
  async listPurchases(
    filter: PurchaseFilter = {},
    pagination: PaginationParams = {}
  ): Promise<{ data: Purchase[]; total: number }> {
    return purchaseRepository.list(filter, pagination);
  }
};
