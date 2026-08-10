"use client";

import { use, useMemo, useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Layers,
  Pencil,
  Plus,
  AlertCircle,
  ExternalLink,
  Package,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Archive,
  Eye,
} from "lucide-react";
import type { Product, VariantOptionDefinition } from "@/types";
import { ProductFormModal, AdjustStockModal } from "../../components/ProductModals";
import { AddProductWithVariantModal } from "../../components/AddProductWithVariantModal";
import { EditBaseProductModal } from "../../components/EditBaseProductModal";
import { calculateRevenue } from "@/lib/revenueUtils";
import { calculateProfit } from "@/lib/profitUtils";

// Option display formatter helper
function formatVariantOptions(v: Product, options: VariantOptionDefinition[]) {
  if (!v.variantValues) return "—";
  const entries = v.variantValues;
  const formatted: string[] = [];
  const usedKeys = new Set<string>();

  if (options && options.length > 0) {
    for (const optDef of options) {
      const val = entries[optDef.name];
      if (val && val.trim()) {
        formatted.push(`${optDef.name.trim()}: ${val.trim()}`);
        usedKeys.add(optDef.name);
      }
    }
  }

  for (const [key, val] of Object.entries(entries)) {
    if (!usedKeys.has(key) && key.trim() && val && val.trim()) {
      formatted.push(`${key.trim()}: ${val.trim()}`);
    }
  }

  return formatted.length > 0 ? formatted.join(" · ") : "—";
}

