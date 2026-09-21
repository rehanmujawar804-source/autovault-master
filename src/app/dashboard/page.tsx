"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import {
  ReceiptText,
  Users,
  Package,
  AlertTriangle,
  TrendingUp,
  Wallet,
  AlertCircle,
  ShoppingCart,
  ArrowRight,
  Search,
  CheckCircle,
  Coins,
  ChevronRight,
  X,
  Activity,
  FileText,
  RotateCcw,
  Building2,
  Car,
  Clock,
  Zap,
  Tag,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  Layers,
  Inbox,
  Sparkles,
  DollarSign,
  HelpCircle,
  Calendar,
  CheckSquare,
  Compass,
} from "lucide-react";
import type { PaymentStatus, Customer, Invoice, PurchaseOrder, SalesReturn } from "@/types";
import {
  todayLocalStr,
  formatInvoiceDate,
  toLocalDateStr,
  sortInvoicesDescending,
  formatDateOnlyIST,
  formatDateTimeIST,
} from "@/lib/dateUtils";
import { calculateRevenue } from "@/lib/revenueUtils";
import { calculateProfit } from "@/lib/profitUtils";

// ─────────────────────────────────────────────────────────────────────────────
//  TYPES & INTERFACES FOR ACTION INBOX & HEALTH SCORE
// ─────────────────────────────────────────────────────────────────────────────

type InboxPriority = "Critical" | "High" | "Medium" | "Info";
type InboxCategory = "Inventory" | "Customers" | "Suppliers" | "Billing" | "Returns" | "Finance";

interface ActionInboxItem {
  id: string;
  priority: InboxPriority;
  category: InboxCategory;
  title: string;
  description: string;
  timestamp: string;
  urgencyValue: number; // Used for secondary deterministic urgency sorting
  actionText: string;
  actionHref: string;
}

interface ChecklistItem {
  id: string;
  action: string;
  context: string;
}

interface MaintenanceReminderItem {
  id: string;
  title: string;
  description: string;
  actionText: string;
  actionHref: string;
}

const PRIORITY_RANK: Record<InboxPriority, number> = {
  Critical: 1,
  High: 2,
  Medium: 3,
  Info: 4,
};

const PRIORITY_BADGE: Record<InboxPriority, { bg: string; text: string; border: string; icon: string }> = {
  Critical: { bg: "bg-red-50 text-red-700", border: "border-red-200", text: "Critical", icon: "🔴" },
  High: { bg: "bg-orange-50 text-orange-700", border: "border-orange-200", text: "High", icon: "🟠" },
  Medium: { bg: "bg-amber-50 text-amber-800", border: "border-amber-200", text: "Medium", icon: "🟡" },
  Info: { bg: "bg-blue-50 text-blue-700", border: "border-blue-200", text: "Info", icon: "🔵" },
};

const CATEGORY_ICONS: Record<InboxCategory, any> = {
  Inventory: Package,
  Customers: Users,
  Suppliers: Building2,
  Billing: ReceiptText,
  Returns: RotateCcw,
  Finance: Wallet,
};

// ─────────────────────────────────────────────────────────────────────────────
//  STATUS BADGE COLORS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PaymentStatus, string> = {
  Paid: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  Partial: "bg-blue-100 text-blue-700 border border-blue-200",
  Debt: "bg-amber-100 text-amber-700 border border-amber-200",
  "Partially Returned": "bg-orange-100 text-orange-800 border border-orange-200",
  "Fully Returned": "bg-red-100 text-red-800 border border-red-200",
  Refunded: "bg-purple-100 text-purple-800 border border-purple-200",
  Voided: "bg-slate-200 text-slate-700 border border-slate-300",
};

