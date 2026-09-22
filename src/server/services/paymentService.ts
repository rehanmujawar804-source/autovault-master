/**
 * AUTOVAULT — Payment & Debt Settlement Domain Service
 * 
 * Manages customer debt repayment (Direct & deterministic FIFO waterfall),
 * store credit settlement, supplier liability repayment (FIFO),
 * document receipt numbering delegation, and payment voiding with ledger reversals.
 */

import Decimal from "decimal.js";
import { withTransaction, DbClient } from "../db/txRunner";
import { pool } from "../db/client";
import { invoiceRepository } from "../repositories/invoiceRepository";
import { purchaseRepository } from "../repositories/purchaseRepository";
import { customerRepository } from "../repositories/customerRepository";
import { supplierRepository } from "../repositories/supplierRepository";
import { numberingRepository } from "../repositories/numberingRepository";
import { paymentRepository } from "../repositories/paymentRepository";
import { financeRepository } from "../repositories/financeRepository";
import { 
  ValidationError, 
  EntityNotFoundError, 
  ExceededAllocationError, 
  InvalidStateTransitionError 
} from "../errors/domainErrors";
import { 
  RecordCustomerPaymentInput, 
  CustomerPaymentFifoInput, 
  RecordSupplierPaymentInput, 
  SupplierPaymentFifoInput, 
  ApplyCreditResult 
} from "./types";
import { methodToAccountId } from "./financeService";
import { DebtPayment, SupplierPayment } from "../../types";

