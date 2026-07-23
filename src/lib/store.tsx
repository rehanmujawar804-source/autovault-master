"use client";

/**
 * AutoVault — Central App Store
 *
 * React Context + useReducer, persisted to localStorage.
 * Single source of truth for products, customers, invoices, and debt payments.
 *
 * Debt Model:
 *   - Every invoice stores amountPaid + dueAmount.
 *   - Repayments are logged as DebtPayment records tied to a specific invoice.
 *   - Customer.debt is a derived cache, always = sum of open invoice dues.
 *   - getTotalOutstandingDebt() derives from invoice dueAmounts, not customer.debt.
 *
 * Demo Reset:
 *   - STORE_VERSION is used to force a clean reset when bumped.
 *   - On first load after a version change, localStorage is wiped and the app
 *     starts with an empty state ready for live demonstration.
 *
 * Migration System:
 *   - MIGRATIONS is a registry of one-time data repair functions.
 *   - Each migration has a unique id, a description, and a pure function that
 *     transforms the AppState and returns { state, log }.
 *   - Applied migration IDs are persisted in MIGRATION_KEY so each migration
 *     runs exactly once, even across future app restarts.
 *   - To add a new migration: append an entry to the MIGRATIONS array below.
 */

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";
import type {
  AppState,
  Product,
  Customer,
  Invoice,
  DebtPayment,
  PaymentMethod,
  PaymentStatus,
  Supplier,
  Purchase,
  StockMovement,
  SupplierPayment,
  FinanceAccount,
  FinanceCategory,
  FinanceTransaction,
  HoldBill,
  PurchaseReturn,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  POActivityLog,
  SalesReturn,
  SalesReturnItem,
  SalesReturnStatus,
  ExchangeItem,
} from "@/types";
import { todayLocalStr } from "@/lib/dateUtils";
import { calculateRevenue } from "./revenueUtils";
import { calculateProfit } from "./profitUtils";

// ─────────────────────────────────────────────
//  VERSION — bump this to force localStorage reset on all clients
// ─────────────────────────────────────────────

const STORE_VERSION = "v3-demo-clean-2026";

// ─────────────────────────────────────────────
//  SEED DATA  — intentionally empty for owner demo
//  (Owner will add their own products, customers, and invoices live)
// ─────────────────────────────────────────────

const SEED_PRODUCTS: Product[] = [];
const SEED_CUSTOMERS: Customer[] = [];
const SEED_INVOICES: Invoice[] = [];

// ─────────────────────────────────────────────
//  DEFAULT FINANCE ACCOUNTS
// ─────────────────────────────────────────────

const DEFAULT_FINANCE_ACCOUNTS: FinanceAccount[] = [
  { id: "acc-cash", name: "Cash", type: "Cash", openingBalance: 0, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "acc-upi",  name: "UPI",  type: "UPI",  openingBalance: 0, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "acc-bank", name: "Bank", type: "Bank", openingBalance: 0, createdAt: "2026-01-01T00:00:00.000Z" },
];

const INITIAL_STATE: AppState = {
  products: SEED_PRODUCTS,
  customers: SEED_CUSTOMERS,
  invoices: SEED_INVOICES,
  debtPayments: [],
  suppliers: [],
  purchases: [],
  stockMovements: [],
  supplierPayments: [],
  financeAccounts: DEFAULT_FINANCE_ACCOUNTS,
  financeTransactions: [],
  holdBills: [],
  holdBillsCounter: 0,
  purchaseOrders: [],
  purchaseOrderCounter: 0,
  salesReturns: [],
  salesReturnCounter: 0,
};

const STORAGE_KEY = "autovault_store";
/** Tracks which migration IDs have already been applied. */
const MIGRATION_KEY = "autovault_migrations";

// ─────────────────────────────────────────────
//  ACTIONS
// ─────────────────────────────────────────────

