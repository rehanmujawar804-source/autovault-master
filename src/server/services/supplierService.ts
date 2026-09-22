/**
 * AUTOVAULT — Supplier Domain Service
 * 
 * Orchestrates supplier profiles and deterministic financial statement generation
 * reconciling purchases (debits), payments (credits), and purchase returns (credits).
 */

import Decimal from "decimal.js";
import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { supplierRepository } from "../repositories/supplierRepository";
import { purchaseRepository } from "../repositories/purchaseRepository";
import { paymentRepository } from "../repositories/paymentRepository";
import { 
  ValidationError, 
  EntityNotFoundError 
} from "../errors/domainErrors";
import { 
  NewSupplierInput, 
  UpdateSupplierInput, 
  SupplierFilter, 
  PaginationParams, 
  SupplierStatementReport, 
  SupplierStatementEntry 
} from "./types";
import { Supplier } from "../../types";

function normalizeMoney(val: unknown): number {
  if (val === undefined || val === null) return 0;
  let num: number;
  if (typeof val === "number") {
    num = val;
  } else if (typeof val === "string") {
    const cleaned = val.replace(/[₹$,\s]/g, "").trim();
    if (cleaned === "") return 0;
    num = Number(cleaned);
  } else {
    return 0;
  }
  if (!Number.isFinite(num) || isNaN(num)) return 0;
  return new Decimal(num).toDecimalPlaces(2).toNumber();
}

