"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import {
  ChevronRight,
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

// ── Movement Summary Component for Expanded Row Pane ──────────────────────
function ProductExpandedMovementSummaryTablet({ product }: { product: Product }) {
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
    <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-50 text-blue-600 flex items-center justify-center">
              <Activity size={12} />
            </div>
            <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Latest Stock Movement</h4>
          </div>
          {latestMovement && (
            <span className="text-[9px] text-slate-400 font-semibold">
              {formatStockMovementDate(latestMovement.date)}
            </span>
          )}
        </div>

        {latestMovement ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                latestMovement.type === "Sale" ? "bg-blue-50 text-blue-700 border-blue-200"
                : latestMovement.type === "Purchase" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : latestMovement.type === "Adjustment" ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
              }`}>
                {latestMovement.type}
              </span>
              <span className={`text-xs font-black px-1.5 py-0.5 rounded ${
                latestMovement.delta > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
              }`}>
                {latestMovement.delta > 0 ? `+${latestMovement.delta}` : latestMovement.delta} units
              </span>
            </div>
            <div className="text-xs">
              <p className="font-semibold text-slate-800 truncate">{latestMovement.desc}</p>
              <p className="text-[10px] text-slate-400 font-mono">Ref: {latestMovement.reference}</p>
            </div>
          </div>
        ) : (
          <div className="py-2 text-center">
            <p className="text-xs text-slate-400 italic">No stock movements recorded yet.</p>
          </div>
        )}
      </div>

      <div className="mt-3 pt-2 border-t border-slate-100">
        <Link
          href={`/inventory/${product.id}?tab=movement`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-navy-600 hover:underline"
        >
          View Full Ledger &rarr;
        </Link>
      </div>
    </div>
  );
}

export function InventoryTabletView({
  groupedDisplayItems,
  isOwner,
  isSelectionMode,
  selectedSet,
  allVisibleSelected,
  selectAllCheckboxRef,
  handleToggleSelectAllVisible,
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
  function renderProductRow(product: Product, isVariant: boolean, rowIndex: number) {
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

    const accentColor = outOfStock
      ? "border-l-red-500"
      : lowStock
      ? "border-l-amber-500"
      : "border-l-emerald-500";

    const zebraBase = rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/60";
    const rowBg = isExpanded ? "bg-blue-50/30" : isVariant ? "bg-slate-50/70" : zebraBase;

    return (
      <Fragment key={product.id || `tab-prod-${rowIndex}`}>
        <tr className={`border-b border-slate-100 border-l-4 ${accentColor} ${rowBg} hover:bg-slate-50 transition-colors`}>
          {/* Selection Checkbox */}
          {isOwner && isSelectionMode && (
            <td className="pl-3 pr-1 py-3 w-8 text-center" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedSet.has(product.id)}
                onChange={() => handleToggleSelectProduct(product.id)}
                className="w-4 h-4 text-navy-950 rounded border-slate-300 accent-navy-950 cursor-pointer"
              />
            </td>
          )}

          {/* Expand Chevron */}
          <td className="pl-2 pr-1 py-3 w-8">
            <button
              onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
              className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronRight size={14} />}
            </button>
          </td>

          {/* Product Name & SKU */}
          <td className="px-3 py-3 max-w-[200px]">
            {isVariant ? (
              <div className="flex items-start gap-1.5 pl-1">
                <CornerDownRight size={13} className="text-navy-500 shrink-0 mt-0.5" />
                <button
                  className="text-left cursor-pointer"
                  onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                >
                  <p className="font-medium text-slate-800 text-xs leading-tight truncate">{product.name}</p>
                  <p className="font-mono text-[10px] text-slate-400 mt-0.5">{product.sku}</p>
                </button>
              </div>
            ) : (
              <button
                className="text-left cursor-pointer w-full"
                onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
              >
                <p className="font-medium text-slate-800 text-xs leading-tight truncate">{product.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="font-mono text-[10px] text-slate-400">{product.sku}</span>
                  {product.brand && (
                    <span className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                      {product.brand}
                    </span>
                  )}
                </div>
              </button>
            )}
          </td>

          {/* SKU Copy Pill */}
          <td className="px-2 py-3 text-center">
            <button
              onClick={() => handleCopySku(product)}
              className={`inline-flex items-center gap-1 font-mono text-[10px] border rounded px-1.5 py-0.5 cursor-pointer ${
                isCopied ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-600"
              }`}
            >
              {isCopied ? <Check size={10} /> : <Copy size={10} />}
              {isCopied ? "Copied" : product.sku}
            </button>
          </td>

          {/* Stock */}
          <td className="px-3 py-3 text-center">
            <div className="inline-flex flex-col items-center">
              <span className={`text-xs font-bold ${outOfStock ? "text-red-600" : lowStock ? "text-amber-600" : "text-slate-800"}`}>
                {product.stock}
              </span>
              <span className={`text-[9px] font-medium ${outOfStock ? "text-red-500" : lowStock ? "text-amber-500" : "text-emerald-600"}`}>
                {outOfStock ? "Out" : lowStock ? "Low" : "Healthy"}
              </span>
            </div>
          </td>

          {/* Cost Price (Owner) */}
          {isOwner && (
            <td className="px-3 py-3 text-right">
              <span className="text-xs text-slate-500 font-medium">₹{product.currentCost.toLocaleString()}</span>
            </td>
          )}

          {/* Sell Price */}
          <td className="px-3 py-3 text-right">
            <span className="text-xs font-bold text-slate-800">₹{product.sellPrice.toLocaleString()}</span>
          </td>

          {/* Margin % (Owner) */}
          {isOwner && (
            <td className="px-3 py-3 text-right">
              {margin !== null ? (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  margin >= 30 ? "bg-green-50 text-green-700 border-green-200"
                  : margin > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-red-50 text-red-700 border-red-200"
                }`}>
                  {margin}%
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">—</span>
              )}
            </td>
          )}

          {/* Actions */}
          <td className="px-3 py-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <Link
                href={`/inventory/${product.id}`}
                title="View Details"
                className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-navy-700 hover:bg-slate-100"
              >
                <Eye size={14} />
              </Link>
              {isOwner && (
                <button
                  onClick={() => setStockModal(product)}
                  title="Adjust Stock"
                  className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                >
                  <Layers size={14} />
                </button>
              )}
              {isOwner && (
                <button
                  onClick={() => { setEditingProduct(product); setShowModal(true); }}
                  title="Edit Product"
                  className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-navy-700 hover:bg-navy-50"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
          </td>
        </tr>

        {/* Tablet Expanded Pane */}
        {isExpanded && (
          <tr className={`border-l-4 ${accentColor} bg-slate-50/50`}>
            <td colSpan={isOwner ? (isSelectionMode ? 9 : 8) : 6} className="p-4 border-b border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Fitment Card */}
                <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-100">
                    <Info size={13} className="text-amber-600" />
                    <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Vehicle Compatibility</h4>
                  </div>
                  {product.isUniversalFit ? (
                    <div className="flex items-center gap-1.5 bg-amber-50 text-amber-900 px-2.5 py-1.5 rounded text-xs font-bold">
                      <Sparkles size={12} className="text-amber-600 shrink-0" />
                      Universal Fit — Compatible with all vehicles
                    </div>
                  ) : product.fitments && product.fitments.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {product.fitments.map((fit, idx) => (
                        <span key={idx} className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold px-2 py-0.5 rounded">
                          {formatFitmentDisplay(fit)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No vehicle fitments configured.</p>
                  )}
                </div>

                {/* Stock Movement Summary */}
                <ProductExpandedMovementSummaryTablet product={product} />

                {/* Quick Intelligence */}
                <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs col-span-1 md:col-span-2 lg:col-span-1">
                  <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-100">
                    <TrendingUp size={13} className="text-violet-600" />
                    <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Quick Intelligence</h4>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between py-0.5">
                      <span className="text-slate-500">Status</span>
                      <span className="font-bold text-slate-700">{outOfStock ? "Out of Stock" : lowStock ? "Low Stock Alert" : "Healthy"}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-slate-500">Suggested Order</span>
                      <span className="font-bold text-slate-700">{lowStock ? `${product.lowStockThreshold * 2} units` : "0 units"}</span>
                    </div>
                    {isOwner && (
                      <div className="flex justify-between py-0.5 border-t border-slate-100 pt-1">
                        <span className="text-slate-500">Unit Profit</span>
                        <span className="font-bold text-green-700">₹{(product.sellPrice - product.currentCost).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  return (
    <div className="overflow-x-auto min-w-0 w-full">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {isOwner && isSelectionMode && (
              <th className="w-8 pl-3 pr-1 py-2.5 text-center">
                <input
                  type="checkbox"
                  ref={selectAllCheckboxRef}
                  checked={allVisibleSelected}
                  onChange={handleToggleSelectAllVisible}
                  className="w-4 h-4 text-navy-950 rounded border-slate-300 accent-navy-950 cursor-pointer"
                />
              </th>
            )}
            <th className="w-8 pl-2 pr-1 py-2.5" />
            <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-slate-500 text-[10px]">Product</th>
            <th className="px-2 py-2.5 text-center font-bold uppercase tracking-wider text-slate-500 text-[10px]">SKU</th>
            <th className="px-3 py-2.5 text-center font-bold uppercase tracking-wider text-slate-500 text-[10px]">Stock</th>
            {isOwner && <th className="px-3 py-2.5 text-right font-bold uppercase tracking-wider text-slate-500 text-[10px]">Cost ₹</th>}
            <th className="px-3 py-2.5 text-right font-bold uppercase tracking-wider text-slate-500 text-[10px]">Sell ₹</th>
            {isOwner && <th className="px-3 py-2.5 text-right font-bold uppercase tracking-wider text-slate-500 text-[10px]">Margin</th>}
            <th className="px-3 py-2.5 text-center font-bold uppercase tracking-wider text-slate-500 text-[10px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {groupedDisplayItems.map((item, itemIdx) => {
            if (item.type === "standalone") {
              return renderProductRow(item.product, false, itemIdx);
            }

            const isGroupExpanded = expandedGroupNames.has(item.groupName);
            return (
              <Fragment key={`tab-group-${item.groupName}-${itemIdx}`}>
                {/* Group Header Row */}
                <tr className="border-b border-slate-200 border-l-4 border-l-navy-800 bg-slate-100/90 font-sans">
                  {isOwner && isSelectionMode && (
                    <td className="pl-3 pr-1 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={item.variants.length > 0 && item.variants.every((v) => selectedSet.has(v.id))}
                        onChange={() => {
                          const allSelected = item.variants.every((v) => selectedSet.has(v.id));
                          item.variants.forEach((v) => {
                            if (allSelected) {
                              if (selectedSet.has(v.id)) handleToggleSelectProduct(v.id);
                            } else {
                              if (!selectedSet.has(v.id)) handleToggleSelectProduct(v.id);
                            }
                          });
                        }}
                        className="w-4 h-4 text-navy-950 rounded border-slate-300 accent-navy-950 cursor-pointer"
                      />
                    </td>
                  )}

                  <td className="pl-2 pr-1 py-3">
                    <button
                      onClick={() => toggleGroupExpand(item.groupName)}
                      className="p-1 rounded bg-white border border-slate-300 text-navy-700 shadow-xs cursor-pointer"
                    >
                      {isGroupExpanded ? <ChevronUp size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </td>

                  <td className="px-3 py-3">
                    <button className="text-left cursor-pointer" onClick={() => toggleGroupExpand(item.groupName)}>
                      <div className="flex items-center gap-1.5">
                        <Package size={15} className="text-navy-700 shrink-0" />
                        <div>
                          <p className="font-bold text-navy-950 text-xs truncate flex items-center gap-1">
                            {item.groupName}
                            <span className="bg-navy-100 text-navy-800 text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                              {item.variants.length} Var
                            </span>
                          </p>
                          <p className="text-[9px] text-slate-500">Group • Click to toggle</p>
                        </div>
                      </div>
                    </button>
                  </td>

                  <td className="px-2 py-3 text-center font-mono text-[10px] text-slate-400 italic">
                    {item.variants.length} SKUs
                  </td>

                  <td className="px-3 py-3 text-center">
                    <span className="text-xs font-bold text-navy-950">{item.totalStock} units</span>
                  </td>

                  {isOwner && <td className="px-3 py-3 text-right text-slate-400 italic">—</td>}
                  <td className="px-3 py-3 text-right text-slate-400 italic">—</td>
                  {isOwner && <td className="px-3 py-3 text-right text-slate-400 italic">—</td>}

                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        href={`/inventory/group/${encodeURIComponent(item.groupName)}`}
                        title="View Group"
                        className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-navy-950 hover:bg-white"
                      >
                        <Eye size={14} />
                      </Link>
                      {isOwner && (
                        <button
                          onClick={() => handleEditBaseGroup(item.groupName)}
                          title="Edit Group"
                          className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-navy-700 hover:bg-white"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {isOwner && isGroupExpanded && (
                        <button
                          onClick={() => {
                            setTargetGroupForNewVariant(item.groupName);
                            setShowAddWithVariantModal(true);
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-navy-950 text-white cursor-pointer"
                        >
                          <Plus size={11} />
                          <span>+ Variant</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Group Variant Rows */}
                {isGroupExpanded && item.variants.map((v, vIdx) => renderProductRow(v, true, vIdx))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