type Action =
  // Products
  | { type: "ADD_PRODUCT"; product: Product }
  | { type: "UPDATE_PRODUCT"; product: Product }
  | { type: "ADJUST_STOCK"; productId: string; delta: number }

  // Customers
  | { type: "ADD_CUSTOMER"; customer: Customer }
  | { type: "UPDATE_CUSTOMER"; customer: Customer }

  // Invoices
  | { type: "ADD_INVOICE"; invoice: Invoice }
  | { type: "VOID_INVOICE"; invoiceId: string; reason: string; voidedBy: string }

  // Debt Repayment — core new action
  | { type: "RECORD_DEBT_PAYMENT"; payment: DebtPayment }
  | {
      type: "RECORD_CUSTOMER_DEBT_PAYMENT_FIFO";
      customerId: string;
      totalAmount: number;
      method: PaymentMethod;
      date: string;
      note?: string;
      collectedBy?: "Owner" | "Staff";
    }
  | { type: "VOID_DEBT_PAYMENT"; paymentId: string; reason: string; voidedBy: string }

  // Suppliers Sprint 1 & 2
  | { type: "ADD_SUPPLIER"; supplier: Supplier }
  | { type: "UPDATE_SUPPLIER"; supplier: Supplier }
  | { type: "ADD_PURCHASE"; purchase: Purchase; paymentMethod?: PaymentMethod }
  | { type: "UPDATE_PURCHASE"; purchaseId: string; invoiceNumber: string; date: string; notes: string }
  | { type: "RECORD_SUPPLIER_PAYMENT"; payment: SupplierPayment }
  | {
      type: "RECORD_SUPPLIER_PAYMENT_FIFO";
      supplierId: string;
      totalAmount: number;
      method: PaymentMethod;
      date: string;
      note?: string;
      paidBy?: "Owner" | "Staff";
    }
  | { type: "ADD_PURCHASE_RETURN"; returnRecord: PurchaseReturn; refundMethod: PaymentMethod | "Adjustment" }

  // Reset / Hydrate
  | { type: "RESET_STORE" }
  | { type: "HYDRATE_STORE"; state: AppState }
  | { type: "RECONCILE_DEBT_CACHE" }

  // Hold Bills (Sprint 4.3 POS Park/Recall)
  | { type: "CREATE_HOLD_BILL"; bill: Omit<HoldBill, "id" | "createdAt" | "updatedAt" | "holdNumber"> }
  | { type: "UPDATE_HOLD_BILL"; billId: string; bill: Omit<HoldBill, "id" | "createdAt" | "updatedAt" | "holdNumber"> }
  | { type: "DELETE_HOLD_BILL"; id: string }
  | { type: "LOAD_HOLD_BILL"; id: string }

  // Purchase Orders (Sprint 4.6, 4.6.1 & 4.6.2)
  | { type: "CREATE_PURCHASE_ORDER"; po: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt" | "updatedAt" | "activityLog"> }
  | { type: "UPDATE_PURCHASE_ORDER"; poId: string; expectedDeliveryDate: string; notes: string; items: PurchaseOrderItem[]; status: PurchaseOrderStatus }
  | { type: "DELETE_PURCHASE_ORDER"; poId: string }
  | { type: "MARK_PURCHASE_ORDER_SENT"; poId: string }
  | { type: "MARK_PURCHASE_ORDER_CANCELLED"; poId: string }
  | { type: "COMPLETE_PURCHASE_ORDER"; poId: string }
  | { type: "CONFIRM_PURCHASE_ORDER"; poId: string }
  | { type: "RECORD_PO_ACTIVITY"; poId: string; entry: POActivityLog }
  
  // Sales Returns (Sprint 5.0)
  | { type: "ADD_SALES_RETURN"; salesReturn: SalesReturn }
  | { type: "CANCEL_SALES_RETURN"; returnId: string; reason: string; voidedBy: string }
  | { type: "MODIFY_SALES_RETURN"; returnId: string; refundAmount: number; notes: string }

  // Operating Business Expenses
  | {
      type: "RECORD_BUSINESS_EXPENSE";
      category: FinanceCategory;
      amount: number;
      paymentMethod: PaymentMethod;
      date?: string;
      notes?: string;
      referenceId?: string;
    };

// ─────────────────────────────────────────────
//  HELPERS (pure, used inside reducer)
// ─────────────────────────────────────────────

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Generate a collision-safe unique ID with a prefix */
export function generateUniqueId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${Date.now()}-${rand}`;
}

/** Normalizes a product ensuring all standard properties are set properly */
export function normalizeProduct(product: Partial<Product> & { id: string; name: string; sku: string }): Product {
  const fallbackTimestamp = new Date().toISOString();
  const legacyP = product as any;
  return {
    ...product,
    id: product.id,
    name: product.name,
    sku: product.sku,
    brand: product.brand || "",
    category: product.category || "",
    stock: product.stock ?? 0,
    currentCost: product.currentCost ?? legacyP.buyPrice ?? 0,
    sellPrice: product.sellPrice ?? 0,
    lowStockThreshold: product.lowStockThreshold ?? 5,
    status: product.status || "Active",
    fitments: product.fitments || [],
    createdAt: product.createdAt || fallbackTimestamp,
    updatedAt: product.updatedAt || fallbackTimestamp,
  };
}

/**
 * Maps a PaymentMethod to its corresponding FinanceAccount ID.
 * Credit payments create no finance entry (no real money movement).
 */
function methodToAccountId(method: PaymentMethod): string {
  switch (method) {
    case "Cash": return "acc-cash";
    case "UPI":  return "acc-upi";
    case "Card": return "acc-bank";
    default:     return "acc-cash"; // Should not be reached for Credit
  }
}

function refundMethodToAccountId(method: string): string {
  switch (method) {
    case "Cash": return "acc-cash";
    case "UPI":  return "acc-upi";
    case "Bank": return "acc-bank";
    default:     return "acc-cash";
  }
}

// ─────────────────────────────────────────────
//  MIGRATION SYSTEM
// ─────────────────────────────────────────────

type MigrationFn = (state: AppState) => { state: AppState; log: string[] };

interface StoreMigration {
  /** Unique, immutable ID. Once shipped never rename or reuse this string. */
  id: string;
  description: string;
  run: MigrationFn;
}

/**
 * Registry of one-time data migrations.
 *
 * Rules:
 *  - Never delete or rename an existing entry — the ID is the idempotency key.
 *  - Always append new migrations at the END of the array.
 *  - Each `run` function must be pure: receive state, return { state, log }.
 */
const MIGRATIONS: StoreMigration[] = [
  {
    id: "m001-repair-duplicate-product-ids",
    description:
      "Detects products that share an ID (caused by Date.now() batch collision) and " +
      "assigns each duplicate a new collision-safe ID. Also backfills status, createdAt, " +
      "and updatedAt on every product.",
    run(inputState) {
      const log: string[] = [];
      const seenIds = new Set<string>();

      const repairedProducts = inputState.products.map((p) => {
        let repaired = { ...p };

        // ── Repair duplicate ID ───────────────────────
        if (seenIds.has(repaired.id)) {
          const oldId = repaired.id;
          repaired.id = generateUniqueId("p");
          log.push(
            `Repaired: id "${oldId}" → "${repaired.id}" | SKU: ${repaired.sku} | Name: ${repaired.name}`
          );
        } else {
          seenIds.add(repaired.id);
        }

        return normalizeProduct(repaired);
      });

      if (log.length === 0) {
        log.push("No duplicate product IDs found — state is clean.");
      }

      return {
        state: { ...inputState, products: repairedProducts },
        log,
      };
    },
  },
  {
    id: "m002-restore-purchase-totals",
    description: "Restores original purchase values that were previously modified by returns, making purchases immutable.",
    run(inputState) {
      const log: string[] = [];
      const newPurchases = (inputState.purchases || []).map((p) => {
        const originalTotal = roundMoney(p.buyPrice * p.quantity);
        if (p.totalAmount !== originalTotal) {
          log.push(`Restored purchase ${p.id} (INV: ${p.invoiceNumber}): totalAmount ${p.totalAmount} -> ${originalTotal}`);
          const returnedQty = p.returnedQuantity ?? 0;
          let newAmountPaid = p.amountPaid;
          if (returnedQty === 0) {
            newAmountPaid = roundMoney(originalTotal - p.dueAmount);
          } else {
            const returnsForP = (inputState.purchaseReturns || []).filter(r => r.purchaseId === p.id);
            const totalRefunded = returnsForP.reduce((s, r) => s + r.refundAmount, 0);
            newAmountPaid = roundMoney(p.amountPaid + totalRefunded);
          }
          const newDueAmount = roundMoney(Math.max(0, originalTotal - newAmountPaid));
          const newPaymentStatus: "Paid" | "Partial" | "Credit" =
            newDueAmount <= 0 ? "Paid" : newAmountPaid > 0 ? "Partial" : "Credit";

          return {
            ...p,
            totalAmount: originalTotal,
            amountPaid: newAmountPaid,
            dueAmount: newDueAmount,
            paymentStatus: newPaymentStatus,
          };
        }
        return p;
      });

      return {
        state: { ...inputState, purchases: newPurchases },
        log,
      };
    }
  },
  {
    id: "m003-backfill-invoice-item-cost-price",
    description: "Backfills historical costPrice snapshot on invoice items using the product's current cost if missing.",
    run(inputState) {
      const log: string[] = [];
      const newInvoices = (inputState.invoices || []).map((inv) => {
        const newItems = (inv.items || []).map((item) => {
          if (item.costPrice !== undefined) return item;
          const prod = inputState.products.find((p) => p.id === item.productId);
          const costPrice = prod?.currentCost ?? 0;
          log.push(`Backfilled costPrice ₹${costPrice} for invoice item ${item.name} in invoice ${inv.invoiceNumber}`);
          return { ...item, costPrice };
        });
        return { ...inv, items: newItems };
      });
      return {
        state: { ...inputState, invoices: newInvoices },
        log,
      };
    },
  },
];

/**
 * Loads the set of already-applied migration IDs from localStorage.
 * Returns a Set so lookups are O(1).
 */
function loadAppliedMigrations(): Set<string> {
  try {
    const raw = localStorage.getItem(MIGRATION_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set<string>(parsed);
  } catch { /* ignore */ }
  return new Set();
}

/**
 * Persists the updated set of applied migration IDs to localStorage.
 */
function saveAppliedMigrations(applied: Set<string>): void {
  try {
    localStorage.setItem(MIGRATION_KEY, JSON.stringify([...applied]));
  } catch { /* ignore */ }
}

/**
 * Runs all pending migrations against `rawState` in order.
 * Applied migration IDs are read from and written back to MIGRATION_KEY.
 * Returns the (possibly repaired) state.
 */
function runMigrations(rawState: AppState): AppState {
  const applied = loadAppliedMigrations();
  let currentState = rawState;
  let anyRan = false;

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue; // already ran — skip

    try {
      const result = migration.run(currentState);
      currentState = result.state;
      applied.add(migration.id);
      anyRan = true;

      // Log to console for traceability
      console.group(`[AutoVault Migration] ${migration.id}`);
      console.info(`Description: ${migration.description}`);
      result.log.forEach((line) => console.info(line));
      console.groupEnd();
    } catch (err) {
      console.error(
        `[AutoVault Migration] FAILED: ${migration.id}`,
        err
      );
      // Do not mark as applied — allow retry on next load
    }
  }

  if (anyRan) {
    saveAppliedMigrations(applied);
  }

  return currentState;
}

/** Calculate remaining due for an invoice after applying all repayments */
function calcInvoiceDue(invoice: Invoice, payments: DebtPayment[], salesReturns: SalesReturn[]): number {
  const returnsTotal = (salesReturns || [])
    .filter((r) => r.invoiceId === invoice.id && r.status !== "Cancelled")
    .reduce((s, r) => s + r.totalRefund, 0);
  return Math.max(0, roundMoney(invoice.dueAmount - returnsTotal));
}

/** Calculate payment status given remaining due and total */
function calcPaymentStatus(due: number, total: number): PaymentStatus {
  if (due <= 0) return "Paid";
  if (due < total) return "Partial";
  return "Debt";
}

// ─────────────────────────────────────────────
//  REDUCER
// ─────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {

    // ── Products ──────────────────────────────

    case "ADD_PRODUCT": {
      const movements = [...(state.stockMovements || [])];
      if (action.product.stock > 0) {
        movements.push({
          id: generateUniqueId("sm"),
          productId: action.product.id,
          type: "Opening Stock",
          delta: action.product.stock,
          date: action.product.createdAt || new Date().toISOString(),
          desc: "Opening stock record declared at creation",
          reference: "SYSTEM-INIT",
        });
      }
      return {
        ...state,
        products: [...state.products, action.product],
        stockMovements: movements,
      };
    }

    case "UPDATE_PRODUCT":
      return {
        ...state,
        products: state.products.map((p) =>
          p.id === action.product.id ? action.product : p
        ),
      };

    case "ADJUST_STOCK": {
      const originalProd = state.products.find(p => p.id === action.productId);
      const movements = [...(state.stockMovements || [])];
      if (originalProd && action.delta !== 0) {
        movements.push({
          id: generateUniqueId("sm"),
          productId: action.productId,
          type: "Adjustment",
          delta: action.delta,
          date: new Date().toISOString(),
          desc: `Manual stock adjustment (${action.delta > 0 ? "+" : ""}${action.delta})`,
          reference: "MANUAL-ADJ",
        });
      }
      return {
        ...state,
        products: state.products.map((p) =>
          p.id === action.productId
            ? { ...p, stock: Math.max(0, p.stock + action.delta) }
            : p
        ),
        stockMovements: movements,
      };
    }

    // ── Customers ─────────────────────────────

    case "ADD_CUSTOMER":
      return { ...state, customers: [...state.customers, action.customer] };

    case "UPDATE_CUSTOMER":
      return {
        ...state,
        customers: state.customers.map((c) =>
          c.id === action.customer.id ? action.customer : c
        ),
      };

    // ── Add Invoice (full connected action) ───
    //
    // 1. Invoice stored
    // 2. Stock reduced for each sold item
    // 3. Customer debt/visits updated (or new customer created). totalSpent is derived.
    case "ADD_INVOICE": {
      const originalInv = action.invoice;
      const inv: Invoice = {
        ...originalInv,
        items: (originalInv.items || []).map((item, idx) => {
          const prod = state.products.find((p) => p.id === item.productId);
          return {
            ...item,
            id: item.id || `inv-item-${originalInv.id}-${idx}`,
            costPrice: item.costPrice ?? prod?.currentCost ?? 0,
          };
        }),
      };

      const newInvoices = [...state.invoices, inv];

      // Reduce stock for each item sold
      const newProducts = state.products.map((p) => {
        const soldItem = inv.items.find((item) => item.productId === p.id);
        if (!soldItem) return p;
        return { ...p, stock: Math.max(0, p.stock - soldItem.quantity) };
      });

      // Update or create customer
      const existingCustomer = state.customers.find(
        (c) => c.id === inv.customerId || c.phone === inv.customerPhone
      );

      let newCustomers: Customer[];

      if (existingCustomer) {
        newCustomers = state.customers.map((c) => {
          if (c.id !== existingCustomer.id) return c;
          return {
            ...c,
            debt: c.debt + inv.dueAmount,
            // totalSpent intentionally not updated here — derived via calculateRevenue() on demand
            visits: c.visits + 1,
            lastVisit: inv.date,
            invoiceIds: [...c.invoiceIds, inv.id],
            activities: [
              ...(c.activities || []),
              {
                id: `ca-${crypto.randomUUID()}`,
                type: "Invoice" as const,
                description: "Invoice Created",
                reference: inv.invoiceNumber,
                date: inv.createdAt || new Date().toISOString(),
              },
            ],
          };
        });
      } else if (inv.customer && inv.customer !== "Walk-in Customer") {
        const newCustomer: Customer = {
          id: inv.customerId ?? `c-${crypto.randomUUID()}`,
          name: inv.customer,
          phone: inv.customerPhone,
          debt: inv.dueAmount,
          // totalSpent intentionally omitted — derived via calculateRevenue() on demand
          visits: 1,
          lastVisit: inv.date,
          invoiceIds: [inv.id],
          activities: [
            {
              id: `ca-${crypto.randomUUID()}`,
              type: "Invoice" as const,
              description: "Invoice Created",
              reference: inv.invoiceNumber,
              date: inv.createdAt || new Date().toISOString(),
            },
          ],
        };
        newCustomers = [...state.customers, newCustomer];
      } else {
        newCustomers = state.customers;
      }

      // Finance entry: Income for paid portion (skip Credit — no real cash movement)
      const newInvoiceFinanceTxs = [...(state.financeTransactions || [])];
      if (inv.amountPaid > 0 && inv.paymentMethod !== "Credit") {
        newInvoiceFinanceTxs.push({
          id: `ft-${crypto.randomUUID()}`,
          accountId: methodToAccountId(inv.paymentMethod),
          type: "Income",
          category: "Sale" as const,
          referenceId: inv.id,
          customerId: inv.customerId ?? undefined,
          amount: inv.amountPaid,
          date: inv.createdAt || inv.date + "T12:00:00.000Z",
          method: inv.paymentMethod,
          notes: `Invoice ${inv.invoiceNumber}`,
        });
      }

      return {
        ...state,
        invoices: newInvoices,
        products: newProducts,
        customers: newCustomers,
        financeTransactions: newInvoiceFinanceTxs,
      };
    }

    // ── Record Debt Payment ────────────────────
    //
    // 1. DebtPayment record added to ledger
    // 2. Target invoice: amountPaid increases, dueAmount decreases, paymentStatus updated
    // 3. Customer.debt cache recalculated from all open invoice dues
    case "RECORD_DEBT_PAYMENT": {
      const payment = action.payment;

      // Add to ledger
      const newPayments = [...(state.debtPayments ?? []), payment];

      // Update the target invoice
      const newInvoices = state.invoices.map((inv) => {
        if (inv.id !== payment.invoiceId) return inv;

        // Cap payment at current due
        const currentDue = calcInvoiceDue(inv, state.debtPayments ?? [], state.salesReturns ?? []);
        const actualAmount = Math.min(payment.amount, currentDue);
        const newAmountPaid = inv.amountPaid + actualAmount;
        const newDueAmount = Math.max(0, inv.dueAmount - actualAmount);
        const newStatus = calcPaymentStatus(newDueAmount, inv.total);

        return {
          ...inv,
          amountPaid: newAmountPaid,
          dueAmount: newDueAmount,
          paymentStatus: newStatus,
        };
      });

      // Recalculate customer debt from all their invoice dues
      const newCustomers = state.customers.map((c) => {
        if (c.id !== payment.customerId) return c;
        const customerInvoices = newInvoices.filter(
          (inv) => inv.customerId === c.id && !inv.voided
        );
        const totalDue = customerInvoices.reduce((s, inv) => {
          const returnsTotal = (state.salesReturns || [])
            .filter((r) => r.invoiceId === inv.id && r.status !== "Cancelled")
            .reduce((sum, r) => sum + r.totalRefund, 0);
          return s + Math.max(0, roundMoney(inv.dueAmount - returnsTotal));
        }, 0);
        const invoice = state.invoices.find((i) => i.id === payment.invoiceId);
        return {
          ...c,
          debt: roundMoney(totalDue),
          activities: [
            ...(c.activities || []),
            {
              id: `ca-${crypto.randomUUID()}`,
              type: "Repayment" as const,
              description: "Debt Repayment",
              reference: invoice?.invoiceNumber || "",
              date: payment.date,
            },
          ],
        };
      });

      // Finance entry: Income for customer debt repayment
      const debtFinanceTxs = [...(state.financeTransactions || [])];
      debtFinanceTxs.push({
        id: `ft-${crypto.randomUUID()}`,
        accountId: methodToAccountId(payment.method),
        type: "Income",
        category: "Customer Payment" as const,
        referenceId: payment.invoiceId,
        customerId: payment.customerId,
        amount: payment.amount,
        date: new Date().toISOString(),
        method: payment.method,
        notes: payment.note || "Customer debt repayment",
      });

      return {
        ...state,
        debtPayments: newPayments,
        invoices: newInvoices,
        customers: newCustomers,
        financeTransactions: debtFinanceTxs,
      };
    }

    // ── Atomic Lump-Sum FIFO Debt Repayment ─────────────────────────────────
    case "RECORD_CUSTOMER_DEBT_PAYMENT_FIFO": {
      const { customerId, totalAmount, method, date, note, collectedBy } = action;
      const roundedTotal = roundMoney(totalAmount);
      if (roundedTotal <= 0) return state;

      // 1. Retrieve all open unpaid invoices for this customer
      // Authoritative FIFO ordering: createdAt ISO timestamp, falling back to invoice date
      const customerInvoices = state.invoices.filter(
        (inv) => inv.customerId === customerId && !inv.voided && inv.dueAmount > 0
      ).sort((a, b) => {
        const timeA = new Date(a.createdAt || a.date).getTime();
        const timeB = new Date(b.createdAt || b.date).getTime();
        return timeA - timeB;
      });

      let remaining = roundedTotal;
      const createdPayments: DebtPayment[] = [];
      const invoiceUpdates: Record<string, { newAmountPaid: number; newDueAmount: number; newStatus: PaymentStatus }> = {};
      const newFinanceTxs = [...(state.financeTransactions || [])];

      for (const inv of customerInvoices) {
        if (remaining <= 0) break;

        // Subtract active returns for effective outstanding
        const returnsTotal = (state.salesReturns || [])
          .filter((r) => r.invoiceId === inv.id && r.status !== "Cancelled")
          .reduce((s, r) => s + r.totalRefund, 0);
        const effectiveDue = Math.max(0, roundMoney(inv.dueAmount - returnsTotal));
        if (effectiveDue <= 0) continue;

        const alloc = Math.min(remaining, effectiveDue);
        if (alloc <= 0) continue;

        const newPayment: DebtPayment = {
          id: `dp-${crypto.randomUUID()}`,
          customerId,
          invoiceId: inv.id,
          amount: alloc,
          date,
          method,
          note: note ? `FIFO Payment for ${inv.invoiceNumber} — ${note}` : `FIFO Payment for ${inv.invoiceNumber}`,
          collectedBy: collectedBy || "Owner",
        };
        createdPayments.push(newPayment);

        const currentPaid = inv.amountPaid;
        const currentDue = inv.dueAmount;
        const newAmountPaid = currentPaid + alloc;
        const newDueAmount = Math.max(0, currentDue - alloc);
        const newStatus = calcPaymentStatus(newDueAmount, inv.total);

        invoiceUpdates[inv.id] = {
          newAmountPaid,
          newDueAmount,
          newStatus,
        };

        // Finance entry for allocated payment amount only
        newFinanceTxs.push({
          id: `ft-${crypto.randomUUID()}`,
          accountId: methodToAccountId(method),
          type: "Income",
          category: "Customer Payment",
          referenceId: inv.id,
          customerId,
          amount: alloc,
          date: new Date().toISOString(),
          method,
          notes: note ? `FIFO Payment for ${inv.invoiceNumber} — ${note}` : `FIFO Payment for ${inv.invoiceNumber}`,
        });

        remaining = roundMoney(remaining - alloc);
      }

      if (createdPayments.length === 0) return state;

      // Update invoices in state
      const updatedInvoices = state.invoices.map((inv) => {
        const update = invoiceUpdates[inv.id];
        if (!update) return inv;
        return {
          ...inv,
          amountPaid: update.newAmountPaid,
          dueAmount: update.newDueAmount,
          paymentStatus: update.newStatus,
        };
      });

      // Recalculate customer debt
      const updatedCustomers = state.customers.map((c) => {
        if (c.id !== customerId) return c;
        const remainingInvoices = updatedInvoices.filter(
          (inv) => inv.customerId === c.id && !inv.voided
        );
        const totalDue = remainingInvoices.reduce((s, inv) => {
          const returnsTotal = (state.salesReturns || [])
            .filter((r) => r.invoiceId === inv.id && r.status !== "Cancelled")
            .reduce((sum, r) => sum + r.totalRefund, 0);
          return s + Math.max(0, roundMoney(inv.dueAmount - returnsTotal));
        }, 0);
        const allocatedTotal = roundMoney(roundedTotal - remaining);
        return {
          ...c,
          debt: roundMoney(totalDue),
          activities: [
            ...(c.activities || []),
            {
              id: `ca-${crypto.randomUUID()}`,
              type: "Repayment" as const,
              description: `Lump-Sum Debt Repayment (${createdPayments.length} inv)`,
              reference: `₹${allocatedTotal.toLocaleString()} FIFO`,
              date,
            },
          ],
        };
      });

      return {
        ...state,
        invoices: updatedInvoices,
        debtPayments: [...(state.debtPayments || []), ...createdPayments],
        customers: updatedCustomers,
        financeTransactions: newFinanceTxs,
      };
    }

    // ── Void Debt Payment (Void a single repayment) ────────────────────────
    //
    // Reverses ONE repayment without touching the invoice void status.
    // Appends void metadata to the DebtPayment — never deletes or overwrites.
    // Recalculates invoice amountPaid / dueAmount / paymentStatus from active payments only.
    // Recalculates customer.debt from all non-voided invoice dues.
    // Appends a reversing Finance Expense (category: Payment Void).
    // Stock is NEVER touched.
    case "VOID_DEBT_PAYMENT": {
      const { paymentId, reason, voidedBy } = action;
      const voidedAt = new Date().toISOString();

      // Find the payment — return unchanged if already voided (idempotency guard)
      const targetPayment = (state.debtPayments ?? []).find((p) => p.id === paymentId);
      if (!targetPayment || targetPayment.voided) return state;

      // Find the linked invoice — return unchanged if invoice itself is voided
      const targetInvoice = state.invoices.find((i) => i.id === targetPayment.invoiceId);
      if (!targetInvoice || targetInvoice.voided) return state;

      // 1. Mark payment as voided — immutable append only, never overwrite other fields
      const voidedPayments = (state.debtPayments ?? []).map((p) => {
        if (p.id !== paymentId) return p;
        return { ...p, voided: true, voidedAt, voidReason: reason, voidedBy };
      });

      // 2. Recalculate invoice totals using ONLY active (non-voided) payments
      const activePaymentsForInvoice = voidedPayments.filter(
        (p) => p.invoiceId === targetInvoice.id && !p.voided
      );
      const totalActiveRepaid = activePaymentsForInvoice.reduce((s, p) => s + p.amount, 0);

      // amountPaid = initial POS payment + all active repayments
      // Initial POS payment = invoice total - original dueAmount at creation.
      // We recover the initial payment as: current amountPaid - previous repayment total (before void).
      const previousActivePayments = (state.debtPayments ?? []).filter(
        (p) => p.invoiceId === targetInvoice.id && !p.voided
      );
      const prevTotalRepaid = previousActivePayments.reduce((s, p) => s + p.amount, 0);
      const initialPOSPayment = roundMoney(targetInvoice.amountPaid - prevTotalRepaid);
      const newAmountPaid = roundMoney(Math.max(0, initialPOSPayment + totalActiveRepaid));
      const newDueAmount = roundMoney(Math.max(0, targetInvoice.total - newAmountPaid));
      const newPaymentStatus = calcPaymentStatus(newDueAmount, targetInvoice.total);

      const newInvoices = state.invoices.map((inv) => {
        if (inv.id !== targetInvoice.id) return inv;
        return {
          ...inv,
          amountPaid: newAmountPaid,
          dueAmount: newDueAmount,
          paymentStatus: newPaymentStatus,
        };
      });

      // 3. Recalculate customer.debt from all non-voided invoice dues + append activity
      const newCustomers = state.customers.map((c) => {
        if (c.id !== targetPayment.customerId) return c;
        const customerInvoices = newInvoices.filter(
          (inv) => inv.customerId === c.id && !inv.voided
        );
        const totalDue = customerInvoices.reduce((s, inv) => {
          const returnsTotal = (state.salesReturns || [])
            .filter((r) => r.invoiceId === inv.id && r.status !== "Cancelled")
            .reduce((sum, r) => sum + r.totalRefund, 0);
          return s + Math.max(0, roundMoney(inv.dueAmount - returnsTotal));
        }, 0);
        return {
          ...c,
          debt: roundMoney(totalDue),
          activities: [
            ...(c.activities || []),
            {
              id: `ca-${crypto.randomUUID()}`,
              type: "Void" as const,
              description: `Payment Voided — ${reason}`,
              reference: targetInvoice.invoiceNumber,
              date: voidedAt,
            },
          ],
        };
      });

      // 4. Append reversing Finance Expense — only if real money changed hands (not Credit)
      const newFinanceTxs = [...(state.financeTransactions ?? [])];
      if (targetPayment.method !== "Credit") {
        newFinanceTxs.push({
          id: `ft-${crypto.randomUUID()}`,
          accountId: methodToAccountId(targetPayment.method),
          type: "Expense" as const,
          category: "Payment Void" as const,
          referenceId: targetPayment.invoiceId,
          customerId: targetPayment.customerId,
          amount: targetPayment.amount,
          date: voidedAt,
          method: targetPayment.method,
          notes: `Payment Voided — ${reason}`,
        });
      }

      return {
        ...state,
        debtPayments: voidedPayments,
        invoices: newInvoices,
        customers: newCustomers,
        financeTransactions: newFinanceTxs,
      };
    }

    case "VOID_INVOICE": {
      const { invoiceId, reason, voidedBy } = action;
      const invoice = state.invoices.find((i) => i.id === invoiceId);
      if (!invoice || invoice.voided) return state; // Stock restore safety & already voided guard

      const voidedAt = new Date().toISOString();

      // 1. Mark invoice as voided
      const newInvoices = state.invoices.map((inv) => {
        if (inv.id !== invoiceId) return inv;
        return {
          ...inv,
          voided: true,
          voidReason: reason,
          voidedAt,
          voidedBy,
        };
      });

      // 2. Restore stock levels (only unreturned quantities)
      const newProducts = state.products.map((p) => {
        const item = invoice.items.find((it) => it.productId === p.id);
        if (!item) return p;
        const unreturnedQty = Math.max(0, item.quantity - (item.returnedQuantity || 0));
        if (unreturnedQty === 0) return p;
        return {
          ...p,
          stock: p.stock + unreturnedQty,
        };
      });

      // 3. Append stock movements (only if unreturnedQty > 0)
      const movements = [...(state.stockMovements || [])];
      invoice.items.forEach((item) => {
        const unreturnedQty = Math.max(0, item.quantity - (item.returnedQuantity || 0));
        if (unreturnedQty > 0) {
          movements.push({
            id: generateUniqueId("sm"),
            productId: item.productId,
            type: "Adjustment" as const,
            delta: unreturnedQty,
            date: voidedAt,
            desc: "Invoice Voided",
            reference: invoice.invoiceNumber,
          });
        }
      });

      const newCustomers = state.customers.map((c) => {
        if (c.id !== invoice.customerId) return c;
        const customerInvoices = newInvoices.filter(
          (inv) => inv.customerId === c.id && !inv.voided
        );
        const totalDue = customerInvoices.reduce((s, inv) => {
          const returnsTotal = (state.salesReturns || [])
            .filter((r) => r.invoiceId === inv.id && r.status !== "Cancelled")
            .reduce((sum, r) => sum + r.totalRefund, 0);
          return s + Math.max(0, roundMoney(inv.dueAmount - returnsTotal));
        }, 0);
        return {
          ...c,
          debt: roundMoney(totalDue),
          // totalSpent intentionally not updated here — derived via calculateRevenue() on demand
          activities: [
            ...(c.activities || []),
            {
              id: `ca-${crypto.randomUUID()}`,
              type: "Void" as const,
              description: "Invoice Voided",
              reference: invoice.invoiceNumber,
              date: voidedAt,
            },
          ],
        };
      });

      // 5. Append reversing finance transaction (only for amount actually paid)
      const newFinanceTransactions = [...(state.financeTransactions || [])];
      if (invoice.amountPaid > 0 && invoice.paymentMethod !== "Credit") {
        newFinanceTransactions.push({
          id: `ft-${crypto.randomUUID()}`,
          accountId: methodToAccountId(invoice.paymentMethod),
          type: "Expense" as const,
          category: "Invoice Void" as const,
          referenceId: invoice.id,
          customerId: invoice.customerId ?? undefined,
          amount: invoice.amountPaid,
          date: voidedAt,
          method: invoice.paymentMethod,
          notes: "Invoice Voided",
        });
      }

      return {
        ...state,
        invoices: newInvoices,
        products: newProducts,
        stockMovements: movements,
        customers: newCustomers,
        financeTransactions: newFinanceTransactions,
      };
    }

    case "RESET_STORE":
      return INITIAL_STATE;

    case "HYDRATE_STORE": {
      const products = (action.state.products || []).map((p) => {
        const legacyP = p as any;
        return {
          ...p,
          status: p.status || "Active",
          currentCost: p.currentCost ?? legacyP.buyPrice ?? 0,
        };
      });
      const purchases = (action.state.purchases || []).map((pur) => {
        const totalAmount = pur.totalAmount ?? (pur.quantity * pur.buyPrice);
        const amountPaid = pur.amountPaid ?? (pur.paymentStatus === "Paid" ? totalAmount : 0);
        const dueAmount = pur.dueAmount ?? (totalAmount - amountPaid);
        const paymentStatus = pur.paymentStatus ?? (dueAmount === 0 ? "Paid" : (amountPaid > 0 ? "Partial" : "Credit"));
        return {
          ...pur,
          totalAmount,
          amountPaid,
          dueAmount,
          paymentStatus,
          returnedQuantity: pur.returnedQuantity ?? 0,
        };
      });
      const invoices = (action.state.invoices || []).map((inv: Invoice) => {
        return {
          ...inv,
          voided: inv.voided ?? false,
          items: (inv.items || []).map((item, idx) => {
            const prod = products.find((p) => p.id === item.productId);
            return {
              ...item,
              id: item.id || `inv-item-${inv.id}-${idx}`,
              costPrice: item.costPrice ?? prod?.currentCost ?? 0,
            };
          }),
        };
      });
      return {
        ...action.state,
        products,
        purchases,
        invoices,
        debtPayments: action.state.debtPayments ?? [],
        suppliers: action.state.suppliers ?? [],
        stockMovements: action.state.stockMovements ?? [],
        supplierPayments: action.state.supplierPayments ?? [],
        financeAccounts: action.state.financeAccounts?.length
          ? action.state.financeAccounts
          : DEFAULT_FINANCE_ACCOUNTS,
        financeTransactions: action.state.financeTransactions ?? [],
        purchaseReturns: action.state.purchaseReturns ?? [],
        holdBills: action.state.holdBills ?? [],
        holdBillsCounter: action.state.holdBillsCounter ?? 0,
        purchaseOrders: (action.state.purchaseOrders || []).map((po: any) => {
          const status: PurchaseOrderStatus =
            po.status === "Partially Received" ? "Partially Delivered" : po.status;
          const activityLog = po.activityLog || [
            {
              id: `poa-${crypto.randomUUID()}`,
              type: "Created" as const,
              date: po.createdAt || new Date().toISOString(),
              notes: "Purchase Order created",
            },
          ];
          return {
            ...po,
            status,
            activityLog,
          };
        }),
        purchaseOrderCounter: action.state.purchaseOrderCounter ?? 0,
        salesReturns: action.state.salesReturns ?? [],
        salesReturnCounter: action.state.salesReturnCounter ?? 0,
      };
    }

    case "ADD_SUPPLIER":
      return {
        ...state,
        suppliers: [...(state.suppliers || []), action.supplier],
      };

    case "UPDATE_SUPPLIER":
      return {
        ...state,
        suppliers: (state.suppliers || []).map((s) =>
          s.id === action.supplier.id ? action.supplier : s
        ),
      };

    case "ADD_PURCHASE": {
      const { purchase, paymentMethod } = action;
      const newPurchases = [...(state.purchases || []), purchase];

      // Update product: increase stock and update currentCost
      const newProducts = state.products.map((p) => {
        if (p.id !== purchase.productId) return p;
        return {
          ...p,
          stock: p.stock + purchase.quantity,
          currentCost: purchase.buyPrice,
        };
      });

      // Create Stock Movement
      const supplierName = state.suppliers?.find((s) => s.id === purchase.supplierId)?.name || "Supplier";
      const movement: StockMovement = {
        id: generateUniqueId("sm"),
        productId: purchase.productId,
        type: "Purchase",
        delta: purchase.quantity,
        date: purchase.date + "T12:00:00.000Z",
        desc: `Purchased from ${supplierName}`,
        reference: purchase.invoiceNumber || purchase.id,
      };

      const newStockMovements = [...(state.stockMovements || []), movement];

      // Upfront payment and finance entry
      const newPayments = [...(state.supplierPayments || [])];
      const newFinanceTransactions = [...(state.financeTransactions || [])];

      if (purchase.amountPaid > 0 && (paymentMethod || "Cash") !== "Credit") {
        const method = paymentMethod || "Cash";
        // Log upfront supplier payment
        newPayments.push({
          id: `sp-${crypto.randomUUID()}`,
          supplierId: purchase.supplierId,
          purchaseId: purchase.id,
          amount: purchase.amountPaid,
          date: purchase.date + "T12:00:00.000Z",
          method,
          note: "Upfront payment",
          paidBy: "Owner",
          isUpfront: true,
        });

        // Log upfront finance entry
        newFinanceTransactions.push({
          id: `ft-${crypto.randomUUID()}`,
          accountId: methodToAccountId(method),
          type: "Expense",
          category: "Inventory Purchase" as const,
          referenceId: purchase.id,
          supplierId: purchase.supplierId,
          amount: purchase.amountPaid,
          date: purchase.date + "T12:00:00.000Z",
          method,
          notes: purchase.notes || "Initial purchase payment",
        });
      }

      let newPurchaseOrders = state.purchaseOrders || [];
      if (purchase.purchaseOrderId) {
        newPurchaseOrders = (state.purchaseOrders || []).map((po) => {
          if (po.id !== purchase.purchaseOrderId) return po;
          const updatedItems = po.items.map((item) => {
            if (item.productId !== purchase.productId) return item;
            return {
              ...item,
              receivedQuantity: item.receivedQuantity + purchase.quantity,
            };
          });
          
          const productName = state.products.find((p) => p.id === purchase.productId)?.name || "Unknown Product";
          const deliveryActivity: POActivityLog = {
            id: `poa-${crypto.randomUUID()}`,
            type: "Delivery" as const,
            date: new Date().toISOString(),
            notes: `Delivered ${purchase.quantity} units of ${productName}`,
          };
          
          const newActivities = [...(po.activityLog || []), deliveryActivity];
          
          const isAllCompleted = updatedItems.every((item) => item.receivedQuantity >= item.quantity);
          const newStatus: PurchaseOrderStatus = isAllCompleted ? "Completed" : "Partially Delivered";
          
          if (isAllCompleted) {
            newActivities.push({
              id: `poa-${crypto.randomUUID()}`,
              type: "Completed" as const,
              date: new Date().toISOString(),
              notes: "Purchase Order fully completed",
            });
          }

          return {
            ...po,
            items: updatedItems,
            status: newStatus,
            activityLog: newActivities,
            updatedAt: new Date().toISOString(),
          };
        });
      }

      return {
        ...state,
        purchases: newPurchases,
        products: newProducts,
        stockMovements: newStockMovements,
        supplierPayments: newPayments,
        financeTransactions: newFinanceTransactions,
        purchaseOrders: newPurchaseOrders,
      };
    }

    case "UPDATE_PURCHASE": {
      const { purchaseId, invoiceNumber, date, notes } = action;
      
      // Update purchase fields
      const newPurchases = (state.purchases || []).map((p) =>
        p.id === purchaseId
          ? { ...p, invoiceNumber, date, notes }
          : p
      );

      // Sync upfront payment date if any
      const newPayments = (state.supplierPayments || []).map((sp) =>
        sp.purchaseId === purchaseId && sp.isUpfront
          ? { ...sp, date: date + "T12:00:00.000Z" }
          : sp
      );

      // Sync upfront finance transaction date if any
      const newFinanceTransactions = (state.financeTransactions || []).map((ft) =>
        ft.referenceId === purchaseId && ft.category === "Inventory Purchase"
          ? { ...ft, date: date + "T12:00:00.000Z" }
          : ft
      );

      return {
        ...state,
        purchases: newPurchases,
        supplierPayments: newPayments,
        financeTransactions: newFinanceTransactions,
      };
    }

    case "RECORD_SUPPLIER_PAYMENT": {
      const payment = action.payment;
      const newPayments = [...(state.supplierPayments || []), payment];

      // Finance entry — skip if Credit (no real cash movement)
      const newFinanceTransactions = [...(state.financeTransactions || [])];
      if (payment.method !== "Credit") {
        newFinanceTransactions.push({
          id: `ft-${crypto.randomUUID()}`,
          accountId: methodToAccountId(payment.method),
          type: "Expense",
          category: "Supplier Payment" as const,
          referenceId: payment.purchaseId,
          supplierId: payment.supplierId,
          amount: payment.amount,
          date: payment.date,
          method: payment.method,
          notes: payment.note || "Supplier repayment",
        });
      }

      const newPurchases = (state.purchases || []).map((pur) => {
        if (pur.id !== payment.purchaseId) return pur;
        const actualAmount = Math.min(payment.amount, pur.dueAmount);
        const newAmountPaid = roundMoney(pur.amountPaid + actualAmount);
        const newDueAmount = Math.max(0, roundMoney(pur.dueAmount - actualAmount));
        const newStatus = (newDueAmount <= 0 ? "Paid" : (newAmountPaid > 0 ? "Partial" : "Credit")) as "Paid" | "Partial" | "Credit";
        return {
          ...pur,
          amountPaid: newAmountPaid,
          dueAmount: newDueAmount,
          paymentStatus: newStatus,
        };
      });
      return {
        ...state,
        supplierPayments: newPayments,
        purchases: newPurchases,
        financeTransactions: newFinanceTransactions,
      };
    }

    // ── Atomic Lump-Sum Supplier Payment (FIFO) ───────────────────────────────
    case "RECORD_SUPPLIER_PAYMENT_FIFO": {
      const { supplierId, totalAmount, method, date, note, paidBy = "Owner" } = action;
      const roundedTotal = roundMoney(totalAmount);
      if (roundedTotal <= 0) return state;

      // Helper to compute canonical return-aware effective due for a purchase (Bug #4 integrity)
      const getEffectiveDue = (pur: Purchase): number => {
        const total = pur.totalAmount ?? (pur.buyPrice * pur.quantity);
        const returns = (state.purchaseReturns || []).filter((r) => r.purchaseId === pur.id);
        const returnedValue = returns.reduce((s, r) => s + r.totalAmount, 0);
        const payments = (state.supplierPayments || []).filter((sp) => sp.purchaseId === pur.id);
        const paid = payments.reduce((s, pay) => s + pay.amount, 0);
        return Math.max(0, roundMoney(total - returnedValue - paid));
      };

      // 1. Find all open unpaid purchases for this supplier with effective due > 0
      // Authoritative FIFO ordering: createdAt ISO timestamp, falling back to purchase date
      const openPurchases = (state.purchases || [])
        .filter((pur) => pur.supplierId === supplierId && getEffectiveDue(pur) > 0)
        .sort((a, b) => {
          const timeA = new Date(a.createdAt || a.date).getTime();
          const timeB = new Date(b.createdAt || b.date).getTime();
          return timeA - timeB;
        });

      let remaining = roundedTotal;
      const createdPayments: SupplierPayment[] = [];
      const purchaseUpdates: Record<string, { newAmountPaid: number; newDueAmount: number; newStatus: "Paid" | "Partial" | "Credit" }> = {};
      const newFinanceTxs = [...(state.financeTransactions || [])];
      const txDate = date ? (new Date(date).toISOString()) : new Date().toISOString();

      for (const pur of openPurchases) {
        if (remaining <= 0) break;
        const due = getEffectiveDue(pur);
        if (due <= 0) continue;

        const alloc = Math.min(remaining, due);
        if (alloc <= 0) continue;

        const newPayment: SupplierPayment = {
          id: `sp-${crypto.randomUUID()}`,
          supplierId,
          purchaseId: pur.id,
          amount: alloc,
          date: date || new Date().toISOString(),
          method,
          note: note ? `FIFO Payment for ${pur.invoiceNumber} — ${note}` : `FIFO Payment for ${pur.invoiceNumber}`,
          paidBy,
        };
        createdPayments.push(newPayment);

        const currentPaid = (state.supplierPayments || [])
          .filter((sp) => sp.purchaseId === pur.id)
          .reduce((sum, sp) => sum + sp.amount, 0);
        const newAmountPaid = roundMoney(currentPaid + alloc);
        const newDueAmount = Math.max(0, roundMoney(due - alloc));
        const newStatus = (newDueAmount <= 0 ? "Paid" : (newAmountPaid > 0 ? "Partial" : "Credit")) as "Paid" | "Partial" | "Credit";

        purchaseUpdates[pur.id] = {
          newAmountPaid,
          newDueAmount,
          newStatus,
        };

        // Finance entry (Expense) for allocated payment amount only (skip Credit method)
        if (method !== "Credit") {
          newFinanceTxs.push({
            id: `ft-${crypto.randomUUID()}`,
            accountId: methodToAccountId(method),
            type: "Expense",
            category: "Supplier Payment",
            referenceId: pur.id,
            supplierId,
            amount: alloc,
            date: txDate,
            method,
            notes: note ? `FIFO Payment for ${pur.invoiceNumber} — ${note}` : `FIFO Payment for ${pur.invoiceNumber}`,
          });
        }

        remaining = roundMoney(remaining - alloc);
      }

      if (createdPayments.length === 0) return state;

      const updatedPurchases = (state.purchases || []).map((pur) => {
        const update = purchaseUpdates[pur.id];
        if (!update) return pur;
        return {
          ...pur,
          amountPaid: update.newAmountPaid,
          dueAmount: update.newDueAmount,
          paymentStatus: update.newStatus,
        };
      });

      return {
        ...state,
        supplierPayments: [...(state.supplierPayments || []), ...createdPayments],
        purchases: updatedPurchases,
        financeTransactions: newFinanceTxs,
      };
    }

    case "ADD_PURCHASE_RETURN": {
      const { returnRecord, refundMethod } = action;

      // Find purchase — bail if not found
      const origPurchase = (state.purchases || []).find((p) => p.id === returnRecord.purchaseId);
      if (!origPurchase) return state;

      // Guard: returnedQuantity cannot exceed available quantity
      const alreadyReturned = origPurchase.returnedQuantity ?? 0;
      const availableQty = origPurchase.quantity - alreadyReturned;
      if (returnRecord.quantity <= 0 || returnRecord.quantity > availableQty) return state;

      // Guard: stock in hand must be sufficient (cannot return what was sold)
      const product = (state.products || []).find((p) => p.id === origPurchase.productId);
      if (!product || returnRecord.quantity > product.stock) return state;

      // 1. Update purchase: increment returnedQuantity and update dueAmount & paymentStatus
      const returnedTotal = roundMoney(returnRecord.quantity * origPurchase.buyPrice);
      const refund = Math.min(returnRecord.refundAmount, returnedTotal); // clamp refund
      const newPurchases = (state.purchases || []).map((p) => {
        if (p.id !== origPurchase.id) return p;
        const newReturnedQty = (p.returnedQuantity ?? 0) + returnRecord.quantity;
        const totalP = p.totalAmount ?? (p.buyPrice * p.quantity);
        const returnsForP = [...(state.purchaseReturns || []), returnRecord].filter((r) => r.purchaseId === p.id);
        const returnedValue = returnsForP.reduce((s, r) => s + r.totalAmount, 0);
        const paymentsForP = (state.supplierPayments || []).filter((sp) => sp.purchaseId === p.id);
        const paidForP = paymentsForP.reduce((s, pay) => s + pay.amount, 0);
        const newDueAmount = Math.max(0, roundMoney(totalP - returnedValue - paidForP));
        const newStatus = (newDueAmount <= 0 ? "Paid" : (paidForP > 0 ? "Partial" : "Credit")) as "Paid" | "Partial" | "Credit";
        return {
          ...p,
          returnedQuantity: newReturnedQty,
          dueAmount: newDueAmount,
          paymentStatus: newStatus,
        };
      });

      // 2. Decrease product stock
      const newProducts = (state.products || []).map((prod) => {
        if (prod.id !== origPurchase.productId) return prod;
        return { ...prod, stock: Math.max(0, prod.stock - returnRecord.quantity) };
      });

      // 3. Stock Movement (type: "Purchase Return", negative delta)
      const supplierName = (state.suppliers || []).find((s) => s.id === origPurchase.supplierId)?.name || "Supplier";
      const movement: StockMovement = {
        id: generateUniqueId("sm"),
        productId: origPurchase.productId,
        type: "Purchase Return" as const,
        delta: -returnRecord.quantity,
        date: returnRecord.createdAt,
        desc: `Returned to ${supplierName}. Reason: ${returnRecord.reason}`,
        reference: returnRecord.id,
      };

      // 4. Finance — Income (refund received), positive amount, skip if Adjustment
      const newFinanceTransactions = [...(state.financeTransactions || [])];
      if (refundMethod !== "Adjustment" && refund > 0) {
        const accountId = methodToAccountId(refundMethod as PaymentMethod);
        newFinanceTransactions.push({
          id: `ft-${crypto.randomUUID()}`,
          accountId,
          type: "Income" as const,
          category: "Purchase Return" as const,
          referenceId: returnRecord.id,
          supplierId: origPurchase.supplierId,
          amount: refund,
          date: returnRecord.createdAt,
          method: refundMethod as PaymentMethod,
          notes: `Refund — return from invoice ${origPurchase.invoiceNumber || origPurchase.id}. Reason: ${returnRecord.reason}`,
        });
      }

      // 5. Append immutable PurchaseReturn record
      return {
        ...state,
        purchases: newPurchases,
        products: newProducts,
        stockMovements: [...(state.stockMovements || []), movement],
        financeTransactions: newFinanceTransactions,
        purchaseReturns: [...(state.purchaseReturns || []), returnRecord],
      };
    }

    case "RECONCILE_DEBT_CACHE": {
      const newCustomers = state.customers.map((c) => {
        const customerInvoices = state.invoices.filter(
          (inv) => inv.customerId === c.id && !inv.voided
        );
        const totalDue = customerInvoices.reduce((s, inv) => {
          const returnsTotal = (state.salesReturns || [])
            .filter((r) => r.invoiceId === inv.id && r.status !== "Cancelled")
            .reduce((sum, r) => sum + r.totalRefund, 0);
          return s + Math.max(0, roundMoney(inv.dueAmount - returnsTotal));
        }, 0);
        const totalSpent = calculateRevenue(state.invoices, state.salesReturns, undefined, c.id);
        return {
          ...c,
          debt: roundMoney(totalDue),
          totalSpent: roundMoney(totalSpent),
        };
      });
      return {
        ...state,
        customers: newCustomers,
      };
    }

    // ── Purchase Order Reducers (Sprint 4.6) ─────────────────────────────────
    case "CREATE_PURCHASE_ORDER": {
      const nextCounter = (state.purchaseOrderCounter || 0) + 1;
      const poNumber = `PO-2026-${String(nextCounter).padStart(5, "0")}`;
      const now = new Date().toISOString();
      const newPo: PurchaseOrder = {
        ...action.po,
        id: generateUniqueId("po"),
        poNumber,
        createdAt: now,
        updatedAt: now,
        status: action.po.status || "Draft",
        items: action.po.items.map((item) => ({
          ...item,
          id: item.id || `poi-${crypto.randomUUID()}`,
          receivedQuantity: 0,
        })),
        activityLog: [
          {
            id: `poa-${crypto.randomUUID()}`,
            type: "Created" as const,
            date: now,
            notes: "Purchase Order created",
          },
        ],
      };
      return {
        ...state,
        purchaseOrders: [...(state.purchaseOrders || []), newPo],
        purchaseOrderCounter: nextCounter,
      };
    }

    case "UPDATE_PURCHASE_ORDER": {
      const { poId, expectedDeliveryDate, notes, items, status } = action;
      const newPurchaseOrders = (state.purchaseOrders || []).map((po) => {
        if (po.id !== poId) return po;
        return {
          ...po,
          expectedDeliveryDate,
          notes,
          items: items.map((item) => ({
            ...item,
            id: item.id || `poi-${crypto.randomUUID()}`,
            receivedQuantity: item.receivedQuantity ?? 0,
          })),
          status,
          activityLog: [
            ...(po.activityLog || []),
            {
              id: `poa-${crypto.randomUUID()}`,
              type: "Edited" as const,
              date: new Date().toISOString(),
              notes: "Purchase Order details updated",
            },
          ],
          updatedAt: new Date().toISOString(),
        };
      });
      return {
        ...state,
        purchaseOrders: newPurchaseOrders,
      };
    }

    case "DELETE_PURCHASE_ORDER": {
      const targetPO = (state.purchaseOrders || []).find((po) => po.id === action.poId);
      if (!targetPO || targetPO.status !== "Draft") {
        return state;
      }
      return {
        ...state,
        purchaseOrders: (state.purchaseOrders || []).filter((po) => po.id !== action.poId),
      };
    }

    case "MARK_PURCHASE_ORDER_SENT": {
      return {
        ...state,
        purchaseOrders: (state.purchaseOrders || []).map((po) =>
          po.id === action.poId
            ? {
                ...po,
                status: "Sent" as const,
                activityLog: [
                  ...(po.activityLog || []),
                  {
                    id: `poa-${crypto.randomUUID()}`,
                    type: "Sent" as const,
                    date: new Date().toISOString(),
                    notes: "Purchase Order marked as Sent",
                  },
                ],
                updatedAt: new Date().toISOString(),
              }
            : po
        ),
      };
    }

    case "MARK_PURCHASE_ORDER_CANCELLED": {
      return {
        ...state,
        purchaseOrders: (state.purchaseOrders || []).map((po) =>
          po.id === action.poId
            ? {
                ...po,
                status: "Cancelled" as const,
                activityLog: [
                  ...(po.activityLog || []),
                  {
                    id: `poa-${crypto.randomUUID()}`,
                    type: "Cancelled" as const,
                    date: new Date().toISOString(),
                    notes: "Purchase Order cancelled",
                  },
                ],
                updatedAt: new Date().toISOString(),
              }
            : po
        ),
      };
    }

    case "COMPLETE_PURCHASE_ORDER": {
      return {
        ...state,
        purchaseOrders: (state.purchaseOrders || []).map((po) =>
          po.id === action.poId
            ? {
                ...po,
                status: "Completed" as const,
                activityLog: [
                  ...(po.activityLog || []),
                  {
                    id: `poa-${crypto.randomUUID()}`,
                    type: "Completed" as const,
                    date: new Date().toISOString(),
                    notes: "Purchase Order manually marked as Completed",
                  },
                ],
                updatedAt: new Date().toISOString(),
              }
            : po
        ),
      };
    }

    case "CONFIRM_PURCHASE_ORDER": {
      return {
        ...state,
        purchaseOrders: (state.purchaseOrders || []).map((po) =>
          po.id === action.poId
            ? {
                ...po,
                status: "Supplier Confirmed" as const,
                activityLog: [
                  ...(po.activityLog || []),
                  {
                    id: `poa-${crypto.randomUUID()}`,
                    type: "Confirmed" as const,
                    date: new Date().toISOString(),
                    notes: "Supplier confirmed purchase order",
                  },
                ],
                updatedAt: new Date().toISOString(),
              }
            : po
        ),
      };
    }

    case "RECORD_PO_ACTIVITY": {
      return {
        ...state,
        purchaseOrders: (state.purchaseOrders || []).map((po) =>
          po.id === action.poId
            ? {
                ...po,
                activityLog: [...(po.activityLog || []), action.entry],
                updatedAt: new Date().toISOString(),
              }
            : po
        ),
      };
    }

    // ── Hold Bills Reducers ──────────────────────────────────────────────────
    //
    // Complete isolation constraint: None of these actions interact with stock,
    // finance transactions, customer activities, customer debts, or invoices.
    // They are temporary POS cart snapshots only.
    case "CREATE_HOLD_BILL": {
      const nextCounter = (state.holdBillsCounter || 0) + 1;
      const holdNumber = `HB-${String(nextCounter).padStart(4, "0")}`;
      const now = new Date().toISOString();
      const newBill: HoldBill = {
        ...action.bill,
        id: `hb-${crypto.randomUUID()}`,
        holdNumber,
        createdAt: now,
        updatedAt: now,
      };
      // Keep newest first
      const newHoldBills = [newBill, ...(state.holdBills || [])];
      return {
        ...state,
        holdBills: newHoldBills,
        holdBillsCounter: nextCounter,
      };
    }

    case "UPDATE_HOLD_BILL": {
      const now = new Date().toISOString();
      const existing = (state.holdBills || []).find((b) => b.id === action.billId);
      if (!existing) return state;

      const updatedBill: HoldBill = {
        ...existing,
        ...action.bill,
        updatedAt: now, // update the last-edited timestamp
      };

      // Filter out the old one, and place the updated one first (newest/most recently edited first)
      const otherBills = (state.holdBills || []).filter((b) => b.id !== action.billId);
      const newHoldBills = [updatedBill, ...otherBills];

      return {
        ...state,
        holdBills: newHoldBills,
      };
    }

    case "DELETE_HOLD_BILL": {
      const newHoldBills = (state.holdBills || []).filter((b) => b.id !== action.id);
      return {
        ...state,
        holdBills: newHoldBills,
      };
    }

    case "LOAD_HOLD_BILL":
      return state; // No-op in reducer; load details in component state directly

    // ── Sales Return Reducers (Sprint 5.0) ───────────────────────────────────
    case "ADD_SALES_RETURN": {
      const { salesReturn } = action;
      const now = salesReturn.createdAt;

      // 1. Append the new sales return record
      const newSalesReturns = [...(state.salesReturns || []), salesReturn];

      // 2. Update returnedQuantity cache on each invoice item (convenience cache only)
      const newInvoices = state.invoices.map((inv) => {
        if (inv.id !== salesReturn.invoiceId) return inv;
        const newItems = inv.items.map((item) => {
          const returnItem = salesReturn.items.find((ri) => ri.invoiceItemId === item.id);
          if (!returnItem) return item;
          return {
            ...item,
            returnedQuantity: (item.returnedQuantity || 0) + returnItem.quantity,
          };
        });
        return { ...inv, items: newItems };
      });

      // 3. Restore stock for returned items and deduct stock for replacement items (if Exchange)
      const newProducts = state.products.map((p) => {
        let stockDelta = 0;
        const matchingReturnItems = salesReturn.items.filter((ri) => ri.productId === p.id);
        if (matchingReturnItems.length > 0) {
          stockDelta += matchingReturnItems.reduce((s, ri) => s + ri.quantity, 0);
        }
        if (salesReturn.refundMethod === "Exchange" && salesReturn.exchangeItems) {
          const matchingExchangeItems = salesReturn.exchangeItems.filter((ex) => ex.productId === p.id);
          if (matchingExchangeItems.length > 0) {
            stockDelta -= matchingExchangeItems.reduce((s, ex) => s + ex.quantity, 0);
          }
        }
        if (stockDelta === 0) return p;
        return { ...p, stock: Math.max(0, p.stock + stockDelta) };
      });

      // 4. Append stock movements
      const newStockMovements = [...(state.stockMovements || [])];
      salesReturn.items.forEach((ri) => {
        newStockMovements.push({
          id: generateUniqueId("sm"),
          productId: ri.productId,
          type: "Sales Return" as const,
          delta: ri.quantity,
          date: now,
          desc: `Sales Return — ${salesReturn.returnNumber}`,
          reference: salesReturn.returnNumber,
        });
      });
      if (salesReturn.refundMethod === "Exchange" && salesReturn.exchangeItems) {
        salesReturn.exchangeItems.forEach((exItem) => {
          newStockMovements.push({
            id: generateUniqueId("sm"),
            productId: exItem.productId,
            type: "Sale" as const,
            delta: -exItem.quantity,
            date: now,
            desc: `Exchange Replacement — ${salesReturn.returnNumber}`,
            reference: salesReturn.returnNumber,
          });
        });
      }

      // 5. Append Finance transaction — only for actual money movement
      const newFinanceTxs = [...(state.financeTransactions || [])];
      if (salesReturn.refundMethod === "Exchange") {
        const diff = salesReturn.exchangeDifference ?? 0;
        if (diff > 0) {
          // Customer paid additional amount for higher-value replacement
          const method: PaymentMethod =
            salesReturn.differencePaymentMethod && salesReturn.differencePaymentMethod !== "Adjustment"
              ? (salesReturn.differencePaymentMethod as PaymentMethod)
              : "Cash";
          const accountId = methodToAccountId(method);
          newFinanceTxs.push({
            id: generateUniqueId("ft"),
            type: "Income" as const,
            category: "Sales Return" as const,
            amount: diff,
            accountId,
            date: now,
            method,
            referenceId: salesReturn.returnNumber,
            customerId: salesReturn.customerId || undefined,
            notes: `Exchange difference received — ${salesReturn.returnNumber}`,
          });
        } else if (diff < 0 && (salesReturn.differencePaymentMethod as string) !== "Adjustment") {
          // Store refunded difference for lower-value replacement
          const refundAmt = Math.abs(diff);
          const method: PaymentMethod =
            salesReturn.differencePaymentMethod && (salesReturn.differencePaymentMethod as string) !== "Adjustment"
              ? (salesReturn.differencePaymentMethod as PaymentMethod)
              : "Cash";
          const accountId = methodToAccountId(method);
          newFinanceTxs.push({
            id: generateUniqueId("ft"),
            type: "Expense" as const,
            category: "Sales Return" as const,
            amount: refundAmt,
            accountId,
            date: now,
            method,
            referenceId: salesReturn.returnNumber,
            customerId: salesReturn.customerId || undefined,
            notes: `Exchange difference refunded — ${salesReturn.returnNumber}`,
          });
        }
      } else if (salesReturn.refundMethod !== "Adjustment" && salesReturn.totalRefund > 0) {
        const accountId = refundMethodToAccountId(salesReturn.refundMethod);
        const financeMethod: PaymentMethod =
          salesReturn.refundMethod === "Bank"
            ? "Cash"
            : (salesReturn.refundMethod as PaymentMethod);
        newFinanceTxs.push({
          id: generateUniqueId("ft"),
          type: "Expense" as const,
          category: "Sales Return" as const,
          amount: salesReturn.totalRefund,
          accountId,
          date: now,
          method: financeMethod,
          referenceId: salesReturn.returnNumber,
          customerId: salesReturn.customerId || undefined,
          notes: `Refund — ${salesReturn.returnNumber} (${salesReturn.refundMethod})`,
        });
      }

      // 6. Append customer activity (only for named customers, not walk-ins)
      const origInvoice = state.invoices.find((i) => i.id === salesReturn.invoiceId);
      const newCustomers = state.customers.map((c) => {
        if (!salesReturn.customerId || c.id !== salesReturn.customerId) return c;
        const itemsStr = salesReturn.items.map((it) => `${it.productName} ×${it.quantity}`).join(", ");
        return {
          ...c,
          // totalSpent intentionally not updated here — derived via calculateRevenue() on demand
          activities: [
            ...(c.activities || []),
            {
              id: `ca-${crypto.randomUUID()}`,
              type: "Return" as const,
              description: `Sales Return: ${itemsStr} — Refund ₹${salesReturn.totalRefund.toLocaleString()}`,
              reference: origInvoice?.invoiceNumber || salesReturn.invoiceId,
              date: now,
            },
          ],
        };
      });

      return {
        ...state,
        salesReturns: newSalesReturns,
        salesReturnCounter: (state.salesReturnCounter || 0) + 1,
        invoices: newInvoices,
        products: newProducts,
        stockMovements: newStockMovements,
        financeTransactions: newFinanceTxs,
        customers: newCustomers,
      };
    }

    case "CANCEL_SALES_RETURN": {
      const { returnId, reason, voidedBy } = action;
      const cancelledAt = new Date().toISOString();

      const target = (state.salesReturns || []).find((r) => r.id === returnId);
      if (!target || target.status === "Cancelled") return state;

      // 1. Mark return as Cancelled (append-only, never delete)
      const newSalesReturns = (state.salesReturns || []).map((r) =>
        r.id !== returnId
          ? r
          : { ...r, status: "Cancelled" as const, cancellationReason: reason, cancelledBy: voidedBy, cancelledAt }
      );

      // 2. Reverse returnedQuantity cache on invoice items
      const newInvoices = state.invoices.map((inv) => {
        if (inv.id !== target.invoiceId) return inv;
        const newItems = inv.items.map((item) => {
          const returnItem = target.items.find((ri) => ri.invoiceItemId === item.id);
          if (!returnItem) return item;
          return {
            ...item,
            returnedQuantity: Math.max(0, (item.returnedQuantity || 0) - returnItem.quantity),
          };
        });
        return { ...inv, items: newItems };
      });

      // 3. Reverse stock (re-sell returned items and restore replacement items if Exchange)
      const newProducts = state.products.map((p) => {
        let stockDelta = 0;
        const matchingReturnItems = target.items.filter((ri) => ri.productId === p.id);
        if (matchingReturnItems.length > 0) {
          stockDelta -= matchingReturnItems.reduce((s, ri) => s + ri.quantity, 0);
        }
        if (target.refundMethod === "Exchange" && target.exchangeItems) {
          const matchingExchangeItems = target.exchangeItems.filter((ex) => ex.productId === p.id);
          if (matchingExchangeItems.length > 0) {
            stockDelta += matchingExchangeItems.reduce((s, ex) => s + ex.quantity, 0);
          }
        }
        if (stockDelta === 0) return p;
        return { ...p, stock: Math.max(0, p.stock + stockDelta) };
      });

      // 4. Append reversing stock movements
      const newStockMovements = [...(state.stockMovements || [])];
      target.items.forEach((ri) => {
        newStockMovements.push({
          id: generateUniqueId("sm"),
          productId: ri.productId,
          type: "Adjustment" as const,
          delta: -ri.quantity,
          date: cancelledAt,
          desc: `Sales Return Cancelled — ${target.returnNumber}`,
          reference: target.returnNumber,
        });
      });
      if (target.refundMethod === "Exchange" && target.exchangeItems) {
        target.exchangeItems.forEach((exItem) => {
          newStockMovements.push({
            id: generateUniqueId("sm"),
            productId: exItem.productId,
            type: "Adjustment" as const,
            delta: exItem.quantity,
            date: cancelledAt,
            desc: `Exchange Replacement Cancelled — ${target.returnNumber}`,
            reference: target.returnNumber,
          });
        });
      }

      // 5. Append reversing Finance transaction
      const newFinanceTxs = [...(state.financeTransactions || [])];
      if (target.refundMethod === "Exchange") {
        const diff = target.exchangeDifference ?? 0;
        if (diff > 0) {
          // Reversing original Income -> Expense
          const method: PaymentMethod =
            target.differencePaymentMethod && target.differencePaymentMethod !== "Adjustment"
              ? (target.differencePaymentMethod as PaymentMethod)
              : "Cash";
          const accountId = methodToAccountId(method);
          newFinanceTxs.push({
            id: generateUniqueId("ft"),
            type: "Expense" as const,
            category: "Sales Return" as const,
            amount: diff,
            accountId,
            date: cancelledAt,
            method,
            referenceId: target.returnNumber,
            customerId: target.customerId || undefined,
            notes: `Exchange Cancelled (difference reversed) — ${target.returnNumber}`,
          });
        } else if (diff < 0 && (target.differencePaymentMethod as string) !== "Adjustment") {
          // Reversing original Expense -> Income
          const refundAmt = Math.abs(diff);
          const method: PaymentMethod =
            target.differencePaymentMethod && (target.differencePaymentMethod as string) !== "Adjustment"
              ? (target.differencePaymentMethod as PaymentMethod)
              : "Cash";
          const accountId = methodToAccountId(method);
          newFinanceTxs.push({
            id: generateUniqueId("ft"),
            type: "Income" as const,
            category: "Sales Return" as const,
            amount: refundAmt,
            accountId,
            date: cancelledAt,
            method,
            referenceId: target.returnNumber,
            customerId: target.customerId || undefined,
            notes: `Exchange Cancelled (difference reversed) — ${target.returnNumber}`,
          });
        }
      } else if (target.refundMethod !== "Adjustment" && target.totalRefund > 0) {
        const accountId = refundMethodToAccountId(target.refundMethod);
        const financeMethod: PaymentMethod =
          target.refundMethod === "Bank"
            ? "Cash"
            : (target.refundMethod as PaymentMethod);
        newFinanceTxs.push({
          id: generateUniqueId("ft"),
          type: "Income" as const,
          category: "Sales Return" as const,
          amount: target.totalRefund,
          accountId,
          date: cancelledAt,
          method: financeMethod,
          referenceId: target.returnNumber,
          customerId: target.customerId || undefined,
          notes: `Sales Return Cancelled — ${target.returnNumber} (${reason})`,
        });
      }

      // 6. Append customer activity (only for named customers, not walk-ins)
      const origInvoice = state.invoices.find((i) => i.id === target.invoiceId);
      const newCustomers = state.customers.map((c) => {
        if (!target.customerId || c.id !== target.customerId) return c;
        const itemsStr = target.items.map((it) => `${it.productName} ×${it.quantity}`).join(", ");
        return {
          ...c,
          // totalSpent intentionally not updated here — derived via calculateRevenue() on demand
          activities: [
            ...(c.activities || []),
            {
              id: `ca-${crypto.randomUUID()}`,
              type: "Void" as const,
              description: `Sales Return Cancelled: ${target.returnNumber} (${itemsStr}) — ${reason}`,
              reference: origInvoice?.invoiceNumber || target.invoiceId,
              date: cancelledAt,
            },
          ],
        };
      });

      return {
        ...state,
        salesReturns: newSalesReturns,
        invoices: newInvoices,
        products: newProducts,
        stockMovements: newStockMovements,
        financeTransactions: newFinanceTxs,
        customers: newCustomers,
      };
    }

    case "MODIFY_SALES_RETURN": {
      // Lightweight: update refundAmount and notes only (e.g. Adjustment value correction)
      const { returnId, refundAmount, notes } = action;
      return {
        ...state,
        salesReturns: (state.salesReturns || []).map((r) =>
          r.id !== returnId ? r : { ...r, totalRefund: refundAmount, notes }
        ),
      };
    }

    case "RECORD_BUSINESS_EXPENSE": {
      const { category, amount, paymentMethod, date, notes, referenceId } = action;
      if (amount <= 0 || paymentMethod === "Credit") {
        return state;
      }

      const accountId = methodToAccountId(paymentMethod);
      const txDate = date || new Date().toISOString();
      const refId =
        referenceId ||
        `EXP-${txDate.slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newFinanceTx: FinanceTransaction = {
        id: generateUniqueId("ftx"),
        accountId,
        type: "Expense",
        category,
        referenceId: refId,
        amount: roundMoney(amount),
        date: txDate,
        method: paymentMethod,
        notes: notes || `Operating Expense: ${category}`,
      };

      return {
        ...state,
        financeTransactions: [newFinanceTx, ...(state.financeTransactions || [])],
      };
    }

    default:
      return state;
  }
}

