"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppState, Product, Invoice, Purchase, Supplier, StockMovement, SalesReturn } from "@/types";
import {
  formatPurchaseDate,
  formatStockMovementDate,
  sortPurchasesDescending,
  toLocalDateStr,
  todayLocalStr,
} from "@/lib/dateUtils";
import { calculateRevenue } from "@/lib/revenueUtils";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Package,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  XCircle,
  Clock,
  ShoppingBag,
  Truck,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Layers,
  Archive,
  Info,
  ExternalLink,
  Tag,
} from "lucide-react";

interface InventoryIntelligenceProps {
  state: AppState;
  getInventoryValue: () => number;
}

export function InventoryIntelligenceDashboard({
  state,
  getInventoryValue,
}: InventoryIntelligenceProps) {
  // Collapsible toggle UI state (non-persisted UI state)
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "health" | "categories" | "sales" | "purchases" | "movements">("overview");

  // ───────────────────────────────────────────────────────────────────────────
  // 1. INVENTORY OVERVIEW & HEALTH METRICS (Pure derived calculations)
  // ───────────────────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const ps = state.products || [];
    const totalProducts = ps.length;

    const activeProducts = ps.filter((p) => (p.status || "Active") === "Active");
    const inactiveProducts = ps.filter((p) => p.status === "Inactive");
    const discontinuedProducts = ps.filter((p) => p.status === "Discontinued");

    const totalStockUnits = ps.reduce((s, p) => s + p.stock, 0);

    // Valuation calculations
    const inventoryCostValue = getInventoryValue(); // sum(currentCost * stock)
    const inventorySellValue = ps.reduce((s, p) => s + p.sellPrice * p.stock, 0);
    const potentialGrossProfit = inventorySellValue - inventoryCostValue;
    const potentialGrossMarginPct = inventorySellValue > 0
      ? ((inventorySellValue - inventoryCostValue) / inventorySellValue) * 100
      : 0;

    // Stock health classification (Strictly applying status rules)
    const outOfStockActive = activeProducts.filter((p) => p.stock === 0);
    const lowStockActive = activeProducts.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold);
    const healthyStockActive = activeProducts.filter((p) => p.stock > p.lowStockThreshold);

    // Discontinued & Inactive stock breakdown
    const discontinuedWithStock = discontinuedProducts.filter((p) => p.stock > 0);
    const discontinuedUnits = discontinuedWithStock.reduce((s, p) => s + p.stock, 0);
    const discontinuedCostValue = discontinuedWithStock.reduce((s, p) => s + p.stock * p.currentCost, 0);

    const inactiveWithStock = inactiveProducts.filter((p) => p.stock > 0);
    const inactiveUnits = inactiveWithStock.reduce((s, p) => s + p.stock, 0);
    const inactiveCostValue = inactiveWithStock.reduce((s, p) => s + p.stock * p.currentCost, 0);

    return {
      totalProducts,
      activeCount: activeProducts.length,
      inactiveCount: inactiveProducts.length,
      discontinuedCount: discontinuedProducts.length,
      totalStockUnits,
      inventoryCostValue,
      inventorySellValue,
      potentialGrossProfit,
      potentialGrossMarginPct,
      potentialMargin: potentialGrossProfit,
      outOfStockActive,
      lowStockActive,
      healthyStockActive,
      discontinuedWithStock,
      discontinuedUnits,
      discontinuedCostValue,
      inactiveWithStock,
      inactiveUnits,
      inactiveCostValue,
    };
  }, [state.products, getInventoryValue]);

  // ───────────────────────────────────────────────────────────────────────────
  // 2. CATEGORY INTELLIGENCE (Pure derived calculations)
  // ───────────────────────────────────────────────────────────────────────────
  const categoryStats = useMemo(() => {
    const map: Record<
      string,
      {
        count: number;
        units: number;
        costValue: number;
        sellValue: number;
        outOfStock: number;
        lowStock: number;
      }
    > = {};

    (state.products || []).forEach((p) => {
      const cat = p.category || "Uncategorized";
      if (!map[cat]) {
        map[cat] = { count: 0, units: 0, costValue: 0, sellValue: 0, outOfStock: 0, lowStock: 0 };
      }
      map[cat].count += 1;
      map[cat].units += p.stock;
      map[cat].costValue += p.stock * p.currentCost;
      map[cat].sellValue += p.stock * p.sellPrice;
      const status = p.status || "Active";
      if (status === "Active" && p.stock === 0) map[cat].outOfStock += 1;
      if (status === "Active" && p.stock > 0 && p.stock <= p.lowStockThreshold) map[cat].lowStock += 1;
    });

    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        ...data,
        margin: data.sellValue - data.costValue,
      }))
      .sort((a, b) => b.costValue - a.costValue);
  }, [state.products]);

  // ───────────────────────────────────────────────────────────────────────────
  // 3. SALES INTELLIGENCE & SLOW-MOVING / DEAD STOCK
  // ───────────────────────────────────────────────────────────────────────────
  const salesAnalysis = useMemo(() => {
    const invoices = (state.invoices || []).filter((inv) => !inv.voided);
    const salesReturns = (state.salesReturns || []).filter((r) => r.status !== "Cancelled");
    const products = state.products || [];

    // Track product sales and last sold dates
    const salesMap: Record<
      string,
      {
        unitsSold: number;
        lastSoldDate: string | null;
      }
    > = {};

    invoices.forEach((inv) => {
      const invDate = inv.createdAt || inv.date;
      inv.items.forEach((item) => {
        if (!salesMap[item.productId]) {
          salesMap[item.productId] = { unitsSold: 0, lastSoldDate: null };
        }
        salesMap[item.productId].unitsSold += item.quantity;

        // Keep most recent sale date
        if (!salesMap[item.productId].lastSoldDate) {
          salesMap[item.productId].lastSoldDate = invDate;
        } else {
          const currentT = new Date(salesMap[item.productId].lastSoldDate!).getTime();
          const nextT = new Date(invDate).getTime();
          if (nextT > currentT) salesMap[item.productId].lastSoldDate = invDate;
        }
      });
    });

    // Subtract sales returns
    salesReturns.forEach((r) => {
      r.items.forEach((ri) => {
        if (salesMap[ri.productId]) {
          salesMap[ri.productId].unitsSold = Math.max(0, salesMap[ri.productId].unitsSold - ri.quantity);
        }
      });
    });

    // Top Selling Products
    const topSellers = Object.entries(salesMap)
      .map(([productId, info]) => {
        const product = products.find((p) => p.id === productId);
        const revenue = calculateRevenue(invoices, salesReturns, productId);
        return {
          productId,
          product,
          unitsSold: info.unitsSold,
          revenue,
          lastSoldDate: info.lastSoldDate,
        };
      })
      .filter((item) => item.product && item.unitsSold > 0)
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 6);

    // Slow-Moving & Dead Stock Analysis (Products with stock > 0)
    const nowMs = new Date().getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const slowMoving = products
      .filter((p) => p.stock > 0)
      .map((p) => {
        const salesInfo = salesMap[p.id];
        const lastDate = salesInfo?.lastSoldDate;
        let daysSinceLastSale: number | null = null;
        if (lastDate) {
          const t = new Date(lastDate).getTime();
          if (!isNaN(t)) {
            daysSinceLastSale = Math.floor((nowMs - t) / oneDayMs);
          }
        }
        return {
          product: p,
          unitsSold: salesInfo?.unitsSold ?? 0,
          lastSoldDate: lastDate,
          daysSinceLastSale,
          tiedUpCapital: p.stock * p.currentCost,
        };
      })
      .filter((item) => item.daysSinceLastSale === null || item.daysSinceLastSale >= 30)
      .sort((a, b) => (b.daysSinceLastSale ?? 9999) - (a.daysSinceLastSale ?? 9999))
      .slice(0, 6);

    return { topSellers, slowMoving };
  }, [state.invoices, state.salesReturns, state.products]);

  // ───────────────────────────────────────────────────────────────────────────
  // 4. RECENT PURCHASES & SUPPLIER INTELLIGENCE
  // ───────────────────────────────────────────────────────────────────────────
  const supplierAnalysis = useMemo(() => {
    const purchases = state.purchases || [];
    const suppliers = state.suppliers || [];
    const products = state.products || [];

    // Recent purchases (sorted newest-first using shared helper)
    const recentPurchases = sortPurchasesDescending(purchases).slice(0, 5);

    // Supplier volume & value rollup
    const supplierMap: Record<
      string,
      {
        supplier: Supplier | undefined;
        totalVolume: number;
        totalValue: number;
        transactionCount: number;
        lastPurchaseDate: string | null;
      }
    > = {};

    purchases.forEach((pur) => {
      if (!supplierMap[pur.supplierId]) {
        supplierMap[pur.supplierId] = {
          supplier: suppliers.find((s) => s.id === pur.supplierId),
          totalVolume: 0,
          totalValue: 0,
          transactionCount: 0,
          lastPurchaseDate: null,
        };
      }
      supplierMap[pur.supplierId].totalVolume += pur.quantity;
      supplierMap[pur.supplierId].totalValue += pur.totalAmount ?? pur.buyPrice * pur.quantity;
      supplierMap[pur.supplierId].transactionCount += 1;

      const pDate = pur.createdAt || pur.date;
      if (!supplierMap[pur.supplierId].lastPurchaseDate) {
        supplierMap[pur.supplierId].lastPurchaseDate = pDate;
      } else {
        const curT = new Date(supplierMap[pur.supplierId].lastPurchaseDate!).getTime();
        const nextT = new Date(pDate).getTime();
        if (nextT > curT) supplierMap[pur.supplierId].lastPurchaseDate = pDate;
      }
    });

    const rankedSuppliers = Object.values(supplierMap)
      .filter((item) => item.supplier)
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5);

    return { recentPurchases, rankedSuppliers, products };
  }, [state.purchases, state.suppliers, state.products]);

  // ───────────────────────────────────────────────────────────────────────────
  // 5. STOCK MOVEMENT FLOW INTELLIGENCE
  // ───────────────────────────────────────────────────────────────────────────
  const movementAnalysis = useMemo(() => {
    const movements = state.stockMovements || [];
    const breakdown: Record<string, { count: number; totalUnits: number }> = {};
    let totalInbound = 0;
    let totalOutbound = 0;

    movements.forEach((m) => {
      const type = m.type || "Adjustment";
      if (!breakdown[type]) {
        breakdown[type] = { count: 0, totalUnits: 0 };
      }
      breakdown[type].count += 1;
      breakdown[type].totalUnits += Math.abs(m.delta);

      if (m.delta > 0) totalInbound += m.delta;
      if (m.delta < 0) totalOutbound += Math.abs(m.delta);
    });

    const typeList = Object.entries(breakdown).map(([type, d]) => ({
      type,
      count: d.count,
      totalUnits: d.totalUnits,
    }));

    return { totalMovements: movements.length, totalInbound, totalOutbound, typeList };
  }, [state.stockMovements]);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-navy-950 to-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden text-slate-100 mb-6 transition-all duration-300">
      {/* ── HEADER STRIP & COLLAPSIBLE CONTROL ── */}
      <div className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <Sparkles size={20} className="text-indigo-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white tracking-tight">Inventory Intelligence</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                Live Derivations
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live insights derived from your current inventory, sales, purchases, and stock movement history.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 transition-all cursor-pointer shadow-sm self-start md:self-auto"
        >
          {isExpanded ? (
            <>
              <ChevronUp size={15} />
              Collapse Intelligence
            </>
          ) : (
            <>
              <ChevronDown size={15} />
              Expand Intelligence Dashboard
            </>
          )}
        </button>
      </div>

      {/* ── COLLAPSED SUMMARY STRIP ── */}
      {!isExpanded && (
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-slate-900/40">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total SKUs (incl. variants)</p>
            <p className="text-lg font-black text-white mt-1">{metrics.totalProducts}</p>
            <div className="flex flex-wrap gap-1 mt-1 text-[10px]">
              <span className="text-emerald-400 font-semibold">{metrics.activeCount} Act</span>
              <span className="text-slate-500">·</span>
              <span className="text-amber-400 font-semibold">{metrics.inactiveCount} Inact</span>
              <span className="text-slate-500">·</span>
              <span className="text-rose-400 font-semibold">{metrics.discontinuedCount} Disc</span>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Units</p>
            <p className="text-lg font-black text-white mt-1">{metrics.totalStockUnits.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 mt-1">Across all categories</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Cost Value</p>
            <p className="text-lg font-black text-indigo-300 mt-1">₹{metrics.inventoryCostValue.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 mt-1">Capital invested</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Retail Value</p>
            <p className="text-lg font-black text-emerald-400 mt-1">₹{metrics.inventorySellValue.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 mt-1">Selling value</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Potential Gross Profit</p>
            <p className={`text-lg font-black mt-1 ${
              metrics.potentialGrossProfit > 0
                ? "text-emerald-400"
                : metrics.potentialGrossProfit === 0
                ? "text-slate-300"
                : "text-red-400"
            }`}>
              {metrics.potentialGrossProfit < 0
                ? `-₹${Math.abs(metrics.potentialGrossProfit).toLocaleString()}`
                : `₹${metrics.potentialGrossProfit.toLocaleString()}`}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Margin: {Math.round(metrics.potentialGrossMarginPct)}%
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Active Alerts</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                {metrics.outOfStockActive.length} Out
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {metrics.lowStockActive.length} Low
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Reorder candidates</p>
          </div>
        </div>
      )}

      {/* ── EXPANDED DASHBOARD PANEL ── */}
      {isExpanded && (
        <div className="p-5 space-y-6 animate-fadeIn">
          {/* Sub-Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === "overview"
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Overview & Valuation
            </button>
            <button
              onClick={() => setActiveTab("health")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === "health"
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Stock Health & Risk Center ({metrics.outOfStockActive.length + metrics.lowStockActive.length})
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === "categories"
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Category Intelligence ({categoryStats.length})
            </button>
            <button
              onClick={() => setActiveTab("sales")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === "sales"
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Sales Velocity & Dead Stock
            </button>
            <button
              onClick={() => setActiveTab("purchases")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === "purchases"
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Purchases & Suppliers
            </button>
            <button
              onClick={() => setActiveTab("movements")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === "movements"
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Stock Flow Intelligence
            </button>
          </div>

          {/* ── TAB 1: OVERVIEW & VALUATION ── */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                    <span>Total Products & Units</span>
                    <Package size={16} className="text-indigo-400" />
                  </div>
                  <p className="text-2xl font-black text-white mt-2">{metrics.totalProducts} products</p>
                  <p className="text-xs text-indigo-300 font-semibold mt-1">
                    {metrics.totalStockUnits.toLocaleString()} units in stock
                  </p>
                </div>

                <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                    <span>Capital Invested (Cost)</span>
                    <DollarSign size={16} className="text-indigo-400" />
                  </div>
                  <p className="text-2xl font-black text-indigo-300 mt-2">₹{metrics.inventoryCostValue.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 mt-1">Sum of buy prices × stock</p>
                </div>

                <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                    <span>Retail Value (Selling)</span>
                    <TrendingUp size={16} className="text-emerald-400" />
                  </div>
                  <p className="text-2xl font-black text-emerald-400 mt-2">₹{metrics.inventorySellValue.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 mt-1">Sum of sell prices × stock</p>
                </div>

                <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                    <span>Potential Gross Profit</span>
                    <Sparkles size={16} className={
                      metrics.potentialGrossProfit > 0
                        ? "text-emerald-400"
                        : metrics.potentialGrossProfit === 0
                        ? "text-slate-400"
                        : "text-red-400"
                    } />
                  </div>
                  <p className={`text-2xl font-black mt-2 ${
                    metrics.potentialGrossProfit > 0
                      ? "text-emerald-400"
                      : metrics.potentialGrossProfit === 0
                      ? "text-slate-300"
                      : "text-red-400"
                  }`}>
                    {metrics.potentialGrossProfit < 0
                      ? `-₹${Math.abs(metrics.potentialGrossProfit).toLocaleString()}`
                      : `₹${metrics.potentialGrossProfit.toLocaleString()}`}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 flex justify-between">
                    <span>Retail Value − Cost</span>
                    <span className={`font-semibold ${
                      metrics.potentialGrossMarginPct > 0
                        ? "text-emerald-400"
                        : metrics.potentialGrossMarginPct === 0
                        ? "text-slate-400"
                        : "text-red-400"
                    }`}>
                      {Math.round(metrics.potentialGrossMarginPct)}% margin
                    </span>
                  </p>
                </div>
              </div>

              {/* Product Status Lifecycle Breakdown */}
              <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Tag size={14} className="text-indigo-400" /> Product Lifecycle Distribution
                  </h3>
                  <span className="text-[11px] text-slate-400">Status rules enforced</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400">Active Inventory</span>
                      <span className="text-xs font-black text-white">{metrics.activeCount} products</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Normal operational stock. Eligible for POS sales, low-stock alerts, and reordering.
                    </p>
                  </div>

                  <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-400">Inactive Stock</span>
                      <span className="text-xs font-black text-white">{metrics.inactiveCount} products</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {metrics.inactiveUnits} units (₹{metrics.inactiveCostValue.toLocaleString()} cost). Paused from POS sales and reorder alerts.
                    </p>
                  </div>

                  <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-400">Discontinued Stock</span>
                      <span className="text-xs font-black text-white">{metrics.discontinuedCount} products</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {metrics.discontinuedUnits} units (₹{metrics.discontinuedCostValue.toLocaleString()} cost). Sell-out clearance only; non-reorderable.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: STOCK HEALTH & RISK CENTER ── */}
          {activeTab === "health" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Critical: Out of Stock Active Products */}
              <div className="bg-slate-800/40 border border-red-500/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle size={16} className="text-red-400" />
                    <h3 className="text-xs font-bold text-red-300 uppercase tracking-wider">
                      Critical: Active Out of Stock ({metrics.outOfStockActive.length})
                    </h3>
                  </div>
                  <span className="text-[10px] text-red-400 font-semibold">Needs Immediate Restock</span>
                </div>

                {metrics.outOfStockActive.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No active products out of stock.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {metrics.outOfStockActive.map((p) => (
                      <Link
                        key={p.id}
                        href={`/inventory/${p.id}`}
                        className="flex items-center justify-between bg-slate-900/80 hover:bg-slate-800 p-2.5 rounded-xl border border-slate-700/60 transition-colors group"
                      >
                        <div>
                          <p className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">SKU: {p.sku} · {p.category}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-red-400">0 in stock</span>
                          <ExternalLink size={12} className="text-slate-500 group-hover:text-white" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Attention: Low Stock Active Products */}
              <div className="bg-slate-800/40 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-400" />
                    <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Attention: Active Low Stock ({metrics.lowStockActive.length})
                    </h3>
                  </div>
                  <span className="text-[10px] text-amber-400 font-semibold">Reorder Recommended</span>
                </div>

                {metrics.lowStockActive.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No active products low in stock.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {metrics.lowStockActive.map((p) => (
                      <Link
                        key={p.id}
                        href={`/inventory/${p.id}`}
                        className="flex items-center justify-between bg-slate-900/80 hover:bg-slate-800 p-2.5 rounded-xl border border-slate-700/60 transition-colors group"
                      >
                        <div>
                          <p className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            SKU: {p.sku} · Threshold: {p.lowStockThreshold}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-amber-400">{p.stock} remaining</span>
                          <ExternalLink size={12} className="text-slate-500 group-hover:text-white" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Clearance: Discontinued Stock (Non-reorderable) */}
              <div className="bg-slate-800/40 border border-rose-500/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Archive size={16} className="text-rose-400" />
                    <h3 className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                      Clearance: Discontinued Stock ({metrics.discontinuedWithStock.length})
                    </h3>
                  </div>
                  <span className="text-[10px] text-rose-400 font-semibold">Sell-Out Only · Do Not Reorder</span>
                </div>

                {metrics.discontinuedWithStock.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No discontinued products with stock remaining.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {metrics.discontinuedWithStock.map((p) => (
                      <Link
                        key={p.id}
                        href={`/inventory/${p.id}`}
                        className="flex items-center justify-between bg-slate-900/80 hover:bg-slate-800 p-2.5 rounded-xl border border-slate-700/60 transition-colors group"
                      >
                        <div>
                          <p className="text-xs font-bold text-white group-hover:text-rose-300 transition-colors">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">Tied Up Capital: ₹{(p.stock * p.currentCost).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-rose-300">{p.stock} units</span>
                          <ExternalLink size={12} className="text-slate-500 group-hover:text-white" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Informational: Inactive Stock */}
              <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info size={16} className="text-slate-400" />
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Informational: Inactive Stock ({metrics.inactiveWithStock.length})
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold">Paused Inventory</span>
                </div>

                {metrics.inactiveWithStock.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No inactive products with stock.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {metrics.inactiveWithStock.map((p) => (
                      <Link
                        key={p.id}
                        href={`/inventory/${p.id}`}
                        className="flex items-center justify-between bg-slate-900/80 hover:bg-slate-800 p-2.5 rounded-xl border border-slate-700/60 transition-colors group"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">Tied Up Capital: ₹{(p.stock * p.currentCost).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400">{p.stock} units</span>
                          <ExternalLink size={12} className="text-slate-500 group-hover:text-white" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 3: CATEGORY INTELLIGENCE ── */}
          {activeTab === "categories" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Layers size={14} className="text-indigo-400" /> Category Breakdown ({categoryStats.length} categories)
                </h3>
                <span className="text-[11px] text-slate-400">Sorted by highest capital invested</span>
              </div>

              <div className="border border-slate-800 rounded-2xl overflow-hidden text-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 font-bold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3">Category</th>
                        <th className="p-3 text-right">Products</th>
                        <th className="p-3 text-right">Stock Units</th>
                        <th className="p-3 text-right">Cost Value</th>
                        <th className="p-3 text-right">Retail Value</th>
                        <th className="p-3 text-right">Potential Margin</th>
                        <th className="p-3 text-center">Alerts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {categoryStats.map((cat) => (
                        <tr key={cat.name} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-3 font-bold text-white flex items-center gap-2">
                            <span>{cat.name}</span>
                          </td>
                          <td className="p-3 text-right font-medium text-slate-300">{cat.count}</td>
                          <td className="p-3 text-right font-medium text-slate-300">{cat.units.toLocaleString()}</td>
                          <td className="p-3 text-right font-bold text-indigo-300">₹{cat.costValue.toLocaleString()}</td>
                          <td className="p-3 text-right font-bold text-emerald-400">₹{cat.sellValue.toLocaleString()}</td>
                          <td className={`p-3 text-right font-bold ${cat.margin > 0 ? "text-cyan-300" : cat.margin === 0 ? "text-slate-400" : "text-red-400"}`}>
                            {cat.margin < 0 ? `-₹${Math.abs(cat.margin).toLocaleString()}` : `₹${cat.margin.toLocaleString()}`}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {cat.outOfStock > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                                  {cat.outOfStock} Out
                                </span>
                              )}
                              {cat.lowStock > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  {cat.lowStock} Low
                                </span>
                              )}
                              {cat.outOfStock === 0 && cat.lowStock === 0 && (
                                <span className="text-[10px] font-bold text-emerald-400">Healthy</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 4: SALES VELOCITY & DEAD STOCK ── */}
          {activeTab === "sales" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Top Selling Products */}
              <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <TrendingUp size={14} className="text-emerald-400" /> Top Selling Products
                  </h3>
                  <span className="text-[11px] text-slate-400">Non-voided sales</span>
                </div>

                {salesAnalysis.topSellers.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No sales history recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {salesAnalysis.topSellers.map((item) => (
                      <Link
                        key={item.productId}
                        href={`/inventory/${item.productId}`}
                        className="flex items-center justify-between bg-slate-900/80 hover:bg-slate-800 p-2.5 rounded-xl border border-slate-700/60 transition-colors group"
                      >
                        <div>
                          <p className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                            {item.product?.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            Stock: {item.product?.stock} · Status: {item.product?.status || "Active"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-emerald-400">{item.unitsSold} units sold</p>
                          <p className="text-[10px] font-bold text-slate-300">₹{item.revenue.toLocaleString()} revenue</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Slow-Moving / Dead Stock */}
              <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Clock size={14} className="text-amber-400" /> Slow Moving & Dead Stock
                  </h3>
                  <span className="text-[11px] text-slate-400">Products with stock & no recent sales</span>
                </div>

                {salesAnalysis.slowMoving.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No slow-moving inventory detected.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {salesAnalysis.slowMoving.map((item) => (
                      <Link
                        key={item.product.id}
                        href={`/inventory/${item.product.id}`}
                        className="flex items-center justify-between bg-slate-900/80 hover:bg-slate-800 p-2.5 rounded-xl border border-slate-700/60 transition-colors group"
                      >
                        <div>
                          <p className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                            {item.product.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            Tied Up Capital: ₹{item.tiedUpCapital.toLocaleString()} ({item.product.stock} units)
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {item.daysSinceLastSale !== null ? `${item.daysSinceLastSale} days idle` : "Never Sold"}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 5: PURCHASES & SUPPLIERS ── */}
          {activeTab === "purchases" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Recent Purchases */}
              <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <ShoppingBag size={14} className="text-indigo-400" /> Recent Purchases
                  </h3>
                  <span className="text-[11px] text-slate-400">Newest first</span>
                </div>

                {supplierAnalysis.recentPurchases.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No purchases recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {supplierAnalysis.recentPurchases.map((pur) => {
                      const supplier = state.suppliers?.find((s) => s.id === pur.supplierId);
                      const product = supplierAnalysis.products.find((p) => p.id === pur.productId);
                      return (
                        <div
                          key={pur.id}
                          className="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60 text-xs"
                        >
                          <div>
                            <Link
                              href={`/inventory/${pur.productId}?tab=purchases`}
                              className="font-bold text-white hover:text-indigo-300 transition-colors"
                            >
                              {product?.name || "Product"}
                            </Link>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Supplier:{" "}
                              {supplier ? (
                                <Link
                                  href={`/suppliers/${supplier.id}`}
                                  className="text-indigo-300 font-semibold hover:underline"
                                >
                                  {supplier.name}
                                </Link>
                              ) : (
                                "—"
                              )}{" "}
                              · {formatPurchaseDate(pur)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-emerald-400">{pur.quantity} units</p>
                            <p className="text-[10px] text-slate-300 font-mono">
                              ₹{(pur.totalAmount ?? pur.buyPrice * pur.quantity).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Ranked Supplier Intelligence */}
              <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Truck size={14} className="text-indigo-400" /> Supplier Volume & Value
                  </h3>
                  <span className="text-[11px] text-slate-400">Ranked by purchase total</span>
                </div>

                {supplierAnalysis.rankedSuppliers.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No supplier transactions recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {supplierAnalysis.rankedSuppliers.map((item) => (
                      <Link
                        key={item.supplier!.id}
                        href={`/suppliers/${item.supplier!.id}`}
                        className="flex items-center justify-between bg-slate-900/80 hover:bg-slate-800 p-2.5 rounded-xl border border-slate-700/60 transition-colors group"
                      >
                        <div>
                          <p className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                            {item.supplier!.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {item.transactionCount} transactions · {item.totalVolume} units
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-indigo-300">₹{item.totalValue.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-400">
                            Last: {item.lastPurchaseDate ? formatStockMovementDate(item.lastPurchaseDate) : "—"}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 6: STOCK MOVEMENT FLOW ── */}
          {activeTab === "movements" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Stock Movements</p>
                  <p className="text-2xl font-black text-white mt-1">{movementAnalysis.totalMovements}</p>
                  <p className="text-[11px] text-slate-400 mt-1">Append-only audit trail</p>
                </div>

                <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <ArrowDownRight size={16} /> Total Inbound Flow
                  </p>
                  <p className="text-2xl font-black text-emerald-400 mt-1">+{movementAnalysis.totalInbound.toLocaleString()} units</p>
                  <p className="text-[11px] text-slate-400 mt-1">Purchases, imports & returns</p>
                </div>

                <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
                  <p className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                    <ArrowUpRight size={16} /> Total Outbound Flow
                  </p>
                  <p className="text-2xl font-black text-rose-400 mt-1">-{movementAnalysis.totalOutbound.toLocaleString()} units</p>
                  <p className="text-[11px] text-slate-400 mt-1">Sales & purchase returns</p>
                </div>
              </div>

              {/* Movement Types Grid */}
              <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Activity size={14} className="text-indigo-400" /> Movement Type Breakdown
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {movementAnalysis.typeList.map((item) => (
                    <div key={item.type} className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/60">
                      <p className="text-xs font-bold text-slate-200">{item.type}</p>
                      <div className="flex items-center justify-between mt-1 text-[11px]">
                        <span className="text-slate-400">{item.count} events</span>
                        <span className="font-bold text-indigo-300">{item.totalUnits} units</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
