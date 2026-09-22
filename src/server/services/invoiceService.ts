/**
 * AUTOVAULT — Invoice & POS Billing Domain Service
 * 
 * Coordinates multi-SKU invoicing, stock deduction, document numbering,
 * customer store credit redemption, finance ledger entries, and atomic voiding
 * with deadlock-free row locking (ORDER BY id ASC).
 */

import Decimal from "decimal.js";
import { withTransaction, DbClient } from "../db/txRunner";
import { pool } from "../db/client";
import { invoiceRepository } from "../repositories/invoiceRepository";
import { productRepository } from "../repositories/productRepository";
import { customerRepository } from "../repositories/customerRepository";
import { numberingRepository } from "../repositories/numberingRepository";
import { stockMovementRepository } from "../repositories/stockMovementRepository";
import { financeRepository } from "../repositories/financeRepository";
import { paymentRepository } from "../repositories/paymentRepository";
import { shopSettingsRepository } from "../repositories/shopSettingsRepository";
import { salesReturnRepository } from "../repositories/salesReturnRepository";
import { 
  ValidationError, 
  EntityNotFoundError, 
  InsufficientStockError, 
  InvalidStateTransitionError,
  ActiveReturnsBlockVoidError 
} from "../errors/domainErrors";
import { 
  CreateInvoiceInput, 
  InvoiceFilter, 
  PaginationParams 
} from "./types";
import { methodToAccountId } from "./financeService";
import { Invoice, InvoiceItem } from "../../types";