export const supplierService = {
  /**
   * Creates a new supplier profile.
   */
  async createSupplier(
    data: NewSupplierInput,
    client: DbClient = pool
  ): Promise<Supplier> {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError("Supplier name is required");
    }

    return supplierRepository.create(data, client);
  },

  /**
   * Updates an existing supplier profile.
   */
  async updateSupplier(
    id: string,
    data: UpdateSupplierInput,
    client: DbClient = pool
  ): Promise<Supplier> {
    const existing = await supplierRepository.findById(id, client);
    if (!existing) {
      throw new EntityNotFoundError("Supplier", id);
    }

    return supplierRepository.update(id, data, client);
  },

  /**
   * Lists suppliers with filtering and pagination.
   */
  async listSuppliers(
    filter: SupplierFilter = {},
    pagination: PaginationParams = {},
    client: DbClient = pool
  ): Promise<{ data: Supplier[]; total: number }> {
    return supplierRepository.list(filter, pagination, client);
  },

  /**
   * Generates a deterministic supplier statement of account.
   * Matches exact mathematical specifications from Sprint 2C test suite:
   * - Chronological ordering: date -> type priority (Purchase:1, Payment:2, Return:3) -> id.
   * - Opening balance from transactions strictly prior to dateFrom.
   * - Debits increase liability, Credits decrease liability.
   */
  async getSupplierStatement(
    supplierId: string,
    dateFrom?: string,
    dateTo?: string,
    client: DbClient = pool
  ): Promise<SupplierStatementReport> {
    const supplier = await supplierRepository.findById(supplierId, client);
    if (!supplier) {
      throw new EntityNotFoundError("Supplier", supplierId);
    }

    // 1. Fetch all raw financial records for this supplier
    const [purchasesRes, paymentsRes, returnsRes] = await Promise.all([
      purchaseRepository.getPurchasesWithProductNameBySupplier(supplierId, client),
      paymentRepository.getSupplierPaymentsBySupplier(supplierId, client),
      purchaseRepository.getReturnsBySupplier(supplierId, client)
    ]);

    interface RawStatementRecord {
      id: string;
      type: "Purchase" | "Payment" | "Purchase Return";
      date: string;
      istDateStr: string;
      timestamp: number;
      typePriority: number; // 1 = Purchase, 2 = Payment, 3 = Return
      reference: string;
      debit: number;
      credit: number;
      notes: string;
    }

    const allRecords: RawStatementRecord[] = [];

    // Purchases (Debits)
    for (const row of purchasesRes) {
      const debitAmount = normalizeMoney(row.total_amount ?? (Number(row.buy_price) * Number(row.quantity)));
      const rawDateStr = row.purchase_date 
        ? new Date(row.purchase_date).toISOString().split("T")[0]
        : (row.created_at ? new Date(row.created_at).toISOString().split("T")[0] : "2026-01-01");
      const d = new Date(row.created_at || rawDateStr);
      const timestamp = isNaN(d.getTime()) ? 0 : d.getTime();

      const prodName = row.product_name || `Product (${(row.product_id || "").slice(-6)})`;
      const qtyText = row.quantity ? `${row.quantity} units` : "0 units";
      const priceText = row.buy_price ? `@ ₹${normalizeMoney(row.buy_price)}` : "";
      const desc = `Purchase: ${prodName} (${qtyText} ${priceText})`.trim();

      allRecords.push({
        id: row.id,
        type: "Purchase",
        date: rawDateStr,
        istDateStr: rawDateStr,
        timestamp,
        typePriority: 1,
        reference: row.invoice_number || `PUR-${row.id.slice(-6).toUpperCase()}`,
        debit: debitAmount,
        credit: 0,
        notes: desc
      });
    }

    // Payments (Credits)
    for (const row of paymentsRes) {
      const creditAmount = normalizeMoney(row.amount);
      const rawDateStr = row.created_at 
        ? new Date(row.created_at).toISOString().split("T")[0] 
        : "2026-01-01";
      const d = new Date(row.created_at || rawDateStr);
      const timestamp = isNaN(d.getTime()) ? 0 : d.getTime();

      allRecords.push({
        id: row.id,
        type: "Payment",
        date: rawDateStr,
        istDateStr: rawDateStr,
        timestamp,
        typePriority: 2,
        reference: `PAY-${row.id.slice(-6).toUpperCase()}`,
        debit: 0,
        credit: creditAmount,
        notes: `Payment via ${row.method || "Cash"}`
      });
    }

    // Purchase Returns (Credits)
    for (const row of returnsRes) {
      const creditAmount = normalizeMoney(row.total_amount);
      const rawDateStr = row.created_at 
        ? new Date(row.created_at).toISOString().split("T")[0] 
        : "2026-01-01";
      const d = new Date(row.created_at || rawDateStr);
      const timestamp = isNaN(d.getTime()) ? 0 : d.getTime();

      allRecords.push({
        id: row.id,
        type: "Purchase Return",
        date: rawDateStr,
        istDateStr: rawDateStr,
        timestamp,
        typePriority: 3,
        reference: `RET-${row.id.slice(-6).toUpperCase()}`,
        debit: 0,
        credit: creditAmount,
        notes: `Return: ${row.reason || "Supplier Return"}`
      });
    }

    // Sort all records chronologically: date -> typePriority -> id
    allRecords.sort((a, b) => {
      if (a.istDateStr !== b.istDateStr) {
        return a.istDateStr.localeCompare(b.istDateStr);
      }
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      if (a.typePriority !== b.typePriority) {
        return a.typePriority - b.typePriority;
      }
      return a.id.localeCompare(b.id);
    });

    // Compute opening balance for transactions strictly prior to dateFrom
    let openingBalance = 0;
    const periodRecords: RawStatementRecord[] = [];

    for (const rec of allRecords) {
      if (dateFrom && rec.istDateStr < dateFrom) {
        openingBalance += rec.debit - rec.credit;
      } else if (!dateTo || rec.istDateStr <= dateTo) {
        periodRecords.push(rec);
      }
    }

    openingBalance = normalizeMoney(openingBalance);

    // Compute running balance across period records
    let currentRunning = openingBalance;
    let totalPurchases = 0;
    let totalPayments = 0;
    let totalReturns = 0;

    const entries: SupplierStatementEntry[] = periodRecords.map((rec) => {
      currentRunning = normalizeMoney(currentRunning + rec.debit - rec.credit);

      if (rec.type === "Purchase") totalPurchases += rec.debit;
      else if (rec.type === "Payment") totalPayments += rec.credit;
      else if (rec.type === "Purchase Return") totalReturns += rec.credit;

      return {
        id: rec.id,
        date: rec.date,
        type: rec.type,
        reference: rec.reference,
        debit: rec.debit,
        credit: rec.credit,
        runningBalance: currentRunning,
        notes: rec.notes
      };
    });

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      dateFrom,
      dateTo,
      openingBalance,
      entries,
      closingBalance: normalizeMoney(currentRunning),
      totalPurchases: normalizeMoney(totalPurchases),
      totalPayments: normalizeMoney(totalPayments),
      totalReturns: normalizeMoney(totalReturns)
    };
  }
};
