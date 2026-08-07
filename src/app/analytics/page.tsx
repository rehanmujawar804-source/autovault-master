"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toLocalDateStr, todayLocalStr } from "@/lib/dateUtils";
import { calculateRevenue } from "@/lib/revenueUtils";
import { calculateProfit } from "@/lib/profitUtils";
import StatCard from "@/components/StatCard";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Users,
  Package,
  ShieldCheck,
  Activity,
  Info,
  X,
  Printer,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Zap,
  Building2,
  Eye
} from "lucide-react";
import {
  calculateStockRunoutPredictions,
  analyzeRevenueTrends,
  analyzeProfitTrends,
  getCategoryAndSalesTimingInsights,
  calculateBusinessHealthScore,
  generateRecommendedActions,
  calculatePeriodComparison,
  calculateProductVelocityInsights,
  calculateCustomerInsightsExtended,
  calculateSupplierInsightsExtended,
  calculateCashFlowBreakdown,
  calculateSalesReturnsDetailed,
  generateExplainableSmartInsights,
  calculateFinancialWaterfall,
  StockRunoutPrediction,
  OwnerRecommendedAction,
  ExplainableInsight
} from "@/lib/biAnalytics";

// ─────────────────────────────────────────────────────────────────────────────
// EXPLAINABILITY DICTIONARY FOR KPI POPUPS
// ─────────────────────────────────────────────────────────────────────────────
interface KPIExplanation {
  title: string;
  formula: string;
  sources: string[];
  meaning: string;
  updateFrequency: string;
}

const KPI_EXPLANATIONS: Record<string, KPIExplanation> = {
  billedTotal: {
    title: "Billed Total (Gross Invoice Sum)",
    formula: "SUM(Invoice.total) for all non-voided invoices in selected period",
    sources: ["invoices (non-voided)"],
    meaning: "Total gross dollar amount billed on customer invoices prior to sales returns or refunds.",
    updateFrequency: "Real-time on invoice creation"
  },
  collectedRevenue: {
    title: "Collected Revenue (Net Sales)",
    formula: "calculateRevenue(Invoices, SalesReturns) = SUM(Invoice.total) - SUM(SalesReturn.totalRefund)",
    sources: ["invoices", "salesReturns (active)"],
    meaning: "Actual net revenue generated after deducting customer refunds for returned products.",
    updateFrequency: "Real-time on payment/return"
  },
  netProfit: {
    title: "Net Business Profit (Gross Margin)",
    formula: "calculateProfit() = Net Revenue - Cost of Goods Sold (COGS)",
    sources: ["invoices", "salesReturns", "products.currentCost"],
    meaning: "Gross trading profit earned after deducting FIFO unit buy costs from net sales revenue.",
    updateFrequency: "Real-time on billing"
  },
  pendingDebt: {
    title: "Pending Customer Dues (Receivables)",
    formula: "SUM(Invoice.total - Invoice.amountPaid) for invoices with unpaid balance",
    sources: ["invoices", "customers.debt"],
    meaning: "Total uncollected credit extended to customers. Represents money owed to the business.",
    updateFrequency: "Real-time on credit sale / payment"
  },
  avgOrderValue: {
    title: "Average Order Value (AOV)",
    formula: "Gross Billed Total ÷ Total Invoice Count in period",
    sources: ["invoices"],
    meaning: "Average bill amount per customer checkout transaction.",
    updateFrequency: "Calculated per filter range"
  },
  warehouseValue: {
    title: "Warehouse Inventory Valuation",
    formula: "SUM(Product.stock × Product.currentCost) for all active stock",
    sources: ["products"],
    meaning: "Total wholesale working capital tied up in physical inventory at cost price.",
    updateFrequency: "Real-time on purchase / sale"
  },
  lowStockItems: {
    title: "Low Stock & Out of Stock Items",
    formula: "COUNT(Product) WHERE stock <= lowStockThreshold OR stock == 0",
    sources: ["products"],
    meaning: "Number of catalog items requiring immediate reorder to prevent stockouts.",
    updateFrequency: "Real-time on inventory change"
  },
  liquidCash: {
    title: "Total Liquid Cash Available",
    formula: "Cash in Till + Bank Account Balance + Digital UPI Balance",
    sources: ["financeAccounts (acc-cash, acc-bank, acc-upi)"],
    meaning: "Immediately spendable liquid cash reserves available across cash drawer and bank accounts.",
    updateFrequency: "Real-time on finance transactions"
  },
  businessHealth: {
    title: "Business Health Score (0–100)",
    formula: "Deterministic composite (Cash: 20pt, Debt: 20pt, Payables: 15pt, Stock: 15pt, Profit: 15pt, Rev: 15pt)",
    sources: ["biAnalytics.calculateBusinessHealthScore()"],
    meaning: "Objective store health index evaluating liquidity, credit risk, stock efficiency, and growth trajectory.",
    updateFrequency: "Calculated dynamically"
  }
};

