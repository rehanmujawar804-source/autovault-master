"use client";

import { use, useMemo, useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { formatDateOnlyIST, formatInvoiceDate, formatPurchaseDate, sortInvoicesDescending, sortPurchasesDescending } from "@/lib/dateUtils";
import {
  ArrowLeft,
  Pencil,
  Layers,
  Trash2,
  AlertTriangle,
  X,
  DollarSign,
  Package,
  Calendar,
  TrendingUp,
  ShoppingCart,
  ShieldCheck,
  AlertCircle,
  Archive,
  Info,
  MapPin,
  Activity,
  FileSpreadsheet,
  Clock,
  Car,
  User,
  ExternalLink,
  ChevronRight,
  TrendingDown,
  Sparkles,
} from "lucide-react";
import type { Invoice, InvoiceItem } from "@/types";
import { ProductFormModal, AdjustStockModal } from "../components/ProductModals";
import { calculateRevenue } from "@/lib/revenueUtils";
import { toLocalDateStr, formatStockMovementDate } from "@/lib/dateUtils";

// Custom date formatter helper
function formatDisplayDate(dateStr?: string) {
  if (!dateStr || dateStr === "—") return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function ProductDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { state, showToast, deleteProduct, isProductSafeToDelete } = useStore();
  const { isOwner, loading, requireAuth } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  // Find target product
  const product = useMemo(() => {
    return state.products.find((p) => p.id === id);
  }, [state.products, id]);

  // Modal triggers
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // CHECK 1: Fail-safe safety check determining whether Delete Product button should be visible
  const isDeletable = useMemo(() => {
    if (!product || !isOwner) return false;
    return isProductSafeToDelete(product.id);
  }, [product, isOwner, isProductSafeToDelete, state]);

  function handleConfirmDelete() {
    if (!product) return;
    // deleteProduct performs CHECK 2 (second safety check) immediately before state dispatch
    const success = deleteProduct(product.id);
    if (success) {
      showToast("Product permanently deleted.", "success");
      setShowDeleteModal(false);
      router.push("/inventory");
    } else {
      setShowDeleteModal(false);
    }
  }

  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    "overview" | "stock" | "sales" | "purchases" | "movement" | "vehicles"
  >("overview");

  useEffect(() => {
    if (tabParam && ["overview", "stock", "sales", "purchases", "movement", "vehicles"].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [tabParam]);

  // Dynamic Sales Filtering for this product (newest first)
  const productSales = useMemo(() => {
    const list = state.invoices.filter(
      (inv) => !inv.voided && inv.items.some((item) => item.productId === id)
    );
    return sortInvoicesDescending(list);
  }, [state.invoices, id]);

  const salesStats = useMemo(() => {
    let units = 0;
    let rev = calculateRevenue(state.invoices, state.salesReturns, id);
    let lastDate = "—";
    let lastCust = "—";
    let lastInvNo = "—";
    let lastInvId = "";

    // Calculate total units sold across non-voided invoices

    productSales.forEach((inv) => {
      inv.items.forEach((item) => {
        if (item.productId === id) {
          units += item.quantity;
        }
      });
    });

    const activeProductReturns = (state.salesReturns || [])
      .filter((r) => r.status !== "Cancelled")
      .flatMap((r) => r.items)
      .filter((item) => item.productId === id);

    activeProductReturns.forEach((item) => {
      units -= item.quantity;
    });

    if (productSales.length > 0) {
      const lastInv = productSales[0];
      lastDate = formatInvoiceDate(lastInv);
      lastCust = lastInv.customer;
      lastInvNo = lastInv.invoiceNumber;
      lastInvId = lastInv.id;
    }

    return {
      totalUnitsSold: Math.max(0, units),
      totalRevenue: rev,
      avgSellingPrice: units > 0 ? Math.round(rev / units) : 0,
      lastSoldDate: lastDate,
      lastCustomer: lastCust,
      lastInvoiceNumber: lastInvNo,
      lastInvoiceId: lastInvId,
    };
  }, [productSales, state.salesReturns, state.invoices, id]);

  // Opening stock = sum of all "Opening Stock" movements for this product
  const openingStock = useMemo(() => {
    return (state.stockMovements || [])
      .filter((m) => m.productId === id && m.type === "Opening Stock")
      .reduce((sum, m) => sum + m.delta, 0);
  }, [state.stockMovements, id]);

  // Pull real stock movements from store for this product, merging with sale events
  const stockMovements = useMemo(() => {
    const list: Array<{
      date: string;
      type: string;
      delta: number;
      desc: string;
      reference: string;
      note?: string;
      refUrl?: string;
    }> = [];

    // Stored stock movements from state (Purchase, Adjustment, Opening Stock, Sales Return, Purchase Return, and Sale)
    const stored = (state.stockMovements || []).filter((m) => m.productId === id);

    // Track invoice numbers that ALREADY have a recorded "Sale" movement in state.stockMovements
    const recordedSaleInvoices = new Set(
      stored.filter((m) => m.type === "Sale").map((m) => m.reference)
    );

    // Backward compatibility: Synthesize sales events from invoices ONLY if not already recorded in state.stockMovements
    productSales.forEach((inv) => {
      if (!recordedSaleInvoices.has(inv.invoiceNumber)) {
        const item = inv.items.find((i) => i.productId === id);
        if (item) {
          list.push({
            date: inv.date,
            type: "Sale",
            delta: -item.quantity,
            desc: `Sold to ${inv.customer}`,
            reference: inv.invoiceNumber,
            refUrl: `/invoices/${inv.id}`,
          });
        }
      }
    });

    stored.forEach((m) => {
      const matchingInv = m.type === "Sale" ? state.invoices.find((inv) => inv.invoiceNumber === m.reference) : undefined;
      list.push({
        date: m.date,
        type: m.type,
        delta: m.delta,
        desc: m.desc,
        reference: m.reference,
        note: m.note,
        refUrl: matchingInv ? `/invoices/${matchingInv.id}` : undefined,
      });
    });

    // Sort newest first with deterministic tie-breaker
    return list.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      if (timeB !== timeA) return timeB - timeA;
      const idA = (a as any).id || "";
      const idB = (b as any).id || "";
      return idB.localeCompare(idA);
    });
  }, [productSales, state.stockMovements, state.invoices, id]);

  // Purchases from store for this product (newest first)
  const productPurchases = useMemo(() => {
    return sortPurchasesDescending((state.purchases || []).filter((p) => p.productId === id));
  }, [state.purchases, id]);

  // Safe early return ONLY AFTER all 18 hooks have executed unconditionally
  if (!product) {
    return (
      <div className="py-20 flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center shadow-sm">
          <AlertCircle size={36} className="text-red-500" />
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-slate-700">Product Not Found</p>
          <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            The product identifier does not exist or may have been updated.
          </p>
        </div>
        <Link
          href="/inventory"
          className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow"
        >
          Back to Inventory
        </Link>
      </div>
    );
  }

  // 10 Core Product KPI Cards values
  const currentStock = product.stock;
  const reservedStock = 0;
  const availableStock = currentStock - reservedStock;
  const currentCost = product.currentCost;
  const sellPrice = product.sellPrice;
  const unitProfit = sellPrice - currentCost;
  const marginPct = sellPrice > 0 ? ((sellPrice - currentCost) / sellPrice) * 100 : 0;
  const inventoryValue = currentStock * currentCost;
  const capitalInvested = currentStock * currentCost;
  const retailValue = currentStock * sellPrice;

  // Intelligence calculations
  const lowStock = currentStock <= product.lowStockThreshold;
  const outOfStock = currentStock === 0;

  // Stock health pct vs threshold
  const stockHealthPct =
    product.lowStockThreshold > 0
      ? Math.round((currentStock / product.lowStockThreshold) * 100)
      : 100;

  const daysSinceLastSale = (() => {
    if (salesStats.lastSoldDate === "—") return "—";
    try {
      const lastDate = new Date(salesStats.lastSoldDate);
      const diffTime = Math.abs(Date.now() - lastDate.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return "—";
    }
  })();

  // Deterministic velocity flag
  const velocity =
    salesStats.totalUnitsSold === 0
      ? "Dead Stock"
      : salesStats.totalUnitsSold <= 5
      ? "Slow Moving"
      : salesStats.totalUnitsSold <= 20
      ? "Medium Moving"
      : "Fast Moving";

  // Deterministic restock recommendation
  const restockQty = lowStock ? product.lowStockThreshold * 2 : 0;

  // Deterministic profitability rating based on business rules:
  // Sell Price > Current Cost -> Profitable
  // Sell Price == Current Cost -> Break Even
  // Sell Price < Current Cost -> Loss
  const profitabilityStatus: "Profitable" | "Break Even" | "Loss" =
    sellPrice > currentCost
      ? "Profitable"
      : sellPrice === currentCost
      ? "Break Even"
      : "Loss";

  return (
    <div className="space-y-6">
      {/* ── Header Toolbar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <Link
            href="/inventory"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-navy-950 font-semibold transition-colors"
          >
            <ArrowLeft size={13} />
            Back to Inventory
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-navy-950 tracking-tight">
              {product.name}
            </h1>
            <span className="font-mono text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
              {product.sku}
            </span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200">
              {product.category || "Uncategorized"}
            </span>

            {/* Lifecycle Badge */}
            {product.status === "Inactive" ? (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-0.5 rounded-full">
                Inactive
              </span>
            ) : product.status === "Discontinued" ? (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full">
                Discontinued
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 border border-green-200 px-2.5 py-0.5 rounded-full">
                Active
              </span>
            )}

            {/* Stock status badge */}
            {outOfStock ? (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-600 border border-red-200 px-2.5 py-0.5 rounded-full">
                Out of Stock
              </span>
            ) : lowStock ? (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full">
                Low Stock
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                Healthy Stock
              </span>
            )}
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          {isOwner && (
            <>
              {isDeletable && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-sm active:scale-98"
                >
                  <Trash2 size={14} />
                  Delete Product
                </button>
              )}
              <button
                onClick={() => setShowAdjustModal(true)}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer border border-slate-200"
              >
                <Layers size={14} />
                Adjust Stock
              </button>
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-navy-950 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow active:scale-98 cursor-pointer"
              >
                <Pencil size={14} />
                Edit Product
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Main High-Density KPI Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Current Stock — primary metric, given stronger treatment */}
        <div className={`border p-4 rounded-xl flex flex-col justify-between h-24 ${outOfStock ? 'bg-red-50 border-red-200' : lowStock ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
          }`}>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Stock</span>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold tabular-nums ${outOfStock ? 'text-red-700' : lowStock ? 'text-amber-700' : 'text-slate-800'
              }`}>{currentStock}</span>
            <span className="text-slate-400 text-xs font-normal">units</span>
          </div>
        </div>

        {/* Opening Stock */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between h-24">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opening Stock</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-slate-700 tabular-nums">{openingStock}</span>
            <span className="text-slate-400 text-xs font-normal">units</span>
          </div>
        </div>

        {/* Available Stock */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between h-24">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Available Stock</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-slate-800 tabular-nums">{availableStock}</span>
            <span className="text-slate-400 text-xs font-normal">units</span>
          </div>
        </div>

        {/* Inventory Value */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between h-24">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inventory Value</span>
          <div className="flex items-baseline gap-0.5">
            <span className="text-xs font-medium text-slate-400">₹</span>
            <span className="text-xl font-bold text-slate-800 tabular-nums">{inventoryValue.toLocaleString()}</span>
          </div>
        </div>

        {/* Buy Price - Owner only */}
        {isOwner ? (
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between h-24">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Cost</span>
            <div className="flex items-baseline gap-0.5">
              <span className="text-xs font-medium text-slate-400">₹</span>
              <span className="text-xl font-bold text-slate-700 tabular-nums">{currentCost.toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50/30 border border-slate-200/80 p-4 rounded-2xl shadow-sm flex flex-col justify-center items-center h-24 text-slate-350">
            <ShieldCheck size={16} />
            <span className="text-[9px] font-bold uppercase mt-1">Cost Hidden</span>
          </div>
        )}

        {/* Sell Price */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between h-24">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sell Price</span>
          <div className="flex items-baseline gap-0.5">
            <span className="text-xs font-medium text-slate-400">₹</span>
            <span className="text-xl font-bold text-slate-800 tabular-nums">{sellPrice.toLocaleString()}</span>
          </div>
        </div>

        {/* Unit Profit - Owner only */}
        {isOwner ? (
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between h-24">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unit Profit</span>
            <div className="flex items-baseline gap-0.5">
              {unitProfit < 0 ? (
                <span className="text-xl font-bold tabular-nums text-red-600">
                  -₹{Math.abs(unitProfit).toLocaleString()}
                </span>
              ) : (
                <>
                  <span className={`text-xs font-medium ${unitProfit > 0 ? "text-green-600" : "text-slate-400"}`}>₹</span>
                  <span className={`text-xl font-bold tabular-nums ${unitProfit > 0 ? "text-green-700" : "text-slate-700"}`}>
                    {unitProfit.toLocaleString()}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-50/30 border border-slate-200/80 p-4 rounded-2xl shadow-sm flex flex-col justify-center items-center h-24 text-slate-350">
            <ShieldCheck size={16} />
            <span className="text-[9px] font-bold uppercase mt-1">Profit Hidden</span>
          </div>
        )}

        {/* Margin % - Owner only */}
        {isOwner ? (
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between h-24">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Margin</span>
            <div className="flex items-baseline gap-0.5">
              <span className={`text-xl font-bold tabular-nums ${marginPct > 0 ? "text-green-700" : marginPct === 0 ? "text-slate-600" : "text-red-600"}`}>
                {Math.round(marginPct)}%
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50/30 border border-slate-200/80 p-4 rounded-2xl shadow-sm flex flex-col justify-center items-center h-24 text-slate-350">
            <ShieldCheck size={16} />
            <span className="text-[9px] font-bold uppercase mt-1">Margin Hidden</span>
          </div>
        )}

        {/* Capital Invested - Owner only */}
        {isOwner ? (
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between h-24">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Capital Invested</span>
            <div className="flex items-baseline gap-0.5">
              <span className="text-xs font-medium text-slate-400">₹</span>
              <span className="text-xl font-bold text-slate-700 tabular-nums">{capitalInvested.toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50/30 border border-slate-200/80 p-4 rounded-2xl shadow-sm flex flex-col justify-center items-center h-24 text-slate-350">
            <ShieldCheck size={16} />
            <span className="text-[9px] font-bold uppercase mt-1">Cost Hidden</span>
          </div>
        )}
      </div>

      {/* ── Main Layout: Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side (Col Span 9) */}
        <div className="lg:col-span-9 space-y-6">
          {/* Tabs bar */}
          <div className="border-b border-slate-200 flex gap-1 overflow-x-auto text-sm scrollbar-hide py-0.5">
            {[
              { id: "overview", label: "Overview" },
              { id: "stock", label: "Stock" },
              { id: "movement", label: "Stock Movement" },
              { id: "sales", label: "Sales History" },
              { id: "purchases", label: "Purchase History" },
              { id: "vehicles", label: "Compatible Vehicles" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-2 border-b-2 text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${activeTab === tab.id
                    ? "border-navy-950 text-navy-950 font-semibold"
                    : "border-transparent text-slate-450 hover:text-slate-700 hover:border-slate-300"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Contents */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 min-h-[360px]">
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-black text-slate-800 mb-3">Product Profile</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 text-xs">Total Units Sold</span>
                      <p className="text-xl font-extrabold text-slate-800 mt-1">
                        {salesStats.totalUnitsSold} <span className="text-xs text-slate-400 font-medium">units</span>
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs">Total Sales Value</span>
                      <p className="text-xl font-extrabold text-slate-800 mt-1">
                        ₹{salesStats.totalRevenue.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs">Average Sale Price</span>
                      <p className="text-xl font-extrabold text-slate-800 mt-1">
                        ₹{salesStats.avgSellingPrice.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Intelligence panel */}
                <div>
                  <h3 className="text-base font-black text-slate-800 mb-3">Inventory Intelligence</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Stock Health */}
                    <div className="border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
                      <div>
                        <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Stock Health</span>
                        <p className={`text-lg font-black mt-2 ${outOfStock ? "text-red-650" : lowStock ? "text-amber-600" : "text-green-700"}`}>
                          {outOfStock ? "Out of Stock" : lowStock ? "Low Stock" : "Healthy"}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-3 block">{stockHealthPct}% of warning threshold ({product.lowStockThreshold} units)</span>
                    </div>

                    {/* Velocity Flag */}
                    <div className="border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
                      <div>
                        <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Sales Velocity</span>
                        <p className={`text-lg font-black mt-2 text-slate-800`}>{velocity}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-3 block">Based on {salesStats.totalUnitsSold} units sold historically</span>
                    </div>

                    {/* Restock Recommendation */}
                    <div className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Restock Recommendation</span>
                        <p className={`text-lg font-bold mt-2 ${restockQty > 0 ? "text-amber-600" : "text-green-700"
                          }`}>
                          {restockQty > 0 ? `Order ${restockQty} units` : "Adequate Stock"}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-3 block">
                        {restockQty > 0 ? `Stock is below threshold of ${product.lowStockThreshold}` : "No purchase required"}
                      </span>
                    </div>

                    {/* Profitability Rating */}
                    {isOwner && (
                      <div className="border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
                        <div>
                          <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Profitability Rating</span>
                          <p className={`text-lg font-black mt-2 ${
                            profitabilityStatus === "Profitable"
                              ? "text-green-700"
                              : profitabilityStatus === "Break Even"
                              ? "text-amber-600"
                              : "text-red-600"
                          }`}>
                            {profitabilityStatus}
                          </p>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-3 block">
                          {profitabilityStatus === "Profitable"
                            ? `Margin is ${Math.round(marginPct)}%`
                            : profitabilityStatus === "Break Even"
                            ? "Selling at cost price (₹0 profit)"
                            : `Loss of ₹${Math.abs(unitProfit).toLocaleString()} per unit`}
                        </span>
                      </div>
                    )}

                    {/* Days since last sale */}
                    <div className="border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
                      <div>
                        <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Days Since Last Sale</span>
                        <p className="text-lg font-black mt-2 text-slate-800">
                          {daysSinceLastSale === "—" ? "—" : `${daysSinceLastSale} days`}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-3 block">
                        Last sale: {formatDisplayDate(salesStats.lastSoldDate)}
                      </span>
                    </div>

                    {/* Dead stock check */}
                    <div className="border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
                      <div>
                        <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Dead Stock Status</span>
                        <p className={`text-lg font-black mt-2 ${velocity === "Dead Stock" ? "text-red-600" : "text-green-700"}`}>
                          {velocity === "Dead Stock" ? "Detected (No Sales)" : "Active turnover"}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-3 block">No orders registered in invoices list</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STOCK TAB */}
            {activeTab === "stock" && (
              <div className="space-y-6">
                <h3 className="text-base font-black text-slate-800">Stock Settings & Parameters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex justify-between py-2.5 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Low Stock Alert Threshold</span>
                      <span className="font-bold text-slate-800">{product.lowStockThreshold} units</span>
                    </div>
                    <div className="flex justify-between py-2.5 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Opening stock entry value</span>
                      <span className="font-bold text-slate-800">{openingStock} units</span>
                    </div>
                    <div className="flex justify-between py-2.5 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Current physical count</span>
                      <span className="font-bold text-slate-800">{product.stock} units</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between py-2.5 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Shelf/Bin location assignment</span>
                      <span className="font-bold text-slate-500">Not Assigned</span>
                    </div>
                    <div className="flex justify-between py-2.5 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Tax GST classification</span>
                      <span className="font-bold text-slate-800">{product.gst ? `${product.gst}%` : "—"}</span>
                    </div>
                    <div className="flex justify-between py-2.5 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">HSN code number</span>
                      <span className="font-bold text-slate-800">{product.hsn || "—"}</span>
                    </div>
                  </div>
                </div>

                {isOwner && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mt-4">
                    <h4 className="text-sm font-bold text-slate-800 mb-2">Adjust Current Stock Count</h4>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4">
                      Perform manual stock counts, Audits, write-offs, or check-ins. All movements will be reflected in the Timeline.
                    </p>
                    <button
                      onClick={() => setShowAdjustModal(true)}
                      className="inline-flex items-center gap-2 bg-navy-950 hover:bg-navy-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                    >
                      <Layers size={13} />
                      Adjust Stock
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SALES HISTORY TAB */}
            {activeTab === "sales" && (
              <div className="space-y-4">
                <h3 className="text-base font-black text-slate-800">Dynamic Invoiced Orders</h3>
                {productSales.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-55 flex items-center justify-center text-slate-400">
                      <ShoppingCart size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">No Sales History</p>
                      <p className="text-xs text-slate-400 mt-0.5">This product has not been billed on any invoice yet.</p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                          <th className="px-4 py-3">Invoice No</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Customer</th>
                          <th className="px-4 py-3 text-center">Qty Sold</th>
                          <th className="px-4 py-3 text-right">Sold Rate</th>
                          <th className="px-4 py-3 text-right">Total (₹)</th>
                          <th className="px-4 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {productSales.map((inv) => {
                          const item = inv.items.find((i) => i.productId === id);
                          if (!item) return null;
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3">
                                <Link
                                  href={`/invoices/${inv.id}`}
                                  className="text-amber-600 hover:text-amber-700 font-bold flex items-center gap-1 inline-flex"
                                >
                                  {inv.invoiceNumber}
                                  <ExternalLink size={10} />
                                </Link>
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-600">{formatInvoiceDate(inv)}</td>
                              <td className="px-4 py-3 font-semibold">{inv.customer}</td>
                              <td className="px-4 py-3 text-center font-bold text-slate-800">{item.quantity}</td>
                              <td className="px-4 py-3 text-right">₹{item.price.toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900">
                                ₹{(item.quantity * item.price).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${inv.paymentStatus === "Paid"
                                      ? "bg-green-50 text-green-700 border-green-200"
                                      : inv.paymentStatus === "Partial"
                                        ? "bg-orange-50 text-orange-700 border-orange-200"
                                        : "bg-red-50 text-red-600 border-red-200"
                                    }`}
                                >
                                  {inv.paymentStatus}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* PURCHASE HISTORY TAB */}
            {activeTab === "purchases" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-slate-800">Supplier Receipts</h3>
                  <span className="text-[10px] font-bold text-slate-450 uppercase border border-slate-200 rounded-md px-2 py-0.5">
                    {productPurchases.length} Record{productPurchases.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {productPurchases.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-55 flex items-center justify-center text-slate-400">
                      <FileSpreadsheet size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">No Supplier Purchases</p>
                      <p className="text-xs text-slate-400 mt-0.5 max-w-xs leading-relaxed">
                        Purchase orders will appear here once added via the Supplier module.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Date</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Supplier</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Qty</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Unit Cost</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Invoice</th>
                          <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {productPurchases.map((pur) => {
                          const supplier = state.suppliers?.find(s => s.id === pur.supplierId);
                          return (
                            <tr key={pur.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-4 py-3 text-xs text-slate-600 font-medium">{formatPurchaseDate(pur)}</td>
                              <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                {supplier ? (
                                  <Link href={`/suppliers/${supplier.id}`} className="hover:text-navy-700 hover:underline">
                                    {supplier.name}
                                  </Link>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-3 text-xs text-right font-bold text-slate-700">{pur.quantity}</td>
                              <td className="px-4 py-3 text-xs text-right text-slate-600">₹{pur.buyPrice.toLocaleString()}</td>
                              <td className="px-4 py-3 text-xs text-right font-bold text-slate-800">₹{(pur.buyPrice * pur.quantity).toLocaleString()}</td>
                              <td className="px-4 py-3 text-xs font-mono text-slate-500">{pur.invoiceNumber || "—"}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pur.paymentStatus === "Paid"
                                    ? "bg-green-50 text-green-700 border-green-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                  }`}>
                                  {pur.paymentStatus}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* STOCK MOVEMENT TAB */}
            {activeTab === "movement" && (
              <div className="space-y-6">
                <h3 className="text-base font-bold text-slate-800">Stock Movement Ledger</h3>

                {stockMovements.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-slate-200">
                      <rect x="6" y="12" width="36" height="27" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      <path d="M6 19h36" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M15 9v6M33 9v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M13 28h22M13 34h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <div>
                      <p className="text-sm font-bold text-slate-600">No movements recorded yet</p>
                      <p className="text-xs text-slate-400 mt-0.5">Movements appear here after stock adjustments, purchases, or sales.</p>
                    </div>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-slate-100 ml-4 pl-6 space-y-6">
                    {stockMovements.map((move, idx) => (
                      <div key={idx} className="relative">
                        {/* Node Circle */}
                        <span
                          className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center ${move.type === "Sale"
                              ? "border-blue-500 text-blue-500"
                              : move.type === "Purchase"
                                ? "border-emerald-500 text-emerald-500"
                                : move.type === "Purchase Return"
                                  ? "border-rose-500 text-rose-500"
                                  : move.type === "Return" || move.type === "Sales Return"
                                    ? "border-violet-500 text-violet-500"
                                    : move.type === "Invoice Void"
                                      ? "border-purple-600 text-purple-600"
                                      : move.type === "Opening Stock"
                                        ? "border-green-600 text-green-600"
                                        : move.type === "Adjustment"
                                          ? "border-amber-500 text-amber-500"
                                          : "border-slate-400 text-slate-400"
                            }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${move.type === "Sale"
                                ? "bg-blue-500"
                                : move.type === "Purchase"
                                  ? "bg-emerald-500"
                                  : move.type === "Purchase Return"
                                    ? "bg-rose-500"
                                    : move.type === "Return" || move.type === "Sales Return"
                                      ? "bg-violet-500"
                                      : move.type === "Invoice Void"
                                        ? "bg-purple-600"
                                        : move.type === "Opening Stock"
                                          ? "bg-green-600"
                                          : move.type === "Adjustment"
                                            ? "bg-amber-500"
                                            : "bg-slate-400"
                              }`}
                          />
                        </span>

                        {/* Movement content */}
                        <div className="bg-slate-50/50 hover:bg-slate-50 border border-slate-150 rounded-xl p-4 transition-all">
                          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${move.type === "Sale" ? "bg-blue-50 text-blue-600"
                                  : move.type === "Purchase" ? "bg-emerald-50 text-emerald-700"
                                    : move.type === "Purchase Return" ? "bg-rose-50 text-rose-700"
                                      : move.type === "Return" || move.type === "Sales Return" ? "bg-violet-50 text-violet-750"
                                        : move.type === "Invoice Void" ? "bg-purple-50 text-purple-700"
                                          : move.type === "Opening Stock" ? "bg-green-50 text-green-700"
                                            : move.type === "Adjustment" ? "bg-amber-50 text-amber-700"
                                              : "bg-slate-100 text-slate-500"
                                }`}>{move.type}</span>
                              <span className="font-black text-slate-750">{move.desc}</span>
                            </div>
                            <span className="text-slate-400 text-[10px]">{formatStockMovementDate(move.date)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                            <span className="text-[10px] text-slate-550">
                              Ref:{" "}
                              {move.refUrl ? (
                                <Link
                                  href={move.refUrl}
                                  className="text-amber-600 hover:text-amber-700 font-bold inline-flex items-center gap-0.5"
                                >
                                  {move.reference}
                                  <ExternalLink size={8} />
                                </Link>
                              ) : (
                                <span className="font-semibold">{move.reference}</span>
                              )}
                            </span>

                            <span
                              className={`text-xs font-black px-2 py-0.5 rounded ${move.delta > 0
                                  ? "bg-green-50 text-green-700"
                                  : "bg-red-50 text-red-600"
                                }`}
                            >
                              {move.delta > 0 ? `+${move.delta}` : move.delta} units
                            </span>
                          </div>
                          {move.note && (
                            <div className="mt-2 text-xs bg-amber-50/70 border border-amber-200/80 text-amber-900 px-2.5 py-1.5 rounded-lg flex items-start gap-1.5">
                              <span className="font-bold text-amber-800 uppercase tracking-wider text-[9px] mt-0.5 shrink-0">Reason:</span>
                              <span className="font-medium text-slate-700">{move.note}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* VEHICLE COMPATIBILITY TAB */}
            {activeTab === "vehicles" && (
              <div className="space-y-4">
                <h3 className="text-base font-black text-slate-800">Compatible Fitments</h3>
                {product.isUniversalFit && (
                  <div className="py-8 flex flex-col items-center justify-center text-center gap-2 bg-amber-50/50 border border-amber-200/80 rounded-2xl p-6">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-2xs">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-amber-950">Universal Fit — Compatible with all vehicles</p>
                      <p className="text-xs text-amber-700 font-medium mt-0.5">This product is compatible with all vehicle makes, brands, and models.</p>
                    </div>
                  </div>
                )}

                {product.fitments && product.fitments.length > 0 && (
                  <div>
                    {product.isUniversalFit && (
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-4">
                        Explicit Vehicle Fitments
                      </h4>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {product.fitments.map((fit, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl text-xs"
                        >
                          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 font-bold uppercase shrink-0">
                            {fit.brand.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-850">
                              {fit.brand} {fit.model}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Year Model: {fit.yearTo && fit.yearTo !== fit.year ? `${fit.year}–${fit.yearTo}` : fit.year}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!product.isUniversalFit && (!product.fitments || product.fitments.length === 0) && (
                  <div className="py-12 flex flex-col items-center justify-center text-center gap-3 bg-slate-50 border border-slate-200/80 rounded-2xl p-6">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <Info size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">No specific vehicles configured for this product.</p>
                      <p className="text-xs text-slate-400 mt-0.5">No specific vehicle compatibility rules have been added for this product.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side (Col Span 3) - Sticky Metadata Sidebar */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5 sticky top-24">
            {/* System Info */}
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">System Metadata</span>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="flex justify-between py-2 text-slate-650">
                  <span>Created At</span>
                  <span className="font-bold">{formatDisplayDate(product.createdAt)}</span>
                </div>
                <div className="flex justify-between py-2 text-slate-650">
                  <span>Last Modified</span>
                  <span className="font-bold">{formatDisplayDate(product.updatedAt)}</span>
                </div>
                <div className="flex justify-between py-2 text-slate-650">
                  <span>Supplier Code</span>
                  <span className="font-bold text-slate-800">{product.supplier || "—"}</span>
                </div>
                <div className="flex justify-between py-2 text-slate-650">
                  <span>Tax GST Code</span>
                  <span className="font-bold text-slate-850">{product.gst ? `${product.gst}%` : "—"}</span>
                </div>
                <div className="flex justify-between py-2 text-slate-650">
                  <span>Low Alert Threshold</span>
                  <span className="font-bold text-slate-850">{product.lowStockThreshold} units</span>
                </div>
              </div>
            </div>

            {/* Warehouse location */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-600 mb-1">
                <MapPin size={13} className="text-slate-400" />
                <span className="text-[10px] font-black uppercase tracking-wider">Warehouse Location</span>
              </div>
              <p className="text-xs font-bold text-slate-650 pl-5">Not Assigned</p>
            </div>

            {/* Notes Disclaimer (Local Only) */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Local Notes
              </span>
              <textarea
                placeholder="Write local memos or stock flags for reference..."
                className="w-full min-h-[90px] border border-slate-200 rounded-lg p-3 text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-navy-600/30 focus:border-navy-600 transition-all placeholder:text-slate-400 resize-y"
              />
              <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-amber-600 shrink-0 mt-0.5">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 4v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <p className="text-[10px] text-amber-700 font-medium leading-snug">
                  Not saved. Notes are session-only and lost on navigation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Shared Edit & Adjust Modal Component refs */}
      <ProductFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        editingProduct={product}
      />
      <AdjustStockModal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        product={product}
      />

      {/* Delete Product Confirmation Modal */}
      {showDeleteModal && product && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-150 bg-red-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Delete Product Permanently?</h3>
                  <p className="text-xs text-red-700 font-medium mt-0.5">Destructive Action — Owner Authorization Required</p>
                </div>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Target Product Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Product Name:</span>
                  <span className="font-bold text-slate-800">{product.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">SKU:</span>
                  <span className="font-mono font-bold text-slate-700">{product.sku}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Current Stock:</span>
                  <span className="font-bold text-slate-800">{product.stock} units</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Status:</span>
                  <span className="font-bold text-slate-700">{product.status || "Active"}</span>
                </div>
              </div>

              {/* Eligibility notice */}
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                This product has no protected sales, purchase, return, or other business transaction history and is eligible for permanent deletion.
              </p>

              {/* Cascade removal list */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-amber-900">Deleting this product will permanently remove:</p>
                <ul className="text-[11px] text-amber-800 space-y-1.5 list-disc list-inside font-medium">
                  <li>Product record</li>
                  <li>Current stock associated with this product</li>
                  <li>Inventory-only StockMovement history belonging exclusively to this product</li>
                  <li>Embedded Vehicle Fitment data belonging to this product</li>
                  <li>Any references to this product in temporary Hold Bills</li>
                  <li>Any Hold Bill that becomes completely empty after removing this product</li>
                </ul>
              </div>

              {/* Permanent Warning */}
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 font-semibold">
                <AlertTriangle size={16} className="shrink-0 text-red-500" />
                <span>This action cannot be undone.</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-4 bg-slate-50 border-t border-slate-150">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-all shadow cursor-pointer active:scale-98"
              >
                <Trash2 size={15} />
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}