export const invoiceService = {
  /**
   * Creates a new sales invoice atomically.
   * - Locks products ordered by ID to eliminate deadlocks.
   * - Enforces stock availability.
   * - Verifies and redeems customer store credit.
   * - Emits stock_movements and finance_transactions.
   */
  async createInvoice(
    input: CreateInvoiceInput,
    actorId?: string
  ): Promise<Invoice & { items: InvoiceItem[] }> {
    // 1. Domain Validation
    if (!input.items || input.items.length === 0) {
      throw new ValidationError("Invoice must contain at least one line item");
    }

    const discountRate = new Decimal(input.discount ?? 0);
    if (discountRate.lessThan(0) || discountRate.greaterThan(100)) {
      throw new ValidationError("Discount percentage must be between 0 and 100");
    }

    const creditRedeemed = new Decimal(input.creditRedeemed ?? 0);
    if (creditRedeemed.lessThan(0)) {
      throw new ValidationError("Store credit redeemed cannot be negative");
    }

    const amountPaid = new Decimal(input.amountPaid ?? 0);
    if (amountPaid.lessThan(0)) {
      throw new ValidationError("Amount paid cannot be negative");
    }

    // Compute subtotal with Decimal precision
    let subtotal = new Decimal(0);
    for (const item of input.items) {
      if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        throw new ValidationError(`Invalid item quantity for "${item.name}": must be a positive integer`);
      }
      if (item.price < 0) {
        throw new ValidationError(`Invalid item price for "${item.name}": cannot be negative`);
      }
      subtotal = subtotal.plus(new Decimal(item.quantity).times(new Decimal(item.price)));
    }

    const discountMultiplier = new Decimal(1).minus(discountRate.dividedBy(100));
    const discountedTotal = subtotal.times(discountMultiplier).toDecimalPlaces(2);
    const calculatedTotal = Decimal.max(0, discountedTotal.minus(creditRedeemed));
    const dueAmount = Decimal.max(0, calculatedTotal.minus(amountPaid));

    let paymentStatus: string;
    if (dueAmount.lessThanOrEqualTo(0)) {
      paymentStatus = "Paid";
    } else if (amountPaid.greaterThan(0)) {
      paymentStatus = "Partial";
    } else {
      paymentStatus = "Credit";
    }

    return withTransaction(async (client: DbClient) => {
      // 2. Fetch Shop Settings for invoice prefix
      const settings = await shopSettingsRepository.getSettings(client);
      const invoicePrefix = settings.invoicePrefix || "INV";
      const invoiceYear = new Date(input.date || Date.now()).getFullYear();

      // 3. Lock Counter & Generate Atomic Invoice Number
      const invoiceNumber = await numberingRepository.getNextInvoiceNumber(invoicePrefix, invoiceYear, client);

      // 4. Deadlock-free product row locks: sort product IDs ascending
      const uniqueProductIds = Array.from(new Set(input.items.map(i => i.productId))).sort();
      const productMap = new Map();

      for (const pId of uniqueProductIds) {
        const prod = await productRepository.findById(pId, { forUpdate: true }, client);
        if (!prod) {
          throw new EntityNotFoundError("Product", pId);
        }
        productMap.set(pId, prod);
      }

      // Aggregate requested quantities per product to verify stock
      const requestedQtyMap = new Map<string, number>();
      for (const item of input.items) {
        const curr = requestedQtyMap.get(item.productId) || 0;
        requestedQtyMap.set(item.productId, curr + item.quantity);
      }

      for (const [pId, requestedQty] of requestedQtyMap.entries()) {
        const prod = productMap.get(pId);
        if (prod.stock < requestedQty) {
          throw new InsufficientStockError(prod.id, prod.name, prod.stock, requestedQty);
        }
      }

      // 5. If customer linked, lock customer row and check store credit
      if (input.customerId) {
        const customer = await customerRepository.findByIdForUpdate(input.customerId, client);
        if (!customer) {
          throw new EntityNotFoundError("Customer", input.customerId);
        }

        if (creditRedeemed.greaterThan(0)) {
          const availableCredit = await customerRepository.getCreditBalance(input.customerId, client);
          if (creditRedeemed.greaterThan(availableCredit)) {
            throw new ValidationError(
              `Redeemed credit (₹${creditRedeemed}) exceeds customer credit balance (₹${availableCredit})`
            );
          }
        }
      } else if (creditRedeemed.greaterThan(0)) {
        throw new ValidationError("Walk-in customers cannot redeem store credit");
      }

      // 6. Deduct physical stock
      for (const [pId, requestedQty] of requestedQtyMap.entries()) {
        const prod = productMap.get(pId);
        const nextStock = prod.stock - requestedQty;
        await productRepository.updateStock(pId, nextStock, client);
      }

      // 7. Insert Invoice Header
      const invoice = await invoiceRepository.create({
        invoiceNumber,
        customerId: input.customerId ?? null,
        customer: input.customerName,
        customerPhone: input.customerPhone ?? "",
        vehicleNumber: input.vehicleNumber ?? "",
        vehicleModel: input.vehicleModel ?? "",
        paymentMethod: input.paymentMethod,
        paymentStatus: paymentStatus as any,
        amountPaid: amountPaid.toNumber(),
        dueAmount: dueAmount.toNumber(),
        subtotal: subtotal.toNumber(),
        discount: discountRate.toNumber(),
        total: calculatedTotal.toNumber(),
        creditRedeemed: creditRedeemed.toNumber(),
        notes: input.notes ?? "",
        date: input.date,
        billedBy: input.billedBy || "Owner",
        shopSnapshot: {
          shopName: settings.shopName,
          address: settings.address,
          phone: settings.phone,
          gstNumber: settings.gstNumber
        }
      }, client);

      // 8. Insert Invoice Items and Stock Movements
      const createdItems: InvoiceItem[] = [];
      for (const item of input.items) {
        const prod = productMap.get(item.productId);
        const costPrice = prod.currentCost; // Snapshot current operational WAC

        const createdItem = await invoiceRepository.createItem({
          invoiceId: invoice.id,
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          costPrice
        }, client);
        createdItems.push(createdItem);

        // Immutable stock movement entry
        await stockMovementRepository.create({
          productId: item.productId,
          type: "Sale",
          delta: -item.quantity,
          desc: `Sale to ${input.customerName} (Inv: ${invoiceNumber})`,
          reference: invoiceNumber
        }, client);
      }

      // 9. If store credit redeemed, record customer credit transaction
      if (creditRedeemed.greaterThan(0) && input.customerId) {
        await paymentRepository.createCreditTransaction({
          customerId: input.customerId,
          type: "Redeem",
          amount: creditRedeemed.toNumber(),
          referenceType: "Invoice",
          invoiceId: invoice.id,
          date: input.date,
          notes: `Credit redeemed on invoice ${invoiceNumber}`,
          createdBy: (actorId === "Staff" || input.billedBy === "Staff" ? "Staff" : "Owner")
        }, client);
      }

      // 10. If upfront payment > 0, log Income in finance ledger
      if (amountPaid.greaterThan(0)) {
        await financeRepository.createTransaction({
          accountId: methodToAccountId(input.paymentMethod),
          type: "Income",
          category: "Sale",
          amount: amountPaid.toNumber(),
          date: input.date,
          method: input.paymentMethod,
          notes: `Payment for Invoice ${invoiceNumber}`,
          referenceId: invoice.id,
          customerId: input.customerId
        }, client);
      }

      // 11. Customer Activity & Visit Tracking
      if (input.customerId) {
        await customerRepository.recordActivity({
          customerId: input.customerId,
          type: "Invoice",
          description: `Billed invoice ${invoiceNumber} for ₹${calculatedTotal.toFixed(2)}`,
          reference: invoiceNumber
        }, client);

        await customerRepository.recordVisit(input.customerId, input.date || new Date().toISOString().split("T")[0], client);
      }

      return {
        ...invoice,
        items: createdItems
      };
    });
  },

  /**
   * Voids an invoice atomically:
   * - Blocks if any active sales returns exist on the invoice.
   * - Restores unreturned product stock and appends 'Invoice Void' stock movements.
   * - Reverses redeemed store credit via 'Reversal' credit transaction.
   * - Reverses all linked finance income via offset Expense entries.
   * - Idempotent: rejects already voided invoices.
   */
  async voidInvoice(
    invoiceId: string,
    reason: string,
    voidedBy: string
  ): Promise<Invoice> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("Void reason is required");
    }

    return withTransaction(async (client: DbClient) => {
      // 1. Lock invoice row
      const invoice = await invoiceRepository.findById(invoiceId, { forUpdate: true }, client);
      if (!invoice) {
        throw new EntityNotFoundError("Invoice", invoiceId);
      }

      // 2. Idempotency Check
      if (invoice.voided) {
        throw new InvalidStateTransitionError("Invoice", invoiceId, "Voided", "Voided");
      }

      // 3. Active Sales Returns Guard
      const activeReturnsCount = await salesReturnRepository.getActiveReturnsCountByInvoice(invoiceId, client);
      if (activeReturnsCount > 0) {
        throw new ActiveReturnsBlockVoidError(invoiceId, activeReturnsCount);
      }

      // 4. Fetch invoice line items
      const items = await invoiceRepository.getItems(invoiceId, client);

      // 5. Lock products sorted by ID ascending
      const productIds = Array.from(new Set(items.map(i => i.productId))).sort();
      const productMap = new Map();
      for (const pId of productIds) {
        const prod = await productRepository.findById(pId, { forUpdate: true }, client);
        if (prod) productMap.set(pId, prod);
      }

      // 6. Restore unreturned stock
      for (const item of items) {
        const unreturnedQty = item.quantity - (item.returnedQuantity ?? 0);
        if (unreturnedQty > 0) {
          const prod = productMap.get(item.productId);
          if (prod) {
            await productRepository.updateStock(prod.id, prod.stock + unreturnedQty, client);
            await stockMovementRepository.create({
              productId: prod.id,
              type: "Invoice Void",
              delta: unreturnedQty,
              desc: `Stock restored from voided invoice ${invoice.invoiceNumber}`,
              reference: invoice.invoiceNumber,
              note: reason
            }, client);
          }
        }
      }

      // 7. Reverse redeemed store credit if any
      if ((invoice.creditRedeemed ?? 0) > 0 && invoice.customerId) {
        await paymentRepository.createCreditTransaction({
          customerId: invoice.customerId,
          type: "Reversal",
          amount: invoice.creditRedeemed!,
          referenceType: "Invoice",
          invoiceId: invoice.id,
          date: new Date().toISOString().split("T")[0],
          notes: `Store credit reversed from voided invoice ${invoice.invoiceNumber} (${reason})`,
          createdBy: (voidedBy === "Staff" ? "Staff" : "Owner")
        }, client);
      }

      // 8. Reverse linked finance income transactions (upfront payments and debt payments)
      const linkedFinanceTxs = await financeRepository.getLinkedIncomeTransactionsForInvoice(invoiceId, client);

      const todayStr = new Date().toISOString().split("T")[0];
      for (const tx of linkedFinanceTxs) {
        await financeRepository.createTransaction({
          accountId: tx.accountId,
          type: "Expense",
          category: "Invoice Void",
          amount: tx.amount,
          date: todayStr,
          method: tx.method,
          notes: `Reversal of Income #${tx.id} for voided invoice ${invoice.invoiceNumber} (${reason})`,
          referenceId: invoice.id,
          referenceType: "Invoice",
          reversalOf: tx.id,
          customerId: invoice.customerId || undefined
        }, client);
      }

      // 9. Update invoice void fields
      await invoiceRepository.updateVoidFields(invoiceId, {
        voidReason: reason,
        voidedBy
      }, client);

      // 10. Customer Activity Audit
      if (invoice.customerId) {
        await customerRepository.recordActivity({
          customerId: invoice.customerId,
          type: "Void",
          description: `Invoice ${invoice.invoiceNumber} voided by ${voidedBy}: ${reason}`,
          reference: invoice.invoiceNumber
        }, client);
      }

      const refreshed = await invoiceRepository.findById(invoiceId, undefined, client);
      return refreshed!;
    });
  },

  /**
   * Fetches an invoice with its line items.
   */
  async getInvoiceById(id: string): Promise<(Invoice & { items: InvoiceItem[] }) | null> {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) return null;
    const items = await invoiceRepository.getItems(id);
    return { ...invoice, items };
  },

  /**
   * Lists invoices with filtering and pagination.
   */
  async listInvoices(
    filter: InvoiceFilter = {},
    pagination: PaginationParams = {}
  ): Promise<{ data: Invoice[]; total: number }> {
    return invoiceRepository.list(filter, pagination);
  }
};
