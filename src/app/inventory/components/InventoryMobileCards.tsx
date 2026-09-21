"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Copy,
  Check,
  Eye,
  Layers,
  Pencil,
  Info,
  Sparkles,
  TrendingUp,
  Package,
  Plus,
  Activity,
} from "lucide-react";
import type { Product } from "@/types";
import { useStore } from "@/lib/store";
import { formatFitmentDisplay } from "@/lib/fitmentUtils";
import { formatStockMovementDate } from "@/lib/dateUtils";
import type { InventoryDesktopTableProps } from "./InventoryDesktopTable";

// ── Mobile Movement Summary Sub-component ──────────────────────────────────
function ProductExpandedMovementSummaryMobile({ product }: { product: Product }) {
  const { state } = useStore();

  const latestMovement = useMemo(() => {
    const list: Array<{
      id?: string;
      date: string;
      type: string;
      delta: number;
      desc: string;
      reference: string;
      note?: string;
    }> = [];

    const stored = (state.stockMovements || []).filter((m) => m.productId === product.id);
    const recordedSaleInvoices = new Set(
      stored.filter((m) => m.type === "Sale").map((m) => m.reference)
    );

    (state.invoices || []).forEach((inv) => {
      if (!inv.voided && !recordedSaleInvoices.has(inv.invoiceNumber)) {
        const item = inv.items.find((i) => i.productId === product.id);
        if (item) {
          list.push({
            id: `synth-sale-${inv.id}`,
            date: inv.createdAt || (inv.date ? (inv.date.includes("T") ? inv.date : inv.date + "T12:00:00.000Z") : new Date().toISOString()),
            type: "Sale",
            delta: -item.quantity,
            desc: `Sold to ${inv.customer || "Walk-in Customer"}`,
            reference: inv.invoiceNumber,
          });
        }
      }
    });

    stored.forEach((m) => {
      list.push({
        id: m.id,
        date: m.date,
        type: m.type,
        delta: m.delta,
        desc: m.desc,
        reference: m.reference,
        note: m.note,
      });
    });

    list.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      if (timeB !== timeA) return timeB - timeA;
      const idA = a.id || "";
      const idB = b.id || "";
      return idB.localeCompare(idA);
    });

    return list[0] || null;
  }, [state.stockMovements, state.invoices, product.id]);

  return (
    <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs text-xs space-y-2">
      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
        <div className="flex items-center gap-1.5">
          <Activity size={12} className="text-blue-600" />
          <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Latest Movement</span>
        </div>
        {latestMovement && (
          <span className="text-[9px] text-slate-400 font-medium">
            {formatStockMovementDate(latestMovement.date)}
          </span>
        )}
      </div>

      {latestMovement ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              {latestMovement.type}
            </span>
            <span className={`font-black text-xs ${latestMovement.delta > 0 ? "text-green-700" : "text-red-600"}`}>
              {latestMovement.delta > 0 ? `+${latestMovement.delta}` : latestMovement.delta} units
            </span>
          </div>
          <p className="font-semibold text-slate-800 text-xs truncate">{latestMovement.desc}</p>
          <p className="text-[10px] text-slate-400 font-mono">Ref: {latestMovement.reference}</p>
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic py-1">No stock movements recorded.</p>
      )}

      <div className="pt-1 border-t border-slate-100">
        <Link
          href={`/inventory/${product.id}?tab=movement`}
          className="text-[10px] font-bold text-navy-600 hover:underline block text-right"
        >
          View Full Ledger &rarr;
        </Link>
      </div>
    </div>
  );
}