export default function GroupDetailsPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group } = use(params);
  const { state } = useStore();
  const { isOwner, loading, requireAuth } = useRole();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  const searchParams = useSearchParams();
  const currentVariantId = searchParams?.get("variant") || searchParams?.get("current");

  const decodedGroup = useMemo(() => {
    try {
      return decodeURIComponent(group);
    } catch {
      return group;
    }
  }, [group]);

  const groupVariants = useMemo(() => {
    if (!decodedGroup || !decodedGroup.trim()) return [];
    const groupKey = decodedGroup.trim().toLowerCase();
    return state.products.filter(
      (p) => p.displayGroup && p.displayGroup.trim().toLowerCase() === groupKey
    );
  }, [state.products, decodedGroup]);

  const groupOptions = useMemo(() => {
    if (!groupVariants || groupVariants.length === 0) return [];
    return (
      groupVariants.find((v) => v.variantOptions && v.variantOptions.length > 0)?.variantOptions || []
    );
  }, [groupVariants]);

  // Set of group product IDs for fast lookup in sales metrics
  const groupVariantIds = useMemo(() => {
    return new Set(groupVariants.map((v) => v.id));
  }, [groupVariants]);

  // Derived Variant Status counts
  const variantHealth = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let discontinued = 0;
    let lowStock = 0;
    let outOfStock = 0;

    groupVariants.forEach((v) => {
      if (v.status === "Inactive") inactive++;
      else if (v.status === "Discontinued") discontinued++;
      else active++;

      if (v.stock === 0) outOfStock++;
      else if (v.lowStockThreshold > 0 && v.stock <= v.lowStockThreshold) lowStock++;
    });

    return { active, inactive, discontinued, lowStock, outOfStock };
  }, [groupVariants]);

  // Derived Sales & Units Sold metrics across active invoices
  const salesMetrics = useMemo(() => {
    let unitsSold = 0;
    const matchingOrderIds = new Set<string>();

    (state.invoices || []).forEach((inv) => {
      if (inv.voided) return;
      let hasGroupItem = false;
      inv.items.forEach((item) => {
        if (groupVariantIds.has(item.productId)) {
          unitsSold += item.quantity;
          hasGroupItem = true;
        }
      });
      if (hasGroupItem) {
        matchingOrderIds.add(inv.id);
      }
    });

    // Account for active sales return deductions
    (state.salesReturns || []).forEach((r) => {
      if (r.status === "Cancelled") return;
      r.items.forEach((ri) => {
        if (groupVariantIds.has(ri.productId)) {
          unitsSold -= ri.quantity;
        }
      });
    });

    return {
      unitsSold: Math.max(0, unitsSold),
      orderCount: matchingOrderIds.size,
    };
  }, [state.invoices, state.salesReturns, groupVariantIds]);

  // Financial KPIs (Revenue, Gross Profit, Gross Margin, Inventory Value)
  const financialMetrics = useMemo(() => {
    let totalRevenue = 0;
    let totalGrossProfit = 0;
    let totalInventoryValue = 0;

    groupVariants.forEach((v) => {
      const rev = calculateRevenue(state.invoices, state.salesReturns, v.id);
      const profit = calculateProfit(state.invoices, state.salesReturns, state.products, v.id);
      const val = v.stock * (v.currentCost || 0);

      totalRevenue += rev;
      totalGrossProfit += profit;
      totalInventoryValue += val;
    });

    const marginPct =
      totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalGrossProfit: Math.round(totalGrossProfit * 100) / 100,
      marginPct: Math.round(marginPct * 10) / 10,
      totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
    };
  }, [groupVariants, state.invoices, state.salesReturns, state.products]);

  // Unique variant option combinations for summary badges
  const uniqueVariantOptionChips = useMemo(() => {
    const chips: string[] = [];
    const seen = new Set<string>();

    groupVariants.forEach((v) => {
      const optionsText = formatVariantOptions(v, groupOptions);
      if (optionsText && optionsText !== "—" && !seen.has(optionsText)) {
        seen.add(optionsText);
        chips.push(optionsText);
      }
    });

    return chips;
  }, [groupVariants, groupOptions]);

  const [editingVariant, setEditingVariant] = useState<Product | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddVariantModal, setShowAddVariantModal] = useState(false);
  const [showEditBaseModal, setShowEditBaseModal] = useState(false);
  const [adjustStockVariant, setAdjustStockVariant] = useState<Product | null>(null);

  if (groupVariants.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center shadow-sm">
          <AlertCircle size={36} className="text-red-500" />
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-slate-700">Display Group Not Found</p>
          <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            No products match display group &quot;{decodedGroup}&quot;.
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

  // Summary metrics for the Display Group Header
  const totalStock = groupVariants.reduce((sum, v) => sum + v.stock, 0);
  const groupBrand = groupVariants.find((v) => v.brand && v.brand.trim())?.brand || "—";
  const groupCategory = groupVariants.find((v) => v.category && v.category.trim())?.category || "—";

  return (
    <div className="space-y-6">
      {/* ── Header Toolbar & Group Identity Summary ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        {/* Navigation & Actions Top Bar */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/inventory"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-navy-950 font-semibold transition-colors"
          >
            <ArrowLeft size={13} />
            Back to Inventory
          </Link>

          {isOwner && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowEditBaseModal(true)}
                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer border border-slate-200"
                title="Edit Base Product Family / Display Group"
                aria-label="Edit Base Product Family"
              >
                <Pencil size={14} />
                Edit Base Group
              </button>
              <button
                onClick={() => setShowAddVariantModal(true)}
                className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-navy-950 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-xs active:scale-98 cursor-pointer"
                title="Add new variant to this product family"
                aria-label="Add Variant"
              >
                <Plus size={15} />
                Add Variant
              </button>
            </div>
          )}
        </div>

        {/* Group Identity Details */}
        <div className="space-y-3 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center shrink-0">
              <Layers size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-black text-navy-950 tracking-tight">
                  {decodedGroup}
                </h1>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                  Product Family
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {groupVariants.length} {groupVariants.length === 1 ? "Variant" : "Variants"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {groupCategory !== "—" && (
                  <>
                    Category: <span className="font-semibold text-slate-700">{groupCategory}</span> ·{" "}
                  </>
                )}
                Brand: <span className="font-semibold text-slate-700">{groupBrand}</span> · Status:{" "}
                <span className="font-bold text-emerald-600">{variantHealth.active} Active</span>
                {variantHealth.inactive > 0 && (
                  <span className="font-medium text-slate-500"> · {variantHealth.inactive} Inactive</span>
                )}
                {variantHealth.discontinued > 0 && (
                  <span className="font-medium text-red-600"> · {variantHealth.discontinued} Discontinued</span>
                )}
              </p>
            </div>
          </div>

          {/* Variant Option Chips Row */}
          {uniqueVariantOptionChips.length > 0 && (
            <div className="pt-2 border-t border-slate-100/80 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                Variant Options:
              </span>
              {uniqueVariantOptionChips.map((chip, idx) => (
                <span
                  key={idx}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200/80 shadow-2xs"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Stock & Variant Health */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Stock</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">
              {totalStock.toLocaleString()} <span className="text-xs font-normal text-slate-400">units</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                {groupVariants.length} {groupVariants.length === 1 ? "variant" : "variants"}
              </span>
              {variantHealth.lowStock > 0 && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                  {variantHealth.lowStock} Low
                </span>
              )}
              {variantHealth.outOfStock > 0 && (
                <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                  {variantHealth.outOfStock} Out
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Units Sold */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Units Sold</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShoppingCart size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">
              {salesMetrics.unitsSold.toLocaleString()} <span className="text-xs font-normal text-slate-400">units</span>
            </div>
            <div className="text-[11px] font-medium text-slate-400 mt-1">
              Across <span className="font-semibold text-slate-600">{salesMetrics.orderCount}</span> {salesMetrics.orderCount === 1 ? "order" : "orders"}
            </div>
          </div>
        </div>

        {/* Card 3: Group Revenue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Group Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <DollarSign size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">
              ₹{financialMetrics.totalRevenue.toLocaleString()}
            </div>
            <div className="text-[11px] font-medium text-slate-400 mt-1">
              Net completed sales
            </div>
          </div>
        </div>

        {/* Card 4: Gross Profit & Margin (Owner Only) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Gross Profit</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div>
            {isOwner ? (
              <>
                <div className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">
                  ₹{financialMetrics.totalGrossProfit.toLocaleString()}
                </div>
                <div className="text-[11px] font-medium text-slate-500 mt-1">
                  <span className="font-bold text-emerald-600">{financialMetrics.marginPct}%</span> gross margin
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-black text-slate-300 tracking-tight">
                  —
                </div>
                <div className="text-[11px] font-medium text-slate-400 mt-1 italic">
                  Owner restricted
                </div>
              </>
            )}
          </div>
        </div>

        {/* Card 5: Inventory Value (Owner Only) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Inventory Value</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Archive size={16} />
            </div>
          </div>
          <div>
            {isOwner ? (
              <>
                <div className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">
                  ₹{financialMetrics.totalInventoryValue.toLocaleString()}
                </div>
                <div className="text-[11px] font-medium text-slate-400 mt-1">
                  Estimated cost value
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-black text-slate-300 tracking-tight">
                  —
                </div>
                <div className="text-[11px] font-medium text-slate-400 mt-1 italic">
                  Owner restricted
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Variant Manager Workspace ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-navy-950">Variant Manager</h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {groupVariants.length} {groupVariants.length === 1 ? "variant" : "variants"}
            </span>
          </div>
          {isOwner && (
            <button
              onClick={() => setShowAddVariantModal(true)}
              className="inline-flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-xs active:scale-98 cursor-pointer"
            >
              <Plus size={13} />
              Add Variant
            </button>
          )}
        </div>

        {/* Variant List Table */}
        {groupVariants.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <Layers size={22} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">No variants found in this product family</p>
              <p className="text-xs text-slate-400 mt-0.5">Add a new variant to populate this display group.</p>
            </div>
            {isOwner && (
              <button
                onClick={() => setShowAddVariantModal(true)}
                className="inline-flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs active:scale-98 cursor-pointer mt-1"
              >
                <Plus size={14} />
                Add Variant
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="px-4 py-3">Variant</th>
                  <th className="px-4 py-3 hidden md:table-cell">SKU</th>
                  <th className="px-4 py-3 hidden md:table-cell">Options</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {groupVariants.map((v) => {
                  const optionsText = formatVariantOptions(v, groupOptions);
                  const isCurrent = currentVariantId === v.id;
                  const isOutOfStock = v.stock === 0;
                  const isLowStock = v.lowStockThreshold > 0 && v.stock <= v.lowStockThreshold;

                  return (
                    <tr
                      key={v.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isCurrent ? "bg-amber-50/40 border-l-4 border-l-amber-500" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-850">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/inventory/${v.id}`}
                              className="hover:text-amber-600 transition-colors inline-flex items-center gap-1 font-bold text-slate-900"
                            >
                              {v.name}
                              <ExternalLink size={11} className="text-slate-400" />
                            </Link>
                            {isCurrent && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                Current
                              </span>
                            )}
                          </div>
                          {/* Mobile-only secondary info line */}
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5 md:hidden">
                            {v.sku}{optionsText && optionsText !== "—" ? ` · ${optionsText}` : ""}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-600 hidden md:table-cell">
                        {v.sku}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-600 hidden md:table-cell">
                        {optionsText}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">
                        <span
                          className={
                            isOutOfStock
                              ? "text-red-600 font-bold"
                              : isLowStock
                              ? "text-amber-600 font-bold"
                              : "text-slate-800 font-bold"
                          }
                        >
                          {v.stock}
                        </span>{" "}
                        <span className="text-slate-400 font-normal text-[11px]">
                          units
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {v.status === "Inactive" ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
                            Inactive
                          </span>
                        ) : v.status === "Discontinued" ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                            Discontinued
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                          <Link
                            href={`/inventory/${v.id}`}
                            title="View Individual Variant Detail"
                            aria-label={`View detail for ${v.name}`}
                            className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs transition-colors cursor-pointer"
                          >
                            <Eye size={12} />
                            View
                          </Link>
                          {isOwner && (
                            <>
                              <button
                                onClick={() => setAdjustStockVariant(v)}
                                title="Adjust stock for this variant"
                                aria-label={`Adjust stock for ${v.name}`}
                                className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs transition-colors cursor-pointer"
                              >
                                <Layers size={12} />
                                Adjust
                              </button>
                              <button
                                onClick={() => {
                                  setEditingVariant(v);
                                  setShowEditModal(true);
                                }}
                                title="Edit this variant"
                                aria-label={`Edit ${v.name}`}
                                className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs transition-colors cursor-pointer"
                              >
                                <Pencil size={12} />
                                Edit
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shared Modals */}
      {editingVariant && (
        <ProductFormModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingVariant(null);
          }}
          editingProduct={editingVariant}
        />
      )}
      <AddProductWithVariantModal
        isOpen={showAddVariantModal}
        onClose={() => setShowAddVariantModal(false)}
        initialGroup={decodedGroup}
      />
      <EditBaseProductModal
        isOpen={showEditBaseModal}
        groupName={decodedGroup}
        onClose={() => setShowEditBaseModal(false)}
      />
      {adjustStockVariant && (
        <AdjustStockModal
          isOpen={Boolean(adjustStockVariant)}
          onClose={() => setAdjustStockVariant(null)}
          product={adjustStockVariant}
        />
      )}
    </div>
  );
}

