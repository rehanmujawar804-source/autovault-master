/**
 * AUTOVAULT — Sales Return & Exchange Domain Service
 * 
 * Manages customer goods returns, Canonical Refund Partitioning (cash, debt cancellation,
 * store credit), replacement product exchanges with surcharge billing, return cancellations,
 * and stock restoration.
 */

import Decimal from "decimal.js";
import { withTransaction, DbClient } from "../db/txRunner";
import { pool } from "../db/client";
import { salesReturnRepository } from "../repositories/salesReturnRepository";
import { invoiceRepository } from "../repositories/invoiceRepository";
import { productRepository } from "../repositories/productRepository";
import { customerRepository } from "../repositories/customerRepository";
import { numberingRepository } from "../repositories/numberingRepository";
import { stockMovementRepository } from "../repositories/stockMovementRepository";
import { paymentRepository } from "../repositories/paymentRepository";
import { financeRepository } from "../repositories/financeRepository";
import { 
  ValidationError, 
  EntityNotFoundError, 
  InsufficientStockError, 
  InvalidStateTransitionError,
  OverReturnError 
} from "../errors/domainErrors";
import { 
  CreateSalesReturnInput, 
  SalesReturnFilter, 
  PaginationParams 
} from "./types";
import { methodToAccountId, financeService } from "./financeService";
import { SalesReturn, SalesReturnItem, ExchangeItem } from "../../types";