export default function AnalyticsPage() {
  const router = useRouter();
  const { isOwner, role } = useRole();
  const {
    state,
    getCashBalance,
    getBankBalance,
    getUPIBalance,
    getTotalCashAvailable,
    getInventoryValue,
    getTotalOutstandingDebt,
    getTotalSupplierOutstanding
  } = useStore();

  // Access Control Guard
  useEffect(() => {
    if (!isOwner) {
      router.replace("/");
    }
  }, [isOwner, router]);

  // ── Date Range Filters State ─────────────────────────────────────────────
  const [timeRange, setTimeRange] = useState<string>("Month");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // ── UI View Controls ─────────────────────────────────────────────────────
  const [trendView, setTrendView] = useState<"chart" | "waterfall">("chart");
  const [productRankingTab, setProductRankingTab] = useState<"revenue" | "profit" | "velocity" | "deadStock" | "neverSold">("revenue");

  // ── Modal State ──────────────────────────────────────────────────────────
  const [activeExplainKey, setActiveExplainKey] = useState<string | null>(null);
  const [activeDrillModal, setActiveDrillModal] = useState<"moneyVault" | "lowStock" | "debtors" | "deadStock" | null>(null);

  // Hover state and container ref for Area Chart
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleChartPointerMove = (e: React.PointerEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!chartContainerRef.current || !chartData.points || chartData.points.length === 0) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("clientX" in e) {
      clientX = (e as React.PointerEvent<HTMLDivElement>).clientX;
      clientY = (e as React.PointerEvent<HTMLDivElement>).clientY;
    } else {
      return;
    }

    const posX = clientX - rect.left;
    const posY = clientY - rect.top;
    const W = rect.width;
    const H = rect.height;
    if (W <= 0 || H <= 0) return;

    // Hit-testing against rendered 2D (x, y) coordinates of every plotted point
    let closestIndex = -1;
    let minDistance = Infinity;

    chartData.points.forEach((pt, idx) => {
      const px = (pt.x / 800) * W;
      const pySales = (pt.ySales / 200) * H;
      const pyProfit = (pt.yProfit / 200) * H;

      const dSales = Math.hypot(posX - px, posY - pySales);
      const dProfit = Math.hypot(posX - px, posY - pyProfit);
      const dMin = Math.min(dSales, dProfit);

      if (dMin < minDistance) {
        minDistance = dMin;
        closestIndex = idx;
      }
    });

    // Proximity threshold check: snap ONLY when pointer is within reasonable radius
    if (closestIndex >= 0 && chartData.points[closestIndex]) {
      const closestPt = chartData.points[closestIndex];
      const closestPx = (closestPt.x / 800) * W;
      const dxClosest = Math.abs(posX - closestPx);
      if (minDistance <= 50 || dxClosest <= 35) {
        if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
        setHoverIndex(closestIndex);
        return;
      }
    }

    setHoverIndex(null);
  };

  const handleChartPointerLeave = () => {
    if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    setHoverIndex(null);
  };

  const handleChartTouchEnd = () => {
    if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    touchTimeoutRef.current = setTimeout(() => {
      setHoverIndex(null);
    }, 1500);
  };

  // Set default custom date bounds
  useEffect(() => {
    if (timeRange === "Custom" && (!startDate || !endDate)) {
      const today = todayLocalStr();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      setStartDate(thirtyDaysAgo);
      setEndDate(today);
    }
  }, [timeRange, startDate, endDate]);

  // ── 1. Memoized Filtered Invoices, Returns & Purchases ────────────────────
  const filteredInvoices = useMemo(() => {
    const invoices = state.invoices.filter((inv) => !inv.voided);
    if (timeRange === "All") return invoices;

    const now = new Date();
    const todayStr = todayLocalStr();

    if (timeRange === "Today") {
      return invoices.filter((inv) => inv.date === todayStr);
    }

    let cutoffDate = new Date();
    if (timeRange === "Week") {
      cutoffDate.setDate(now.getDate() - 7);
    } else if (timeRange === "Month") {
      cutoffDate.setDate(now.getDate() - 30);
    } else if (timeRange === "Quarter") {
      cutoffDate.setDate(now.getDate() - 90);
    } else if (timeRange === "Year") {
      cutoffDate.setFullYear(now.getFullYear() - 1);
    } else if (timeRange === "Custom" && startDate && endDate) {
      return invoices.filter((inv) => inv.date >= startDate && inv.date <= endDate);
    }

    const cutoffStr = toLocalDateStr(cutoffDate);
    return invoices.filter((inv) => inv.date >= cutoffStr);
  }, [state.invoices, timeRange, startDate, endDate]);

  const filteredSalesReturns = useMemo(() => {
    const returns = (state.salesReturns || []).filter((r) => r.status !== "Cancelled");
    if (timeRange === "All") return returns;

    const now = new Date();
    const todayStr = todayLocalStr();

    if (timeRange === "Today") {
      return returns.filter((r) => (r.createdAt ? r.createdAt.split("T")[0] : "") === todayStr);
    }

    let cutoffDate = new Date();
    if (timeRange === "Week") {
      cutoffDate.setDate(now.getDate() - 7);
    } else if (timeRange === "Month") {
      cutoffDate.setDate(now.getDate() - 30);
    } else if (timeRange === "Quarter") {
      cutoffDate.setDate(now.getDate() - 90);
    } else if (timeRange === "Year") {
      cutoffDate.setFullYear(now.getFullYear() - 1);
    } else if (timeRange === "Custom" && startDate && endDate) {
      return returns.filter((r) => {
        const rDate = r.createdAt ? r.createdAt.split("T")[0] : "";
        return rDate >= startDate && rDate <= endDate;
      });
    }

    const cutoffStr = toLocalDateStr(cutoffDate);
    return returns.filter((r) => (r.createdAt ? r.createdAt.split("T")[0] : "") >= cutoffStr);
  }, [state.salesReturns, timeRange, startDate, endDate]);

  const filteredPurchases = useMemo(() => {
    const purchases = state.purchases || [];
    if (timeRange === "All") return purchases;

    const now = new Date();
    const todayStr = todayLocalStr();

    if (timeRange === "Today") {
      return purchases.filter((p) => (p.date ? p.date.split("T")[0] : p.createdAt ? p.createdAt.split("T")[0] : "") === todayStr);
    }

    let cutoffDate = new Date();
    if (timeRange === "Week") {
      cutoffDate.setDate(now.getDate() - 7);
    } else if (timeRange === "Month") {
      cutoffDate.setDate(now.getDate() - 30);
    } else if (timeRange === "Quarter") {
      cutoffDate.setDate(now.getDate() - 90);
    } else if (timeRange === "Year") {
      cutoffDate.setFullYear(now.getFullYear() - 1);
    } else if (timeRange === "Custom" && startDate && endDate) {
      return purchases.filter((p) => {
        const pDate = p.date ? p.date.split("T")[0] : p.createdAt ? p.createdAt.split("T")[0] : "";
        return pDate >= startDate && pDate <= endDate;
      });
    }

    const cutoffStr = toLocalDateStr(cutoffDate);
    return purchases.filter((p) => (p.date ? p.date.split("T")[0] : p.createdAt ? p.createdAt.split("T")[0] : "") >= cutoffStr);
  }, [state.purchases, timeRange, startDate, endDate]);

  const filteredSupplierPayments = useMemo(() => {
    const payments = state.supplierPayments || [];
    if (timeRange === "All") return payments;

    const now = new Date();
    const todayStr = todayLocalStr();

    if (timeRange === "Today") {
      return payments.filter((p) => (p.date ? p.date.split("T")[0] : p.createdAt ? p.createdAt.split("T")[0] : "") === todayStr);
    }

    let cutoffDate = new Date();
    if (timeRange === "Week") {
      cutoffDate.setDate(now.getDate() - 7);
    } else if (timeRange === "Month") {
      cutoffDate.setDate(now.getDate() - 30);
    } else if (timeRange === "Quarter") {
      cutoffDate.setDate(now.getDate() - 90);
    } else if (timeRange === "Year") {
      cutoffDate.setFullYear(now.getFullYear() - 1);
    } else if (timeRange === "Custom" && startDate && endDate) {
      return payments.filter((p) => {
        const pDate = p.date ? p.date.split("T")[0] : p.createdAt ? p.createdAt.split("T")[0] : "";
        return pDate >= startDate && pDate <= endDate;
      });
    }

    const cutoffStr = toLocalDateStr(cutoffDate);
    return payments.filter((p) => (p.date ? p.date.split("T")[0] : p.createdAt ? p.createdAt.split("T")[0] : "") >= cutoffStr);
  }, [state.supplierPayments, timeRange, startDate, endDate]);

  // Helper for invoice outstanding
  const getInvoiceOutstanding = (inv: typeof state.invoices[0]) => {
    if (inv.paymentStatus === "Paid") return 0;
    const paid = inv.amountPaid !== undefined ? inv.amountPaid : (inv.paymentStatus === "Debt" ? 0 : inv.total);
    return Math.max(0, inv.total - paid);
  };

  const allTimeDebtorsList = useMemo(() => {
    return (state.customers || [])
      .filter((c) => (c.debt || 0) > 0)
      .sort((a, b) => (b.debt || 0) - (a.debt || 0));
  }, [state.customers]);

  // ── 2. Master Memoized BI Analytics Integrations ─────────────────────────
  const biData = useMemo(() => {
    const products = state.products || [];
    const invoices = state.invoices || [];
    const salesReturns = state.salesReturns || [];
    const suppliers = state.suppliers || [];
    const customers = state.customers || [];
    const purchases = state.purchases || [];
    const supplierPayments = state.supplierPayments || [];
    const financeTransactions = state.financeTransactions || [];

    // Period comparison
    const periodComp = calculatePeriodComparison(timeRange, startDate, endDate, invoices, salesReturns, products);

    // Stock runouts
    const runoutPredictions = calculateStockRunoutPredictions(products, invoices, salesReturns);
    const criticalStockCount = runoutPredictions.filter((p) => p.priority === "Critical" || p.priority === "High").length;

    // Velocity & Ageing
    const velocityInsights = calculateProductVelocityInsights(
      products,
      filteredInvoices,
      invoices,
      salesReturns,
      periodComp,
      periodComp.previousPeriodInvoices
    );

    // Customer & Supplier Intelligence
    const customerExt = calculateCustomerInsightsExtended(customers, filteredInvoices, invoices);
    const supplierExt = calculateSupplierInsightsExtended(suppliers, filteredPurchases, filteredSupplierPayments, filteredInvoices);

    // Trends & Cash Flow
    const revTrend = analyzeRevenueTrends(invoices, salesReturns);
    const profTrend = analyzeProfitTrends(products, invoices, salesReturns);
    const cashFlow = calculateCashFlowBreakdown(financeTransactions);
    const timingInsights = getCategoryAndSalesTimingInsights(products, invoices, salesReturns);

    // Health Score
    const liquidCash = getTotalCashAvailable();
    const custDebt = getTotalOutstandingDebt();
    const supPayables = getTotalSupplierOutstanding();
    const healthScore = calculateBusinessHealthScore(
      liquidCash,
      custDebt,
      supPayables,
      criticalStockCount,
      velocityInsights.deadStockProducts.length,
      profTrend.monthVsLastMonth,
      revTrend.monthVsLastMonth
    );

    // Supplier payables map
    const supPayablesMap: Record<string, number> = {};
    purchases.forEach((p) => {
      const due = p.dueAmount ?? Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0));
      supPayablesMap[p.supplierId] = (supPayablesMap[p.supplierId] || 0) + due;
    });

    // Owner recommended actions
    const recommendedActions = generateRecommendedActions(
      runoutPredictions,
      customers,
      suppliers,
      supPayablesMap,
      velocityInsights.deadStockProducts.length
    );

    // Financial Waterfall
    const waterfall = calculateFinancialWaterfall(filteredInvoices, filteredSalesReturns, products);

    // Detailed Sales Returns
    const returnsDetailed = calculateSalesReturnsDetailed(salesReturns, filteredInvoices, filteredSalesReturns, products);

    // Explainable Smart Insights
    const smartInsights = generateExplainableSmartInsights(
      periodComp,
      timingInsights.bestCategory,
      cashFlow,
      custDebt,
      getInventoryValue(),
      velocityInsights.deadStockValuation
    );

    return {
      periodComp,
      runoutPredictions,
      velocityInsights,
      customerExt,
      supplierExt,
      revTrend,
      profTrend,
      cashFlow,
      timingInsights,
      healthScore,
      recommendedActions,
      waterfall,
      returnsDetailed,
      smartInsights,
      liquidCash,
      custDebt,
      supPayables
    };
  }, [
    state.products,
    state.invoices,
    state.salesReturns,
    state.suppliers,
    state.customers,
    state.purchases,
    state.supplierPayments,
    state.financeTransactions,
    filteredInvoices,
    filteredSalesReturns,
    filteredPurchases,
    filteredSupplierPayments,
    timeRange,
    startDate,
    endDate,
    getTotalCashAvailable,
    getTotalOutstandingDebt,
    getTotalSupplierOutstanding,
    getInventoryValue
  ]);

  // ── 3. Base Financial Aggregations (Single-pass Optimized) ────────────────
  const financialTotals = useMemo(() => {
    const totalBilled = filteredInvoices.reduce((s, i) => s + i.total, 0);
    const totalRevenue = calculateRevenue(filteredInvoices, filteredSalesReturns);
    const totalDebt = filteredInvoices.reduce((s, i) => s + getInvoiceOutstanding(i), 0);
    const totalProfit = calculateProfit(filteredInvoices, filteredSalesReturns, state.products);
    const avgOrderValue = filteredInvoices.length > 0 ? Math.round(totalBilled / filteredInvoices.length) : 0;
    const warehouseValue = getInventoryValue();
    const lowStockCount = state.products.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).length + state.products.filter((p) => p.stock === 0).length;

    // Payment Methods
    const methods = ["Cash", "Digital", "Bank Transfer", "Credit"] as const;
    const methodMix = methods.map((m) => {
      const invs = filteredInvoices.filter((i) => i.paymentMethod === m);
      const amt = invs.reduce((s, i) => s + i.total, 0);
      const pct = totalBilled > 0 ? Math.round((amt / totalBilled) * 100) : 0;
      return { method: m, count: invs.length, amount: amt, percentage: pct };
    });

    // Payment Statuses
    const statusMix = [
      {
        status: "Paid",
        label: "Paid In Full",
        count: filteredInvoices.filter((i) => i.paymentStatus === "Paid").length,
        amount: filteredInvoices.filter((i) => i.paymentStatus === "Paid").reduce((s, i) => s + i.total, 0)
      },
      {
        status: "Partial",
        label: "Partial Payments",
        count: filteredInvoices.filter((i) => i.paymentStatus === "Partial").length,
        amount: filteredInvoices.filter((i) => i.paymentStatus === "Partial").reduce((s, i) => s + i.total, 0)
      },
      {
        status: "Debt",
        label: "Unpaid Debt",
        count: filteredInvoices.filter((i) => i.paymentStatus === "Debt").length,
        amount: filteredInvoices.filter((i) => i.paymentStatus === "Debt").reduce((s, i) => s + i.total, 0)
      }
    ];

    // Single-pass Product Metrics Accumulation
    const productSalesMap: Record<string, { product: typeof state.products[0]; qty: number; revenue: number; profit: number }> = {};
    state.products.forEach((p) => {
      productSalesMap[p.id] = { product: p, qty: 0, revenue: 0, profit: 0 };
    });

    const productCostMap = new Map<string, number>();
    state.products.forEach((p) => productCostMap.set(p.id, p.currentCost));

    filteredInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        const entry = productSalesMap[item.productId];
        if (entry) {
          entry.qty += item.quantity;
          const itemRev = item.quantity * item.price;
          entry.revenue += itemRev;
          const cost = item.costPrice ?? productCostMap.get(item.productId) ?? 0;
          entry.profit += itemRev - item.quantity * cost;
        }
      });
    });

    filteredSalesReturns.forEach((r) => {
      r.items.forEach((ri) => {
        const entry = productSalesMap[ri.productId];
        if (entry) {
          entry.revenue -= ri.refundAmount;
          const cost = productCostMap.get(ri.productId) ?? 0;
          entry.profit -= ri.refundAmount - ri.quantity * cost;
        }
      });
      if (r.refundMethod === "Exchange" && r.exchangeItems) {
        r.exchangeItems.forEach((exItem) => {
          const entry = productSalesMap[exItem.productId];
          if (entry) {
            const exRev = exItem.quantity * exItem.sellingPrice;
            entry.revenue += exRev;
            entry.profit += exRev - exItem.quantity * exItem.costPrice;
          }
        });
      }
    });

    const sortedProductsByRevenue = Object.values(productSalesMap).sort((a, b) => b.revenue - a.revenue);
    const sortedProductsByProfit = Object.values(productSalesMap).sort((a, b) => b.profit - a.profit);
    const sortedProductsByVelocity = Object.values(productSalesMap).sort((a, b) => b.qty - a.qty);

    // Category Sales Map Single Pass
    const catMap: Record<string, { category: string; revenue: number; pct: number }> = {};
    const categories = Array.from(new Set(state.products.map((p) => p.category || "Accessories")));

    categories.forEach((cat) => {
      catMap[cat] = { category: cat, revenue: 0, pct: 0 };
    });

    const productCategoryMap = new Map<string, string>();
    state.products.forEach((p) => productCategoryMap.set(p.id, p.category || "Accessories"));

    Object.values(productSalesMap).forEach((pData) => {
      const cat = productCategoryMap.get(pData.product.id) || "Accessories";
      if (catMap[cat]) {
        catMap[cat].revenue += pData.revenue;
      }
    });

    Object.values(catMap).forEach((c) => {
      c.pct = totalRevenue > 0 ? Math.round((c.revenue / totalRevenue) * 100) : 0;
    });

    const categoryList = Object.values(catMap).sort((a, b) => b.revenue - a.revenue);

    // Customer Spenders Single Pass
    const spenderMap: Record<string, { customerId: string; name: string; phone: string; spent: number; invoices: number }> = {};
    filteredInvoices.forEach((inv) => {
      const cId = inv.customerId || `walkin-${inv.customer}`;
      if (!spenderMap[cId]) {
        spenderMap[cId] = {
          customerId: cId,
          name: inv.customer || "Walk-in Customer",
          phone: inv.customerPhone || "—",
          spent: 0,
          invoices: 0
        };
      }
      spenderMap[cId].invoices += 1;
      spenderMap[cId].spent += inv.total;
    });

    filteredSalesReturns.forEach((r) => {
      const cId = r.customerId || (r.invoiceId ? filteredInvoices.find((i) => i.id === r.invoiceId)?.customerId : null);
      if (cId && spenderMap[cId]) {
        spenderMap[cId].spent -= r.totalRefund;
      }
    });

    const topSpenders = Object.values(spenderMap).sort((a, b) => b.spent - a.spent).slice(0, 5);

    // Debtors List
    const debtInvoices = filteredInvoices.filter((i) => getInvoiceOutstanding(i) > 0);
    const debtorMap: Record<string, { name: string; phone: string; totalDebt: number; invCount: number }> = {};
    debtInvoices.forEach((i) => {
      const cId = i.customerId || i.customer || "Unknown";
      if (!debtorMap[cId]) {
        debtorMap[cId] = { name: i.customer, phone: i.customerPhone || "—", totalDebt: 0, invCount: 0 };
      }
      debtorMap[cId].totalDebt += getInvoiceOutstanding(i);
      debtorMap[cId].invCount += 1;
    });
    const debtorList = Object.values(debtorMap).sort((a, b) => b.totalDebt - a.totalDebt);

    return {
      totalBilled,
      totalRevenue,
      totalDebt,
      totalProfit,
      avgOrderValue,
      warehouseValue,
      lowStockCount,
      methodMix,
      statusMix,
      sortedProductsByRevenue,
      sortedProductsByProfit,
      sortedProductsByVelocity,
      categoryList,
      topSpenders,
      debtorList
    };
  }, [filteredInvoices, filteredSalesReturns, state.products, getInventoryValue]);

  // ── 4. Chart Data Generation (Continuous Timeline & Auto-aggregation) ──────
  const chartData = useMemo(() => {
    let dateBuckets: { label: string; startDateStr: string; endDateStr: string; hour?: number }[] = [];

    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const daysCount = timeRange === "Custom" && startDate && endDate
      ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / oneDayMs) + 1)
      : timeRange === "Week" ? 7 : timeRange === "Month" ? 30 : timeRange === "Quarter" ? 90 : timeRange === "Year" ? 365 : 7;

    if (timeRange === "Today" || (timeRange === "Custom" && daysCount <= 1)) {
      // 24 Hourly Buckets for Today (00:00 to 23:00)
      const targetDateStr = timeRange === "Today" ? todayLocalStr() : (startDate || todayLocalStr());
      for (let h = 0; h < 24; h++) {
        const ampm = h >= 12 ? "PM" : "AM";
        const formattedHour = h % 12 === 0 ? 12 : h % 12;
        dateBuckets.push({
          label: `${formattedHour}${ampm}`,
          startDateStr: targetDateStr,
          endDateStr: targetDateStr,
          hour: h
        });
      }
    } else if (timeRange === "Week" || (timeRange === "Custom" && daysCount <= 7)) {
      // Daily 7 Points
      let startD = new Date(now.getTime() - 6 * oneDayMs);
      if (timeRange === "Custom" && startDate) {
        startD = new Date(startDate);
      }
      for (let i = 0; i < 7; i++) {
        const d = new Date(startD.getTime() + i * oneDayMs);
        const dStr = toLocalDateStr(d);
        dateBuckets.push({
          label: d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
          startDateStr: dStr,
          endDateStr: dStr
        });
      }
    } else if (timeRange === "Month" || (timeRange === "Custom" && daysCount <= 31)) {
      // Daily 30 Points
      let count = 30;
      let startD = new Date(now.getTime() - 29 * oneDayMs);
      if (timeRange === "Custom" && startDate && endDate) {
        startD = new Date(startDate);
        count = daysCount;
      }
      for (let i = 0; i < count; i++) {
        const d = new Date(startD.getTime() + i * oneDayMs);
        const dStr = toLocalDateStr(d);
        dateBuckets.push({
          label: d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
          startDateStr: dStr,
          endDateStr: dStr
        });
      }
    } else if (timeRange === "Quarter" || (timeRange === "Custom" && daysCount <= 180)) {
      // 12 Weekly Buckets
      let startD = new Date(now.getTime() - 90 * oneDayMs);
      if (timeRange === "Custom" && startDate) startD = new Date(startDate);
      for (let i = 0; i < 12; i++) {
        const bStart = new Date(startD.getTime() + i * 7 * oneDayMs);
        const bEnd = new Date(bStart.getTime() + 6 * oneDayMs);
        dateBuckets.push({
          label: `${bStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
          startDateStr: toLocalDateStr(bStart),
          endDateStr: toLocalDateStr(bEnd)
        });
      }
    } else {
      // 12 Monthly Buckets (Year / All / Long Custom)
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        dateBuckets.push({
          label: d.toLocaleDateString("en-IN", { month: "short" }),
          startDateStr: toLocalDateStr(d),
          endDateStr: toLocalDateStr(lastDay)
        });
      }
    }

    const displayPoints = dateBuckets.map((bucket) => {
      let bInvs: typeof filteredInvoices = [];
      let bRets: typeof filteredSalesReturns = [];

      if (bucket.hour !== undefined) {
        bInvs = filteredInvoices.filter((inv) => {
          const invDateStr = inv.date ? inv.date.split("T")[0] : "";
          if (invDateStr !== bucket.startDateStr) return false;
          const timePart = inv.createdAt && inv.createdAt.includes("T")
            ? inv.createdAt.split("T")[1]
            : (inv.date.includes("T") ? inv.date.split("T")[1] : "");
          if (!timePart) return true;
          const invHour = parseInt(timePart.split(":")[0], 10);
          return invHour === bucket.hour;
        });
        bRets = filteredSalesReturns.filter((r) => {
          const rDateStr = r.createdAt ? r.createdAt.split("T")[0] : "";
          if (rDateStr !== bucket.startDateStr) return false;
          const timePart = r.createdAt && r.createdAt.includes("T") ? r.createdAt.split("T")[1] : "";
          if (!timePart) return true;
          const rHour = parseInt(timePart.split(":")[0], 10);
          return rHour === bucket.hour;
        });
      } else {
        bInvs = filteredInvoices.filter((inv) => {
          const d = inv.date ? inv.date.split("T")[0] : "";
          return d >= bucket.startDateStr && d <= bucket.endDateStr;
        });
        bRets = filteredSalesReturns.filter((r) => {
          const d = r.createdAt ? r.createdAt.split("T")[0] : "";
          return d >= bucket.startDateStr && d <= bucket.endDateStr;
        });
      }

      const sales = calculateRevenue(bInvs, bRets);
      const profit = calculateProfit(bInvs, bRets, state.products);
      return {
        dateLabel: bucket.label,
        startDateStr: bucket.startDateStr,
        endDateStr: bucket.endDateStr,
        sales,
        profit,
        invoiceCount: bInvs.length
      };
    });

    const maxSales = Math.max(...displayPoints.map((p) => p.sales), 100);
    const maxProfit = Math.max(...displayPoints.map((p) => p.profit), 10);
    const minProfit = Math.min(...displayPoints.map((p) => p.profit), 0);

    const maxChartVal = Math.max(maxSales, maxProfit) * 1.15;
    const minChartVal = Math.min(0, minProfit);
    const chartRange = (maxChartVal - minChartVal) || 1;

    const width = 800;
    const height = 200;
    const step = displayPoints.length > 1 ? width / (displayPoints.length - 1) : width;

    const yZero = Math.round(height - ((0 - minChartVal) / chartRange) * (height - 30));

    const points = displayPoints.map((p, idx) => {
      const x = Math.round(idx * step);
      const ySales = Math.round(height - ((p.sales - minChartVal) / chartRange) * (height - 30));
      const yProfit = Math.round(height - ((p.profit - minChartVal) / chartRange) * (height - 30));
      return { x, ySales, yProfit, ...p };
    });

    const salesPath = points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.ySales}`).join(" ");
    const salesArea = `${salesPath} L ${width} ${yZero} L 0 ${yZero} Z`;

    const profitPath = points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.yProfit}`).join(" ");
    const profitArea = `${profitPath} L ${width} ${yZero} L 0 ${yZero} Z`;

    return {
      points,
      salesPath,
      salesArea,
      profitPath,
      profitArea,
      maxChartVal,
      minChartVal,
      yZero
    };
  }, [filteredInvoices, filteredSalesReturns, state.products, timeRange, startDate, endDate]);

  // ── 5. Sales Heatmap Data Generation (Day of Week x Hourly Windows) ────────
  const heatmapData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const slots = [
      { label: "12 AM–4 AM", start: 0, end: 4 },
      { label: "4 AM–8 AM", start: 4, end: 8 },
      { label: "8 AM–12 PM", start: 8, end: 12 },
      { label: "12 PM–4 PM", start: 12, end: 16 },
      { label: "4 PM–8 PM", start: 16, end: 20 },
      { label: "8 PM–12 AM", start: 20, end: 24 }
    ];

    const grid = days.map((d, dIdx) =>
      slots.map((s, sIdx) => ({
        day: d,
        dayIdx: dIdx,
        slot: s.label,
        slotIdx: sIdx,
        sales: 0,
        count: 0
      }))
    );

    filteredInvoices.forEach((inv) => {
      const dateObj = new Date(inv.createdAt || inv.date);
      const dayIdx = dateObj.getDay();
      const hour = dateObj.getHours();

      if (!isNaN(dayIdx) && !isNaN(hour)) {
        const slotIdx = Math.min(5, Math.floor(hour / 4));
        if (grid[dayIdx] && grid[dayIdx][slotIdx]) {
          grid[dayIdx][slotIdx].sales += inv.total;
          grid[dayIdx][slotIdx].count += 1;
        }
      }
    });

    let maxCellSales = 0;
    grid.forEach((row) => {
      row.forEach((cell) => {
        if (cell.sales > maxCellSales) maxCellSales = cell.sales;
      });
    });

    return { days, slots, grid, maxCellSales };
  }, [filteredInvoices]);

  // Helper for explainability modal trigger
  const openExplainModal = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveExplainKey(key);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20 print:bg-white print:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">

        {/* ── SECTION 1: HEADER & PERIOD FILTER CONTROLS ───────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-navy-950 tracking-tight">Analytics & Business Intelligence</h1>
              <span className="bg-emerald-50 text-emerald-700 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-emerald-200">
                LIVE ERP
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Deterministic real-time financial command center • {filteredInvoices.length} invoices in range
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Range Selector Pills */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/60 overflow-x-auto max-w-full">
              {["Today", "Week", "Month", "Quarter", "Year", "All", "Custom"].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    timeRange === range
                      ? "bg-white text-navy-900 shadow-xs font-black"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  {range === "Week" ? "7 Days" : range === "Month" ? "30 Days" : range === "All" ? "All Time" : range}
                </button>
              ))}
            </div>

            {/* Custom Date Inputs */}
            {timeRange === "Custom" && (
              <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none"
                />
                <span className="text-xs text-slate-400 font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none"
                />
              </div>
            )}

            {/* Print Trigger Button */}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-navy-900 hover:bg-navy-950 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0 ml-auto md:ml-0 min-h-[44px]"
            >
              <Printer size={15} />
              <span>Print Report</span>
            </button>
          </div>
        </div>

        {/* ── SECTION 2: EXECUTIVE SNAPSHOT HERO CARDS ─────────────────────── */}
        <div className="space-y-3 print:hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Activity size={14} className="text-accent-500" />
              Executive Financial Snapshot
            </h2>
            <span className="text-[11px] font-bold text-slate-400">
              Comparing {biData.periodComp.comparisonLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Billed Total */}
            <div className="relative group">
              <StatCard
                title="Billed Total"
                value={`₹${financialTotals.totalBilled.toLocaleString()}`}
                subtitle={`${filteredInvoices.length} invoices generated`}
                icon={DollarSign}
                accent="blue"
              />
              <button
                onClick={(e) => openExplainModal("billedTotal", e)}
                className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-navy-900 hover:bg-slate-100 rounded-full transition-all cursor-pointer"
                title="Explain Billed Total Calculation"
              >
                <Info size={14} />
              </button>
              <div className="px-5 pb-3 -mt-2 flex items-center justify-between text-xs border-t border-slate-100/80 pt-2">
                <span className={`font-bold flex items-center gap-0.5 ${biData.periodComp.billedGrowthPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {biData.periodComp.billedGrowthPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {biData.periodComp.billedGrowthPct >= 0 ? "+" : ""}{biData.periodComp.billedGrowthPct}% billed
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Prev: ₹{biData.periodComp.previousBilledTotal.toLocaleString()}</span>
              </div>
            </div>

            {/* Card 2: Collected Revenue */}
            <div className="relative group">
              <StatCard
                title="Revenue (Collected)"
                value={`₹${financialTotals.totalRevenue.toLocaleString()}`}
                subtitle="Cash received after returns"
                icon={TrendingUp}
                accent="green"
              />
              <button
                onClick={(e) => openExplainModal("collectedRevenue", e)}
                className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-emerald-800 hover:bg-emerald-50 rounded-full transition-all cursor-pointer"
                title="Explain Revenue Calculation"
              >
                <Info size={14} />
              </button>
              <div className="px-5 pb-3 -mt-2 flex items-center justify-between text-xs border-t border-slate-100/80 pt-2">
                <span className={`font-bold flex items-center gap-0.5 ${biData.periodComp.revenueGrowthPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {biData.periodComp.revenueGrowthPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {biData.periodComp.revenueGrowthPct >= 0 ? "+" : ""}{biData.periodComp.revenueGrowthPct}% rev
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Prev: ₹{biData.periodComp.previousRevenue.toLocaleString()}</span>
              </div>
            </div>

            {/* Card 3: Net Business Profit */}
            <div className="relative group">
              <StatCard
                title="Net Trading Profit"
                value={`₹${financialTotals.totalProfit.toLocaleString()}`}
                subtitle={`COGS: ₹${biData.waterfall.cogs.toLocaleString()}`}
                icon={Percent}
                accent="navy"
              />
              <button
                onClick={(e) => openExplainModal("netProfit", e)}
                className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-navy-900 hover:bg-slate-100 rounded-full transition-all cursor-pointer"
                title="Explain Profit Calculation"
              >
                <Info size={14} />
              </button>
              <div className="px-5 pb-3 -mt-2 flex items-center justify-between text-xs border-t border-slate-100/80 pt-2">
                <span className={`font-bold flex items-center gap-0.5 ${biData.periodComp.profitGrowthPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {biData.periodComp.profitGrowthPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {biData.periodComp.profitGrowthPct >= 0 ? "+" : ""}{biData.periodComp.profitGrowthPct}% profit
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Margin: {biData.waterfall.marginPct}%</span>
              </div>
            </div>

            {/* Card 4: Customer Debt */}
            <div
              onClick={() => setActiveDrillModal("debtors")}
              className="relative group cursor-pointer transition-all hover:scale-[1.01]"
            >
              <StatCard
                title="Pending Dues (Debt)"
                value={`₹${biData.custDebt.toLocaleString()}`}
                subtitle={`Across ${allTimeDebtorsList.length} outstanding accounts`}
                icon={CreditCard}
                accent="amber"
              />
              <button
                onClick={(e) => openExplainModal("pendingDebt", e)}
                className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-amber-800 hover:bg-amber-50 rounded-full transition-all cursor-pointer"
                title="Explain Debt Calculation"
              >
                <Info size={14} />
              </button>
              <div className="px-5 pb-3 -mt-2 flex items-center justify-between text-xs border-t border-slate-100/80 pt-2">
                <span className="text-amber-700 font-bold flex items-center gap-1">
                  <Eye size={12} /> Click for Debtors List
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Click to view</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 3: MONEY VAULT & BUSINESS HEALTH ROW ─────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">

          {/* Money Available Right Now Panel (7 cols) */}
          <div
            onClick={() => setActiveDrillModal("moneyVault")}
            className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    ₹
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-navy-900">Money Available Right Now</h3>
                    <p className="text-[11px] text-slate-400 font-medium">Real-time liquid cash drawers & accounts</p>
                  </div>
                </div>
                <button
                  onClick={(e) => openExplainModal("liquidCash", e)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full"
                >
                  <Info size={14} />
                </button>
              </div>

              {/* Big Liquid Cash Hero */}
              <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between mb-5">
                <div>
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Liquid Cash</span>
                  <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-400 mt-0.5">
                    ₹{biData.liquidCash.toLocaleString()}
                  </div>
                </div>
                <span className="bg-emerald-500/20 text-emerald-300 text-xs font-bold px-3 py-1 rounded-lg border border-emerald-500/30">
                  Ready Cash
                </span>
              </div>

              {/* Progress Bars for Cash / Bank / UPI */}
              <div className="space-y-3">
                {/* Cash Drawer */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Cash Till (Drawer)</span>
                    <span className="font-mono">₹{getCashBalance().toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${biData.liquidCash > 0 ? Math.min(100, (getCashBalance() / biData.liquidCash) * 100) : 0}%` }}
                    />
                  </div>
                </div>

                {/* Bank Account */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Bank Account</span>
                    <span className="font-mono">₹{getBankBalance().toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${biData.liquidCash > 0 ? Math.min(100, (getBankBalance() / biData.liquidCash) * 100) : 0}%` }}
                    />
                  </div>
                </div>

                {/* UPI Digital */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Digital UPI Account</span>
                    <span className="font-mono">₹{getUPIBalance().toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${biData.liquidCash > 0 ? Math.min(100, (getUPIBalance() / biData.liquidCash) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-bar: Customer Dues vs Supplier Payables */}
            <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs">
              <div className="bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/60">
                <span className="text-[11px] font-bold text-amber-800 block">Customer Receivables</span>
                <span className="text-sm font-extrabold font-mono text-amber-900 mt-0.5 block">₹{biData.custDebt.toLocaleString()}</span>
              </div>
              <div className="bg-rose-50/60 p-2.5 rounded-xl border border-rose-200/60">
                <span className="text-[11px] font-bold text-rose-800 block">Supplier Credit Payables</span>
                <span className="text-sm font-extrabold font-mono text-rose-900 mt-0.5 block">₹{biData.supPayables.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Business Health Score Widget (5 cols) */}
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-navy-900" />
                  <h3 className="text-sm font-extrabold text-navy-900">Business Health Ring</h3>
                </div>
                <button
                  onClick={(e) => openExplainModal("businessHealth", e)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
                >
                  <Info size={14} />
                </button>
              </div>

              {/* Circular SVG Gauge & Score */}
              <div className="flex items-center gap-5 my-2">
                <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-100"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className={
                        biData.healthScore.status === "Healthy"
                          ? "text-emerald-500"
                          : biData.healthScore.status === "Moderate"
                          ? "text-amber-500"
                          : "text-rose-500"
                      }
                      strokeDasharray={`${biData.healthScore.score}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-xl font-black font-mono text-navy-950 leading-none">{biData.healthScore.score}</span>
                    <span className="text-[9px] font-bold text-slate-400 mt-0.5">OUT OF 100</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span
                    className={`inline-block text-xs font-black px-2.5 py-1 rounded-lg border ${
                      biData.healthScore.status === "Healthy"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : biData.healthScore.status === "Moderate"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-rose-50 text-rose-800 border-rose-200"
                    }`}
                  >
                    STATUS: {biData.healthScore.status.toUpperCase()}
                  </span>
                  <p className="text-xs text-slate-500 font-medium line-clamp-2">
                    {biData.healthScore.positiveDrivers[0] || "Store operations running standard"}
                  </p>
                </div>
              </div>

              {/* 6 Category Score Breakdown */}
              <div className="space-y-2 mt-4 pt-3 border-t border-slate-100 text-[11px]">
                {Object.entries(biData.healthScore.breakdown).map(([key, item]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">{item.score}/{item.max}</span>
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-navy-900 rounded-full"
                          style={{ width: `${(item.score / item.max) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 4: OWNER ACTION CENTER PRIORITY INBOX ───────────────── */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs print:hidden space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Zap size={16} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-navy-900">Owner Action Center</h3>
                <p className="text-[11px] text-slate-400 font-medium">Deterministic priority inbox for instant business decisions</p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              {biData.recommendedActions.length} Actions Required
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {biData.recommendedActions.length > 0 ? (
              biData.recommendedActions.map((action) => (
                <div
                  key={action.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                    action.type === "Critical"
                      ? "bg-rose-50/40 border-rose-200/80 hover:border-rose-300"
                      : action.type === "Warning"
                      ? "bg-amber-50/40 border-amber-200/80 hover:border-amber-300"
                      : action.type === "Opportunity"
                      ? "bg-emerald-50/40 border-emerald-200/80 hover:border-emerald-300"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                          action.type === "Critical"
                            ? "bg-rose-600 text-white"
                            : action.type === "Warning"
                            ? "bg-amber-600 text-white"
                            : "bg-emerald-600 text-white"
                        }`}
                      >
                        {action.type.toUpperCase()}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{action.category}</span>
                    </div>
                    <h4 className="text-xs font-extrabold text-navy-950 leading-tight">{action.title}</h4>
                    <p className="text-[11px] text-slate-600 font-medium leading-relaxed">{action.action}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 text-[10px] text-slate-500 font-medium">
                    <span className="font-bold text-slate-700">Reason:</span> {action.reason}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold text-center">
                ✓ All store metrics are healthy. No critical action required right now.
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 5: SALES & PROFIT TREND CHART & WATERFALL TOGGLE ────── */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-5 print:hidden">
          {/* Header & Chips */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-extrabold text-navy-900">Sales & Financial Performance</h3>
              <p className="text-[11px] text-slate-400 font-medium">Daily revenue and gross trading profit trajectories</p>
            </div>

            {/* View Toggle */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/60 self-start md:self-auto">
              <button
                onClick={() => setTrendView("chart")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  trendView === "chart" ? "bg-white text-navy-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Area Chart
              </button>
              <button
                onClick={() => setTrendView("waterfall")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  trendView === "waterfall" ? "bg-white text-navy-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Financial Waterfall
              </button>
            </div>
          </div>

          {/* Period Summary Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Revenue Trajectory</span>
              <span className="font-extrabold text-slate-800 text-sm mt-0.5 block">{biData.revTrend.todayVsYesterday.displayMessage}</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Profit Trajectory</span>
              <span className="font-extrabold text-slate-800 text-sm mt-0.5 block">{biData.profTrend.todayVsYesterday.displayMessage}</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Average Order Value</span>
              <span className="font-extrabold text-slate-800 text-sm mt-0.5 block">₹{biData.periodComp.currentAOV.toLocaleString()}</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Trading Margin</span>
              <span className="font-extrabold text-emerald-700 text-sm mt-0.5 block">{biData.waterfall.marginPct}% Margin</span>
            </div>
          </div>

          {/* Conditioned View: Area Chart vs Financial Waterfall */}
          {trendView === "chart" ? (
            <div className="space-y-3 pt-2">
              {/* Responsive Legend */}
              <div className="flex items-center justify-center gap-6 text-xs font-bold text-slate-600 pb-1">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-sky-500 inline-block shadow-xs" />
                  <span>Revenue (Net)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-xs" />
                  <span>Gross Trading Profit</span>
                </div>
              </div>

              {/* Chart Canvas & Interaction Container */}
              <div
                ref={chartContainerRef}
                onPointerMove={handleChartPointerMove}
                onPointerLeave={handleChartPointerLeave}
                onTouchStart={handleChartPointerMove}
                onTouchMove={handleChartPointerMove}
                onTouchEnd={handleChartTouchEnd}
                className="relative w-full select-none cursor-crosshair touch-none"
              >
                {chartData.points && chartData.points.length > 0 && !chartData.points.every((p) => p.sales === 0 && p.profit === 0) ? (
                  <>
                    <svg className="w-full h-52 sm:h-60 overflow-visible" viewBox="0 0 800 200" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0284c7" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                        </linearGradient>
                        <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Grid Lines */}
                      {[0, 50, 100, 150, 200].map((y) => (
                        <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                      ))}

                      {/* Zero Baseline Line */}
                      <line x1="0" y1={chartData.yZero} x2="800" y2={chartData.yZero} stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="3 3" />

                      {/* Area & Line Paths */}
                      <path d={chartData.salesArea} fill="url(#salesGrad)" />
                      <path d={chartData.salesPath} fill="none" stroke="#0284c7" strokeWidth="2.5" />

                      <path d={chartData.profitArea} fill="url(#profitGrad)" />
                      <path d={chartData.profitPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeDasharray="4 2" />

                      {/* Active Vertical Guide Line */}
                      {hoverIndex !== null && chartData.points[hoverIndex] && (
                        <line
                          x1={chartData.points[hoverIndex].x}
                          y1="0"
                          x2={chartData.points[hoverIndex].x}
                          y2="200"
                          stroke="#94a3b8"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                        />
                      )}

                      {/* Data Points */}
                      {chartData.points.map((pt, idx) => {
                        const isActive = hoverIndex === idx;
                        return (
                          <g key={idx}>
                            <circle
                              cx={pt.x}
                              cy={pt.ySales}
                              r={isActive ? 7 : 3.5}
                              fill="#0284c7"
                              stroke={isActive ? "#ffffff" : "none"}
                              strokeWidth={isActive ? 2.5 : 0}
                              className="transition-all duration-75"
                            />
                            <circle
                              cx={pt.x}
                              cy={pt.yProfit}
                              r={isActive ? 7 : 3.5}
                              fill="#10b981"
                              stroke={isActive ? "#ffffff" : "none"}
                              strokeWidth={isActive ? 2.5 : 0}
                              className="transition-all duration-75"
                            />
                          </g>
                        );
                      })}
                    </svg>

                    {/* Responsive X-Axis Labels */}
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-2 px-1">
                      {(() => {
                        const totalPts = chartData.points.length;
                        const labelStep = totalPts > 24 ? 4 : totalPts > 12 ? 2 : 1;
                        return chartData.points.map((pt, idx) => {
                          const showLabel = idx % labelStep === 0 || idx === totalPts - 1;
                          return (
                            <span
                              key={idx}
                              className={`truncate text-center transition-all ${
                                showLabel ? "opacity-100" : "opacity-0 sm:opacity-100"
                              } ${hoverIndex === idx ? "text-navy-950 font-black scale-110" : ""}`}
                              style={{ width: `${100 / totalPts}%` }}
                            >
                              {showLabel ? pt.dateLabel : ""}
                            </span>
                          );
                        });
                      })()}
                    </div>

                    {/* Smart Positioning Floating Tooltip Card */}
                    {hoverIndex !== null && chartData.points[hoverIndex] && (() => {
                      const activePt = chartData.points[hoverIndex];
                      const rawPct = (activePt.x / 800) * 100;
                      let positionClass = "-translate-x-1/2 left-1/2";
                      let styleLeft = `${Math.min(84, Math.max(16, rawPct))}%`;

                      if (rawPct > 70) {
                        positionClass = "-translate-x-full";
                        styleLeft = `${Math.min(95, rawPct)}%`;
                      } else if (rawPct < 30) {
                        positionClass = "translate-x-0";
                        styleLeft = `${Math.max(5, rawPct)}%`;
                      }

                      const marginPct = activePt.sales > 0 ? Math.round((activePt.profit / activePt.sales) * 100) : 0;
                      return (
                        <div
                          className={`absolute top-2 z-20 bg-navy-950 text-white p-3.5 rounded-xl shadow-2xl text-xs space-y-2 border border-slate-700/80 pointer-events-none transition-all duration-75 w-52 ${positionClass}`}
                          style={{ left: styleLeft }}
                        >
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-bold text-slate-300">
                            <span>{activePt.dateLabel}</span>
                            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-md text-slate-400 font-mono">
                              {activePt.invoiceCount} {activePt.invoiceCount === 1 ? "Invoice" : "Invoices"}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-mono">
                            <div>
                              <span className="text-[10px] text-slate-400 font-sans block uppercase">Revenue</span>
                              <span className="font-extrabold text-sky-400 text-xs">₹{activePt.sales.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-sans block uppercase">Profit</span>
                              <span className="font-extrabold text-emerald-400 text-xs">₹{activePt.profit.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-sans block uppercase">Margin</span>
                              <span className="font-bold text-slate-200">{marginPct}%</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-sans block uppercase">Invoices</span>
                              <span className="font-bold text-slate-200">{activePt.invoiceCount}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  /* Empty State fallback when no sales exist */
                  <div className="py-12 flex flex-col items-center justify-center text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs font-bold text-slate-500">No sales recorded during this period.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Billed revenue and profit curves will populate dynamically as checkout invoices are generated.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Financial Waterfall Chart */
            <div className="space-y-4 py-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Financial Waterfall Flow</h4>
              <div className="space-y-3">
                {/* 1. Gross Billed */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>1. Gross Billed Revenue</span>
                    <span className="font-mono">₹{biData.waterfall.grossBilled.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-4 bg-slate-100 rounded-lg overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-lg" style={{ width: "100%" }} />
                  </div>
                </div>

                {/* 2. Customer Returns */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-rose-700 mb-1">
                    <span>2. Less: Sales Returns & Refunds</span>
                    <span className="font-mono">-₹{biData.waterfall.returnsRefund.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-4 bg-slate-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-lg"
                      style={{ width: `${biData.waterfall.grossBilled > 0 ? (biData.waterfall.returnsRefund / biData.waterfall.grossBilled) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* 3. Net Revenue */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-emerald-800 mb-1">
                    <span>3. Net Collected Revenue</span>
                    <span className="font-mono font-black">₹{biData.waterfall.netRevenue.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-4 bg-slate-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-lg"
                      style={{ width: `${biData.waterfall.grossBilled > 0 ? (biData.waterfall.netRevenue / biData.waterfall.grossBilled) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* 4. COGS */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                    <span>4. Less: Cost of Goods Sold (COGS)</span>
                    <span className="font-mono">-₹{biData.waterfall.cogs.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-4 bg-slate-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-slate-500 rounded-lg"
                      style={{ width: `${biData.waterfall.grossBilled > 0 ? (biData.waterfall.cogs / biData.waterfall.grossBilled) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* 5. Gross Profit */}
                <div>
                  <div className="flex justify-between text-xs font-black text-navy-950 mb-1">
                    <span>5. Net Gross Trading Profit ({biData.waterfall.marginPct}% Margin)</span>
                    <span className="font-mono text-emerald-600 text-sm">₹{biData.waterfall.grossProfit.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-4 bg-slate-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-lg"
                      style={{ width: `${biData.waterfall.grossBilled > 0 ? (biData.waterfall.grossProfit / biData.waterfall.grossBilled) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 6: INVENTORY INTELLIGENCE (VELOCITY & AGEING) ───────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">

          {/* Runout Predictions & Low Stock Alerts (7 cols) */}
          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-navy-900" />
                <div>
                  <h3 className="text-sm font-extrabold text-navy-900">Inventory Velocity & Runouts</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Predictive stock depletion based on daily sales velocity</p>
                </div>
              </div>
              <button
                onClick={() => setActiveDrillModal("lowStock")}
                className="text-xs font-bold text-navy-900 hover:text-navy-950 hover:underline cursor-pointer"
              >
                View All ({biData.runoutPredictions.length})
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-2">Product</th>
                    <th className="py-2.5 px-2 text-right">Stock</th>
                    <th className="py-2.5 px-2 text-right">Daily Velocity</th>
                    <th className="py-2.5 px-2 text-center">Runout Risk</th>
                    <th className="py-2.5 px-2 text-center">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {biData.runoutPredictions.slice(0, 5).map((pred) => (
                    <tr key={pred.productId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-2 font-bold text-navy-950 truncate max-w-[150px]" title={pred.productName}>
                        {pred.productName}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold">{pred.stock}</td>
                      <td className="py-2.5 px-2 text-right font-mono">{pred.avgDailySales}/day</td>
                      <td className="py-2.5 px-2 text-center">
                        <span
                          className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                            pred.priority === "Critical"
                              ? "bg-rose-100 text-rose-800"
                              : pred.priority === "High"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {pred.displayMessage}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center text-[10px] font-bold text-slate-400">{pred.confidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inventory Ageing Buckets (5 cols) */}
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-extrabold text-navy-900">Inventory Ageing Buckets</h3>
                <span className="text-xs font-bold text-slate-400 font-mono">Total: ₹{biData.velocityInsights.inventoryAgeing.totalValuation.toLocaleString()}</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mb-4">Stock valuation categorized by shelf age</p>

              <div className="space-y-3">
                {/* 0-30 Days */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>0–30 Days (Fresh Stock)</span>
                    <span className="font-mono">₹{biData.velocityInsights.inventoryAgeing.bucket0to30.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{
                        width: `${
                          biData.velocityInsights.inventoryAgeing.totalValuation > 0
                            ? (biData.velocityInsights.inventoryAgeing.bucket0to30 / biData.velocityInsights.inventoryAgeing.totalValuation) * 100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>

                {/* 31-60 Days */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>31–60 Days (Moderate Age)</span>
                    <span className="font-mono">₹{biData.velocityInsights.inventoryAgeing.bucket31to60.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{
                        width: `${
                          biData.velocityInsights.inventoryAgeing.totalValuation > 0
                            ? (biData.velocityInsights.inventoryAgeing.bucket31to60 / biData.velocityInsights.inventoryAgeing.totalValuation) * 100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>

                {/* 61-90 Days */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>61–90 Days (Slow Moving)</span>
                    <span className="font-mono">₹{biData.velocityInsights.inventoryAgeing.bucket61to90.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{
                        width: `${
                          biData.velocityInsights.inventoryAgeing.totalValuation > 0
                            ? (biData.velocityInsights.inventoryAgeing.bucket61to90 / biData.velocityInsights.inventoryAgeing.totalValuation) * 100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>

                {/* 90+ Days */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-rose-700 mb-1">
                    <span>90+ Days (Stagnant / Dead Stock)</span>
                    <span className="font-mono font-bold">₹{biData.velocityInsights.inventoryAgeing.bucket90Plus.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full"
                      style={{
                        width: `${
                          biData.velocityInsights.inventoryAgeing.totalValuation > 0
                            ? (biData.velocityInsights.inventoryAgeing.bucket90Plus / biData.velocityInsights.inventoryAgeing.totalValuation) * 100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              onClick={() => setActiveDrillModal("deadStock")}
              className="p-3 bg-rose-50/60 rounded-xl border border-rose-200/60 flex items-center justify-between cursor-pointer hover:bg-rose-50"
            >
              <div>
                <span className="text-[11px] font-bold text-rose-800 block">Dead Stock Locked Capital</span>
                <span className="text-xs font-extrabold font-mono text-rose-950 mt-0.5 block">
                  ₹{biData.velocityInsights.deadStockValuation.toLocaleString()}
                </span>
              </div>
              <span className="text-[10px] font-extrabold bg-rose-600 text-white px-2 py-1 rounded-md">View Stagnant</span>
            </div>
          </div>
        </div>

        {/* ── SECTION 7: PRODUCT RANKING LEDGER WITH INTERACTIVE TABS ──────── */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-extrabold text-navy-900">Product Performance Ledger</h3>
              <p className="text-[11px] text-slate-400 font-medium">Classified ranking of products by revenue, profit, velocity, and stagnant stock</p>
            </div>

            {/* Ranking Tabs */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/60 overflow-x-auto">
              {[
                { id: "revenue", label: "Top Revenue" },
                { id: "profit", label: "Top Profit" },
                { id: "velocity", label: "Velocity" },
                { id: "deadStock", label: "Dead Stock" },
                { id: "neverSold", label: "Never Sold" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setProductRankingTab(tab.id as any)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    productRankingTab === tab.id ? "bg-white text-navy-900 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3 text-right">Units Sold</th>
                  <th className="py-2.5 px-3 text-right">Net Revenue</th>
                  <th className="py-2.5 px-3 text-right">Gross Profit</th>
                  <th className="py-2.5 px-3 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {(productRankingTab === "revenue"
                  ? financialTotals.sortedProductsByRevenue
                  : productRankingTab === "profit"
                  ? financialTotals.sortedProductsByProfit
                  : productRankingTab === "velocity"
                  ? financialTotals.sortedProductsByVelocity
                  : productRankingTab === "deadStock"
                  ? biData.velocityInsights.deadStockProducts.map((p) => ({
                      product: p,
                      qty: 0,
                      revenue: 0,
                      profit: 0
                    }))
                  : biData.velocityInsights.neverSoldProducts.map((p) => ({
                      product: p,
                      qty: 0,
                      revenue: 0,
                      profit: 0
                    }))
                ).slice(0, 8).map((item) => {
                  const marginPct = item.revenue > 0 ? Math.round((item.profit / item.revenue) * 100) : 0;
                  return (
                    <tr key={item.product.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-navy-950">{item.product.name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{item.product.sku}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{item.qty}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">₹{item.revenue.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">₹{item.profit.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">{marginPct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SECTION 8: CUSTOMER & SUPPLIER INTELLIGENCE PANELS ───────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">

          {/* Customer Intelligence Panel (6 cols) */}
          <div className="lg:col-span-6 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-navy-900" />
              <div>
                <h3 className="text-sm font-extrabold text-navy-900">Customer Intelligence</h3>
                <p className="text-[11px] text-slate-400 font-medium">Loyalty metrics, debtors, and purchase behavior</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Highest LTV Customer</span>
                <span className="font-extrabold text-navy-950 text-xs mt-1 block truncate">
                  {biData.customerExt.highestLtvCustomer ? biData.customerExt.highestLtvCustomer.customer.name : "—"}
                </span>
                <span className="text-[10px] text-emerald-600 font-mono font-bold">
                  ₹{biData.customerExt.highestLtvCustomer?.revenue.toLocaleString() || 0} spent
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Largest Debtor</span>
                <span className="font-extrabold text-rose-950 text-xs mt-1 block truncate">
                  {biData.customerExt.highestDebtCustomer ? biData.customerExt.highestDebtCustomer.customer.name : "—"}
                </span>
                <span className="text-[10px] text-rose-600 font-mono font-bold">
                  ₹{biData.customerExt.highestDebtCustomer?.debt.toLocaleString() || 0} due
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Repeat Purchase Rate</span>
                <span className="font-extrabold text-navy-950 text-sm mt-0.5 block">{biData.customerExt.repeatPurchasePct}%</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Avg Spend / Customer</span>
                <span className="font-extrabold text-navy-950 text-sm mt-0.5 block font-mono">₹{biData.customerExt.avgSpendPerCustomer.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Supplier Intelligence Panel (6 cols) */}
          <div className="lg:col-span-6 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-navy-900" />
              <div>
                <h3 className="text-sm font-extrabold text-navy-900">Supplier Intelligence</h3>
                <p className="text-[11px] text-slate-400 font-medium">Vendor volumes, payables, and purchase frequency</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Top Supplier by Spend</span>
                <span className="font-extrabold text-navy-950 text-xs mt-1 block truncate">
                  {biData.supplierExt.topSupplierBySpend ? biData.supplierExt.topSupplierBySpend.supplier.name : "—"}
                </span>
                <span className="text-[10px] text-emerald-600 font-mono font-bold">
                  ₹{biData.supplierExt.topSupplierBySpend?.totalSpend.toLocaleString() || 0} bought
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Largest Supplier Due</span>
                <span className="font-extrabold text-rose-950 text-xs mt-1 block truncate">
                  {biData.supplierExt.mostOutstandingSupplier ? biData.supplierExt.mostOutstandingSupplier.supplier.name : "—"}
                </span>
                <span className="text-[10px] text-rose-600 font-mono font-bold">
                  ₹{biData.supplierExt.mostOutstandingSupplier?.due.toLocaleString() || 0} payable
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Avg Purchase Ticket</span>
                <span className="font-extrabold text-navy-950 text-sm mt-0.5 block font-mono">₹{biData.supplierExt.avgPurchaseValue.toLocaleString()}</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Purchases</span>
                <span className="font-extrabold text-navy-950 text-sm mt-0.5 block font-mono">₹{biData.supplierExt.totalPurchasesInPeriod.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 8.5: DAY OF WEEK X HOURLY SALES HEATMAP ────────────── */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-navy-900" />
              <div>
                <h3 className="text-sm font-extrabold text-navy-900">Sales Heatmap (Day of Week × Time Window)</h3>
                <p className="text-[11px] text-slate-400 font-medium">Billed revenue density across days of the week and peak operating hours</p>
              </div>
            </div>
            {biData.timingInsights.peakHourWindow && (
              <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                Peak Window: {biData.timingInsights.peakHourWindow}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                  <th className="py-2 px-3 text-left w-20">Day</th>
                  {heatmapData.slots.map((s, idx) => (
                    <th key={idx} className="py-2 px-3">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {heatmapData.grid.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-navy-950 text-left">{row[0].day}</td>
                    {row.map((cell, cIdx) => {
                      const intensityPct = heatmapData.maxCellSales > 0 ? (cell.sales / heatmapData.maxCellSales) : 0;
                      return (
                        <td key={cIdx} className="p-1.5">
                          <div
                            className={`p-2.5 rounded-lg border transition-all text-[11px] font-mono flex flex-col items-center justify-center ${
                              cell.sales > 0
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-950 font-bold"
                                : "bg-slate-50 border-slate-100 text-slate-300"
                            }`}
                            style={{
                              backgroundColor: cell.sales > 0 ? `rgba(16, 185, 129, ${Math.max(0.12, intensityPct * 0.75)})` : undefined
                            }}
                            title={`${cell.day} ${cell.slot}: ₹${cell.sales.toLocaleString()} (${cell.count} orders)`}
                          >
                            <span>₹{cell.sales > 0 ? cell.sales.toLocaleString() : "0"}</span>
                            <span className="text-[9px] text-slate-500 font-sans font-normal">{cell.count} orders</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SECTION 9: PRESERVED DEDICATED SALES RETURNS ANALYTICS ─────── */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-5 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-navy-900">Sales Returns & Refunds Analysis</h3>
              <p className="text-[11px] text-slate-400 font-medium">Return rates, units returned, and refund valuations in selected period</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                Return Rate: {biData.returnsDetailed.returnRatePct}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Period Return Records</span>
              <span className="font-extrabold text-navy-950 text-base mt-0.5 block">{biData.returnsDetailed.periodCount} records</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Refund Value</span>
              <span className="font-extrabold text-rose-600 text-base mt-0.5 block font-mono">₹{biData.returnsDetailed.periodRefundValue.toLocaleString()}</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Most Returned Item</span>
              <span className="font-extrabold text-navy-950 text-xs mt-1 block truncate">
                {biData.returnsDetailed.mostReturnedProduct ? biData.returnsDetailed.mostReturnedProduct.product.name : "None"}
              </span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Largest Single Refund</span>
              <span className="font-extrabold text-navy-950 text-xs mt-1 block font-mono">
                ₹{biData.returnsDetailed.largestRefundRecord ? biData.returnsDetailed.largestRefundRecord.refundAmount.toLocaleString() : 0}
              </span>
            </div>
          </div>
        </div>

        {/* ── SECTION 10: DETERMINISTIC SMART INSIGHTS SUMMARY BANNER ────── */}
        <div className="bg-gradient-to-r from-navy-950 to-slate-900 text-white p-5 rounded-2xl shadow-md space-y-3 print:hidden">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-amber-400" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">Deterministic Smart Insights Summary</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {biData.smartInsights.map((insight, idx) => (
              <div key={idx} className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10 space-y-1">
                <h4 className="font-bold text-amber-300 leading-tight">{insight.title}</h4>
                <ul className="space-y-0.5 text-[11px] text-slate-300">
                  {insight.reasons.map((r, rIdx) => (
                    <li key={rIdx} className="flex items-start gap-1.5">
                      <span className="text-amber-400 font-bold">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 11: FULL EXECUTIVE BUSINESS REPORT (PRINT LAYOUT) ───── */}
        <div className="hidden print:block space-y-6 pt-2 text-slate-900 bg-white font-sans">
          {/* 1. REPORT PAGE HEADER */}
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">7 Star Car Accessories</h1>
              <h2 className="text-sm font-bold text-slate-600 uppercase tracking-widest mt-0.5">Executive Analytics & BI Report</h2>
              <p className="text-[11px] text-slate-500 font-medium mt-1">AutoVault ERP Business Intelligence Engine • Official Executive Report</p>
            </div>
            <div className="text-right text-xs space-y-1 font-mono">
              <div><span className="text-slate-500 font-sans uppercase text-[10px]">Filter Scope:</span> <strong className="font-bold text-slate-900">{timeRange}</strong></div>
              <div><span className="text-slate-500 font-sans uppercase text-[10px]">Date Range:</span> <strong className="font-bold text-slate-900">{startDate && endDate ? `${startDate} to ${endDate}` : "Full Period"}</strong></div>
              <div><span className="text-slate-500 font-sans uppercase text-[10px]">Generated At:</span> <strong className="text-slate-900">{new Date().toLocaleString("en-IN")}</strong></div>
            </div>
          </div>

          {/* 2. EXECUTIVE SUMMARY KPI CARDS */}
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b pb-1">1. Executive Snapshot</h3>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 border-2 border-slate-200 rounded-xl bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Billed</span>
                <span className="text-base font-black text-slate-900 font-mono">₹{financialTotals.totalBilled.toLocaleString()}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">{filteredInvoices.length} invoices generated</span>
              </div>
              <div className="p-3 border-2 border-slate-200 rounded-xl bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Net Revenue (Collected)</span>
                <span className="text-base font-black text-emerald-800 font-mono">₹{financialTotals.totalRevenue.toLocaleString()}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">After sales returns & refunds</span>
              </div>
              <div className="p-3 border-2 border-slate-200 rounded-xl bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Gross Trading Profit</span>
                <span className="text-base font-black text-indigo-900 font-mono">₹{financialTotals.totalProfit.toLocaleString()}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Margin: {biData.waterfall.marginPct}%</span>
              </div>
              <div className="p-3 border-2 border-slate-200 rounded-xl bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Pending Customer Debt</span>
                <span className="text-base font-black text-rose-800 font-mono">₹{biData.custDebt.toLocaleString()}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">{allTimeDebtorsList.length} outstanding accounts</span>
              </div>
              <div className="p-3 border-2 border-slate-200 rounded-xl bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Liquid Cash</span>
                <span className="text-base font-black text-emerald-900 font-mono">₹{biData.liquidCash.toLocaleString()}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Cash + Bank + UPI</span>
              </div>
              <div className="p-3 border-2 border-slate-200 rounded-xl bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Business Health Score</span>
                <span className="text-base font-black text-navy-950 font-mono">{biData.healthScore.score} / 100</span>
                <span className="text-[10px] font-bold text-slate-700 block mt-0.5">Status: {biData.healthScore.status}</span>
              </div>
            </div>
          </div>

          {/* 3. FINANCIAL SUMMARY TABLE */}
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b pb-1">2. Financial Reconciliation Ledger</h3>
            <table className="w-full text-left border-collapse text-xs border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700">
                  <th className="py-2 px-3 border-r">Financial Line Item</th>
                  <th className="py-2 px-3 border-r text-right">Amount (₹)</th>
                  <th className="py-2 px-3 text-left">Description / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                <tr>
                  <td className="py-2 px-3 border-r font-bold">1. Gross Billed Total</td>
                  <td className="py-2 px-3 border-r text-right font-mono font-bold">₹{biData.waterfall.grossBilled.toLocaleString()}</td>
                  <td className="py-2 px-3 text-slate-600">Total invoice face value billed to customers</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 border-r font-bold text-rose-800">2. Less: Sales Returns & Refunds</td>
                  <td className="py-2 px-3 border-r text-right font-mono font-bold text-rose-800">-₹{biData.waterfall.returnsRefund.toLocaleString()}</td>
                  <td className="py-2 px-3 text-slate-600">Customer refunds issued for returned items</td>
                </tr>
                <tr className="bg-emerald-50/50 font-bold">
                  <td className="py-2 px-3 border-r text-emerald-950">3. Net Collected Revenue</td>
                  <td className="py-2 px-3 border-r text-right font-mono font-black text-emerald-800">₹{biData.waterfall.netRevenue.toLocaleString()}</td>
                  <td className="py-2 px-3 text-emerald-900">Actual net money earned from sales</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 border-r font-bold text-slate-700">4. Less: Cost of Goods Sold (COGS)</td>
                  <td className="py-2 px-3 border-r text-right font-mono font-bold text-slate-700">-₹{biData.waterfall.cogs.toLocaleString()}</td>
                  <td className="py-2 px-3 text-slate-600">Cost value of inventory items sold</td>
                </tr>
                <tr className="bg-indigo-50/50 font-bold">
                  <td className="py-2 px-3 border-r text-indigo-950">5. Net Gross Trading Profit</td>
                  <td className="py-2 px-3 border-r text-right font-mono font-black text-indigo-900">₹{biData.waterfall.grossProfit.toLocaleString()}</td>
                  <td className="py-2 px-3 text-indigo-900">Trading profit margin ({biData.waterfall.marginPct}%)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 4. REVENUE & PROFIT TREND CHART */}
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b pb-1">3. Sales & Trading Profit Trajectory</h3>
            <div className="p-4 border border-slate-300 rounded-xl space-y-3 bg-white">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Daily Revenue (Blue) & Gross Profit (Green) Curve</span>
                <span>Average Order Value: ₹{biData.periodComp.currentAOV.toLocaleString()}</span>
              </div>
              <svg className="w-full h-44 overflow-visible" viewBox="0 0 800 200" preserveAspectRatio="none">
                {[0, 50, 100, 150, 200].map((y) => (
                  <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#e2e8f0" strokeWidth="1" />
                ))}
                <line x1="0" y1={chartData.yZero} x2="800" y2={chartData.yZero} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 3" />
                <path d={chartData.salesPath} fill="none" stroke="#0284c7" strokeWidth="2.5" />
                <path d={chartData.profitPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeDasharray="4 2" />
                {chartData.points.map((pt, idx) => (
                  <g key={idx}>
                    <circle cx={pt.x} cy={pt.ySales} r="3.5" fill="#0284c7" />
                    <circle cx={pt.x} cy={pt.yProfit} r="3.5" fill="#10b981" />
                  </g>
                ))}
              </svg>
              <div className="flex justify-between text-[9px] font-bold text-slate-600 font-mono">
                {chartData.points.map((pt, idx) => (
                  <span key={idx}>{pt.dateLabel}</span>
                ))}
              </div>
            </div>
          </div>

          {/* 5. MONEY VAULT & LIABILITIES */}
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b pb-1">4. Money Vault & Capital Breakdown</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 border border-slate-300 rounded-xl space-y-2">
                <h4 className="font-bold text-slate-900 border-b pb-1 uppercase text-[10px]">Liquid Cash Drawers</h4>
                <div className="flex justify-between py-1 border-b"><span>Cash Till Drawer:</span> <strong className="font-mono">₹{getCashBalance().toLocaleString()}</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Bank Account:</span> <strong className="font-mono">₹{getBankBalance().toLocaleString()}</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Digital UPI Account:</span> <strong className="font-mono">₹{getUPIBalance().toLocaleString()}</strong></div>
                <div className="flex justify-between py-1 font-bold text-emerald-800 pt-1"><span>Total Liquid Cash:</span> <strong className="font-mono">₹{biData.liquidCash.toLocaleString()}</strong></div>
              </div>
              <div className="p-3 border border-slate-300 rounded-xl space-y-2">
                <h4 className="font-bold text-slate-900 border-b pb-1 uppercase text-[10px]">Liabilities & Capital</h4>
                <div className="flex justify-between py-1 border-b"><span>Uncollected Customer Debt:</span> <strong className="font-mono text-rose-700">₹{biData.custDebt.toLocaleString()}</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Supplier Credit Payables:</span> <strong className="font-mono text-rose-700">₹{biData.supPayables.toLocaleString()}</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Active Warehouse Inventory:</span> <strong className="font-mono">₹{getInventoryValue().toLocaleString()}</strong></div>
                <div className="flex justify-between py-1 font-bold text-slate-800 pt-1"><span>Dead Stock Capital:</span> <strong className="font-mono text-rose-800">₹{biData.velocityInsights.deadStockValuation.toLocaleString()}</strong></div>
              </div>
            </div>
          </div>

          {/* 6. BUSINESS HEALTH SCORE & BREAKDOWN */}
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b pb-1">5. Business Health Assessment ({biData.healthScore.score}/100 — {biData.healthScore.status})</h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {Object.entries(biData.healthScore.breakdown).map(([key, item]) => (
                <div key={key} className="p-2.5 border border-slate-300 rounded-lg flex justify-between items-center">
                  <span className="font-bold capitalize text-[11px] text-slate-700">{key.replace(/([A-Z])/g, " $1")}</span>
                  <span className="font-mono font-black">{item.score} / {item.max}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 7. OWNER ACTION CENTER */}
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b pb-1">6. Owner Action Recommendations</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {biData.recommendedActions.map((action) => (
                <div key={action.id} className="p-3 border border-slate-300 rounded-xl space-y-1 bg-slate-50/50">
                  <div className="flex justify-between font-bold">
                    <span className="text-rose-800 uppercase text-[10px]">{action.type} • {action.category}</span>
                  </div>
                  <h4 className="font-bold text-slate-900">{action.title}</h4>
                  <p className="text-[11px] text-slate-600">{action.action}</p>
                  <span className="text-[10px] text-slate-500 block pt-1 border-t">Reason: {action.reason}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 8. INVENTORY VELOCITY & RUNOUT PREDICTIONS */}
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b pb-1">7. Inventory Velocity & Stock Runout Risk</h3>
            <table className="w-full text-left border-collapse text-xs border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700">
                  <th className="py-2 px-3 border-r">Product Name</th>
                  <th className="py-2 px-3 border-r text-right">Stock</th>
                  <th className="py-2 px-3 border-r text-right">Velocity</th>
                  <th className="py-2 px-3 border-r text-center">Runout Risk</th>
                  <th className="py-2 px-3 text-center">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {biData.runoutPredictions.slice(0, 8).map((pred) => (
                  <tr key={pred.productId}>
                    <td className="py-1.5 px-3 border-r font-bold text-slate-900">{pred.productName}</td>
                    <td className="py-1.5 px-3 border-r text-right font-mono font-bold">{pred.stock}</td>
                    <td className="py-1.5 px-3 border-r text-right font-mono">{pred.avgDailySales}/day</td>
                    <td className="py-1.5 px-3 border-r text-center font-bold text-rose-800">{pred.displayMessage}</td>
                    <td className="py-1.5 px-3 text-center text-slate-600">{pred.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 9. PRODUCT PERFORMANCE LEDGER */}
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b pb-1">8. Top Revenue Products</h3>
            <table className="w-full text-left border-collapse text-xs border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700">
                  <th className="py-2 px-3 border-r">Product</th>
                  <th className="py-2 px-3 border-r">SKU</th>
                  <th className="py-2 px-3 border-r text-right">Units Sold</th>
                  <th className="py-2 px-3 border-r text-right">Revenue</th>
                  <th className="py-2 px-3 border-r text-right">Gross Profit</th>
                  <th className="py-2 px-3 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {financialTotals.sortedProductsByRevenue.slice(0, 8).map((item) => {
                  const marginPct = item.revenue > 0 ? Math.round((item.profit / item.revenue) * 100) : 0;
                  return (
                    <tr key={item.product.id}>
                      <td className="py-1.5 px-3 border-r font-bold text-slate-900">{item.product.name}</td>
                      <td className="py-1.5 px-3 border-r font-mono text-slate-500">{item.product.sku}</td>
                      <td className="py-1.5 px-3 border-r text-right font-mono">{item.qty}</td>
                      <td className="py-1.5 px-3 border-r text-right font-mono font-bold">₹{item.revenue.toLocaleString()}</td>
                      <td className="py-1.5 px-3 border-r text-right font-mono font-bold text-emerald-800">₹{item.profit.toLocaleString()}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-bold">{marginPct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 10. CUSTOMER & SUPPLIER INTELLIGENCE */}
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b pb-1">9. Customer & Supplier Intelligence</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 border border-slate-300 rounded-xl space-y-1.5">
                <h4 className="font-bold border-b pb-1 uppercase text-[10px] text-slate-700">Customer Intelligence</h4>
                <div className="flex justify-between py-1 border-b"><span>Highest LTV Customer:</span> <strong>{biData.customerExt.highestLtvCustomer?.customer.name || "—"}</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Largest Debtor:</span> <strong className="text-rose-800">{biData.customerExt.highestDebtCustomer?.customer.name || "—"}</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Repeat Purchase Rate:</span> <strong>{biData.customerExt.repeatPurchasePct}%</strong></div>
                <div className="flex justify-between py-1"><span>Avg Spend / Customer:</span> <strong className="font-mono">₹{biData.customerExt.avgSpendPerCustomer.toLocaleString()}</strong></div>
              </div>
              <div className="p-3 border border-slate-300 rounded-xl space-y-1.5">
                <h4 className="font-bold border-b pb-1 uppercase text-[10px] text-slate-700">Supplier Intelligence</h4>
                <div className="flex justify-between py-1 border-b"><span>Top Vendor by Spend:</span> <strong>{biData.supplierExt.topSupplierBySpend?.supplier.name || "—"}</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Largest Supplier Due:</span> <strong className="text-rose-800">{biData.supplierExt.mostOutstandingSupplier?.supplier.name || "—"}</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Avg Purchase Ticket:</span> <strong className="font-mono">₹{biData.supplierExt.avgPurchaseValue.toLocaleString()}</strong></div>
                <div className="flex justify-between py-1"><span>Total Purchase Volume:</span> <strong className="font-mono">₹{biData.supplierExt.totalPurchasesInPeriod.toLocaleString()}</strong></div>
              </div>
            </div>
          </div>

          {/* 11. SALES HEATMAP */}
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b pb-1">10. Sales Heatmap (Day × Operating Hours)</h3>
            <table className="w-full text-center border-collapse text-xs border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[9px] text-slate-700">
                  <th className="py-1.5 px-2 border-r text-left">Day</th>
                  {heatmapData.slots.map((s, idx) => (
                    <th key={idx} className="py-1.5 px-2 border-r">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[10px]">
                {heatmapData.grid.map((row, rIdx) => (
                  <tr key={rIdx}>
                    <td className="py-1.5 px-2 border-r font-bold text-slate-900 text-left font-sans">{row[0].day}</td>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-1.5 px-2 border-r">
                        ₹{cell.sales > 0 ? cell.sales.toLocaleString() : "0"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 12. DETERMINISTIC SMART INSIGHTS */}
          <div className="break-inside-avoid space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b pb-1">11. Deterministic Smart Insights Summary</h3>
            <div className="space-y-2 text-xs">
              {biData.smartInsights.map((insight, idx) => (
                <div key={idx} className="p-3 border border-slate-300 rounded-xl space-y-1">
                  <h4 className="font-bold text-slate-900">{insight.title}</h4>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-700">
                    {insight.reasons.map((r, rIdx) => (
                      <li key={rIdx}>{r}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* 13. REPORT FOOTER */}
          <div className="border-t-2 border-slate-900 pt-3 flex justify-between items-center text-[10px] text-slate-500 font-mono">
            <div>Generated by <strong>AutoVault ERP Engine</strong> • 7 Star Car Accessories</div>
            <div>Official Executive Business Document</div>
            <div>Automated PDF/Print Output</div>
          </div>
        </div>

      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/*  MODALS CONTAINER (KPI Explainability & Card Drill-downs)          */}
      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* 1. KPI EXPLAINABILITY MODAL */}
      {activeExplainKey && KPI_EXPLANATIONS[activeExplainKey] && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-navy-950 font-black text-sm">
                <Info size={16} className="text-emerald-600" />
                <span>{KPI_EXPLANATIONS[activeExplainKey].title}</span>
              </div>
              <button onClick={() => setActiveExplainKey(null)} className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Mathematical Formula</span>
                <div className="bg-slate-50 p-2.5 rounded-lg border font-mono text-slate-800 mt-1 font-bold">
                  {KPI_EXPLANATIONS[activeExplainKey].formula}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Canonical Source Tables</span>
                <p className="text-slate-700 font-medium mt-0.5">{KPI_EXPLANATIONS[activeExplainKey].sources.join(", ")}</p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Business Meaning</span>
                <p className="text-slate-600 font-medium mt-0.5 leading-relaxed">{KPI_EXPLANATIONS[activeExplainKey].meaning}</p>
              </div>

              <div className="pt-2 border-t text-[10px] text-slate-400 flex justify-between">
                <span>Update Frequency: {KPI_EXPLANATIONS[activeExplainKey].updateFrequency}</span>
                <span className="font-bold text-emerald-600">Deterministic ERP Rule</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. MONEY VAULT DRILL-DOWN MODAL */}
      {activeDrillModal === "moneyVault" && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-navy-950 text-sm flex items-center gap-2">
                <DollarSign size={16} className="text-emerald-600" />
                Money Vault Liquid Cash Breakdown
              </h3>
              <button onClick={() => setActiveDrillModal(null)} className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex justify-between items-center">
                <span className="font-bold text-emerald-900">Total Liquid Cash Available</span>
                <span className="font-mono font-black text-lg text-emerald-700">₹{biData.liquidCash.toLocaleString()}</span>
              </div>

              <div className="space-y-2 border-t pt-2">
                <div className="flex justify-between py-1.5 border-b font-medium">
                  <span>Cash Drawer (Till)</span>
                  <span className="font-mono font-bold">₹{getCashBalance().toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b font-medium">
                  <span>Bank Account</span>
                  <span className="font-mono font-bold">₹{getBankBalance().toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b font-medium">
                  <span>Digital UPI Account</span>
                  <span className="font-mono font-bold">₹{getUPIBalance().toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setActiveDrillModal(null)}
                  className="px-4 py-2 bg-navy-900 text-white font-bold rounded-xl text-xs cursor-pointer min-h-[44px]"
                >
                  Close Vault
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. CUSTOMER DEBTORS DRILL-DOWN MODAL */}
      {activeDrillModal === "debtors" && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <h3 className="font-black text-navy-950 text-sm flex items-center gap-2">
                <CreditCard size={16} className="text-amber-600" />
                Customer Debtors Ledger ({allTimeDebtorsList.length})
              </h3>
              <button onClick={() => setActiveDrillModal(null)} className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 text-xs flex-1 pr-1">
              {allTimeDebtorsList.map((c) => (
                <div key={c.id} className="p-3 bg-slate-50 rounded-xl border flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-navy-950">{c.name}</h4>
                    <span className="text-[10px] text-slate-400 font-mono">Phone: {c.phone || "—"} • {c.visits || 0} visits</span>
                  </div>
                  <span className="font-mono font-extrabold text-rose-600 text-sm">₹{(c.debt || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t shrink-0 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">Total Receivables: ₹{biData.custDebt.toLocaleString()}</span>
              <button
                onClick={() => setActiveDrillModal(null)}
                className="px-4 py-2 bg-navy-900 text-white font-bold rounded-xl text-xs cursor-pointer min-h-[44px]"
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. DEAD STOCK DRILL-DOWN MODAL */}
      {activeDrillModal === "deadStock" && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <h3 className="font-black text-navy-950 text-sm flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-600" />
                Dead Stock Stagnant Inventory
              </h3>
              <button onClick={() => setActiveDrillModal(null)} className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 text-xs flex-1 pr-1">
              {biData.velocityInsights.deadStockProducts.map((p) => (
                <div key={p.id} className="p-3 bg-rose-50/50 rounded-xl border border-rose-200/60 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-navy-950">{p.name}</h4>
                    <span className="text-[10px] text-slate-400 font-mono">SKU: {p.sku} • Stock: {p.stock} units</span>
                  </div>
                  <span className="font-mono font-bold text-rose-700">₹{(p.stock * p.currentCost).toLocaleString()} locked</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t shrink-0 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">Total Dead Capital: ₹{biData.velocityInsights.deadStockValuation.toLocaleString()}</span>
              <button
                onClick={() => setActiveDrillModal(null)}
                className="px-4 py-2 bg-navy-900 text-white font-bold rounded-xl text-xs cursor-pointer min-h-[44px]"
              >
                Close List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. LOW STOCK RUNOUT PREDICTIONS DRILL-DOWN MODAL */}
      {activeDrillModal === "lowStock" && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <h3 className="font-black text-navy-950 text-sm flex items-center gap-2">
                <Package size={16} className="text-amber-600" />
                Low Stock & Predictive Runout Inventory ({biData.runoutPredictions.length})
              </h3>
              <button onClick={() => setActiveDrillModal(null)} className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 text-xs flex-1 pr-1">
              {biData.runoutPredictions.map((pred) => (
                <div key={pred.productId} className="p-3 bg-slate-50 rounded-xl border flex justify-between items-center gap-3">
                  <div className="space-y-0.5">
                    <h4 className="font-bold text-navy-950">{pred.productName}</h4>
                    <span className="text-[10px] text-slate-400 font-mono">SKU: {pred.sku} • Stock: <strong>{pred.stock}</strong> • Velocity: {pred.avgDailySales}/day</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block text-[10px] font-extrabold px-2.5 py-1 rounded-md ${
                        pred.priority === "Critical"
                          ? "bg-rose-100 text-rose-800"
                          : pred.priority === "High"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {pred.displayMessage}
                    </span>
                    <span className="block text-[9px] font-bold text-slate-400 mt-1">Confidence: {pred.confidence}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t shrink-0 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">Predictive Stock Depletion Engine</span>
              <button
                onClick={() => setActiveDrillModal(null)}
                className="px-4 py-2 bg-navy-900 text-white font-bold rounded-xl text-xs cursor-pointer min-h-[44px]"
              >
                Close Predictions
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