export const paymentService = {
  /**
   * Records a debt payment against a single specific invoice:
   * - Locks target invoice row.
   * - Validates payment amount <= invoice due amount.
   * - Stamps atomic payment receipt number from PostgreSQL sequence (PAY-XXXXXX).
   * - Updates invoice amountPaid, dueAmount, paymentStatus.
   * - Logs Income transaction in finance ledger.
   * - Logs customer activity.
   */
  async recordCustomerDebtPayment(
    input: RecordCustomerPaymentInput,
    actorId?: string
  ): Promise<DebtPayment> {
    if (input.amount <= 0) {
      throw new ValidationError("Payment amount must be greater than zero");
    }

    return withTransaction(async (client: DbClient) => {
      // 1. Lock invoice row
      const invoice = await invoiceRepository.findById(input.invoiceId, { forUpdate: true }, client);
      if (!invoice) {
        throw new EntityNotFoundError("Invoice", input.invoiceId);
      }
      if (invoice.voided) {
        throw new ValidationError(`Cannot apply payment to voided invoice ${invoice.invoiceNumber}`);
      }

      const paymentAmount = new Decimal(input.amount).toDecimalPlaces(2);
      const invoiceDue = new Decimal(invoice.dueAmount);

      if (paymentAmount.greaterThan(invoiceDue)) {
        throw new ExceededAllocationError(
          `Payment amount (₹${paymentAmount}) exceeds invoice due balance (₹${invoiceDue})`
        );
      }

      // 2. Atomic Payment Receipt Number
      const receiptNumber = await numberingRepository.getNextPaymentReceiptNumber(client);

      // 3. Create Debt Payment record
      const paymentDate = input.date || new Date().toISOString().split("T")[0];
      const debtPayment = await paymentRepository.createDebtPayment({
        customerId: invoice.customerId!,
        invoiceId: invoice.id,
        amount: paymentAmount.toNumber(),
        date: paymentDate,
        method: input.method,
        note: input.note,
        collectedBy: input.collectedBy || (actorId === "Staff" ? "Staff" : "Owner"),
        receiptNumber
      }, client);

      // 4. Update Invoice Balances
      const nextPaid = new Decimal(invoice.amountPaid).plus(paymentAmount).toNumber();
      const nextDue = invoiceDue.minus(paymentAmount).toNumber();
      const nextStatus = nextDue <= 0 ? "Paid" : "Partial";

      await invoiceRepository.updatePayment(invoice.id, {
        amountPaid: nextPaid,
        dueAmount: nextDue,
        paymentStatus: nextStatus
      }, client);

      // 5. Record Finance Income
      await financeRepository.createTransaction({
        accountId: methodToAccountId(input.method),
        type: "Income",
        category: "Customer Payment",
        amount: paymentAmount.toNumber(),
        date: paymentDate,
        method: input.method,
        notes: input.note || `Customer debt payment (${receiptNumber}) on ${invoice.invoiceNumber}`,
        referenceId: debtPayment.id,
        referenceType: "DebtPayment",
        customerId: invoice.customerId || undefined
      }, client);

      // 6. Record Customer Activity
      if (invoice.customerId) {
        await customerRepository.recordActivity({
          customerId: invoice.customerId,
          type: "Repayment",
          description: `Payment ${receiptNumber} of ₹${paymentAmount.toFixed(2)} received on ${invoice.invoiceNumber}`,
          reference: receiptNumber
        }, client);
      }

      return debtPayment;
    });
  },

  /**
   * Allocates a payment waterfall across customer open invoices in strict FIFO order:
   * - Invoices locked in deterministic FIFO order (COALESCE(created_at, invoice_date::timestamptz), id FOR UPDATE).
   * - Sequential allocation guarantees zero race conditions or double-allocations.
   * - Stamps atomic receipt numbers from sequence.
   * - Updates each affected invoice and logs finance income.
   */
  async recordCustomerDebtPaymentFifo(
    input: CustomerPaymentFifoInput,
    actorId?: string
  ): Promise<DebtPayment[]> {
    if (input.totalAmount <= 0) {
      throw new ValidationError("Payment total amount must be greater than zero");
    }

    return withTransaction(async (client: DbClient) => {
      const customer = await customerRepository.findById(input.customerId, client);
      if (!customer) {
        throw new EntityNotFoundError("Customer", input.customerId);
      }

      // Query unpaid invoices in frozen FIFO order with row locks
      const openInvoices = await invoiceRepository.getUnpaidInvoicesByCustomer(
        input.customerId,
        { forUpdate: true },
        client
      );

      if (openInvoices.length === 0) {
        throw new ExceededAllocationError(`Customer "${customer.name}" has no outstanding unpaid invoices`);
      }

      // Verify payment does not exceed total outstanding debt
      let totalDebt = new Decimal(0);
      for (const inv of openInvoices) {
        totalDebt = totalDebt.plus(new Decimal(inv.dueAmount));
      }

      const totalPaymentAmount = new Decimal(input.totalAmount).toDecimalPlaces(2);
      if (totalPaymentAmount.greaterThan(totalDebt)) {
        throw new ExceededAllocationError(
          `Payment amount (₹${totalPaymentAmount}) exceeds total customer debt (₹${totalDebt})`
        );
      }

      // Execute FIFO Waterfall
      let remaining = totalPaymentAmount;
      const createdPayments: DebtPayment[] = [];
      const paymentDate = input.date || new Date().toISOString().split("T")[0];

      for (const inv of openInvoices) {
        if (remaining.lessThanOrEqualTo(0)) break;

        const effectiveDue = Decimal.max(0, new Decimal(inv.dueAmount));
        if (effectiveDue.lessThanOrEqualTo(0)) continue;

        const alloc = Decimal.min(remaining, effectiveDue);
        const receiptNumber = await numberingRepository.getNextPaymentReceiptNumber(client);

        const payment = await paymentRepository.createDebtPayment({
          customerId: input.customerId,
          invoiceId: inv.id,
          amount: alloc.toNumber(),
          date: paymentDate,
          method: input.method,
          note: input.note || `FIFO Debt Payment (${receiptNumber})`,
          collectedBy: input.collectedBy || (actorId === "Staff" ? "Staff" : "Owner"),
          receiptNumber
        }, client);
        createdPayments.push(payment);

        const nextPaid = new Decimal(inv.amountPaid).plus(alloc).toNumber();
        const nextDue = effectiveDue.minus(alloc).toNumber();
        const nextStatus = nextDue <= 0 ? "Paid" : "Partial";

        await invoiceRepository.updatePayment(inv.id, {
          amountPaid: nextPaid,
          dueAmount: nextDue,
          paymentStatus: nextStatus
        }, client);

        await financeRepository.createTransaction({
          accountId: methodToAccountId(input.method),
          type: "Income",
          category: "Customer Payment",
          amount: alloc.toNumber(),
          date: paymentDate,
          method: input.method,
          notes: `FIFO payment (${receiptNumber}) on ${inv.invoiceNumber}`,
          referenceId: payment.id,
          referenceType: "DebtPayment",
          customerId: input.customerId || undefined
        }, client);

        await customerRepository.recordActivity({
          customerId: input.customerId,
          type: "Repayment",
          description: `FIFO payment ${receiptNumber} of ₹${alloc.toFixed(2)} on ${inv.invoiceNumber}`,
          reference: receiptNumber
        }, client);

        remaining = remaining.minus(alloc);
      }

      return createdPayments;
    });
  },

  /**
   * Applies available customer store credit to unpaid debt in FIFO order.
   * No finance cash-flow transactions are recorded (debt cancels against liability).
   */
  async applyStoreCreditToDebt(
    customerId: string,
    requestedAmount?: number,
    actorId?: string
  ): Promise<ApplyCreditResult> {
    return withTransaction(async (client: DbClient) => {
      const customer = await customerRepository.findById(customerId, client);
      if (!customer) {
        throw new EntityNotFoundError("Customer", customerId);
      }

      // Query live credit balance from view_customer_credit_balances
      const availableCreditNum = await customerRepository.getCreditBalance(customerId, client);
      const availableCredit = new Decimal(availableCreditNum);

      if (availableCredit.lessThanOrEqualTo(0)) {
        throw new ValidationError(`Customer "${customer.name}" has no available store credit`);
      }

      const creditToUse = requestedAmount 
        ? Decimal.min(new Decimal(requestedAmount), availableCredit)
        : availableCredit;

      if (creditToUse.lessThanOrEqualTo(0)) {
        throw new ValidationError("Requested credit amount must be greater than zero");
      }

      // Lock open invoices in FIFO order
      const openInvoices = await invoiceRepository.getUnpaidInvoicesByCustomer(
        customerId,
        { forUpdate: true },
        client
      );

      if (openInvoices.length === 0) {
        throw new ValidationError(`Customer "${customer.name}" has no unpaid invoices to apply credit to`);
      }

      let remaining = creditToUse;
      let updatedCount = 0;
      let totalAllocated = new Decimal(0);
      const todayStr = new Date().toISOString().split("T")[0];

      for (const inv of openInvoices) {
        if (remaining.lessThanOrEqualTo(0)) break;

        const effectiveDue = Decimal.max(0, new Decimal(inv.dueAmount));
        if (effectiveDue.lessThanOrEqualTo(0)) continue;

        const alloc = Decimal.min(remaining, effectiveDue);

        // Record customer credit redemption transaction
        await paymentRepository.createCreditTransaction({
          customerId,
          type: "Redeem",
          amount: alloc.toNumber(),
          referenceType: "Invoice",
          invoiceId: inv.id,
          date: todayStr,
          notes: `Store credit applied to invoice ${inv.invoiceNumber}`,
          createdBy: (actorId === "Staff" ? "Staff" : "Owner")
        }, client);

        // Update invoice balances (amountPaid remains, dueAmount reduces, creditRedeemed increases)
        const nextDue = effectiveDue.minus(alloc).toNumber();
        const nextCreditRedeemed = new Decimal(inv.creditRedeemed || 0).plus(alloc).toNumber();
        const nextStatus = nextDue <= 0 ? "Paid (Credit Redeemed)" : "Partial";

        await invoiceRepository.updatePaymentAndCredit(inv.id, nextDue, nextCreditRedeemed, nextStatus, client);

        await customerRepository.recordActivity({
          customerId,
          type: "Credit",
          description: `Applied ₹${alloc.toFixed(2)} store credit to ${inv.invoiceNumber}`,
          reference: inv.invoiceNumber
        }, client);

        remaining = remaining.minus(alloc);
        totalAllocated = totalAllocated.plus(alloc);
        updatedCount++;
      }

      return {
        allocatedAmount: totalAllocated.toNumber(),
        updatedInvoicesCount: updatedCount,
        remainingCredit: availableCredit.minus(totalAllocated).toNumber()
      };
    });
  },

  /**
   * Voids an active debt payment:
   * - Restores the due balance on the associated invoice.
   * - Emits balancing reversing Expense entry in finance ledger.
   * - Marks payment voided with audit reason.
   */
  async voidDebtPayment(
    debtPaymentId: string,
    voidReason: string,
    voidedBy: string
  ): Promise<DebtPayment> {
    if (!voidReason || voidReason.trim().length === 0) {
      throw new ValidationError("Void reason is required");
    }

    return withTransaction(async (client: DbClient) => {
      // 1. Lock payment row
      const payment = await paymentRepository.findDebtPaymentById(debtPaymentId, { forUpdate: true }, client);
      if (!payment) {
        throw new EntityNotFoundError("DebtPayment", debtPaymentId);
      }

      if (payment.voided) {
        throw new InvalidStateTransitionError("DebtPayment", debtPaymentId, "Voided", "Voided");
      }

      // 2. Lock associated invoice
      const invoice = await invoiceRepository.findById(payment.invoiceId, { forUpdate: true }, client);
      if (!invoice) {
        throw new EntityNotFoundError("Invoice", payment.invoiceId);
      }

      // 3. Restore Invoice Due Amount
      const paymentAmount = new Decimal(payment.amount);
      const restoredDue = Decimal.min(
        new Decimal(invoice.total),
        new Decimal(invoice.dueAmount).plus(paymentAmount)
      ).toNumber();
      const restoredPaid = Decimal.max(
        0,
        new Decimal(invoice.amountPaid).minus(paymentAmount)
      ).toNumber();
      const restoredStatus = restoredDue <= 0 ? "Paid" : (restoredPaid > 0 ? "Partial" : "Credit");

      await invoiceRepository.updatePayment(invoice.id, {
        amountPaid: restoredPaid,
        dueAmount: restoredDue,
        paymentStatus: restoredStatus
      }, client);

      // 4. Mark Debt Payment Voided
      await paymentRepository.voidDebtPaymentFields(debtPaymentId, voidReason, voidedBy, client);

      // 5. Reverse Finance Income
      // Find original income transaction for this debt payment
      const origTx = await financeRepository.findOriginalIncomeForDebtPayment(debtPaymentId, invoice.id, client);

      const todayStr = new Date().toISOString().split("T")[0];
      if (origTx) {
        await financeRepository.createTransaction({
          accountId: origTx.accountId,
          type: "Expense",
          category: "Payment Void",
          amount: payment.amount,
          date: todayStr,
          method: payment.method,
          notes: `Reversal of payment ${payment.receiptNumber || payment.id} (${voidReason})`,
          referenceId: invoice.id,
          referenceType: "DebtPayment",
          reversalOf: origTx.id,
          customerId: payment.customerId || undefined
        }, client);
      }

      // 6. Record Customer Activity
      await customerRepository.recordActivity({
        customerId: payment.customerId,
        type: "Void",
        description: `Payment ${payment.receiptNumber || payment.id} of ₹${payment.amount.toFixed(2)} voided: ${voidReason}`,
        reference: payment.receiptNumber || payment.id
      }, client);

      const refreshed = await paymentRepository.findDebtPaymentById(debtPaymentId, undefined, client);
      return refreshed!;
    });
  },

  /**
   * Records a payment to a supplier against a specific purchase:
   * - Locks target purchase row.
   * - Validates payment amount <= purchase due amount.
   * - Updates purchase amountPaid, dueAmount, paymentStatus.
   * - Logs Expense transaction in finance ledger.
   */
  async recordSupplierPayment(
    input: RecordSupplierPaymentInput,
    actorId?: string
  ): Promise<SupplierPayment> {
    if (input.amount <= 0) {
      throw new ValidationError("Supplier payment amount must be greater than zero");
    }

    return withTransaction(async (client: DbClient) => {
      // 1. Lock Purchase Row
      const purchase = await purchaseRepository.findById(input.purchaseId, { forUpdate: true }, client);
      if (!purchase) {
        throw new EntityNotFoundError("Purchase", input.purchaseId);
      }

      const paymentAmount = new Decimal(input.amount).toDecimalPlaces(2);
      const purchaseDue = new Decimal(purchase.dueAmount);

      if (paymentAmount.greaterThan(purchaseDue)) {
        throw new ExceededAllocationError(
          `Payment amount (₹${paymentAmount}) exceeds purchase due balance (₹${purchaseDue})`
        );
      }

      const paymentDate = input.date || new Date().toISOString().split("T")[0];

      // 2. Insert Supplier Payment record
      const supplierPayment = await paymentRepository.createSupplierPayment({
        supplierId: purchase.supplierId,
        purchaseId: purchase.id,
        amount: paymentAmount.toNumber(),
        method: input.method as any,
        isUpfront: false,
        note: input.note,
        paidBy: input.paidBy || (actorId === "Staff" ? "Staff" : "Owner")
      }, client);

      // 3. Update Purchase Balances
      const nextPaid = new Decimal(purchase.amountPaid).plus(paymentAmount).toNumber();
      const nextDue = purchaseDue.minus(paymentAmount).toNumber();
      const nextStatus = nextDue <= 0 ? "Paid" : "Partial";

      await purchaseRepository.updatePayment(purchase.id, {
        amountPaid: nextPaid,
        dueAmount: nextDue,
        paymentStatus: nextStatus
      }, client);

      // 4. Record Finance Expense
      await financeRepository.createTransaction({
        accountId: methodToAccountId(input.method),
        type: "Expense",
        category: "Supplier Payment",
        amount: paymentAmount.toNumber(),
        date: paymentDate,
        method: input.method as any,
        notes: input.note || `Supplier payment on Purchase ${purchase.invoiceNumber || purchase.id}`,
        referenceId: purchase.id,
        supplierId: purchase.supplierId
      }, client);

      return supplierPayment;
    });
  },

  /**
   * Allocates a supplier payment waterfall across unpaid purchases in strict FIFO order:
   * - Purchases locked in deterministic FIFO order (COALESCE(created_at, purchase_date::timestamptz), id FOR UPDATE).
   * - Sequential allocation guarantees zero race conditions or double-allocations.
   * - Updates each affected purchase and logs finance expenses.
   */
  async recordSupplierPaymentFifo(
    input: SupplierPaymentFifoInput,
    actorId?: string
  ): Promise<SupplierPayment[]> {
    if (input.totalAmount <= 0) {
      throw new ValidationError("Supplier payment total amount must be greater than zero");
    }

    return withTransaction(async (client: DbClient) => {
      const supplier = await supplierRepository.findById(input.supplierId, client);
      if (!supplier) {
        throw new EntityNotFoundError("Supplier", input.supplierId);
      }

      // Query open purchases in frozen FIFO order with row locks
      const openPurchases = await purchaseRepository.getUnpaidPurchasesBySupplier(
        input.supplierId,
        { forUpdate: true },
        client
      );

      if (openPurchases.length === 0) {
        throw new ExceededAllocationError(`Supplier "${supplier.name}" has no outstanding unpaid purchases`);
      }

      let totalDue = new Decimal(0);
      for (const p of openPurchases) {
        totalDue = totalDue.plus(new Decimal(p.dueAmount));
      }

      const totalPaymentAmount = new Decimal(input.totalAmount).toDecimalPlaces(2);
      if (totalPaymentAmount.greaterThan(totalDue)) {
        throw new ExceededAllocationError(
          `Payment amount (₹${totalPaymentAmount}) exceeds total supplier liability (₹${totalDue})`
        );
      }

      let remaining = totalPaymentAmount;
      const createdPayments: SupplierPayment[] = [];
      const paymentDate = input.date || new Date().toISOString().split("T")[0];

      for (const pur of openPurchases) {
        if (remaining.lessThanOrEqualTo(0)) break;

        const effectiveDue = Decimal.max(0, new Decimal(pur.dueAmount));
        if (effectiveDue.lessThanOrEqualTo(0)) continue;

        const alloc = Decimal.min(remaining, effectiveDue);

        const payment = await paymentRepository.createSupplierPayment({
          supplierId: input.supplierId,
          purchaseId: pur.id,
          amount: alloc.toNumber(),
          method: input.method as any,
          isUpfront: false,
          note: input.note || `FIFO Supplier Payment`,
          paidBy: input.paidBy || (actorId === "Staff" ? "Staff" : "Owner")
        }, client);
        createdPayments.push(payment);

        const nextPaid = new Decimal(pur.amountPaid).plus(alloc).toNumber();
        const nextDue = effectiveDue.minus(alloc).toNumber();
        const nextStatus = nextDue <= 0 ? "Paid" : "Partial";

        await purchaseRepository.updatePayment(pur.id, {
          amountPaid: nextPaid,
          dueAmount: nextDue,
          paymentStatus: nextStatus
        }, client);

        await financeRepository.createTransaction({
          accountId: methodToAccountId(input.method),
          type: "Expense",
          category: "Supplier Payment",
          amount: alloc.toNumber(),
          date: paymentDate,
          method: input.method as any,
          notes: `FIFO payment on purchase ${pur.invoiceNumber || pur.id}`,
          referenceId: pur.id,
          supplierId: input.supplierId
        }, client);

        remaining = remaining.minus(alloc);
      }

      return createdPayments;
    });
  }
};