// ─────────────────────────────────────────────
//  CONTEXT
// ─────────────────────────────────────────────

interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;

  // Toast notifications helper
  toast: { message: string; type: "success" | "error" | "info" } | null;
  showToast: (message: string, type?: "success" | "error" | "info") => void;

  // Convenience helpers
  addInvoice: (invoice: Invoice) => void;
  voidInvoice: (invoiceId: string, reason: string, voidedBy: string) => void;
  addProduct: (product: Omit<Product, "id">) => void;
  updateProduct: (product: Product) => void;
  adjustStock: (productId: string, delta: number) => void;
  addCustomer: (customer: Omit<Customer, "id">) => void;
  updateCustomer: (customer: Customer) => void;
  recordDebtPayment: (payment: Omit<DebtPayment, "id">) => void;
  recordCustomerDebtPaymentFIFO: (params: {
    customerId: string;
    totalAmount: number;
    method: PaymentMethod;
    date?: string;
    note?: string;
    collectedBy?: "Owner" | "Staff";
  }) => void;
  voidDebtPayment: (paymentId: string, reason: string, voidedBy: string) => void;
  reconcileDebtCache: () => void;
  exportStoreAsJSON: () => void;

  // Hold Bills Helpers
  createHoldBill: (bill: Omit<HoldBill, "id" | "createdAt" | "updatedAt" | "holdNumber">) => void;
  updateHoldBill: (billId: string, bill: Omit<HoldBill, "id" | "createdAt" | "updatedAt" | "holdNumber">) => void;
  deleteHoldBill: (id: string) => void;

  // Suppliers Sprint 1 & 2 Convenience helpers
  addSupplier: (supplier: Omit<Supplier, "id" | "createdAt" | "updatedAt">) => void;
  updateSupplier: (supplier: Supplier) => void;
  addPurchase: (purchase: Omit<Purchase, "id" | "createdAt" | "totalAmount" | "amountPaid" | "dueAmount"> & { amountPaid?: number; paymentMethod?: PaymentMethod }) => void;
  /** Sprint 4.4 — records multiple purchases from one supplier invoice. */
  addPurchaseBatch: (params: {
    supplierId: string;
    invoiceNumber: string;
    date: string;
    notes: string;
    paymentMethod: PaymentMethod;
    totalPaid: number;
    items: Array<{ productId: string; quantity: number; buyPrice: number; expectedBuyPrice?: number }>;
    purchaseOrderId?: string;
  }) => void;
  updatePurchase: (purchaseId: string, invoiceNumber: string, date: string, notes: string) => void;
  recordSupplierPayment: (payment: Omit<SupplierPayment, "id">) => void;
  recordSupplierPaymentFIFO: (params: {
    supplierId: string;
    totalAmount: number;
    method: PaymentMethod;
    date?: string;
    note?: string;
    paidBy?: "Owner" | "Staff";
  }) => void;
  addPurchaseReturn: (record: Omit<PurchaseReturn, "id" | "createdAt" | "originalPurchaseQuantity" | "originalPurchaseValue">, refundMethod: PaymentMethod | "Adjustment") => void;
  getSupplierPaymentsBySupplier: (supplierId: string) => SupplierPayment[];
  getSupplierPaymentsByPurchase: (purchaseId: string) => SupplierPayment[];
  getPurchaseReturnsByPurchase: (purchaseId: string) => PurchaseReturn[];
  getPurchaseReturnsBySupplier: (supplierId: string) => PurchaseReturn[];
  getSupplierOutstandingBalance: (supplierId: string) => number;
  getTotalSupplierOutstanding: () => number;

  // Purchase Order Helpers (Sprint 4.6 & 4.6.1)
  createPurchaseOrder: (po: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt" | "updatedAt" | "activityLog">) => void;
  updatePurchaseOrder: (poId: string, expectedDeliveryDate: string, notes: string, items: PurchaseOrderItem[], status: PurchaseOrderStatus) => void;
  deletePurchaseOrder: (poId: string) => void;
  completePurchaseOrder: (poId: string) => void;
  markPurchaseOrderSent: (poId: string) => void;
  markPurchaseOrderCancelled: (poId: string) => void;
  confirmPurchaseOrder: (poId: string) => void;
  recordPOActivity: (poId: string, entry: POActivityLog) => void;

  // Future Ready Hooks / Selectors
  getSupplierBalance: (supplierId: string) => number;
  getSupplierLifetimePurchase: (supplierId: string) => number;
  getSupplierAveragePurchase: (supplierId: string) => number;
  getSupplierLastPurchase: (supplierId: string) => Purchase | undefined;
  getSupplierMonthlyPurchase: (supplierId: string, monthStr: string) => number;

  // Derived selectors
  getLowStockProducts: () => Product[];
  getOutOfStockProducts: () => Product[];
  getCustomerById: (id: string) => Customer | undefined;
  getInvoiceById: (id: string) => Invoice | undefined;
  getInvoicesByCustomer: (customerId: string) => Invoice[];
  getCustomerOutstandingInvoices: (customerId: string) => Invoice[];
  getDebtPaymentsByInvoice: (invoiceId: string) => DebtPayment[];
  getDebtPaymentsByCustomer: (customerId: string) => DebtPayment[];
  getTotalRevenue: () => number;
  getTotalProfit: () => number;
  getTotalOutstandingDebt: () => number;
  getInventoryValue: () => number;
  getNextInvoiceNumber: () => string;

  // Finance selectors (Sprint 3 — no UI, engine only)
  financeAccounts: FinanceAccount[];
  getAccountBalance: (accountId: string) => number;
  getCashBalance: () => number;
  getBankBalance: () => number;
  getUPIBalance: () => number;
  getTotalCashAvailable: () => number;
  getTodayIncome: () => number;
  getTodayExpense: () => number;
  getMonthlyIncome: (monthStr: string) => number;
  getMonthlyExpense: (monthStr: string) => number;
  getCashFlow: (fromDate: string, toDate: string) => number;
  getExpenseByCategory: (category: string) => number;
  getIncomeByCategory: (category: string) => number;

  // Sales Returns (Sprint 5.0)
  addSalesReturn: (params: {
    invoiceId: string;
    customerId: string;
    items: SalesReturnItem[];
    refundMethod: SalesReturn["refundMethod"];
    reason: string;
    notes?: string;
    createdBy?: string;
    exchangeItems?: ExchangeItem[];
    exchangeDifference?: number;
    differencePaymentMethod?: PaymentMethod | "Adjustment";
  }) => void;
  cancelSalesReturn: (returnId: string, reason: string, cancelledBy: string) => void;
  updateSalesReturn: (returnId: string, refundAmount: number, notes: string) => void;
  getSalesReturnsByInvoice: (invoiceId: string) => SalesReturn[];
  getSalesReturnsByCustomer: (customerId: string) => SalesReturn[];
  getInvoiceOutstanding: (invoice: Invoice) => number;
  getReturnableQuantity: (invoiceItemId: string, invoiceId: string) => number;
  recordBusinessExpense: (params: {
    category: FinanceCategory;
    amount: number;
    paymentMethod: PaymentMethod;
    date?: string;
    notes?: string;
    referenceId?: string;
  }) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

// ─────────────────────────────────────────────
//  PROVIDER
// ─────────────────────────────────────────────

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  function showToast(message: string, type: "success" | "error" | "info" = "success") {
    setToast({ message, type });
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ── Load from localStorage on initial mount ────────────────────────────────
  // If the stored version doesn't match STORE_VERSION, we wipe the old data and
  // start fresh — this guarantees a clean demo state after a version bump.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState & { __v?: string };
        if (parsed.__v !== STORE_VERSION) {
          // Version mismatch — clear stale data and start clean
          localStorage.removeItem(STORAGE_KEY);
          // State stays at INITIAL_STATE (empty arrays)
        } else {
          // ── Run any pending one-time migrations ──────────────────────────
          // runMigrations() is pure: receives the raw parsed state, applies
          // only migrations that have not yet been marked as done, and returns
          // the (possibly repaired) state. Applied IDs are persisted to
          // MIGRATION_KEY so this logic is idempotent across page reloads.
          const migratedState = runMigrations(parsed as AppState);

          // If migrations produced a different state, write it back to
          // localStorage immediately so the repaired data is durable.
          if (migratedState !== parsed) {
            try {
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ ...migratedState, __v: STORE_VERSION })
              );
            } catch { /* ignore write failures */ }
          }

          dispatch({ type: "HYDRATE_STORE", state: migratedState });
        }
      }
    } catch {
      // Corrupted storage — ignore and start fresh
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    } finally {
      setHydrated(true);
    }
  }, []);

  // ── Persist to localStorage whenever state changes after hydration ─────────
  // Always tag with STORE_VERSION so future loads can detect mismatches.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, __v: STORE_VERSION })
      );
    } catch {
      // storage full or unavailable — silently ignore
    }
  }, [state, hydrated]);

  // ── Helpers ──────────────────────────────────

  function addInvoice(invoice: Invoice) {
    dispatch({ type: "ADD_INVOICE", invoice });
  }

  function voidInvoice(invoiceId: string, reason: string, voidedBy: string) {
    dispatch({ type: "VOID_INVOICE", invoiceId, reason, voidedBy });
  }

  function addProduct(product: Omit<Product, "id">) {
    const duplicate = state.products.find(
      (p) => p.sku.trim().toLowerCase() === product.sku.trim().toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Duplicate SKU: SKU "${product.sku}" already exists on product "${duplicate.name}".`);
    }

    const timestamp = new Date().toISOString();
    dispatch({
      type: "ADD_PRODUCT",
      product: {
        ...product,
        id: generateUniqueId("p"),
        status: product.status || "Active",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
  }

  function updateProduct(product: Product) {
    const duplicate = state.products.find(
      (p) =>
        p.sku.trim().toLowerCase() === product.sku.trim().toLowerCase() &&
        p.id !== product.id
    );
    if (duplicate) {
      throw new Error(`Duplicate SKU: SKU "${product.sku}" already exists on product "${duplicate.name}".`);
    }

    const timestamp = new Date().toISOString();
    dispatch({
      type: "UPDATE_PRODUCT",
      product: {
        ...product,
        updatedAt: timestamp,
      },
    });
  }

  function adjustStock(productId: string, delta: number) {
    dispatch({ type: "ADJUST_STOCK", productId, delta });
  }

  function addCustomer(customer: Omit<Customer, "id">) {
    dispatch({
      type: "ADD_CUSTOMER",
      customer: { ...customer, id: `c-${crypto.randomUUID()}` },
    });
  }

  function updateCustomer(customer: Customer) {
    dispatch({ type: "UPDATE_CUSTOMER", customer });
  }

  function recordDebtPayment(payment: Omit<DebtPayment, "id">) {
    dispatch({
      type: "RECORD_DEBT_PAYMENT",
      payment: { ...payment, id: `dp-${crypto.randomUUID()}` },
    });
  }

  function recordCustomerDebtPaymentFIFO(params: {
    customerId: string;
    totalAmount: number;
    method: PaymentMethod;
    date?: string;
    note?: string;
    collectedBy?: "Owner" | "Staff";
  }) {
    dispatch({
      type: "RECORD_CUSTOMER_DEBT_PAYMENT_FIFO",
      customerId: params.customerId,
      totalAmount: params.totalAmount,
      method: params.method,
      date: params.date || new Date().toISOString(),
      note: params.note,
      collectedBy: params.collectedBy,
    });
  }

  function voidDebtPayment(paymentId: string, reason: string, voidedBy: string) {
    dispatch({ type: "VOID_DEBT_PAYMENT", paymentId, reason, voidedBy });
  }

  function createHoldBill(bill: Omit<HoldBill, "id" | "createdAt" | "updatedAt" | "holdNumber">) {
    dispatch({ type: "CREATE_HOLD_BILL", bill });
  }

  function updateHoldBill(billId: string, bill: Omit<HoldBill, "id" | "createdAt" | "updatedAt" | "holdNumber">) {
    dispatch({ type: "UPDATE_HOLD_BILL", billId, bill });
  }

  function deleteHoldBill(id: string) {
    dispatch({ type: "DELETE_HOLD_BILL", id });
  }

  function reconcileDebtCache() {
    dispatch({ type: "RECONCILE_DEBT_CACHE" });
  }

  function exportStoreAsJSON() {
    try {
      const settingsRaw = localStorage.getItem("autovault_settings");
      const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
      const backupData = {
        products: state.products,
        customers: state.customers,
        invoices: state.invoices,
        debtPayments: state.debtPayments ?? [],
        suppliers: state.suppliers ?? [],
        purchases: state.purchases ?? [],
        stockMovements: state.stockMovements ?? [],
        supplierPayments: state.supplierPayments ?? [],
        financeAccounts: state.financeAccounts ?? DEFAULT_FINANCE_ACCOUNTS,
        financeTransactions: state.financeTransactions ?? [],
        salesReturns: state.salesReturns ?? [],
        salesReturnCounter: state.salesReturnCounter ?? 0,
        purchaseReturns: state.purchaseReturns ?? [],
        purchaseOrders: state.purchaseOrders ?? [],
        purchaseOrderCounter: state.purchaseOrderCounter ?? 0,
        holdBills: state.holdBills ?? [],
        holdBillsCounter: state.holdBillsCounter ?? 0,
        settings,
        __v: STORE_VERSION,
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `autovault_backup_${todayLocalStr()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      showToast("Failed to export backup.", "error");
    }
  }

  // ── Selectors ─────────────────────────────────

  function getLowStockProducts() {
    return state.products.filter(
      (p) => p.stock > 0 && p.stock <= p.lowStockThreshold
    );
  }

  function getOutOfStockProducts() {
    return state.products.filter((p) => p.stock === 0);
  }

  function getCustomerById(id: string) {
    return state.customers.find((c) => c.id === id);
  }

  function getInvoiceById(id: string) {
    return state.invoices.find((inv) => inv.id === id);
  }

  function getInvoicesByCustomer(customerId: string) {
    return state.invoices.filter((inv) => inv.customerId === customerId);
  }

  /** All invoices for a customer that still have EFFECTIVE outstanding > 0 (after returns) */
  function getCustomerOutstandingInvoices(customerId: string) {
    return state.invoices.filter((inv) => {
      if (inv.customerId !== customerId || inv.voided || inv.dueAmount <= 0) return false;
      // Subtract any active returns from the raw dueAmount
      const returnsTotal = (state.salesReturns || [])
        .filter((r) => r.invoiceId === inv.id && r.status !== "Cancelled")
        .reduce((s, r) => s + r.totalRefund, 0);
      return Math.max(0, inv.dueAmount - returnsTotal) > 0;
    });
  }

  /** All repayment records for a specific invoice */
  function getDebtPaymentsByInvoice(invoiceId: string) {
    return (state.debtPayments ?? []).filter(
      (p) => p.invoiceId === invoiceId
    );
  }

  /** All repayment records for a specific customer */
  function getDebtPaymentsByCustomer(customerId: string) {
    return (state.debtPayments ?? []).filter(
      (p) => p.customerId === customerId
    );
  }

  function getTotalRevenue() {
    return calculateRevenue(state.invoices, state.salesReturns);
  }

  function getTotalProfit() {
    return calculateProfit(state.invoices, state.salesReturns, state.products);
  }

  /** Derives total outstanding debt from all invoice effective dues (subtracting active returns) — source of truth */
  function getTotalOutstandingDebt() {
    return state.invoices
      .filter((inv) => !inv.voided && inv.dueAmount > 0)
      .reduce((sum, inv) => {
        const returnsTotal = (state.salesReturns || [])
          .filter((r) => r.invoiceId === inv.id && r.status !== "Cancelled")
          .reduce((s, r) => s + r.totalRefund, 0);
        return sum + Math.max(0, roundMoney(inv.dueAmount - returnsTotal));
      }, 0);
  }

  function getInventoryValue() {
    return state.products.reduce(
      (sum, p) => sum + p.currentCost * p.stock,
      0
    );
  }

  function getNextInvoiceNumber() {
    const year = new Date().getFullYear();
    const count = state.invoices.length + 1;
    return `INV-${year}-${String(count).padStart(4, "0")}`;
  }

  // ── Procurement Role Guard ───────────────────────────────────────────────
  // Reads role directly from localStorage so the guard works even if called
  // programmatically (e.g. via DevTools) without going through the UI layer.
  function isProcurementAllowed(): boolean {
    if (typeof window === "undefined") return true; // SSR — allow
    const role = localStorage.getItem("role");
    if (role !== "owner") {
      showToast("Access denied. Owner only.", "error");
      return false;
    }
    return true;
  }

  function addSupplier(supplier: Omit<Supplier, "id" | "createdAt" | "updatedAt">) {
    if (!isProcurementAllowed()) return;
    const timestamp = new Date().toISOString();
    dispatch({
      type: "ADD_SUPPLIER",
      supplier: {
        ...supplier,
        id: generateUniqueId("s"),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
  }

  function updateSupplier(supplier: Supplier) {
    if (!isProcurementAllowed()) return;
    const timestamp = new Date().toISOString();
    dispatch({
      type: "UPDATE_SUPPLIER",
      supplier: {
        ...supplier,
        updatedAt: timestamp,
      },
    });
  }

  function addPurchase(purchase: Omit<Purchase, "id" | "createdAt" | "totalAmount" | "amountPaid" | "dueAmount"> & { amountPaid?: number; paymentMethod?: PaymentMethod }) {
    if (!isProcurementAllowed()) return;
    const timestamp = new Date().toISOString();
    const total = roundMoney(purchase.quantity * purchase.buyPrice);
    const paid = purchase.paymentStatus === "Paid" ? total : (purchase.paymentStatus === "Credit" ? 0 : roundMoney(purchase.amountPaid ?? 0));
    const due = Math.max(0, roundMoney(total - paid));
    const status = due === 0 ? "Paid" : (paid > 0 ? "Partial" : "Credit");

    dispatch({
      type: "ADD_PURCHASE",
      purchase: {
        ...purchase,
        id: generateUniqueId("pur"),
        createdAt: timestamp,
        totalAmount: total,
        amountPaid: paid,
        dueAmount: due,
        paymentStatus: status,
      },
      paymentMethod: purchase.paymentMethod,
    });
  }

  /**
   * addPurchaseBatch — Sprint 4.4
   *
   * Records multiple purchases from a single supplier invoice in one operation.
   * Internally calls the existing addPurchase() once per line item, so all
   * downstream effects (stock, StockMovement, SupplierPayment, FinanceTransaction,
   * supplier outstanding balance) continue to work automatically.
   *
   * Payment is distributed proportionally across items by value weight:
   *   itemPaid = (itemTotal / grandTotal) × totalPaid
   *
   * Rounding residual is absorbed by the last item so Σ(itemPaid) === totalPaid exactly.
   */
  function addPurchaseBatch(params: {
    supplierId: string;
    invoiceNumber: string;
    date: string;
    notes: string;
    paymentMethod: PaymentMethod;
    totalPaid: number;
    items: Array<{ productId: string; quantity: number; buyPrice: number; expectedBuyPrice?: number }>;
    purchaseOrderId?: string;
  }) {
    if (!isProcurementAllowed()) return;
    const { supplierId, invoiceNumber, date, notes, paymentMethod, totalPaid, items, purchaseOrderId } = params;

    // 1. Compute per-item subtotals
    const itemTotals = items.map((item) => roundMoney(item.quantity * item.buyPrice));
    const grandTotal = itemTotals.reduce((s, t) => s + t, 0);

    // Clamp paid to grand total (UI validation should already enforce this,
    // but we guard here for safety)
    const safePaid = Math.min(Math.max(0, totalPaid), grandTotal);

    // 2. Proportional allocation with rounding correction on last item
    let allocatedSoFar = 0;
    const paidPerItem: number[] = items.map((_, i) => {
      if (grandTotal === 0) return 0;
      if (i === items.length - 1) {
        // Last item absorbs the rounding residual
        return roundMoney(safePaid - allocatedSoFar);
      }
      const share = roundMoney((itemTotals[i] / grandTotal) * safePaid);
      allocatedSoFar = roundMoney(allocatedSoFar + share);
      return share;
    });

    // 3. Dispatch one ADD_PURCHASE per line item via the existing addPurchase() helper
    items.forEach((item, i) => {
      const total = itemTotals[i];
      const paid = paidPerItem[i];
      const due = roundMoney(Math.max(0, total - paid));
      const status: "Paid" | "Partial" | "Credit" =
        due <= 0 ? "Paid" : paid > 0 ? "Partial" : "Credit";

      addPurchase({
        supplierId,
        productId: item.productId,
        quantity: item.quantity,
        buyPrice: item.buyPrice,
        invoiceNumber,
        date,
        notes,
        paymentStatus: status,
        amountPaid: paid,
        paymentMethod,
        purchaseOrderId,
        expectedBuyPrice: item.expectedBuyPrice,
      });
    });
  }

  function updatePurchase(purchaseId: string, invoiceNumber: string, date: string, notes: string) {
    dispatch({ type: "UPDATE_PURCHASE", purchaseId, invoiceNumber, date, notes });
  }

  function recordSupplierPayment(payment: Omit<SupplierPayment, "id">) {
    if (!isProcurementAllowed()) return;
    dispatch({
      type: "RECORD_SUPPLIER_PAYMENT",
      payment: { ...payment, id: `sp-${crypto.randomUUID()}` },
    });
  }

  function recordSupplierPaymentFIFO(params: {
    supplierId: string;
    totalAmount: number;
    method: PaymentMethod;
    date?: string;
    note?: string;
    paidBy?: "Owner" | "Staff";
  }) {
    if (!isProcurementAllowed()) return;
    dispatch({
      type: "RECORD_SUPPLIER_PAYMENT_FIFO",
      supplierId: params.supplierId,
      totalAmount: params.totalAmount,
      method: params.method,
      date: params.date || new Date().toISOString(),
      note: params.note,
      paidBy: params.paidBy || "Owner",
    });
  }

  function addPurchaseReturn(
    record: Omit<PurchaseReturn, "id" | "createdAt" | "originalPurchaseQuantity" | "originalPurchaseValue">,
    refundMethod: PaymentMethod | "Adjustment"
  ) {
    if (!isProcurementAllowed()) return;
    const origPurchase = (state.purchases || []).find((p) => p.id === record.purchaseId);
    const originalPurchaseQuantity = origPurchase ? origPurchase.quantity : 0;
    const originalPurchaseValue = origPurchase ? (origPurchase.totalAmount ?? (origPurchase.buyPrice * origPurchase.quantity)) : 0;

    const returnRecord: PurchaseReturn = {
      ...record,
      id: generateUniqueId("prr"),
      createdAt: new Date().toISOString(),
      originalPurchaseQuantity,
      originalPurchaseValue,
    };
    dispatch({ type: "ADD_PURCHASE_RETURN", returnRecord, refundMethod });
  }

  function getSupplierPaymentsBySupplier(supplierId: string) {
    return (state.supplierPayments ?? []).filter((p) => p.supplierId === supplierId);
  }

  function getSupplierPaymentsByPurchase(purchaseId: string) {
    return (state.supplierPayments ?? []).filter((p) => p.purchaseId === purchaseId);
  }

  function getPurchaseReturnsByPurchase(purchaseId: string) {
    return (state.purchaseReturns ?? []).filter((r) => r.purchaseId === purchaseId);
  }

  function getPurchaseReturnsBySupplier(supplierId: string) {
    return (state.purchaseReturns ?? []).filter((r) => r.supplierId === supplierId);
  }

  function getSupplierOutstandingBalance(supplierId: string) {
    // Outstanding = Original Purchase Total - Total Returned - Total Paid
    return (state.purchases || [])
      .filter((p) => p.supplierId === supplierId)
      .reduce((sum, p) => {
        const total = p.totalAmount ?? (p.buyPrice * p.quantity);
        const returns = (state.purchaseReturns || []).filter((r) => r.purchaseId === p.id);
        const returnedValue = returns.reduce((s, r) => s + r.totalAmount, 0);
        const payments = (state.supplierPayments || []).filter((sp) => sp.purchaseId === p.id);
        const paid = payments.reduce((s, pay) => s + pay.amount, 0);
        return sum + Math.max(0, roundMoney(total - returnedValue - paid));
      }, 0);
  }

  function getTotalSupplierOutstanding() {
    return (state.purchases || [])
      .reduce((sum, p) => {
        const total = p.totalAmount ?? (p.buyPrice * p.quantity);
        const returns = (state.purchaseReturns || []).filter((r) => r.purchaseId === p.id);
        const returnedValue = returns.reduce((s, r) => s + r.totalAmount, 0);
        const payments = (state.supplierPayments || []).filter((sp) => sp.purchaseId === p.id);
        const paid = payments.reduce((s, pay) => s + pay.amount, 0);
        return sum + Math.max(0, roundMoney(total - returnedValue - paid));
      }, 0);
  }

  function createPurchaseOrder(po: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt" | "updatedAt" | "activityLog">) {
    if (!isProcurementAllowed()) return;
    dispatch({ type: "CREATE_PURCHASE_ORDER", po });
  }

  function updatePurchaseOrder(poId: string, expectedDeliveryDate: string, notes: string, items: PurchaseOrderItem[], status: PurchaseOrderStatus) {
    if (!isProcurementAllowed()) return;
    dispatch({ type: "UPDATE_PURCHASE_ORDER", poId, expectedDeliveryDate, notes, items, status });
  }

  function deletePurchaseOrder(poId: string) {
    if (!isProcurementAllowed()) return;
    const targetPO = (state.purchaseOrders || []).find((po) => po.id === poId);
    if (!targetPO || targetPO.status !== "Draft") return;
    dispatch({ type: "DELETE_PURCHASE_ORDER", poId });
  }

  function completePurchaseOrder(poId: string) {
    if (!isProcurementAllowed()) return;
    dispatch({ type: "COMPLETE_PURCHASE_ORDER", poId });
  }

  function markPurchaseOrderSent(poId: string) {
    if (!isProcurementAllowed()) return;
    dispatch({ type: "MARK_PURCHASE_ORDER_SENT", poId });
  }

  function markPurchaseOrderCancelled(poId: string) {
    if (!isProcurementAllowed()) return;
    dispatch({ type: "MARK_PURCHASE_ORDER_CANCELLED", poId });
  }

  function confirmPurchaseOrder(poId: string) {
    if (!isProcurementAllowed()) return;
    dispatch({ type: "CONFIRM_PURCHASE_ORDER", poId });
  }

  function recordPOActivity(poId: string, entry: POActivityLog) {
    if (!isProcurementAllowed()) return;
    dispatch({ type: "RECORD_PO_ACTIVITY", poId, entry });
  }

  // Future Ready Selectors
  function getSupplierBalance(supplierId: string) {
    return getSupplierOutstandingBalance(supplierId);
  }

  function getSupplierLifetimePurchase(supplierId: string) {
    return (state.purchases || [])
      .filter((p) => p.supplierId === supplierId)
      .reduce((sum, p) => sum + (p.totalAmount ?? (p.buyPrice * p.quantity)), 0);
  }

  function getSupplierAveragePurchase(supplierId: string) {
    const list = (state.purchases || []).filter((p) => p.supplierId === supplierId);
    if (list.length === 0) return 0;
    const total = list.reduce((sum, p) => sum + (p.totalAmount ?? (p.buyPrice * p.quantity)), 0);
    return total / list.length;
  }

  function getSupplierLastPurchase(supplierId: string) {
    const list = (state.purchases || [])
      .filter((p) => p.supplierId === supplierId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list[0];
  }

  function getSupplierMonthlyPurchase(supplierId: string, monthStr: string) {
    return (state.purchases || [])
      .filter((p) => p.supplierId === supplierId && p.date.startsWith(monthStr))
      .reduce((sum, p) => sum + (p.totalAmount ?? (p.buyPrice * p.quantity)), 0);
  }

  // ── Finance Selectors (Sprint 3 — no UI, engine only) ───────────────────────

  /**
   * Derives the balance of a finance account from its opening balance
   * plus all Income transactions minus all Expense transactions.
   * Balance is never stored — always computed.
   */
  function getAccountBalance(accountId: string): number {
    const account = (state.financeAccounts ?? DEFAULT_FINANCE_ACCOUNTS).find((a) => a.id === accountId);
    const opening = account?.openingBalance ?? 0;
    const txs = (state.financeTransactions ?? []).filter((t) => t.accountId === accountId);
    const income  = txs.filter((t) => t.type === "Income" ).reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
    return roundMoney(opening + income - expense);
  }

  function getCashBalance()  { return getAccountBalance("acc-cash"); }
  function getBankBalance()  { return getAccountBalance("acc-bank"); }
  function getUPIBalance()   { return getAccountBalance("acc-upi");  }

  function getTotalCashAvailable(): number {
    return roundMoney(getCashBalance() + getBankBalance() + getUPIBalance());
  }

  function getTodayIncome(): number {
    const today = todayLocalStr();
    return (state.financeTransactions ?? [])
      .filter((t) => t.type === "Income" && t.date.startsWith(today))
      .reduce((s, t) => s + t.amount, 0);
  }

  function getTodayExpense(): number {
    const today = todayLocalStr();
    return (state.financeTransactions ?? [])
      .filter((t) => t.type === "Expense" && t.date.startsWith(today))
      .reduce((s, t) => s + t.amount, 0);
  }

  function getMonthlyIncome(monthStr: string): number {
    return (state.financeTransactions ?? [])
      .filter((t) => t.type === "Income" && t.date.startsWith(monthStr))
      .reduce((s, t) => s + t.amount, 0);
  }

  function getMonthlyExpense(monthStr: string): number {
    return (state.financeTransactions ?? [])
      .filter((t) => t.type === "Expense" && t.date.startsWith(monthStr))
      .reduce((s, t) => s + t.amount, 0);
  }

  /** Net cash flow between two ISO date strings (inclusive) */
  function getCashFlow(fromDate: string, toDate: string): number {
    const txs = (state.financeTransactions ?? []).filter(
      (t) => t.date >= fromDate && t.date <= toDate + "T23:59:59.999Z"
    );
    const income  = txs.filter((t) => t.type === "Income" ).reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
    return roundMoney(income - expense);
  }

  function getExpenseByCategory(category: string): number {
    return (state.financeTransactions ?? [])
      .filter((t) => t.type === "Expense" && t.category === category)
      .reduce((s, t) => s + t.amount, 0);
  }

  function getIncomeByCategory(category: string): number {
    return (state.financeTransactions ?? [])
      .filter((t) => t.type === "Income" && t.category === category)
      .reduce((s, t) => s + t.amount, 0);
  }

  // ── Sales Return Helpers (Sprint 5.0) ─────────────────────────────────────

  function getSalesReturnsByInvoice(invoiceId: string): SalesReturn[] {
    return (state.salesReturns || []).filter((r) => r.invoiceId === invoiceId);
  }

  function getSalesReturnsByCustomer(customerId: string): SalesReturn[] {
    return (state.salesReturns || []).filter((r) => r.customerId === customerId);
  }

  function getInvoiceOutstanding(invoice: Invoice): number {
    const returnsTotal = (state.salesReturns || [])
      .filter((r) => r.invoiceId === invoice.id && r.status !== "Cancelled")
      .reduce((s, r) => s + r.totalRefund, 0);
    return Math.max(0, roundMoney(invoice.dueAmount - returnsTotal));
  }

  function getReturnableQuantity(invoiceItemId: string, invoiceId: string): number {
    const invoice = state.invoices.find((i) => i.id === invoiceId);
    if (!invoice) return 0;
    const item = invoice.items.find((it) => it.id === invoiceItemId);
    if (!item) return 0;
    const alreadyReturned = (state.salesReturns || [])
      .filter((r) => r.invoiceId === invoiceId && r.status !== "Cancelled")
      .flatMap((r) => r.items)
      .filter((ri) => ri.invoiceItemId === invoiceItemId)
      .reduce((s, ri) => s + ri.quantity, 0);
    return Math.max(0, item.quantity - alreadyReturned);
  }

  function addSalesReturn(params: {
    invoiceId: string;
    customerId: string;
    items: SalesReturnItem[];
    refundMethod: SalesReturn["refundMethod"];
    reason: string;
    notes?: string;
    createdBy?: string;
    exchangeItems?: ExchangeItem[];
    exchangeDifference?: number;
    differencePaymentMethod?: PaymentMethod | "Adjustment";
  }): void {
    const counter = (state.salesReturnCounter || 0) + 1;
    const returnNumber = `SR-${new Date().getFullYear()}-${String(counter).padStart(5, "0")}`;
    const now = new Date().toISOString();
    const totalRefund = params.items.reduce((s, i) => s + i.refundAmount, 0);
    const salesReturn: SalesReturn = {
      id: generateUniqueId("sr"),
      returnNumber,
      invoiceId: params.invoiceId,
      customerId: params.customerId,
      items: params.items,
      refundMethod: params.refundMethod,
      totalRefund: roundMoney(totalRefund),
      reason: params.reason,
      notes: params.notes || "",
      status: params.refundMethod === "Adjustment" ? "Adjusted" : "Refunded",
      createdAt: now,
      createdBy: params.createdBy,
      exchangeItems: params.exchangeItems,
      exchangeDifference: params.exchangeDifference,
      differencePaymentMethod: params.differencePaymentMethod,
    };
    dispatch({ type: "ADD_SALES_RETURN", salesReturn });
  }

  function cancelSalesReturn(returnId: string, reason: string, cancelledBy: string): void {
    dispatch({ type: "CANCEL_SALES_RETURN", returnId, reason, voidedBy: cancelledBy });
  }

  function updateSalesReturn(returnId: string, refundAmount: number, notes: string): void {
    dispatch({ type: "MODIFY_SALES_RETURN", returnId, refundAmount, notes });
  }

  function recordBusinessExpense(params: {
    category: FinanceCategory;
    amount: number;
    paymentMethod: PaymentMethod;
    date?: string;
    notes?: string;
    referenceId?: string;
  }): void {
    dispatch({ type: "RECORD_BUSINESS_EXPENSE", ...params });
    showToast(`Recorded ${params.category} expense of ₹${params.amount.toLocaleString()}`, "success");
  }

  return (
    <StoreContext.Provider
      value={{
        state,
        dispatch,
        toast,
        showToast,
        recordBusinessExpense,
        addInvoice,
        voidInvoice,
        addProduct,
        updateProduct,
        adjustStock,
        addCustomer,
        updateCustomer,
        recordDebtPayment,
        recordCustomerDebtPaymentFIFO,
        voidDebtPayment,
        createHoldBill,
        updateHoldBill,
        deleteHoldBill,
        reconcileDebtCache,
        exportStoreAsJSON,
        addSupplier,
        updateSupplier,
        addPurchase,
        addPurchaseBatch,
        updatePurchase,
        recordSupplierPayment,
        recordSupplierPaymentFIFO,
        addPurchaseReturn,
        getSupplierPaymentsBySupplier,
        getSupplierPaymentsByPurchase,
        getPurchaseReturnsByPurchase,
        getPurchaseReturnsBySupplier,
        getSupplierOutstandingBalance,
        getTotalSupplierOutstanding,
        // Purchase Orders
        createPurchaseOrder,
        updatePurchaseOrder,
        deletePurchaseOrder,
        completePurchaseOrder,
        markPurchaseOrderSent,
        markPurchaseOrderCancelled,
        confirmPurchaseOrder,
        recordPOActivity,
        getSupplierBalance,
        getSupplierLifetimePurchase,
        getSupplierAveragePurchase,
        getSupplierLastPurchase,
        getSupplierMonthlyPurchase,
        getLowStockProducts,
        getOutOfStockProducts,
        getCustomerById,
        getInvoiceById,
        getInvoicesByCustomer,
        getCustomerOutstandingInvoices,
        getDebtPaymentsByInvoice,
        getDebtPaymentsByCustomer,
        getTotalRevenue,
        getTotalProfit,
        getTotalOutstandingDebt,
        getInventoryValue,
        getNextInvoiceNumber,
        // Finance (Sprint 3)
        financeAccounts: state.financeAccounts ?? DEFAULT_FINANCE_ACCOUNTS,
        getAccountBalance,
        getCashBalance,
        getBankBalance,
        getUPIBalance,
        getTotalCashAvailable,
        getTodayIncome,
        getTodayExpense,
        getMonthlyIncome,
        getMonthlyExpense,
        getCashFlow,
        getExpenseByCategory,
        getIncomeByCategory,

        // Sales Returns (Sprint 5.0)
        addSalesReturn,
        cancelSalesReturn,
        updateSalesReturn,
        getSalesReturnsByInvoice,
        getSalesReturnsByCustomer,
        getInvoiceOutstanding,
        getReturnableQuantity,
      }}
    >
      {hydrated ? (
        <>
          {children}
          {toast && (
            <div className="fixed bottom-5 right-5 z-[9999] flex items-center gap-3 bg-slate-900 border border-slate-750 text-white rounded-2xl px-5 py-3.5 shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
              {toast.type === "success" && <CheckCircle className="text-green-400 shrink-0" size={18} />}
              {toast.type === "error" && <AlertCircle className="text-red-400 shrink-0" size={18} />}
              {toast.type === "info" && <Info className="text-blue-400 shrink-0" size={18} />}
              <span className="text-sm font-bold">{toast.message}</span>
              <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-200 ml-2 cursor-pointer">
                <X size={14} />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center gap-3 w-full">
          <div className="w-10 h-10 rounded-full border-4 border-yellow-400 border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-slate-300">Loading 7 Star Car Accessories...</p>
        </div>
      )}
    </StoreContext.Provider>
  );
}

// ─────────────────────────────────────────────
//  HOOK
// ─────────────────────────────────────────────

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("useStore must be used inside <StoreProvider>");
  }
  return ctx;
}