export default function DashboardPage() {
  const {
    state,
    getTotalRevenue,
    getTotalProfit,
    getTotalOutstandingDebt,
    getInventoryValue,
    getInvoiceOutstanding,
    getCustomerOutstandingBalance,
    getCustomerCreditBalance,
    getTotalCustomerCreditLiability,
    getCashBalance,
    getBankBalance,
    getUPIBalance,
    getTotalCashAvailable,
    getLowStockProducts,
    getOutOfStockProducts,
  } = useStore();

  const { isOwner, loading, requireAuth } = useRole();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  const today = todayLocalStr();

  // Calculate Yesterday's YYYY-MM-DD string
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateStr(d);
  }, []);

  // ── Local UI States ───────────────────────────────────────────────────────
  const [lookupQuery, setLookupQuery] = useState("");
  const [inboxFilter, setInboxFilter] = useState<"All" | InboxCategory>("All");
  const [showHealthBreakdown, setShowHealthBreakdown] = useState(false);
  const [lastEvaluatedTime, setLastEvaluatedTime] = useState<string>("");

  useEffect(() => {
    setLastEvaluatedTime(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  //  1. SINGLE-PASS DERIVED OPERATIONAL & FINANCIAL DATA
  // ─────────────────────────────────────────────────────────────────────────
  const derived = useMemo(() => {
    const nonVoidedInvoices = state.invoices.filter((inv) => !inv.voided);
    const activeReturns = (state.salesReturns || []).filter((r) => r.status !== "Cancelled");

    // Today's Operations
    const todaysInvoices = nonVoidedInvoices.filter((inv) => inv.date === today);
    const todaysSalesReturns = activeReturns.filter((r) => toLocalDateStr(r.createdAt) === today);
    const todaysRevenue = calculateRevenue(todaysInvoices, todaysSalesReturns);
    const todaysProfit = calculateProfit(todaysInvoices, todaysSalesReturns, state.products);

    // Yesterday's Operations
    const yesterdaysInvoices = nonVoidedInvoices.filter((inv) => inv.date === yesterday);
    const yesterdaysSalesReturns = activeReturns.filter((r) => toLocalDateStr(r.createdAt) === yesterday);
    const yesterdaysRevenue = calculateRevenue(yesterdaysInvoices, yesterdaysSalesReturns);
    const yesterdaysProfit = calculateProfit(yesterdaysInvoices, yesterdaysSalesReturns, state.products);

    // Operational Metrics Today
    const uniqueCustomersToday = new Set(
      todaysInvoices.map((inv) => inv.customerId || inv.customer).filter(Boolean)
    ).size;

    const vehiclesToday = new Set(
      todaysInvoices
        .map((inv) => inv.vehicleModel || inv.vehicleNumber)
        .filter(Boolean)
    ).size;

    const todaysDebtPayments = (state.debtPayments || []).filter(
      (p) => toLocalDateStr(p.date) === today
    );
    const todaysCollectedDebt = todaysDebtPayments.reduce((s, p) => s + p.amount, 0);

    const yesterdaysDebtPayments = (state.debtPayments || []).filter(
      (p) => toLocalDateStr(p.date) === yesterday
    );
    const yesterdaysCollectedDebt = yesterdaysDebtPayments.reduce((s, p) => s + p.amount, 0);

    const todaysCreditInvoices = todaysInvoices.filter((inv) => inv.dueAmount > 0);
    const todaysCreditSalesTotal = todaysCreditInvoices.reduce((s, inv) => s + inv.dueAmount, 0);

    const totalItemsSoldToday = todaysInvoices.reduce(
      (sum, inv) => sum + inv.items.reduce((s, item) => s + item.quantity, 0),
      0
    );

    const avgBillValueToday = todaysInvoices.length > 0 ? Math.round(todaysRevenue / todaysInvoices.length) : 0;
    const avgItemsPerBillToday = todaysInvoices.length > 0 ? (totalItemsSoldToday / todaysInvoices.length).toFixed(1) : "0";

    // Recent Invoices (Audit feed: last 5, newest first)
    const recentInvoices = sortInvoicesDescending(nonVoidedInvoices).slice(0, 5);

    // Top Products by Quantity Sold
    const soldMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    nonVoidedInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        if (!soldMap[item.productId]) {
          soldMap[item.productId] = { name: item.name, qty: 0, revenue: 0 };
        }
        soldMap[item.productId].qty += item.quantity;
      });
    });

    activeReturns.forEach((r) => {
      r.items.forEach((ri) => {
        if (soldMap[ri.productId]) {
          soldMap[ri.productId].qty -= ri.quantity;
        }
      });
    });

    // Top 5 fast moving products
    const topProducts = Object.values(soldMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // Liquidity & Balances
    const cashBal = getCashBalance();
    const bankBal = getBankBalance();
    const upiBal = getUPIBalance();
    const bankUpiTotal = bankBal + upiBal;

    // Debt & Liabilities
    const totalOutstandingDebt = getTotalOutstandingDebt();
    const storeCreditLiability = getTotalCustomerCreditLiability();

    // Inventory Health
    const lowStockItems = getLowStockProducts();
    const outOfStockItems = getOutOfStockProducts();
    const activeProducts = state.products.filter((p) => (p.status || "Active") === "Active");
    const totalActiveProductsCount = activeProducts.length;
    const healthyStockCount = Math.max(
      0,
      totalActiveProductsCount - lowStockItems.length - outOfStockItems.length
    );
    const inventoryHealthPct =
      totalActiveProductsCount > 0
        ? Math.round((healthyStockCount / totalActiveProductsCount) * 100)
        : 100;
    const warehouseValuation = getInventoryValue();

    // Procurement / Purchase Orders
    const allPOs = state.purchaseOrders || [];
    const openPOs = allPOs.filter(
      (po) =>
        po.status === "Draft" ||
        po.status === "Sent" ||
        po.status === "Supplier Confirmed" ||
        po.status === "Partially Delivered"
    );
    const openPOValue = openPOs.reduce(
      (sum, po) => sum + po.items.reduce((s, i) => s + i.quantity * i.expectedBuyPrice, 0),
      0
    );

    const nowMs = Date.now();
    const latePOs = allPOs.filter((po) => {
      if (po.status === "Completed" || po.status === "Cancelled") return false;
      return new Date(po.expectedDeliveryDate).getTime() < nowMs;
    });

    const deliveriesTodayPOs = allPOs.filter((po) => {
      if (po.status === "Completed" || po.status === "Cancelled") return false;
      return toLocalDateStr(po.expectedDeliveryDate) === today;
    });

    // Fitment Health
    const productsMissingFitment = activeProducts.filter(
      (p) => !p.isUniversalFit && (!p.fitments || p.fitments.length === 0)
    );

    // Credit Invoices & Debtors
    const openCreditInvoices = nonVoidedInvoices.filter((inv) => inv.dueAmount > 0);
    const debtorCustomers = state.customers.filter((c) => getCustomerOutstandingBalance(c.id) > 0);

    return {
      todaysInvoices,
      todaysSalesReturns,
      todaysRevenue,
      todaysProfit,
      yesterdaysInvoices,
      yesterdaysSalesReturns,
      yesterdaysRevenue,
      yesterdaysProfit,
      uniqueCustomersToday,
      vehiclesToday,
      todaysCollectedDebt,
      yesterdaysCollectedDebt,
      todaysCreditInvoices,
      todaysCreditSalesTotal,
      totalItemsSoldToday,
      avgBillValueToday,
      avgItemsPerBillToday,
      recentInvoices,
      topProducts,
      cashBal,
      bankBal,
      upiBal,
      bankUpiTotal,
      totalOutstandingDebt,
      storeCreditLiability,
      lowStockItems,
      outOfStockItems,
      totalActiveProductsCount,
      inventoryHealthPct,
      warehouseValuation,
      openPOs,
      openPOValue,
      latePOs,
      deliveriesTodayPOs,
      productsMissingFitment,
      openCreditInvoices,
      debtorCustomers,
    };
  }, [
    state.invoices,
    state.salesReturns,
    state.products,
    state.customers,
    state.debtPayments,
    state.purchaseOrders,
    state.financeTransactions,
    today,
    yesterday,
    getCashBalance,
    getBankBalance,
    getUPIBalance,
    getTotalOutstandingDebt,
    getTotalCustomerCreditLiability,
    getLowStockProducts,
    getOutOfStockProducts,
    getInventoryValue,
    getCustomerOutstandingBalance,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  //  2. ACTION INBOX ENGINE (OPERATIONAL INTERRUPTIONS ONLY - NO FITMENT)
  // ─────────────────────────────────────────────────────────────────────────
  const actionInbox = useMemo(() => {
    const items: ActionInboxItem[] = [];
    const nowMs = Date.now();

    // ── INVENTORY NOTIFICATIONS (BATCHED & CONTEXTUAL) ──
    if (derived.outOfStockItems.length > 0) {
      const top3Names = derived.outOfStockItems.slice(0, 3).map((p) => p.name).join(", ");
      const extraCount = derived.outOfStockItems.length > 3 ? ` +${derived.outOfStockItems.length - 3} more` : "";
      items.push({
        id: "inbox-out-of-stock",
        priority: "Critical",
        category: "Inventory",
        title: `${derived.outOfStockItems.length} Product(s) Completely Out of Stock`,
        description: `Critical warehouse stockout: ${top3Names}${extraCount}. Restock immediately to prevent sales loss.`,
        timestamp: "Active Stockout",
        urgencyValue: 1000 + derived.outOfStockItems.length,
        actionText: "Restock Inventory",
        actionHref: "/inventory",
      });
    }

    if (derived.lowStockItems.length > 0) {
      const top3Low = derived.lowStockItems.slice(0, 3).map((p) => `${p.name} (${p.stock} left)`).join(", ");
      items.push({
        id: "inbox-low-stock",
        priority: "High",
        category: "Inventory",
        title: `${derived.lowStockItems.length} Product(s) Below Low Stock Threshold`,
        description: `Running low: ${top3Low}. Reorder before catalog stockout.`,
        timestamp: "Low Threshold",
        urgencyValue: 500 + derived.lowStockItems.length,
        actionText: "Reorder Stock",
        actionHref: "/inventory",
      });
    }

    // ── SUPPLIER & PROCUREMENT NOTIFICATIONS (CONTEXTUAL AGING) ──
    if (derived.latePOs.length > 0) {
      const oldestLatePO = [...derived.latePOs].sort(
        (a, b) => new Date(a.expectedDeliveryDate).getTime() - new Date(b.expectedDeliveryDate).getTime()
      )[0];
      const overdueDays = Math.max(
        1,
        Math.floor((nowMs - new Date(oldestLatePO.expectedDeliveryDate).getTime()) / (24 * 60 * 60 * 1000))
      );
      const supplierName = state.suppliers.find((s) => s.id === oldestLatePO.supplierId)?.name || "Supplier";

      items.push({
        id: "inbox-po-overdue",
        priority: "Critical",
        category: "Suppliers",
        title: `${derived.latePOs.length} Purchase Order(s) Past Delivery Date (${oldestLatePO.poNumber})`,
        description: `Supplier "${supplierName}" fulfillment delayed by ${overdueDays} day(s). Expected: ${formatDateOnlyIST(oldestLatePO.expectedDeliveryDate)}.`,
        timestamp: `Overdue by ${overdueDays}d`,
        urgencyValue: 2000 + overdueDays * 100,
        actionText: "Inspect PO",
        actionHref: "/suppliers",
      });
    }

    if (derived.deliveriesTodayPOs.length > 0) {
      const firstPO = derived.deliveriesTodayPOs[0];
      const supplierName = state.suppliers.find((s) => s.id === firstPO.supplierId)?.name || "Supplier";
      items.push({
        id: "inbox-po-today",
        priority: "High",
        category: "Suppliers",
        title: `${derived.deliveriesTodayPOs.length} Supplier Delivery Expected Today (${firstPO.poNumber})`,
        description: `Incoming delivery from "${supplierName}" scheduled for arrival today. Inspect items upon receipt.`,
        timestamp: "Today",
        urgencyValue: 800 + derived.deliveriesTodayPOs.length,
        actionText: "Receive Delivery",
        actionHref: "/suppliers",
      });
    }

    // ── BILLING & POS NOTIFICATIONS ──
    if ((state.holdBills || []).length > 0) {
      items.push({
        id: "inbox-parked-bills",
        priority: "Medium",
        category: "Billing",
        title: `${state.holdBills.length} Parked Bill(s) On Hold at Checkout Counter`,
        description: `Saved checkout sessions awaiting customer payment completion.`,
        timestamp: "POS Counter",
        urgencyValue: 300 + state.holdBills.length,
        actionText: "Resume Checkout",
        actionHref: "/billing",
      });
    }

    if (derived.todaysSalesReturns.length > 0) {
      const returnCount = derived.todaysSalesReturns.length;
      const refundSum = derived.todaysSalesReturns.reduce((s, r) => s + r.totalRefund, 0);
      items.push({
        id: "inbox-returns-today",
        priority: "Info",
        category: "Returns",
        title: `${returnCount} Sales Return(s) Billed Today (₹${refundSum.toLocaleString()})`,
        description: `Sales returns & exchanges processed today. Verify returned stock condition.`,
        timestamp: "Today",
        urgencyValue: 50 + returnCount,
        actionText: "Review Invoices",
        actionHref: "/invoices",
      });
    }

    // ── OWNER-ONLY FINANCIAL & CUSTOMER NOTIFICATIONS (CONSOLIDATED & CONTEXTUAL) ──
    if (isOwner) {
      if (derived.totalOutstandingDebt > 0 && derived.debtorCustomers.length > 0) {
        // Find top debtor by outstanding amount
        const topDebtor = [...derived.debtorCustomers].sort(
          (a, b) => getCustomerOutstandingBalance(b.id) - getCustomerOutstandingBalance(a.id)
        )[0];
        const topDebtAmount = getCustomerOutstandingBalance(topDebtor.id);

        items.push({
          id: "inbox-customer-debt",
          priority: "High",
          category: "Customers",
          title: `₹${derived.totalOutstandingDebt.toLocaleString()} Customer Debt Pending across ${derived.debtorCustomers.length} Account(s)`,
          description: `Top balance: ₹${topDebtAmount.toLocaleString()} owed by "${topDebtor.name}". Immediate collection call recommended.`,
          timestamp: "Customer Ledger",
          urgencyValue: 900 + Math.min(999, Math.floor(derived.totalOutstandingDebt / 1000)),
          actionText: "Collect Dues",
          actionHref: "/customers?filter=High Debt",
        });
      }

      if (derived.storeCreditLiability > 0) {
        items.push({
          id: "inbox-store-credit",
          priority: "Info",
          category: "Customers",
          title: `₹${derived.storeCreditLiability.toLocaleString()} Active Customer Store Credit Liability`,
          description: `Unredeemed customer store credits held in ledger. Remind patrons at next checkout.`,
          timestamp: "Ledger",
          urgencyValue: 40 + Math.min(50, Math.floor(derived.storeCreditLiability / 1000)),
          actionText: "View Credit Ledger",
          actionHref: "/customers",
        });
      }

      const ninetyDaysAgoMs = nowMs - 90 * 24 * 60 * 60 * 1000;
      const inactiveVips = state.customers.filter((c) => {
        const rev = calculateRevenue(state.invoices, state.salesReturns, undefined, c.id);
        const lastMs = c.lastVisit ? new Date(c.lastVisit).getTime() : 0;
        return rev >= 25000 && (lastMs === 0 || lastMs < ninetyDaysAgoMs);
      });

      if (inactiveVips.length > 0) {
        const topVip = inactiveVips[0];
        items.push({
          id: "inbox-inactive-vips",
          priority: "Medium",
          category: "Customers",
          title: `${inactiveVips.length} High-Value VIP Patron(s) Inactive for 90+ Days`,
          description: `Patrons at risk of churn: "${topVip.name}" (Last visit: ${topVip.lastVisit || "No visits recorded"}). Courtesy outreach advised.`,
          timestamp: "Retention Alert",
          urgencyValue: 250 + inactiveVips.length,
          actionText: "Open Customers",
          actionHref: "/customers",
        });
      }
    }

    // Strict Deterministic Sorting:
    // Primary: Priority Rank (Critical = 1 -> Info = 4)
    // Secondary: Urgency Value Descending
    items.sort((a, b) => {
      const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (rankDiff !== 0) return rankDiff;
      return b.urgencyValue - a.urgencyValue;
    });

    return items;
  }, [
    derived.outOfStockItems,
    derived.lowStockItems,
    derived.latePOs,
    derived.deliveriesTodayPOs,
    derived.totalOutstandingDebt,
    derived.debtorCustomers,
    derived.storeCreditLiability,
    derived.todaysSalesReturns,
    state.holdBills,
    state.customers,
    state.invoices,
    state.salesReturns,
    state.suppliers,
    isOwner,
    getCustomerOutstandingBalance,
  ]);

  // Filtered Inbox Items
  const filteredInbox = useMemo(() => {
    if (inboxFilter === "All") return actionInbox;
    return actionInbox.filter((item) => item.category === inboxFilter);
  }, [actionInbox, inboxFilter]);

  // ─────────────────────────────────────────────────────────────────────────
  //  3. RECOMMENDED NEXT ACTION (EXACTLY ONE HIGHEST PRIORITY ITEM)
  // ─────────────────────────────────────────────────────────────────────────
  const recommendedNextAction = useMemo(() => {
    if (actionInbox.length === 0) return null;
    return actionInbox[0]; // Highest priority & highest urgency
  }, [actionInbox]);

  // ─────────────────────────────────────────────────────────────────────────
  //  4. MAINTENANCE REMINDERS (NON-URGENT MASTER DATA MAINTENANCE)
  // ─────────────────────────────────────────────────────────────────────────
  const maintenanceReminders = useMemo(() => {
    const list: MaintenanceReminderItem[] = [];

    if (derived.productsMissingFitment.length > 0) {
      list.push({
        id: "maint-fitment-missing",
        title: "Vehicle Compatibility Mapping",
        description: `${derived.productsMissingFitment.length} product(s) still need fitment mapping. This does NOT block business operations.`,
        actionText: "Open Vehicle Fitment",
        actionHref: "/vehicle-fitment",
      });
    }

    return list;
  }, [derived.productsMissingFitment]);

  // ─────────────────────────────────────────────────────────────────────────
  //  5. TODAY'S ACTION CHECKLIST (DYNAMICALLY GENERATED WITH CLEAR FORMATTING)
  // ─────────────────────────────────────────────────────────────────────────
  const actionChecklist = useMemo(() => {
    const list: ChecklistItem[] = [];

    if (derived.outOfStockItems.length > 0) {
      list.push({
        id: "chk-out-of-stock",
        action: "Restock warehouse",
        context: `${derived.outOfStockItems.length} product(s) completely out of stock`,
      });
    }

    if (derived.lowStockItems.length > 0) {
      list.push({
        id: "chk-low-stock",
        action: "Reorder catalog stock",
        context: `${derived.lowStockItems.length} product(s) below threshold`,
      });
    }

    if (derived.latePOs.length > 0) {
      list.push({
        id: "chk-late-pos",
        action: "Receive supplier deliveries",
        context: `${derived.latePOs.length} overdue purchase order(s)`,
      });
    } else if (derived.deliveriesTodayPOs.length > 0) {
      const firstSupplier = state.suppliers.find((s) => s.id === derived.deliveriesTodayPOs[0]?.supplierId)?.name || "Supplier";
      list.push({
        id: "chk-deliveries-today",
        action: "Receive supplier deliveries",
        context: `Expected today: ${firstSupplier}`,
      });
    }

    if ((state.holdBills || []).length > 0) {
      list.push({
        id: "chk-parked-bills",
        action: "Resume parked checkout",
        context: `${state.holdBills.length} bill(s) waiting at POS`,
      });
    }

    if (isOwner && derived.totalOutstandingDebt > 0) {
      list.push({
        id: "chk-customer-debt",
        action: "Collect customer payments",
        context: `₹${derived.totalOutstandingDebt.toLocaleString()} outstanding across ${derived.debtorCustomers.length} customer(s)`,
      });
    }

    if (derived.todaysSalesReturns.length > 0) {
      list.push({
        id: "chk-returns",
        action: "Review today's returns",
        context: `${derived.todaysSalesReturns.length} sales return(s) processed today`,
      });
    }

    return list;
  }, [
    derived.outOfStockItems,
    derived.lowStockItems,
    derived.latePOs,
    derived.deliveriesTodayPOs,
    derived.totalOutstandingDebt,
    derived.debtorCustomers,
    derived.todaysSalesReturns,
    state.holdBills,
    state.suppliers,
    isOwner,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  //  6. DETERMINISTIC BUSINESS HEALTH SCORE (OWNER ONLY, 0-100 SCALE)
  // ─────────────────────────────────────────────────────────────────────────
  const healthScoreData = useMemo(() => {
    let salesScore = 20;
    if (derived.todaysRevenue >= derived.yesterdaysRevenue && derived.todaysRevenue > 0) salesScore = 20;
    else if (derived.todaysRevenue > 0) salesScore = 14;
    else salesScore = 8;

    let inventoryScore = 20;
    if (derived.inventoryHealthPct >= 90) inventoryScore = 20;
    else if (derived.inventoryHealthPct >= 75) inventoryScore = 15;
    else if (derived.inventoryHealthPct >= 50) inventoryScore = 10;
    else inventoryScore = 5;

    let debtScore = 20;
    if (derived.totalOutstandingDebt === 0) debtScore = 20;
    else if (derived.totalOutstandingDebt <= 25000) debtScore = 15;
    else if (derived.totalOutstandingDebt <= 100000) debtScore = 10;
    else debtScore = 5;

    let poScore = 15;
    if (derived.latePOs.length === 0) poScore = 15;
    else if (derived.latePOs.length <= 2) poScore = 10;
    else poScore = 5;

    let returnScore = 15;
    if (derived.todaysSalesReturns.length === 0) returnScore = 15;
    else if (derived.todaysSalesReturns.length <= 2) returnScore = 10;
    else returnScore = 5;

    let cashScore = 10;
    if (derived.cashBal > 0 || derived.bankUpiTotal > 0) cashScore = 10;
    else cashScore = 5;

    const totalScore = Math.min(100, Math.max(0, salesScore + inventoryScore + debtScore + poScore + returnScore + cashScore));

    let status = "Healthy";
    let statusBadge = "bg-emerald-100 text-emerald-800 border-emerald-300";

    if (totalScore >= 85) {
      status = "Excellent Operational Health";
      statusBadge = "bg-emerald-100 text-emerald-800 border-emerald-300";
    } else if (totalScore >= 70) {
      status = "Healthy Operations";
      statusBadge = "bg-blue-100 text-blue-800 border-blue-300";
    } else if (totalScore >= 50) {
      status = "Moderate Attention Needed";
      statusBadge = "bg-amber-100 text-amber-800 border-amber-300";
    } else {
      status = "Critical Actions Required";
      statusBadge = "bg-red-100 text-red-800 border-red-300";
    }

    return {
      totalScore,
      status,
      statusBadge,
      breakdown: {
        salesScore,
        inventoryScore,
        debtScore,
        poScore,
        returnScore,
        cashScore,
      },
    };
  }, [
    derived.todaysRevenue,
    derived.yesterdaysRevenue,
    derived.inventoryHealthPct,
    derived.totalOutstandingDebt,
    derived.latePOs,
    derived.todaysSalesReturns,
    derived.cashBal,
    derived.bankUpiTotal,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  //  7. FAST STOCK LOOKUP RESULTS
  // ─────────────────────────────────────────────────────────────────────────
  const matchedLookupProducts = useMemo(() => {
    const q = lookupQuery.trim().toLowerCase();
    if (!q) return [];
    return state.products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 4);
  }, [state.products, lookupQuery]);

  if (loading) return null;

  // ─────────────────────────────────────────────────────────────────────────
  //  MAIN RENDER — ERP MISSION CONTROL & OPERATIONS COMMAND CENTER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">

      {/* ── TOP HEADER CONTROL BAR ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-navy-950 text-yellow-400 flex items-center justify-center font-black shadow-xs">
              <Zap size={22} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-navy-950 tracking-tight flex items-center gap-2">
                {isOwner ? "ERP Mission Control" : "Store Operations Command"}
                {!isOwner && (
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider">
                    Staff View
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                7 Star Car Accessories · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/billing"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 active:scale-95 text-navy-950 text-xs font-black px-5 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer font-sans"
          >
            <ShoppingCart size={15} />
            POS Billing Terminal
          </Link>
        </div>
      </div>

      {/* ── SECTION 1 — EXECUTIVE COMMAND CENTER (OWNER ONLY) ─────────────── */}
      {isOwner && (
        <section className="bg-gradient-to-r from-navy-950 via-slate-900 to-navy-900 text-white rounded-2xl p-6 shadow-md border border-navy-800 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-yellow-400" />
              <h2 className="text-sm uppercase tracking-widest font-black text-white">Executive Command Snapshot</h2>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Real-time daily operations &amp; liquidity</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl">
              <span className="text-[10px] font-extrabold uppercase text-yellow-400 block tracking-wider">Today&apos;s Sales</span>
              <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">₹{derived.todaysRevenue.toLocaleString()}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">{derived.todaysInvoices.length} bill(s) today</span>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl">
              <span className="text-[10px] font-extrabold uppercase text-purple-300 block tracking-wider">Today&apos;s Profit</span>
              <span className="text-xl font-black text-purple-300 font-mono mt-1 block">₹{derived.todaysProfit.toLocaleString()}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Net margin today</span>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl">
              <span className="text-[10px] font-extrabold uppercase text-blue-300 block tracking-wider">Cash Register</span>
              <span className="text-xl font-black text-blue-300 font-mono mt-1 block">₹{derived.cashBal.toLocaleString()}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Physical cash drawer</span>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl">
              <span className="text-[10px] font-extrabold uppercase text-indigo-300 block tracking-wider">Bank &amp; UPI</span>
              <span className="text-xl font-black text-indigo-300 font-mono mt-1 block">₹{derived.bankUpiTotal.toLocaleString()}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Digital accounts</span>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl">
              <span className="text-[10px] font-extrabold uppercase text-red-400 block tracking-wider">Customer Debt</span>
              <span className="text-xl font-black text-red-400 font-mono mt-1 block">₹{derived.totalOutstandingDebt.toLocaleString()}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">{derived.debtorCustomers.length} debtor account(s)</span>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl">
              <span className="text-[10px] font-extrabold uppercase text-amber-400 block tracking-wider">Store Credit</span>
              <span className="text-xl font-black text-amber-400 font-mono mt-1 block">₹{derived.storeCreditLiability.toLocaleString()}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Active credit liability</span>
            </div>
          </div>
        </section>
      )}

      {/* ── RECOMMENDED NEXT ACTION (EXACTLY ONE HIGHEST PRIORITY ITEM) ───── */}
      {recommendedNextAction && (
        <section className="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400 text-navy-950 rounded-2xl p-4 sm:p-5 shadow-sm border border-yellow-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-navy-950 text-yellow-400 flex items-center justify-center font-black shrink-0 shadow-xs">
              <Compass size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest bg-navy-950 text-white px-2.5 py-0.5 rounded-full">
                  Recommended Next Action
                </span>
                <span className="text-xs font-mono font-bold text-navy-900 opacity-80">
                  Priority 1 of {actionInbox.length}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-black text-navy-950 mt-1">{recommendedNextAction.title}</h3>
              <p className="text-xs text-navy-900 font-medium opacity-90 leading-tight">{recommendedNextAction.description}</p>
            </div>
          </div>

          <Link
            href={recommendedNextAction.actionHref}
            className="shrink-0 inline-flex items-center justify-center gap-2 bg-navy-950 hover:bg-navy-900 text-white text-xs font-extrabold px-5 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer"
          >
            {recommendedNextAction.actionText}
            <ArrowRight size={14} />
          </Link>
        </section>
      )}

      {/* ── SECTION 2 — ACTION INBOX ⭐ (CORE OPERATIONS CENTER) ──────────── */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8.5 h-8.5 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold">
              <Inbox size={19} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">ERP Action Inbox</h2>
                <span className="bg-navy-950 text-yellow-400 text-xs font-black px-2.5 py-0.5 rounded-full font-mono">
                  {actionInbox.length} Actionable Alert{actionInbox.length !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">Prioritized cross-module operational tasks requiring immediate attention</p>
            </div>
          </div>

          {/* Filter Pill Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(["All", "Inventory", "Customers", "Suppliers", "Billing", "Returns"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setInboxFilter(cat)}
                className={`text-xs font-extrabold px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 ${
                  inboxFilter === cat
                    ? "bg-navy-950 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Inbox Items Feed */}
        {filteredInbox.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 bg-emerald-50/40 rounded-2xl border border-emerald-200 p-6">
            <CheckCircle size={40} className="text-emerald-600" />
            <p className="font-extrabold text-emerald-900 text-base">Everything looks good.</p>
            <p className="text-xs text-emerald-700 font-medium">No urgent operational actions required for this filter view.</p>
            {lastEvaluatedTime && (
              <span className="text-[10px] font-mono text-emerald-600 mt-2 bg-emerald-100/80 px-3 py-1 rounded-full border border-emerald-200">
                Last evaluated at {lastEvaluatedTime} IST
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInbox.map((item) => {
              const badge = PRIORITY_BADGE[item.priority];
              const CatIcon = CATEGORY_ICONS[item.category] || Activity;
              return (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-300 transition-colors shadow-2xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 shrink-0 mt-0.5">
                      <CatIcon size={18} />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${badge.bg} ${badge.border}`}>
                          {badge.icon} {badge.text}
                        </span>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                          {item.category}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 font-medium">{item.timestamp}</span>
                      </div>
                      <h3 className="font-bold text-sm text-slate-900 truncate">{item.title}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                    </div>
                  </div>

                  <Link
                    href={item.actionHref}
                    className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-navy-950 hover:bg-navy-900 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-2xs cursor-pointer"
                  >
                    {item.actionText}
                    <ArrowRight size={13} />
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TODAY'S DYNAMIC ACTION CHECKLIST ───────────────────────────── */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare size={16} className="text-navy-950" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Today&apos;s Action Checklist</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Derived live from Action Inbox state</span>
          </div>

          {actionChecklist.length === 0 ? (
            <p className="text-xs text-emerald-700 font-medium bg-emerald-50 p-3.5 rounded-xl border border-emerald-100">
              ✅ All operational tasks completed. No pending work for today.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
              {actionChecklist.map((item) => (
                <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5">
                  <span className="w-4 h-4 rounded border border-slate-300 bg-white flex items-center justify-center shrink-0 text-slate-300 text-[10px] mt-0.5">
                    ☐
                  </span>
                  <div className="min-w-0">
                    <p className="font-extrabold text-slate-900 leading-tight">{item.action}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-tight">{item.context}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── MAINTENANCE REMINDERS (NON-URGENT MASTER DATA MAINTENANCE) ──── */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-slate-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Maintenance Reminders
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Non-urgent administrative work</span>
        </div>

        {maintenanceReminders.length === 0 ? (
          <p className="text-xs text-slate-600 font-medium bg-slate-50 p-3 rounded-xl border border-slate-200">
            ✅ No maintenance reminders. All master data is up to date.
          </p>
        ) : (
          <div className="space-y-2">
            {maintenanceReminders.map((item) => (
              <div
                key={item.id}
                className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0 mt-0.5">
                    <Car size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                        Master Data
                      </span>
                      <h4 className="font-bold text-xs text-slate-800">{item.title}</h4>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-normal">{item.description}</p>
                  </div>
                </div>

                <Link
                  href={item.actionHref}
                  className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                >
                  {item.actionText}
                  <ArrowRight size={13} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── SECTION 3 — OPERATIONAL SNAPSHOT & SECTION 4 — LIVE STORE STATUS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* SECTION 3 — Operational Numbers Today */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-navy-950" />
              <h2 className="text-base font-extrabold text-slate-900">Today&apos;s Operational Snapshot</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">Daily counter throughput</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-slate-500 font-semibold block">Bills Billed</span>
              <span className="text-xl font-black text-slate-900 font-mono mt-1 block">{derived.todaysInvoices.length}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-slate-500 font-semibold block">Customers Served</span>
              <span className="text-xl font-black text-blue-700 font-mono mt-1 block">{derived.uniqueCustomersToday}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-slate-500 font-semibold block">Vehicles Serviced</span>
              <span className="text-xl font-black text-purple-700 font-mono mt-1 block">{derived.vehiclesToday}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-slate-500 font-semibold block">Sales Returns</span>
              <span className="text-xl font-black text-orange-600 font-mono mt-1 block">{derived.todaysSalesReturns.length}</span>
            </div>

            {isOwner && (
              <>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-slate-500 font-semibold block">Debt Collected</span>
                  <span className="text-xl font-black text-emerald-700 font-mono mt-1 block">₹{derived.todaysCollectedDebt.toLocaleString()}</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-slate-500 font-semibold block">Credit Billed</span>
                  <span className="text-xl font-black text-red-600 font-mono mt-1 block">₹{derived.todaysCreditSalesTotal.toLocaleString()}</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-slate-500 font-semibold block">Average Bill Value</span>
                  <span className="text-xl font-black text-navy-950 font-mono mt-1 block">₹{derived.avgBillValueToday.toLocaleString()}</span>
                </div>
              </>
            )}

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-slate-500 font-semibold block">Avg Items / Bill</span>
              <span className="text-xl font-black text-slate-800 font-mono mt-1 block">{derived.avgItemsPerBillToday}</span>
            </div>
          </div>
        </section>

        {/* SECTION 4 — Live Store & Warehouse Status */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Package size={18} className="text-amber-600" />
              <h2 className="text-base font-extrabold text-slate-900">Live Inventory &amp; Warehouse Status</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">Real-time stock health</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-red-50/60 border border-red-100 rounded-xl">
              <span className="text-red-700 font-semibold block">Out of Stock</span>
              <span className="text-xl font-black text-red-700 font-mono mt-1 block">{derived.outOfStockItems.length} items</span>
            </div>

            <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl">
              <span className="text-amber-800 font-semibold block">Low Stock</span>
              <span className="text-xl font-black text-amber-700 font-mono mt-1 block">{derived.lowStockItems.length} items</span>
            </div>

            <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl">
              <span className="text-emerald-800 font-semibold block">Stock Health Score</span>
              <span className="text-xl font-black text-emerald-700 font-mono mt-1 block">{derived.inventoryHealthPct}%</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-slate-600 font-semibold block">Open POs Pending</span>
              <span className="text-xl font-black text-blue-700 font-mono mt-1 block">{derived.openPOs.length} POs</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-slate-600 font-semibold block">Deliveries Today</span>
              <span className="text-xl font-black text-purple-700 font-mono mt-1 block">{derived.deliveriesTodayPOs.length} due</span>
            </div>

            {isOwner && (
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-slate-600 font-semibold block">Warehouse Valuation</span>
                <span className="text-xl font-black text-navy-950 font-mono mt-1 block">₹{derived.warehouseValuation.toLocaleString()}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── SECTION 6 — BUSINESS HEALTH SCORE (OWNER ONLY) ────────────────── */}
      {isOwner && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-yellow-500" />
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Deterministic ERP Business Health Index</h2>
                <p className="text-xs text-slate-500">Pure rule-based score derived across sales, stock, debt, POs &amp; returns</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`text-xs font-black px-3 py-1 rounded-full border ${healthScoreData.statusBadge}`}>
                {healthScoreData.status}
              </span>
              <button
                type="button"
                onClick={() => setShowHealthBreakdown(!showHealthBreakdown)}
                className="text-xs text-blue-600 hover:underline font-bold cursor-pointer"
              >
                {showHealthBreakdown ? "Hide Details ↑" : "View Breakdown ↓"}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
            <div className="relative w-36 h-36 rounded-full border-8 border-slate-100 flex items-center justify-center bg-slate-50 shadow-inner shrink-0">
              <div className="text-center">
                <span className="text-4xl font-black text-slate-900 font-mono">{healthScoreData.totalScore}</span>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">out of 100</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1 text-xs w-full">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-slate-500 font-semibold">Sales Momentum:</span>
                <span className="font-bold text-slate-900 font-mono block text-sm mt-0.5">
                  {healthScoreData.breakdown.salesScore} / 20 pts
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-slate-500 font-semibold">Inventory Health:</span>
                <span className="font-bold text-slate-900 font-mono block text-sm mt-0.5">
                  {healthScoreData.breakdown.inventoryScore} / 20 pts
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-slate-500 font-semibold">Receivables &amp; Debt:</span>
                <span className="font-bold text-slate-900 font-mono block text-sm mt-0.5">
                  {healthScoreData.breakdown.debtScore} / 20 pts
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-slate-500 font-semibold">PO Fulfillment:</span>
                <span className="font-bold text-slate-900 font-mono block text-sm mt-0.5">
                  {healthScoreData.breakdown.poScore} / 15 pts
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-slate-500 font-semibold">Return Compliance:</span>
                <span className="font-bold text-slate-900 font-mono block text-sm mt-0.5">
                  {healthScoreData.breakdown.returnScore} / 15 pts
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-slate-500 font-semibold">Liquidity Position:</span>
                <span className="font-bold text-slate-900 font-mono block text-sm mt-0.5">
                  {healthScoreData.breakdown.cashScore} / 10 pts
                </span>
              </div>
            </div>
          </div>

          {showHealthBreakdown && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2 animate-in fade-in duration-200">
              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Score Logic Rules:</h4>
              <ul className="list-disc pl-5 text-slate-600 space-y-1">
                <li><strong>Sales (20pts):</strong> Max 20pts if today&apos;s revenue meets/exceeds yesterday; 14pts if active sales today.</li>
                <li><strong>Inventory (20pts):</strong> Based on active product stock health % (≥90% = 20pts).</li>
                <li><strong>Debt (20pts):</strong> Max 20pts if outstanding customer debt is zero.</li>
                <li><strong>PO Fulfillment (15pts):</strong> Max 15pts if zero overdue purchase orders.</li>
                <li><strong>Returns (15pts):</strong> Max 15pts if zero sales returns processed today.</li>
                <li><strong>Liquidity (10pts):</strong> 10pts if positive cash register or bank account balance exists.</li>
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── SECTION 7 — MINI TRENDS (TODAY VS YESTERDAY) ──────────────────── */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-blue-600" />
            <h2 className="text-base font-extrabold text-slate-900">Mini Trend Comparison (Today vs Yesterday)</h2>
          </div>
          <span className="text-xs text-slate-400 font-medium">Daily operational movement</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          {isOwner && (
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col justify-between">
              <div>
                <span className="text-slate-500 font-semibold block">Sales Revenue</span>
                <span className="text-lg font-black text-slate-900 font-mono mt-1 block">₹{derived.todaysRevenue.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-[11px] font-extrabold font-mono">
                {derived.todaysRevenue >= derived.yesterdaysRevenue ? (
                  <span className="text-emerald-600 flex items-center gap-0.5">
                    <ArrowUpRight size={13} />
                    +₹{(derived.todaysRevenue - derived.yesterdaysRevenue).toLocaleString()} vs Yday
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center gap-0.5">
                    <ArrowDownRight size={13} />
                    -₹{(derived.yesterdaysRevenue - derived.todaysRevenue).toLocaleString()} vs Yday
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col justify-between">
            <div>
              <span className="text-slate-500 font-semibold block">Bills Generated</span>
              <span className="text-lg font-black text-slate-900 font-mono mt-1 block">{derived.todaysInvoices.length}</span>
            </div>
            <div className="flex items-center gap-1 mt-2 text-[11px] font-extrabold font-mono">
              {derived.todaysInvoices.length >= derived.yesterdaysInvoices.length ? (
                <span className="text-emerald-600 flex items-center gap-0.5">
                  <ArrowUpRight size={13} />
                  +{derived.todaysInvoices.length - derived.yesterdaysInvoices.length} vs Yday
                </span>
              ) : (
                <span className="text-red-600 flex items-center gap-0.5">
                  <ArrowDownRight size={13} />
                  -{derived.yesterdaysInvoices.length - derived.todaysInvoices.length} vs Yday
                </span>
              )}
            </div>
          </div>

          {isOwner && (
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col justify-between">
              <div>
                <span className="text-slate-500 font-semibold block">Debt Collected</span>
                <span className="text-lg font-black text-emerald-700 font-mono mt-1 block">₹{derived.todaysCollectedDebt.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-[11px] font-extrabold font-mono">
                {derived.todaysCollectedDebt >= derived.yesterdaysCollectedDebt ? (
                  <span className="text-emerald-600 flex items-center gap-0.5">
                    <ArrowUpRight size={13} />
                    +₹{(derived.todaysCollectedDebt - derived.yesterdaysCollectedDebt).toLocaleString()} vs Yday
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center gap-0.5">
                    <ArrowDownRight size={13} />
                    -₹{(derived.yesterdaysCollectedDebt - derived.todaysCollectedDebt).toLocaleString()} vs Yday
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col justify-between">
            <div>
              <span className="text-slate-500 font-semibold block">Sales Returns</span>
              <span className="text-lg font-black text-orange-600 font-mono mt-1 block">{derived.todaysSalesReturns.length}</span>
            </div>
            <div className="flex items-center gap-1 mt-2 text-[11px] font-extrabold font-mono text-slate-500">
              Yesterday: {derived.yesterdaysSalesReturns.length} return(s)
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 5 — QUICK OPERATIONS & FAST STOCK CHECKER ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

        {/* Recent Invoices Feed (8/12 grid span) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Recent Customer Invoices</h2>
              <p className="text-xs text-slate-400">Chronological billing log</p>
            </div>
            <Link
              href="/invoices"
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
              View All Invoices →
            </Link>
          </div>

          {derived.recentInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center my-auto">
              <FileText size={32} className="text-slate-200 mb-2" />
              <p className="font-bold text-slate-500 text-xs">No invoices generated yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 my-auto">
              {derived.recentInvoices.map((inv) => (
                <div key={inv.id} className="py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-800">{inv.invoiceNumber}</span>
                      <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${STATUS_BADGE[inv.paymentStatus]}`}>
                        {inv.paymentStatus}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-700 truncate">{inv.customer}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{formatInvoiceDate(inv)}</p>
                  </div>

                  <div className="text-right shrink-0 font-mono space-y-0.5 ml-4">
                    <p className="text-xs font-bold text-slate-900">₹{inv.total.toLocaleString()}</p>
                    {getInvoiceOutstanding(inv) > 0 && (
                      <p className="text-[10px] font-bold text-red-600">Due: ₹{getInvoiceOutstanding(inv).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Shortcut Buttons & Instant Stock Checker (4/12 grid span) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Quick ERP Operations</h2>
            <p className="text-xs text-slate-400">Shortcuts &amp; counter stock checker</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-extrabold">
            <Link href="/billing" className="bg-navy-950 hover:bg-navy-900 text-white p-3 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all shadow-2xs text-center cursor-pointer">
              <ShoppingCart size={16} />
              New Bill
            </Link>

            <Link href="/customers?filter=High Debt" className="bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all shadow-2xs text-center cursor-pointer">
              <Wallet size={16} />
              Collect Debt
            </Link>

            <Link href="/inventory" className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-3 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer">
              <Package size={16} />
              Inventory
            </Link>

            <Link href="/customers" className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-3 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer">
              <Users size={16} />
              Customers
            </Link>

            <Link href="/suppliers" className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-3 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer">
              <Building2 size={16} />
              Suppliers
            </Link>

            <Link href="/vehicle-fitment" className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-3 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer">
              <Car size={16} />
              Fitments
            </Link>

            {isOwner && (
              <Link href="/finance" className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-3 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer">
                <DollarSign size={16} />
                Finance
              </Link>
            )}

            <Link href="/invoices" className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-3 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer">
              <ReceiptText size={16} />
              Invoices
            </Link>
          </div>

          {/* Quick Stock Checker Input */}
          <div className="border-t border-slate-100 pt-3.5 space-y-2">
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Fast Counter Stock Checker</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Type accessory name or SKU..."
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                className="w-full border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white font-medium"
              />
              {lookupQuery && (
                <button
                  type="button"
                  onClick={() => setLookupQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {lookupQuery.trim() && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                {matchedLookupProducts.length === 0 ? (
                  <p className="text-[10px] text-slate-400 text-center py-2">No matching products found</p>
                ) : (
                  matchedLookupProducts.map((p) => {
                    const low = p.stock > 0 && p.stock <= p.lowStockThreshold;
                    const out = p.stock === 0;
                    return (
                      <div key={p.id} className="flex justify-between items-center bg-white border border-slate-100 p-2 rounded-lg text-[10px]">
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-800 truncate">{p.name}</p>
                          <p className="text-[9px] text-slate-400 font-mono mt-0.5">SKU: {p.sku}</p>
                        </div>
                        <span className={`shrink-0 font-bold px-2 py-0.5 rounded-full ${
                          out ? "bg-red-50 text-red-650 border border-red-100" :
                          low ? "bg-amber-50 text-amber-700 border border-amber-100" :
                          "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        }`}>
                          {p.stock} pcs
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}