export function InventoryMobileCards({
  groupedDisplayItems,
  isOwner,
  isSelectionMode,
  selectedSet,
  handleToggleSelectProduct,
  expandedProductId,
  setExpandedProductId,
  copiedSkuId,
  handleCopySku,
  setStockModal,
  setEditingProduct,
  setShowModal,
  expandedGroupNames,
  toggleGroupExpand,
  handleEditBaseGroup,
  setTargetGroupForNewVariant,
  setShowAddWithVariantModal,
}: InventoryDesktopTableProps) {
  function renderProductCard(product: Product, isVariant: boolean, index: number) {
    const outOfStock = product.stock === 0;
    const lowStock = !outOfStock && product.stock <= product.lowStockThreshold;
    const sellNum = Number(product.sellPrice);
    const costNum = Number(product.currentCost);
    const hasValidSellPrice = !isNaN(sellNum) && sellNum > 0;
    const margin = isOwner && hasValidSellPrice && !isNaN(costNum)
      ? Math.round(((sellNum - costNum) / sellNum) * 100)
      : null;
    const isExpanded = expandedProductId === product.id;
    const isCopied = copiedSkuId === product.id;

    const accentBorder = outOfStock
      ? "border-l-red-500"
      : lowStock
      ? "border-l-amber-500"
      : "border-l-emerald-500";

    const statusBadge = (product.status || "Active") === "Active" ? (
      <span className="text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
        Active
      </span>
    ) : product.status === "Inactive" ? (
      <span className="text-[9px] font-bold uppercase bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-full">
        Inactive
      </span>
    ) : (
      <span className="text-[9px] font-bold uppercase bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full">
        Discontinued
      </span>
    );

    return (
      <div
        key={product.id || `mob-card-${index}`}
        className={`bg-white rounded-xl border border-slate-200 border-l-4 ${accentBorder} shadow-xs p-3.5 space-y-3 ${
          isVariant ? "ml-3 border-dashed" : ""
        }`}
      >
        {/* Card Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {isOwner && isSelectionMode && (
              <input
                type="checkbox"
                checked={selectedSet.has(product.id)}
                onChange={() => handleToggleSelectProduct(product.id)}
                className="w-4 h-4 text-navy-950 rounded border-slate-300 accent-navy-950 cursor-pointer mt-0.5 shrink-0"
              />
            )}
            {isVariant && <CornerDownRight size={14} className="text-navy-500 shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <Link href={`/inventory/${product.id}`}>
                <h3 className="text-xs font-bold text-slate-800 hover:text-navy-900 leading-tight line-clamp-2">
                  {product.name}
                </h3>
              </Link>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <button
                  onClick={() => handleCopySku(product)}
                  className={`inline-flex items-center gap-1 font-mono text-[10px] border rounded px-1.5 py-0.5 ${
                    isCopied ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}
                >
                  {isCopied ? <Check size={10} /> : <Copy size={10} />}
                  {isCopied ? "Copied!" : product.sku}
                </button>
                {product.brand && (
                  <span className="text-[9px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                    {product.brand}
                  </span>
                )}
                {product.category && (
                  <span className="text-[9px] font-medium bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded">
                    {product.category}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            {statusBadge}
            <button
              onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer rounded bg-slate-50 hover:bg-slate-100 border border-slate-200"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Card KPI Grid */}
        <div className={`grid ${isOwner ? "grid-cols-3" : "grid-cols-2"} gap-2 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100 text-center`}>
          {/* Stock */}
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-bold uppercase text-slate-400">Stock</span>
            <span className={`text-xs font-bold ${outOfStock ? "text-red-600" : lowStock ? "text-amber-600" : "text-slate-800"}`}>
              {product.stock} units
            </span>
            <span className={`text-[8px] font-semibold ${outOfStock ? "text-red-500" : lowStock ? "text-amber-500" : "text-emerald-600"}`}>
              {outOfStock ? "Out" : lowStock ? "Low" : "Healthy"}
            </span>
          </div>

          {/* Sell Price */}
          <div className="flex flex-col items-center border-x border-slate-200/60 px-1">
            <span className="text-[9px] font-bold uppercase text-slate-400">Sell Price</span>
            <span className="text-xs font-bold text-slate-800">₹{product.sellPrice.toLocaleString()}</span>
            <span className="text-[8px] text-slate-400">Retail</span>
          </div>

          {/* Cost & Margin (Owner) */}
          {isOwner && (
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-bold uppercase text-slate-400">Cost / Margin</span>
              <span className="text-xs font-medium text-slate-600">₹{product.currentCost.toLocaleString()}</span>
              {margin !== null ? (
                <span className={`text-[8px] font-bold px-1 rounded ${
                  margin >= 30 ? "bg-green-50 text-green-700" : margin > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                }`}>
                  {margin}% Margin
                </span>
              ) : (
                <span className="text-[8px] text-slate-400">—</span>
              )}
            </div>
          )}
        </div>

        {/* Card Action Toolbar */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <Link
            href={`/inventory/${product.id}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-navy-700 hover:text-navy-950"
          >
            <Eye size={13} />
            <span>View Details &rarr;</span>
          </Link>

          <div className="flex items-center gap-1.5">
            {isOwner && (
              <button
                onClick={() => setStockModal(product)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200 cursor-pointer"
              >
                <Layers size={12} />
                <span>Adjust</span>
              </button>
            )}
            {isOwner && (
              <button
                onClick={() => { setEditingProduct(product); setShowModal(true); }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-navy-50 text-navy-800 border border-navy-200 cursor-pointer"
              >
                <Pencil size={12} />
                <span>Edit</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Expanded Drawer */}
        {isExpanded && (
          <div className="pt-2 border-t border-slate-200 space-y-2.5 bg-slate-50/50 p-2.5 rounded-lg">
            {/* Compatibility */}
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
              <div className="flex items-center gap-1 font-bold text-slate-700 mb-1">
                <Info size={12} className="text-amber-600" />
                <span className="text-[10px] uppercase tracking-wider">Vehicle Compatibility</span>
              </div>
              {product.isUniversalFit ? (
                <p className="text-amber-900 font-bold bg-amber-50 p-1.5 rounded text-[11px]">
                  ✨ Universal Fit — Compatible with all vehicles
                </p>
              ) : product.fitments && product.fitments.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {product.fitments.map((fit, idx) => (
                    <span key={idx} className="bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-semibold px-1.5 py-0.5 rounded">
                      {formatFitmentDisplay(fit)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px]">No vehicle fitments configured.</p>
              )}
            </div>

            {/* Movement Summary */}
            <ProductExpandedMovementSummaryMobile product={product} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-0 w-full">
      {groupedDisplayItems.map((item, index) => {
        if (item.type === "standalone") {
          return renderProductCard(item.product, false, index);
        }

        const isGroupExpanded = expandedGroupNames.has(item.groupName);
        return (
          <div key={`mob-group-${item.groupName}-${index}`} className="bg-slate-100/90 rounded-xl border border-slate-300 p-3 space-y-3">
            {/* Group Header Card */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <Package size={18} className="text-navy-800 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-bold text-navy-950 truncate">{item.groupName}</h3>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="bg-navy-100 text-navy-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                      {item.variants.length} Variants
                    </span>
                    <span className="bg-white border border-slate-300 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded">
                      {item.totalStock} total units
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => toggleGroupExpand(item.groupName)}
                className="p-1.5 rounded-lg bg-white border border-slate-300 text-navy-800 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>{isGroupExpanded ? "Hide" : "Show"}</span>
                {isGroupExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>

            {/* Group Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 flex-wrap gap-2">
              <Link
                href={`/inventory/group/${encodeURIComponent(item.groupName)}`}
                className="text-xs font-bold text-navy-700 hover:text-navy-950 inline-flex items-center gap-1"
              >
                <Eye size={13} />
                <span>View Group Page &rarr;</span>
              </Link>

              <div className="flex items-center gap-1.5">
                {isOwner && (
                  <button
                    onClick={() => handleEditBaseGroup(item.groupName)}
                    className="text-[11px] font-semibold px-2 py-1 rounded bg-white text-slate-700 border border-slate-300 cursor-pointer"
                  >
                    Edit Base
                  </button>
                )}
                {isOwner && isGroupExpanded && (
                  <button
                    onClick={() => {
                      setTargetGroupForNewVariant(item.groupName);
                      setShowAddWithVariantModal(true);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded bg-navy-950 text-white cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>+ Variant</span>
                  </button>
                )}
              </div>
            </div>

            {/* Expanded Variant Cards */}
            {isGroupExpanded && (
              <div className="pt-2 border-t border-slate-200/80 space-y-2.5 pl-1 border-l-2 border-navy-600">
                {item.variants.map((variant, vIdx) => renderProductCard(variant, true, vIdx))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
