"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import StatCard from "@/components/StatCard";
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
  Smartphone,
  CreditCard,
  Info,
  ChevronRight,
  X,
  Activity,
  FileText,
  RotateCcw,
} from "lucide-react";
import type { PaymentStatus } from "@/types";
import { todayLocalStr, formatInvoiceDate } from "@/lib/dateUtils";

// ─────────────────────────────────────────────────────────────────────────────
//  STATUS BADGE COLORS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PaymentStatus, string> = {
  Paid: "bg-green-50 text-green-700 border border-green-200",
  Partial: "bg-orange-50 text-orange-700 border border-orange-200",
  Debt: "bg-red-50 text-red-600 border border-red-200",
};

export default function DashboardPage() {
  const {
    state,
    getTotalRevenue,
    getTotalProfit,
    getTotalOutstandingDebt,
    getInventoryValue,
    getInvoiceOutstanding,
  } = useStore();

  const { isOwner, loading } = useRole();

  const today = todayLocalStr();

  // ── States ────────────────────────────────────────────────────────────────
  const [lookupQuery, setLookupQuery] = useState("");
  const [chartHoveredIdx, setChartHoveredIdx] = useState<number | null>(null);

  // ── Derived Dashboard Data ────────────────────────────────────────────────
  const {
    todaysInvoices,
    todaysRevenue,
    recentInvoices,
    topProducts,
    highDebtCustomers,
    lowStock,
    outOfStock,
    paymentMethodTotals,
    last7DaysTrend,
  } = useMemo(() => {
    const invoices = state.invoices.filter((inv) => !inv.voided);

    // Today's invoices
    const todaysInvoices = invoices.filter((inv) => inv.date === today);
    const todaysRevenue = todaysInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0);

    // Recent invoices (last 5, newest first)
    const recentInvoices = [...invoices]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    // Top products by quantity sold
    const soldMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    invoices.forEach((inv) => {
      inv.items.forEach((item) => {
        if (!soldMap[item.productId]) {
          soldMap[item.productId] = { name: item.name, qty: 0, revenue: 0 };
        }
        soldMap[item.productId].qty += item.quantity;
        soldMap[item.productId].revenue += item.price * item.quantity;
      });
    });
    const topProducts = Object.values(soldMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // High debt customers — derived from invoice effective dues (not cached customer.debt)
    const debtByCustomerId: Record<string, number> = {};
    invoices.forEach((inv) => {
      const effOutstanding = getInvoiceOutstanding(inv);
      if (inv.customerId && effOutstanding > 0) {
        debtByCustomerId[inv.customerId] = (debtByCustomerId[inv.customerId] ?? 0) + effOutstanding;
      }
    });
    const highDebtCustomers = [...state.customers]
      .filter((c) => (debtByCustomerId[c.id] ?? 0) > 0)
      .map((c) => ({ ...c, debt: debtByCustomerId[c.id] ?? 0 }))
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 5);

    // Low / out of stock
    const lowStock = state.products.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold);
    const outOfStock = state.products.filter((p) => p.stock === 0);

    // Payment method breakdown
    const methods = ["Cash", "UPI", "Card", "Credit"] as const;
    const paymentMethodTotals = methods.map((method) => ({
      method,
      total: invoices.filter((inv) => inv.paymentMethod === method).reduce((s, inv) => s + inv.amountPaid, 0),
      count: invoices.filter((inv) => inv.paymentMethod === method).length,
    }));

    // Sales trend for last 7 days preceding today
    const todayStr = todayLocalStr();
    const [tYear, tMonth, tDay] = todayStr.split("-").map(Number);
    const todayUTC = new Date(Date.UTC(tYear, tMonth - 1, tDay));
    const oneDay = 24 * 60 * 60 * 1000;
    const last7DaysTrend = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayUTC.getTime() - (6 - i) * oneDay);
      const dateStr = d.toISOString().split("T")[0];
      const label = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(d);
      return { label, dateStr, total: 0 };
    });

    invoices.forEach((inv) => {
      last7DaysTrend.forEach((pt) => {
        if (inv.date === pt.dateStr) pt.total += inv.total;
      });
    });

    return {
      todaysInvoices,
      todaysRevenue,
      recentInvoices,
      topProducts,
      highDebtCustomers,
      lowStock,
      outOfStock,
      paymentMethodTotals,
      last7DaysTrend,
    };
  }, [state.invoices, state.customers, state.products, today]);

  // ── Quick Stock Lookup ────────────────────────────────────────────────────
  const matchedLookupProducts = useMemo(() => {
    const q = lookupQuery.trim().toLowerCase();
    if (!q) return [];
    return state.products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 3);
  }, [state.products, lookupQuery]);

  const totalRevenue = getTotalRevenue();
  const totalProfit = getTotalProfit();
  const totalDebt = getTotalOutstandingDebt();
  const inventoryValue = getInventoryValue();

  // ── SVG Trend path string calculation ─────────────────────────────────────
  const { linePath, areaPath, maxChartVal } = useMemo(() => {
    const maxVal = Math.max(...last7DaysTrend.map((t) => t.total), 3000) * 1.15;
    let lP = "";
    let aP = "";

    last7DaysTrend.forEach((pt, idx) => {
      const x = 65 + (idx / 6) * 515;
      const y = 130 - (pt.total / maxVal) * 110;

      if (idx === 0) {
        lP = `M ${x} ${y}`;
        aP = `M ${x} 130 L ${x} ${y}`;
      } else {
        lP += ` L ${x} ${y}`;
        aP += ` L ${x} ${y}`;
      }
    });

    if (last7DaysTrend.length > 0) {
      aP += ` L 580 130 Z`;
    }

    return { linePath: lP, areaPath: aP, maxChartVal: maxVal };
  }, [last7DaysTrend]);

  if (loading) return null;

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER COMMAND CENTER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-12">

      {/* ── Top Bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-tight">
            {isOwner ? "Owner Command Center" : "Store Dashboard"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            7 Star Car Accessories · {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            {!isOwner && <span className="ml-2 bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">Staff View</span>}
          </p>
        </div>
        <Link
          href="/billing"
          className="flex items-center gap-2 bg-navy-950 hover:bg-navy-900 active:scale-97 text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-md cursor-pointer"
        >
          <ShoppingCart size={14} className="text-amber-400" />
          POS Billing Terminal
        </Link>
      </div>

      {/* ── ZONE 1: Grouped Snapshot (Financials & Operations side-by-side) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">

        {/* Financial Metrics Summary (Owner only) */}
        {isOwner ? (
          <div className="xl:col-span-7 bg-slate-900 border border-slate-800 text-white rounded-2xl p-6 shadow-md flex flex-col justify-between relative overflow-hidden group">
            {/* Background design accents */}
            <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-full blur-xl group-hover:scale-125 transition duration-500" />
            <div className="absolute left-1/3 bottom-0 w-32 h-32 bg-gradient-to-tr from-blue-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />

            <div className="relative">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <TrendingUp size={12} className="text-emerald-450" />
                Financial Command Snapshot
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <span className="text-[10px] text-slate-450 block font-bold uppercase tracking-wider">Total Sales</span>
                  <span className="text-xl font-black text-white mt-1 block">₹{totalRevenue.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500 font-semibold mt-1.5 block">Revenue captured</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-450 block font-bold uppercase tracking-wider">Net Profit</span>
                  <span className="text-xl font-black text-emerald-400 mt-1 block">₹{totalProfit.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500 font-semibold mt-1.5 block">
                    {totalRevenue > 0 ? `${Math.round((totalProfit / totalRevenue) * 100)}% net margin` : "0% margin"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-450 block font-bold uppercase tracking-wider">Outstanding Debt</span>
                  <span className="text-xl font-black text-red-400 mt-1 block">₹{totalDebt.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500 font-semibold mt-1.5 block">Uncollected balances</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-450 block font-bold uppercase tracking-wider">Warehouse Value</span>
                  <span className="text-xl font-black text-amber-400 mt-1 block">₹{inventoryValue.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500 font-semibold mt-1.5 block">Assets at cost</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* General Store Operations Summary */}
        <div className={`${isOwner ? "xl:col-span-5" : "xl:col-span-12"} bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between`}>
          <div>
            <h3 className="text-[10px] font-bold text-slate-450 uppercase tracking-widest mb-5 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Package size={12} className="text-amber-500" />
              Store Operations Snapshot
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-5.5">
              <div className="flex justify-between items-start border-r border-slate-100 pr-2 xl:border-r-0 xl:pr-0">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Today&apos;s Bills</span>
                  <span className="text-lg font-black text-slate-900 mt-1 block">{todaysInvoices.length}</span>
                </div>
                {isOwner && todaysRevenue > 0 && (
                  <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200 mt-1">
                    ₹{todaysRevenue.toLocaleString()}
                  </span>
                )}
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Total Invoices</span>
                <span className="text-lg font-black text-slate-900 mt-1 block">{state.invoices.length}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Client Accounts</span>
                <span className="text-lg font-black text-slate-900 mt-1 block">{state.customers.length}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Catalog Products</span>
                <span className="text-lg font-black text-slate-900 mt-1 block">{state.products.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ZONE 2: Consolidated System Action Center (Alerts & Receivables) ── */}
      {(totalDebt > 0 || lowStock.length > 0 || outOfStock.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-500" />
              <h2 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">System Action Center</h2>
            </div>
            <span className="bg-red-550 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {(totalDebt > 0 ? 1 : 0) + (outOfStock.length > 0 ? 1 : 0) + (lowStock.length > 0 ? 1 : 0)} Concerns
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Outstanding Receivables Follow-Up (Owner Only) */}
            {isOwner && totalDebt > 0 && (
              <div className="bg-gradient-to-br from-red-50/40 to-rose-50/40 border border-red-100 rounded-xl p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <h4 className="text-xs font-black text-red-800 uppercase tracking-wide">Dues Pending Collection</h4>
                  </div>
                  <p className="text-xs text-red-650 mt-1.5 leading-relaxed">
                    A total of <span className="font-bold text-red-700">₹{totalDebt.toLocaleString()}</span> outstanding customer debt is recorded across{" "}
                    <span className="font-bold text-red-700">{state.customers.filter((c) => c.debt > 0).length} accounts</span>.
                  </p>
                </div>
                <Link
                  href="/customers?filter=debt"
                  className="text-xs font-bold text-red-750 hover:text-red-950 bg-white border border-red-200 px-3.5 py-2 rounded-lg shadow-sm hover:shadow transition active:scale-95 w-fit flex items-center gap-1 cursor-pointer"
                >
                  Manage Dues <ChevronRight size={12} />
                </Link>
              </div>
            )}

            {/* Warehouse Stock Warnings */}
            {(outOfStock.length > 0 || lowStock.length > 0) && (
              <div className="bg-gradient-to-br from-orange-50/40 to-amber-50/40 border border-orange-100 rounded-xl p-4 flex flex-col justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                    <h4 className="text-xs font-black text-orange-850 uppercase tracking-wide">Inventory Warning</h4>
                  </div>
                  <div className="text-[11px] text-orange-750 mt-2 space-y-1">
                    {outOfStock.length > 0 && (
                      <p className="truncate">
                        <span className="font-bold text-red-600">Stockouts ({outOfStock.length}):</span> {outOfStock.map((p) => p.name).join(", ")}
                      </p>
                    )}
                    {lowStock.length > 0 && (
                      <p className="truncate">
                        <span className="font-bold text-orange-800">Critical Low ({lowStock.length}):</span> {lowStock.map((p) => `${p.name} (${p.stock})`).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <Link
                  href="/inventory"
                  className="text-xs font-bold text-orange-750 hover:text-orange-950 bg-white border border-orange-200 px-3.5 py-2 rounded-lg shadow-sm hover:shadow transition active:scale-95 w-fit flex items-center gap-1 cursor-pointer"
                >
                  Inspect Warehouse <ChevronRight size={12} />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Purchase Orders KPI Strip (Owner only) ── */}
      {isOwner && (() => {
        const allPOs = state.purchaseOrders ?? [];
        const todayMs = new Date(today).getTime();
        const weekMs = todayMs + 7 * 24 * 60 * 60 * 1000;

        const openPOs = allPOs.filter(
          (po) =>
            po.status === "Draft" ||
            po.status === "Sent" ||
            po.status === "Supplier Confirmed" ||
            po.status === "Partially Delivered"
        );
        const openPOValue = openPOs.reduce(
          (sum, po) => sum + po.items.reduce((s, item) => s + item.quantity * item.expectedBuyPrice, 0),
          0
        );

        const latePOs = allPOs.filter((po) => {
          if (po.status === "Completed" || po.status === "Cancelled") return false;
          return new Date(po.expectedDeliveryDate).getTime() < todayMs;
        });
        const dueThisWeek = allPOs.filter((po) => {
          if (po.status === "Completed" || po.status === "Cancelled") return false;
          const ms = new Date(po.expectedDeliveryDate).getTime();
          return ms >= todayMs && ms <= weekMs;
        });

        if (allPOs.length === 0) return null;

        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-blue-500" />
                <h2 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">Purchase Orders</h2>
              </div>
              <Link
                href="/suppliers"
                className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                Manage <ChevronRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Open POs */}
              <Link href="/suppliers" className="group bg-blue-50/60 border border-blue-100 rounded-xl p-4 hover:bg-blue-50 transition-colors cursor-pointer">
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Open POs</p>
                <p className="text-2xl font-extrabold text-blue-800 mt-1">{openPOs.length}</p>
                <p className="text-[10px] text-blue-400 mt-1">Pending Delivery</p>
              </Link>

              {/* Open PO Value */}
              <Link href="/suppliers" className="group bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 hover:bg-indigo-50 transition-colors cursor-pointer">
                <p className="text-[10px] font-bold text-indigo-650 uppercase tracking-wider">Open PO Value</p>
                <p className="text-2xl font-extrabold text-indigo-800 mt-1">₹{openPOValue.toLocaleString()}</p>
                <p className="text-[10px] text-indigo-400 mt-1">Est. value of open orders</p>
              </Link>

              {/* Late POs */}
              <Link href="/suppliers" className={`group rounded-xl p-4 border transition-colors cursor-pointer ${latePOs.length > 0 ? "bg-rose-50/60 border-rose-100 hover:bg-rose-50" : "bg-slate-50 border-slate-100"}`}>
                <div className="flex items-center gap-1.5">
                  {latePOs.length > 0 && <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />}
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${latePOs.length > 0 ? "text-rose-600" : "text-slate-400"}`}>Late POs</p>
                </div>
                <p className={`text-2xl font-extrabold mt-1 ${latePOs.length > 0 ? "text-rose-800" : "text-slate-400"}`}>{latePOs.length}</p>
                <p className={`text-[10px] mt-1 ${latePOs.length > 0 ? "text-rose-400" : "text-slate-300"}`}>Past expected date</p>
              </Link>

              {/* Due This Week */}
              <Link href="/suppliers" className={`group rounded-xl p-4 border transition-colors cursor-pointer ${dueThisWeek.length > 0 ? "bg-amber-50/60 border-amber-100 hover:bg-amber-50" : "bg-slate-50 border-slate-100"}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${dueThisWeek.length > 0 ? "text-amber-600" : "text-slate-400"}`}>Due This Week</p>
                <p className={`text-2xl font-extrabold mt-1 ${dueThisWeek.length > 0 ? "text-amber-800" : "text-slate-400"}`}>{dueThisWeek.length}</p>
                <p className={`text-[10px] mt-1 ${dueThisWeek.length > 0 ? "text-amber-400" : "text-slate-300"}`}>Next 7 days</p>
              </Link>
            </div>
          </div>
        );
      })()}

      {/* ── Sales Returns KPI Strip (Owner only) ── */}
      {isOwner && (() => {
        const allReturns = (state.salesReturns || []).filter((r) => r.status !== "Cancelled");
        if (allReturns.length === 0) return null;

        const totalReturns = allReturns.length;
        const totalRefundValue = allReturns.reduce((s, r) => s + r.totalRefund, 0);
        const thisMonth = today.substring(0, 7); // YYYY-MM
        const monthReturns = allReturns.filter((r) => r.createdAt.startsWith(thisMonth));
        const monthRefund = monthReturns.reduce((s, r) => s + r.totalRefund, 0);
        const totalReturnedQty = allReturns.reduce((s, r) => s + r.items.reduce((ss, i) => ss + i.quantity, 0), 0);

        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <RotateCcw size={15} className="text-orange-500" />
                <h2 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">Sales Returns</h2>
              </div>
              <Link
                href="/invoices"
                className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                View Invoices <ChevronRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-orange-50/60 border border-orange-100 rounded-xl p-4">
                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">Total Returns</p>
                <p className="text-2xl font-extrabold text-orange-800 mt-1">{totalReturns}</p>
                <p className="text-[10px] text-orange-400 mt-1">{totalReturnedQty} items returned</p>
              </div>
              <div className="bg-red-50/60 border border-red-100 rounded-xl p-4">
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Total Refunded</p>
                <p className="text-2xl font-extrabold text-red-800 mt-1">₹{totalRefundValue.toLocaleString()}</p>
                <p className="text-[10px] text-red-400 mt-1">All time refunds</p>
              </div>
              <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-4">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">This Month</p>
                <p className="text-2xl font-extrabold text-amber-800 mt-1">{monthReturns.length}</p>
                <p className="text-[10px] text-amber-400 mt-1">Returns this month</p>
              </div>
              <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-4">
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Month Refunds</p>
                <p className="text-2xl font-extrabold text-rose-800 mt-1">₹{monthRefund.toLocaleString()}</p>
                <p className="text-[10px] text-rose-400 mt-1">Refunded this month</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── ZONE 3: 12-Column Layout Grid (Invoices & Trends vs Sidebar Controls) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

        {/* LEFT COLUMN: Activity Visualizer & Invoice log (8/12 grid span) */}
        <div className="lg:col-span-8 space-y-6 flex flex-col justify-between">

          {/* Sales Trend SVG line chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex-1 flex flex-col justify-between">
            <div className="pb-3 border-b border-slate-50">
              <h2 className="font-extrabold text-slate-900 text-sm md:text-base">Weekly Billing Activity</h2>
              <p className="text-xs text-slate-400 mt-0.5">Sales invoices generated over the last 7 calendar days</p>
            </div>

            <div className="relative w-full h-[180px] select-none mt-4">
              {totalRevenue > 0 ? (
                <>
                  <svg viewBox="0 0 600 180" width="100%" height="100%" className="overflow-visible">
                    <defs>
                      <linearGradient id="salesTrendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f5c518" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#f5c518" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Grid guidelines */}
                    {[0, 0.33, 0.66, 1].map((ratio, i) => {
                      const yVal = 20 + ratio * 110;
                      return (
                        <line key={i} x1="65" y1={yVal} x2="580" y2={yVal} stroke="#f8fafc" strokeWidth="1.5" strokeDasharray="3 3" />
                      );
                    })}

                    <line x1="65" y1="130" x2="580" y2="130" stroke="#e2e8f0" strokeWidth="1" />

                    {/* Area Fill and Stroke Line */}
                    {areaPath && <path d={areaPath} fill="url(#salesTrendGrad)" />}
                    {linePath && (
                      <path d={linePath} fill="none" stroke="#f5c518" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    )}

                    {/* Guided markers on hover */}
                    {last7DaysTrend.map((pt, idx) => {
                      const isHovered = chartHoveredIdx === idx;
                      const x = 65 + (idx / 6) * 515;
                      const y = 130 - (pt.total / maxChartVal) * 110;

                      return (
                        <g key={idx}>
                          {isHovered && (
                            <line x1={x} y1="20" x2={x} y2="130" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                          )}
                          {pt.total > 0 && (
                            <circle
                              cx={x}
                              cy={y}
                              r={isHovered ? 5.5 : 3.5}
                              fill="#f5c518"
                              stroke="#0a121f"
                              strokeWidth="1.5"
                              className="transition-all duration-100"
                            />
                          )}
                        </g>
                      );
                    })}

                    {/* Hover rect overlay */}
                    {last7DaysTrend.map((pt, idx) => {
                      const x = 65 + (idx / 6) * 515;
                      const barWidth = 515 / 7;
                      return (
                        <rect
                          key={idx}
                          x={x - barWidth / 2}
                          y="20"
                          width={barWidth}
                          height="110"
                          fill="transparent"
                          className="cursor-crosshair animate-in fade-in"
                          onMouseEnter={() => setChartHoveredIdx(idx)}
                          onMouseLeave={() => setChartHoveredIdx(null)}
                        />
                      );
                    })}

                    {/* Labels left */}
                    {[0, 0.33, 0.66, 1].map((ratio, i) => {
                      const val = Math.round(maxChartVal * (1 - ratio));
                      const yVal = 20 + ratio * 110;
                      return (
                        <text key={i} x="50" y={yVal + 3.5} textAnchor="end" className="text-[9px] font-bold text-slate-400 font-mono">
                          ₹{val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                        </text>
                      );
                    })}

                    {/* Labels bottom */}
                    {last7DaysTrend.map((pt, idx) => {
                      const x = 65 + (idx / 6) * 515;
                      return (
                        <text key={idx} x={x} y="152" textAnchor="middle" className="text-[9px] font-bold text-slate-400">
                          {pt.label}
                        </text>
                      );
                    })}
                  </svg>

                  {/* Hover Tooltip card overlay */}
                  {chartHoveredIdx !== null && last7DaysTrend[chartHoveredIdx] && (
                    <div
                      className="absolute z-10 bg-slate-900 border border-slate-750 text-white rounded-xl px-3 py-1.5 shadow-xl text-xs w-36 pointer-events-none"
                      style={{
                        left: `${Math.min(Math.max(10, (chartHoveredIdx / 6) * 100 - 12), 73)}%`,
                        top: "10px",
                      }}
                    >
                      <p className="font-bold text-slate-400">{last7DaysTrend[chartHoveredIdx].label}</p>
                      <p className="font-black text-yellow-400 font-mono mt-0.5">
                        ₹{last7DaysTrend[chartHoveredIdx].total.toLocaleString()}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-4">
                  <Activity className="text-slate-350 w-8 h-8 mb-1.5 animate-pulse" />
                  <p className="font-bold text-slate-500 text-xs">No Weekly Billing Activity</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Billing logs will populate this trend visualizer live.</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Invoices list */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-extrabold text-slate-900 text-sm md:text-base">Recent Invoices</h2>
                <p className="text-xs text-slate-400 mt-0.5">Audit log of latest business billing issues</p>
              </div>
              <Link
                href="/invoices"
                className="text-xs font-bold text-amber-500 hover:text-amber-600 flex items-center gap-0.5 cursor-pointer"
              >
                View all <ArrowRight size={12} />
              </Link>
            </div>

            {recentInvoices.length === 0 ? (
              <div className="p-10 flex flex-col items-center justify-center text-center my-auto">
                <FileText size={28} className="text-slate-200 mb-2" />
                <p className="font-bold text-slate-500 text-xs">No invoices generated yet</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Sales invoices will appear here in chronological order.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 flex-1 my-auto">
                {recentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-500">
                          {inv.invoiceNumber}
                        </span>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${STATUS_BADGE[inv.paymentStatus]}`}>
                          {inv.paymentStatus}
                        </span>
                      </div>
                      <p className="text-xs font-extrabold text-slate-800 mt-1 truncate">
                        {inv.customer}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium font-mono">{formatInvoiceDate(inv)}</p>
                    </div>
                    <div className="text-right ml-4 shrink-0 flex items-center gap-4">
                      <div>
                        <p className="font-black text-slate-850 text-sm">
                          ₹{inv.total.toLocaleString()}
                        </p>
                        {getInvoiceOutstanding(inv) > 0 && (
                          <p className="text-[10px] text-red-500 font-bold">
                            Due: ₹{getInvoiceOutstanding(inv).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-xs font-bold text-amber-500 hover:text-amber-600 border border-slate-200 hover:border-amber-250 bg-white hover:bg-amber-50/20 px-3 py-2 rounded-xl transition cursor-pointer"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Controls, breakdowns, leaderboards (4/12 grid span) */}
        <div className="lg:col-span-4 space-y-6">

          {/* Top Products Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-extrabold text-slate-900 text-sm md:text-base">Top Products</h2>
                <p className="text-xs text-slate-400 mt-0.5">Top-selling accessories by units sold</p>
              </div>
            </div>
            {topProducts.length === 0 ? (
              <div className="px-5 py-8 flex flex-col items-center justify-center text-center">
                <Package size={28} className="text-slate-200 mb-2" />
                <p className="font-bold text-slate-500 text-xs">No items sold yet</p>
                <p className="text-[10px] text-slate-450 mt-0.5 font-medium">Product sale counts will update after invoice generation.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {topProducts.map((p, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-bold text-slate-300 w-4 shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {p.name}
                      </span>
                    </div>
                    <div className="text-right ml-2 shrink-0">
                      <p className="text-xs font-black text-slate-800">
                        {p.qty} sold
                      </p>
                      {isOwner && (
                        <p className="text-[10px] font-bold text-green-600">
                          ₹{p.revenue.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* High Debt Customers Card (Owner only) */}
          {isOwner && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <h2 className="font-extrabold text-slate-900 text-sm md:text-base">Outstanding Debt</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Top client balances pending collection</p>
                </div>
              </div>
              {highDebtCustomers.length === 0 ? (
                <div className="px-5 py-8 flex flex-col items-center justify-center text-center">
                  <CheckCircle size={24} className="text-green-500 mb-2" />
                  <span className="text-green-700 font-bold text-xs block">✓ No Pending Dues</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">All customer debt balances are fully paid.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {highDebtCustomers.map((c) => (
                    <Link
                      key={c.id}
                      href={`/customers/${c.id}`}
                      className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6.5 h-6.5 rounded-full bg-red-550 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {c.name.charAt(0)}
                        </div>
                        <span className="text-xs font-bold text-slate-700 truncate">
                          {c.name}
                        </span>
                      </div>
                      <span className="text-xs font-extrabold text-red-600 ml-2 shrink-0">
                        ₹{c.debt.toLocaleString()}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Actions & Stock Checker */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div>
              <h2 className="font-extrabold text-slate-900 text-sm md:text-base">Quick Operations</h2>
              <p className="text-xs text-slate-400 mt-0.5">Fast navigation & instant stock levels checker</p>
            </div>

            {/* Quick Actions Interactive Grid */}
            <div className="grid grid-cols-2 gap-2">
              <QuickAction href="/billing" label="New Bill" icon={<ShoppingCart size={15} />} color="bg-navy-950 hover:bg-navy-800 hover:shadow-md hover:-translate-y-0.5" />
              <QuickAction href="/invoices" label="Invoices" icon={<ReceiptText size={15} />} color="bg-yellow-400 hover:bg-yellow-300 text-navy-950 hover:shadow-md hover:-translate-y-0.5" textClass="text-navy-950" />
              <QuickAction href="/customers" label="Customers" icon={<Users size={15} />} color="bg-navy-700 hover:bg-navy-600 hover:shadow-md hover:-translate-y-0.5" />
              <QuickAction href="/inventory" label="Inventory" icon={<Package size={15} />} color="bg-emerald-700 hover:bg-emerald-600 hover:shadow-md hover:-translate-y-0.5" />
            </div>

            {/* Quick Stock Lookup Tool */}
            <div className="border-t border-slate-100 pt-3.5 space-y-2">
              <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider">Fast Stock Check</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Enter accessory name or SKU..."
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-medium"
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

              {/* Instant Stock Lookup Results dropdown */}
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
                          <span className={`shrink-0 font-bold px-2 py-0.5 rounded-full ${out ? "bg-red-50 text-red-650 border border-red-100" : low ? "bg-orange-50 text-orange-655 border border-orange-100" : "bg-green-50 text-green-655 border border-green-100"
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

      {/* ── SECTION: Payment breakdowns (Owner only) ────────────────────────── */}
      {isOwner && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-extrabold text-slate-900 text-sm md:text-base mb-4">Payment Channel Breakdown</h2>

          {(() => {
            const maxTotal = Math.max(...paymentMethodTotals.map((m) => m.total), 1);
            const COLORS: Record<string, string> = {
              Cash: "bg-green-500",
              UPI: "bg-blue-500",
              Card: "bg-purple-500",
              Credit: "bg-red-400",
            };
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {paymentMethodTotals.map(({ method, total, count }) => (
                  <div key={method} className="bg-slate-50/50 border border-slate-100 p-3 rounded-xl space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-700 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${COLORS[method]}`} />
                        {method}
                      </span>
                      <span className="text-slate-900 font-black">
                        ₹{total.toLocaleString()}{" "}
                        <span className="text-slate-400 font-medium ml-1">· {count} bill{count !== 1 ? "s" : ""}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-350 ${COLORS[method]}`}
                        style={{ width: `${(total / maxTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  QUICK ACTION COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function QuickAction({
  href,
  label,
  icon,
  color,
  textClass = "text-white",
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  textClass?: string;
}) {
  return (
    <Link
      href={href}
      className={`${color} ${textClass} rounded-xl p-3.5 flex flex-col items-center justify-center gap-2 text-xs font-extrabold transition-all duration-150 hover:-translate-y-0.5 active:scale-95 text-center cursor-pointer`}
    >
      {icon}
      {label}
    </Link>
  );
}