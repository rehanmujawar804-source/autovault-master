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
} from "@/types";
import { todayLocalStr } from "@/lib/dateUtils";

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

const INITIAL_STATE: AppState = {
  products: SEED_PRODUCTS,
  customers: SEED_CUSTOMERS,
  invoices: SEED_INVOICES,
  debtPayments: [],
  suppliers: [],
  purchases: [],
  stockMovements: [],
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

  // Debt Repayment — core new action
  | { type: "RECORD_DEBT_PAYMENT"; payment: DebtPayment }

  // Suppliers Sprint 1
  | { type: "ADD_SUPPLIER"; supplier: Supplier }
  | { type: "UPDATE_SUPPLIER"; supplier: Supplier }
  | { type: "ADD_PURCHASE"; purchase: Purchase }

  // Reset / Hydrate
  | { type: "RESET_STORE" }
  | { type: "HYDRATE_STORE"; state: AppState }
  | { type: "RECONCILE_DEBT_CACHE" };

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
  // ── Add future migrations here ─────────────────────────────────────────────
  // {
  //   id: "m002-your-next-migration",
  //   description: "Short description of what this repairs.",
  //   run(state) { return { state, log: [] }; },
  // },
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
function calcInvoiceDue(invoice: Invoice, payments: DebtPayment[]): number {
  const repaid = payments
    .filter((p) => p.invoiceId === invoice.id)
    .reduce((s, p) => s + p.amount, 0);
  return Math.max(0, invoice.dueAmount - repaid);
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
    // 3. Customer debt/totalSpent/visits updated (or new customer created)
    case "ADD_INVOICE": {
      const inv = action.invoice;

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
            totalSpent: c.totalSpent + inv.amountPaid,
            visits: c.visits + 1,
            lastVisit: inv.date,
            invoiceIds: [...c.invoiceIds, inv.id],
          };
        });
      } else if (inv.customer && inv.customer !== "Walk-in Customer") {
        const newCustomer: Customer = {
          id: inv.customerId ?? `c-${crypto.randomUUID()}`,
          name: inv.customer,
          phone: inv.customerPhone,
          debt: inv.dueAmount,
          totalSpent: inv.amountPaid,
          visits: 1,
          lastVisit: inv.date,
          invoiceIds: [inv.id],
        };
        newCustomers = [...state.customers, newCustomer];
      } else {
        newCustomers = state.customers;
      }

      return {
        ...state,
        invoices: newInvoices,
        products: newProducts,
        customers: newCustomers,
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
        const currentDue = calcInvoiceDue(inv, state.debtPayments ?? []);
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
          (inv) => inv.customerId === c.id
        );
        const totalDue = customerInvoices.reduce(
          (s, inv) => s + inv.dueAmount,
          0
        );
        return { ...c, debt: totalDue };
      });

      return {
        ...state,
        debtPayments: newPayments,
        invoices: newInvoices,
        customers: newCustomers,
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
      return {
        ...action.state,
        products,
        debtPayments: action.state.debtPayments ?? [],
        suppliers: action.state.suppliers ?? [],
        purchases: action.state.purchases ?? [],
        stockMovements: action.state.stockMovements ?? [],
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
      const { purchase } = action;
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

      return {
        ...state,
        purchases: newPurchases,
        products: newProducts,
        stockMovements: newStockMovements,
      };
    }

    case "RECONCILE_DEBT_CACHE": {
      const newCustomers = state.customers.map((c) => {
        const customerInvoices = state.invoices.filter(
          (inv) => inv.customerId === c.id && !inv.voided
        );
        const totalDue = customerInvoices.reduce((s, inv) => s + inv.dueAmount, 0);
        const totalSpent = customerInvoices.reduce((s, inv) => s + inv.amountPaid, 0);
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
  addProduct: (product: Omit<Product, "id">) => void;
  updateProduct: (product: Product) => void;
  adjustStock: (productId: string, delta: number) => void;
  addCustomer: (customer: Omit<Customer, "id">) => void;
  updateCustomer: (customer: Customer) => void;
  recordDebtPayment: (payment: Omit<DebtPayment, "id">) => void;
  reconcileDebtCache: () => void;
  exportStoreAsJSON: () => void;

  // Suppliers Sprint 1 Convenience helpers
  addSupplier: (supplier: Omit<Supplier, "id" | "createdAt" | "updatedAt">) => void;
  updateSupplier: (supplier: Supplier) => void;
  addPurchase: (purchase: Omit<Purchase, "id" | "createdAt">) => void;

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

  /** All invoices for a customer that still have dueAmount > 0 */
  function getCustomerOutstandingInvoices(customerId: string) {
    return state.invoices.filter(
      (inv) => inv.customerId === customerId && inv.dueAmount > 0 && !inv.voided
    );
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
    return state.invoices.filter((inv) => !inv.voided).reduce((sum, inv) => sum + inv.amountPaid, 0);
  }

  function getTotalProfit() {
    return state.invoices.filter((inv) => !inv.voided).reduce((sum, inv) => {
      const profit = inv.items.reduce((iSum, item) => {
        const product = state.products.find((p) => p.id === item.productId);
        const currentCost = product?.currentCost ?? 0;
        return iSum + (item.price - currentCost) * item.quantity;
      }, 0);
      return sum + profit;
    }, 0);
  }

  /** Derives total outstanding debt directly from invoice dueAmounts — source of truth */
  function getTotalOutstandingDebt() {
    return state.invoices.filter((inv) => !inv.voided).reduce((sum, inv) => sum + inv.dueAmount, 0);
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

  function addSupplier(supplier: Omit<Supplier, "id" | "createdAt" | "updatedAt">) {
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
    const timestamp = new Date().toISOString();
    dispatch({
      type: "UPDATE_SUPPLIER",
      supplier: {
        ...supplier,
        updatedAt: timestamp,
      },
    });
  }

  function addPurchase(purchase: Omit<Purchase, "id" | "createdAt">) {
    const timestamp = new Date().toISOString();
    dispatch({
      type: "ADD_PURCHASE",
      purchase: {
        ...purchase,
        id: generateUniqueId("pur"),
        createdAt: timestamp,
      },
    });
  }

  return (
    <StoreContext.Provider
      value={{
        state,
        dispatch,
        toast,
        showToast,
        addInvoice,
        addProduct,
        updateProduct,
        adjustStock,
        addCustomer,
        updateCustomer,
        recordDebtPayment,
        reconcileDebtCache,
        exportStoreAsJSON,
        addSupplier,
        updateSupplier,
        addPurchase,
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