export const salesReturnService = {
  /**
   * Creates a customer sales return atomically:
   * - Validates return quantities against original unreturned line item quantities.
   * - Calculates Canonical Refund Partition (cash refund, debt cancellation, store credit).
   * - Restores physical stock of returned items.
   * - If Exchange, verifies and deducts replacement product stock and charges surcharge if any.
   * - Emits stock_movements, finance_transactions, customer_credit_transactions.
   */
  async createSalesReturn(
    input: CreateSalesReturnInput,
    actorId?: string
  ): Promise<SalesReturn & { items: SalesReturnItem[]; exchangeItems: ExchangeItem[] }> {
    if (!input.items || input.items.length === 0) {
      throw new ValidationError("Sales return must contain at least one returned item");
    }

    return withTransaction(async (client: DbClient) => {
      // 1. Lock invoice row
      const invoice = await invoiceRepository.findById(input.invoiceId, { forUpdate: true }, client);
      if (!invoice) {
        throw new EntityNotFoundError("Invoice", input.invoiceId);
      }
      if (invoice.voided) {
        throw new ValidationError(`Cannot create return for voided invoice ${invoice.invoiceNumber}`);
      }

      // Fetch invoice line items to validate against
      const invoiceItems = await invoiceRepository.getItems(input.invoiceId, client);
      const invoiceItemMap = new Map<string, typeof invoiceItems[0]>();
      for (const item of invoiceItems) {
        if (item.id) invoiceItemMap.set(item.id, item);
      }

      // 2. Validate return items & lock returned products
      const returnedProductIds = input.items.map(i => i.productId);
      const exchangeProductIds = (input.exchangeItems || []).map(i => i.productId);
      const allProductIds = Array.from(new Set([...returnedProductIds, ...exchangeProductIds])).sort();

      const productMap = new Map();
      for (const pId of allProductIds) {
        const prod = await productRepository.findById(pId, { forUpdate: true }, client);
        if (!prod) {
          throw new EntityNotFoundError("Product", pId);
        }
        productMap.set(pId, prod);
      }

      // Calculate return value and validate item quantities
      let totalReturnValue = new Decimal(0);
      for (const item of input.items) {
        if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
          throw new ValidationError(`Invalid return quantity for "${item.productName}": must be a positive integer`);
        }

        // Find invoice line item
        let matchedInvoiceItem = item.invoiceItemId ? invoiceItemMap.get(item.invoiceItemId) : undefined;
        if (!matchedInvoiceItem) {
          matchedInvoiceItem = invoiceItems.find(i => i.productId === item.productId);
        }

        if (matchedInvoiceItem) {
          const remainingReturnable = matchedInvoiceItem.quantity - (matchedInvoiceItem.returnedQuantity ?? 0);
          if (item.quantity > remainingReturnable) {
            throw new OverReturnError(
              `Item "${item.productName}" on Invoice ${invoice.invoiceNumber}`,
              remainingReturnable,
              item.quantity
            );
          }
        }

        const itemTotal = new Decimal(item.quantity).times(new Decimal(item.sellingPrice));
        totalReturnValue = totalReturnValue.plus(itemTotal);
      }

      // 3. Compute Canonical Refund Partition
      // Prior cash refunds on this invoice
      const priorCashRefundedNum = await salesReturnRepository.getTotalPriorCashRefundsByInvoice(invoice.id, client);
      const priorCashRefunded = new Decimal(priorCashRefundedNum);
      const paidAvailable = Decimal.max(0, new Decimal(invoice.amountPaid).minus(priorCashRefunded));
      const invoiceDue = new Decimal(invoice.dueAmount);

      let cashRefunded = new Decimal(0);
      let debtCancelled = new Decimal(0);
      let creditCreated = new Decimal(0);
      let exchangeDifference = new Decimal(0);

      if (input.refundMethod === "Adjustment") {
        cashRefunded = new Decimal(0);
        debtCancelled = Decimal.min(invoiceDue, totalReturnValue);
        creditCreated = totalReturnValue.minus(debtCancelled);
      } else if (input.refundMethod === "Exchange") {
        if (!input.exchangeItems || input.exchangeItems.length === 0) {
          throw new ValidationError("Exchange return must specify at least one replacement exchange item");
        }

        let exchangeTotal = new Decimal(0);
        for (const exItem of input.exchangeItems) {
          if (exItem.quantity <= 0 || !Number.isInteger(exItem.quantity)) {
            throw new ValidationError(`Invalid exchange quantity for "${exItem.productName}"`);
          }
          const exProd = productMap.get(exItem.productId);
          if (exProd.stock < exItem.quantity) {
            throw new InsufficientStockError(exProd.id, exProd.name, exProd.stock, exItem.quantity);
          }
          exchangeTotal = exchangeTotal.plus(new Decimal(exItem.quantity).times(new Decimal(exItem.sellingPrice)));
        }

        exchangeDifference = exchangeTotal.minus(totalReturnValue);
        cashRefunded = new Decimal(0);
        debtCancelled = new Decimal(0);
        creditCreated = new Decimal(0);
      } else {
        // Cash, UPI, Bank
        cashRefunded = Decimal.min(totalReturnValue, paidAvailable);
        const remainder = totalReturnValue.minus(cashRefunded);
        debtCancelled = Decimal.min(invoiceDue, remainder);
        creditCreated = remainder.minus(debtCancelled);
      }

      // 4. Generate Return Number via Stored Function
      const year = new Date().getFullYear();
      const returnNumber = await numberingRepository.getNextSalesReturnNumber(year, client);

      // 5. Insert Sales Return Header
      const salesReturn = await salesReturnRepository.create({
        returnNumber,
        invoiceId: invoice.id,
        customerId: invoice.customerId || undefined,
        refundMethod: input.refundMethod,
        totalRefund: totalReturnValue.toNumber(),
        cashRefunded: cashRefunded.toNumber(),
        debtCancelled: debtCancelled.toNumber(),
        debtAdjusted: debtCancelled.toNumber(),
        creditCreated: creditCreated.toNumber(),
        exchangeDifference: exchangeDifference.toNumber(),
        differencePaymentMethod: input.differencePaymentMethod,
        reason: input.reason,
        notes: input.notes,
        status: input.refundMethod === "Adjustment" ? "Adjusted" : "Refunded",
        createdBy: input.createdBy || actorId || "Owner"
      }, client);

      // 6. Insert Return Items, Update Invoice Item Returned Quantities & Restore Stock
      const createdItems: SalesReturnItem[] = [];
      for (const item of input.items) {
        let matchedInvoiceItem = item.invoiceItemId ? invoiceItemMap.get(item.invoiceItemId) : undefined;
        if (!matchedInvoiceItem) {
          matchedInvoiceItem = invoiceItems.find(i => i.productId === item.productId);
        }

        const refundAmount = new Decimal(item.quantity).times(new Decimal(item.sellingPrice)).toNumber();
        const createdItem = await salesReturnRepository.createItem({
          salesReturnId: salesReturn.id,
          invoiceItemId: matchedInvoiceItem?.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice,
          refundAmount,
          totalAmount: refundAmount
        }, client);
        createdItems.push(createdItem);

        // Update returned quantity on invoice item if matched
        if (matchedInvoiceItem && matchedInvoiceItem.id) {
          const nextReturned = (matchedInvoiceItem.returnedQuantity ?? 0) + item.quantity;
          await invoiceRepository.updateItemReturnedQuantity(matchedInvoiceItem.id, nextReturned, client);
        }

        // Restore product stock
        const prod = productMap.get(item.productId);
        await productRepository.updateStock(prod.id, prod.stock + item.quantity, client);

        // Log stock movement
        await stockMovementRepository.create({
          productId: prod.id,
          type: "Sales Return",
          delta: item.quantity,
          desc: `Sales return for ${invoice.invoiceNumber} (${returnNumber})`,
          reference: returnNumber,
          note: input.reason
        }, client);
      }

      // 7. Handle Exchange Items if Exchange
      const createdExchangeItems: ExchangeItem[] = [];
      if (input.refundMethod === "Exchange" && input.exchangeItems) {
        for (const exItem of input.exchangeItems) {
          const exProd = productMap.get(exItem.productId);
          const costPrice = exProd.currentCost;

          const createdEx = await salesReturnRepository.createExchangeItem({
            salesReturnId: salesReturn.id,
            productId: exItem.productId,
            productName: exItem.productName,
            quantity: exItem.quantity,
            sellingPrice: exItem.sellingPrice,
            costPrice
          }, client);
          createdExchangeItems.push(createdEx);

          // Deduct exchange replacement stock
          await productRepository.updateStock(exProd.id, exProd.stock - exItem.quantity, client);

          // Log stock movement
          await stockMovementRepository.create({
            productId: exProd.id,
            type: "Sale",
            delta: -exItem.quantity,
            desc: `Exchange replacement item for return ${returnNumber}`,
            reference: returnNumber
          }, client);
        }

        // If customer has to pay exchange surcharge (exchangeDifference > 0)
        if (exchangeDifference.greaterThan(0)) {
          const diffMethod = (input.differencePaymentMethod as any) || "Cash";
          await financeRepository.createTransaction({
            accountId: methodToAccountId(diffMethod),
            type: "Income",
            category: "Sales Return",
            amount: exchangeDifference.toNumber(),
            date: new Date().toISOString().split("T")[0],
            method: diffMethod,
            notes: `Exchange surcharge for Return ${returnNumber}`,
            referenceId: salesReturn.id,
            referenceType: "Invoice",
            customerId: invoice.customerId || undefined
          }, client);
        } else if (exchangeDifference.lessThan(0)) {
          // Negative exchange difference: store owes customer money
          const diffMethod = (input.differencePaymentMethod as any) || "Cash";
          await financeRepository.createTransaction({
            accountId: methodToAccountId(diffMethod),
            type: "Expense",
            category: "Sales Return",
            amount: exchangeDifference.abs().toNumber(),
            date: new Date().toISOString().split("T")[0],
            method: diffMethod,
            notes: `Exchange refund for Return ${returnNumber}`,
            referenceId: salesReturn.id,
            referenceType: "Invoice",
            customerId: invoice.customerId || undefined
          }, client);
        }
      }

      // 8. Update Invoice Due Amount & Status if debt was cancelled
      if (debtCancelled.greaterThan(0)) {
        const nextDue = Decimal.max(0, invoiceDue.minus(debtCancelled)).toNumber();
        const nextStatus = nextDue <= 0 ? "Paid" : (invoice.amountPaid > 0 ? "Partial" : "Credit");
        await invoiceRepository.updatePayment(invoice.id, {
          amountPaid: invoice.amountPaid,
          dueAmount: nextDue,
          paymentStatus: nextStatus
        }, client);
      }

      // 9. If store credit created, log Customer Credit Transaction
      if (creditCreated.greaterThan(0) && invoice.customerId) {
        await paymentRepository.createCreditTransaction({
          customerId: invoice.customerId,
          type: "Issue",
          amount: creditCreated.toNumber(),
          referenceType: "SalesReturn",
          salesReturnId: salesReturn.id,
          date: new Date().toISOString().split("T")[0],
          notes: `Credit issued for sales return ${returnNumber}`,
          createdBy: (input.createdBy === "Staff" || actorId === "Staff" ? "Staff" : "Owner")
        }, client);
      }

      // 10. If cash refund issued, log Finance Expense
      if (cashRefunded.greaterThan(0)) {
        const refMethod = (input.refundMethod as any) || "Cash";
        await financeRepository.createTransaction({
          accountId: methodToAccountId(refMethod),
          type: "Expense",
          category: "Sales Return",
          amount: cashRefunded.toNumber(),
          date: new Date().toISOString().split("T")[0],
          method: refMethod,
          notes: `Refund for Sales Return ${returnNumber} (${invoice.invoiceNumber})`,
          referenceId: invoice.id,
          customerId: invoice.customerId || undefined
        }, client);
      }

      // 11. Customer Activity Log
      if (invoice.customerId) {
        await customerRepository.recordActivity({
          customerId: invoice.customerId,
          type: "Return",
          description: `Sales return ${returnNumber} created for ₹${totalReturnValue.toFixed(2)}`,
          reference: returnNumber
        }, client);
      }

      return {
        ...salesReturn,
        items: createdItems,
        exchangeItems: createdExchangeItems
      };
    });
  },

  /**
   * Cancels a sales return atomically:
   * - Restores un-returned items and re-deducts exchange replacement stock.
   * - Reverses invoice item returned quantities.
   * - Restores invoice due amount.
   * - Reverses store credit and cash refund transactions.
   */
  async cancelSalesReturn(
    returnId: string,
    reason: string,
    cancelledBy: string
  ): Promise<SalesReturn> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("Cancellation reason is required");
    }

    return withTransaction(async (client: DbClient) => {
      // 1. Lock Sales Return record
      const salesReturn = await salesReturnRepository.findById(returnId, client);
      if (!salesReturn) {
        throw new EntityNotFoundError("SalesReturn", returnId);
      }
      if (salesReturn.status === "Cancelled") {
        throw new InvalidStateTransitionError("SalesReturn", returnId, "Cancelled", "Cancelled");
      }

      // 2. Lock invoice
      const invoice = await invoiceRepository.findById(salesReturn.invoiceId, { forUpdate: true }, client);
      if (!invoice) {
        throw new EntityNotFoundError("Invoice", salesReturn.invoiceId);
      }

      // 3. Fetch return and exchange items
      const [returnItems, exchangeItems] = await Promise.all([
        salesReturnRepository.getItems(returnId, client),
        salesReturnRepository.getExchangeItems(returnId, client)
      ]);

      // 4. Lock products
      const pIds = Array.from(new Set([
        ...returnItems.map(i => i.productId),
        ...exchangeItems.map(i => i.productId)
      ])).sort();

      const productMap = new Map();
      for (const pId of pIds) {
        const p = await productRepository.findById(pId, { forUpdate: true }, client);
        if (p) productMap.set(pId, p);
      }

      // Validate stock for re-deduction of returned items
      for (const item of returnItems) {
        const p = productMap.get(item.productId);
        if (p.stock < item.quantity) {
          throw new InsufficientStockError(p.id, p.name, p.stock, item.quantity);
        }
      }

      // 5. Reverse Stock Changes
      // Re-deduct returned items from stock
      for (const item of returnItems) {
        const p = productMap.get(item.productId);
        await productRepository.updateStock(p.id, p.stock - item.quantity, client);
        await stockMovementRepository.create({
          productId: p.id,
          type: "Sales Return",
          delta: -item.quantity,
          desc: `Cancelled sales return ${salesReturn.returnNumber}: ${reason}`,
          reference: salesReturn.returnNumber
        }, client);

        // Revert invoice item returned quantity if linked
        if (item.invoiceItemId) {
          const currentReturned = await invoiceRepository.getItemReturnedQuantity(item.invoiceItemId, client);
          if (currentReturned !== undefined) {
            await invoiceRepository.updateItemReturnedQuantity(
              item.invoiceItemId,
              Math.max(0, currentReturned - item.quantity),
              client
            );
          }
        }
      }

      // If exchange replacement items were issued, restore them back to stock
      for (const exItem of exchangeItems) {
        const exProd = productMap.get(exItem.productId);
        await productRepository.updateStock(exProd.id, exProd.stock + exItem.quantity, client);
        await stockMovementRepository.create({
          productId: exProd.id,
          type: "Sale",
          delta: exItem.quantity,
          desc: `Cancelled exchange replacement restore: ${salesReturn.returnNumber}`,
          reference: salesReturn.returnNumber
        }, client);
      }

      // 6. Restore Invoice Due Amount if debt was cancelled
      if ((salesReturn.debtCancelled ?? 0) > 0) {
        const maxDue = Math.max(0, invoice.total - invoice.amountPaid);
        const restoredDue = Math.min(maxDue, invoice.dueAmount + (salesReturn.debtCancelled ?? 0));
        const restoredStatus = restoredDue <= 0 ? "Paid" : (invoice.amountPaid > 0 ? "Partial" : "Credit");

        await invoiceRepository.updatePayment(invoice.id, {
          amountPaid: invoice.amountPaid,
          dueAmount: restoredDue,
          paymentStatus: restoredStatus
        }, client);
      }

      const todayStr = new Date().toISOString().split("T")[0];

      // 7. Reverse issued store credit if any
      if ((salesReturn.creditCreated ?? 0) > 0 && salesReturn.customerId) {
        await paymentRepository.createCreditTransaction({
          customerId: salesReturn.customerId,
          type: "Reversal",
          amount: salesReturn.creditCreated!,
          referenceType: "SalesReturn",
          salesReturnId: salesReturn.id,
          date: todayStr,
          notes: `Store credit reversed for cancelled return ${salesReturn.returnNumber} (${reason})`,
          createdBy: (cancelledBy === "Staff" ? "Staff" : "Owner")
        }, client);
      }

      // 8. Reverse cash refund if any
      if ((salesReturn.cashRefunded ?? 0) > 0) {
        const refMethod = (salesReturn.refundMethod as any) || "Cash";
        await financeRepository.createTransaction({
          accountId: methodToAccountId(refMethod),
          type: "Income",
          category: "Sales Return",
          amount: salesReturn.cashRefunded!,
          date: todayStr,
          method: refMethod,
          notes: `Reversal of cash refund for cancelled return ${salesReturn.returnNumber} (${reason})`,
          referenceId: salesReturn.invoiceId,
          customerId: salesReturn.customerId || undefined
        }, client);
      }

      // 8a. Reverse exchange difference if it exists
      if (salesReturn.refundMethod === "Exchange") {
        const exchangeTx = await financeRepository.findExchangeDifferenceTransactionForSalesReturn(salesReturn.id, client);
        if (exchangeTx) {
          await financeService.reverseTransaction(
            exchangeTx.id,
            `Cancellation of Return ${salesReturn.returnNumber} (${reason})`,
            client
          );
        }
      }

      // 9. Update Sales Return Status to 'Cancelled'
      await salesReturnRepository.cancelReturn(returnId, reason, cancelledBy, client);

      // 10. Log Customer Activity
      if (salesReturn.customerId) {
        await customerRepository.recordActivity({
          customerId: salesReturn.customerId,
          type: "Void",
          description: `Sales return ${salesReturn.returnNumber} cancelled by ${cancelledBy}: ${reason}`,
          reference: salesReturn.returnNumber
        }, client);
      }

      const refreshed = await salesReturnRepository.findById(returnId, client);
      return refreshed!;
    });
  },

  /**
   * Fetches a sales return with items.
   */
  async getSalesReturnById(id: string): Promise<(SalesReturn & { items: SalesReturnItem[]; exchangeItems: ExchangeItem[] }) | null> {
    const sr = await salesReturnRepository.findById(id);
    if (!sr) return null;
    const [items, exchangeItems] = await Promise.all([
      salesReturnRepository.getItems(id),
      salesReturnRepository.getExchangeItems(id)
    ]);
    return { ...sr, items, exchangeItems };
  },

  /**
   * Lists sales returns with filtering and pagination.
   */
  async listSalesReturns(
    filter: SalesReturnFilter = {},
    pagination: PaginationParams = {}
  ): Promise<{ data: SalesReturn[]; total: number }> {
    return salesReturnRepository.list(filter, pagination);
  }
};
