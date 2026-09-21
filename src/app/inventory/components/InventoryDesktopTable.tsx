"use client";

import { Fragment, RefObject, useMemo } from "react";
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

// ── Display Product / Grouped Item Types ─────────────────────────────────────
export type GroupedDisplayItem =
  | {
      type: "standalone";
      product: Product;
    }
  | {
      type: "group";
      groupName: string;
      brand?: string;
      category?: string;
      variants: Product[];
      totalStock: number;
    };

// ── Live Stock Movement Summary for Expanded Row Pane ──────────────────────
function ProductExpandedMovementSummary({ product }: { product: Product }) {
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
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
              <Activity size={13} />
            </div>
            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Latest Stock Movement</h4>
          </div>
          {latestMovement && (
            <span className="text-[10px] text-slate-400 font-semibold">
              {formatStockMovementDate(latestMovement.date)}
            </span>
          )}
        </div>

        {latestMovement ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${latestMovement.type === "Sale" ? "bg-blue-50 text-blue-700 border-blue-200"
                  : latestMovement.type === "Purchase" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : latestMovement.type === "Purchase Return" ? "bg-rose-50 text-rose-700 border-rose-200"
                      : latestMovement.type === "Sales Return" ? "bg-violet-50 text-violet-750 border-violet-200"
                        : latestMovement.type === "Invoice Void" ? "bg-purple-50 text-purple-700 border-purple-200"
                          : latestMovement.type === "Opening Stock" ? "bg-green-50 text-green-700 border-green-200"
                            : latestMovement.type === "Adjustment" ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                }`}>
                {latestMovement.type}
              </span>
              <span className={`text-xs font-black px-2 py-0.5 rounded ${latestMovement.delta > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                }`}>
                {latestMovement.delta > 0 ? `+${latestMovement.delta}` : latestMovement.delta} units
              </span>
            </div>

            <div className="text-xs space-y-1">
              <p className="font-semibold text-slate-800 line-clamp-1">{latestMovement.desc}</p>
              <p className="text-[11px] text-slate-500">
                <span className="text-slate-400">Ref:</span> <span className="font-mono font-medium text-slate-700">{latestMovement.reference}</span>
              </p>
            </div>

            {latestMovement.note && (
              <div className="mt-2 text-xs bg-amber-50/80 border border-amber-200 text-amber-900 px-2.5 py-1.5 rounded-lg flex items-start gap-1.5">
                <span className="font-bold text-amber-800 uppercase tracking-wider text-[9px] mt-0.5 shrink-0">Note:</span>
                <span className="font-medium text-slate-700 line-clamp-2">{latestMovement.note}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs text-slate-500 font-medium italic">No stock movements recorded yet.</p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <Link
          href={`/inventory/${product.id}?tab=movement`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-navy-600 hover:text-navy-800 transition-colors"
        >
          View Full Stock Movement Ledger &rarr;
        </Link>
      </div>
    </div>
  );
}

// ── InventoryDesktopTable Props Interface ────────────────────────────────────
export interface InventoryDesktopTableProps {
  groupedDisplayItems: GroupedDisplayItem[];
  isOwner: boolean;
  isSelectionMode: boolean;
  selectedSet: Set<string>;
  allVisibleSelected: boolean;
  selectAllCheckboxRef: RefObject<HTMLInputElement | null>;
  handleToggleSelectAllVisible: () => void;
  handleToggleSelectProduct: (id: string) => void;
  expandedProductId: string | null;
  setExpandedProductId: (id: string | null) => void;
  copiedSkuId: string | null;
  handleCopySku: (product: Product) => void;
  setStockModal: (product: Product | null) => void;
  setEditingProduct: (product: Product | null) => void;
  setShowModal: (show: boolean) => void;
  expandedGroupNames: Set<string>;
  toggleGroupExpand: (groupName: string) => void;
  handleEditBaseGroup: (groupName: string) => void;
  setTargetGroupForNewVariant: (groupName: string | null) => void;
  setShowAddWithVariantModal: (show: boolean) => void;
}

export function InventoryDesktopTable({
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
  // Product Row Renderer
  function renderProductRow(
    product: Product,
    isVariant: boolean,
    rowIndex: number
  ) {
    const outOfStock = product.stock === 0;
    const lowStock = !outOfStock && product.stock <= product.lowStockThreshold;
    const sellNum = Number(product.sellPrice);
    const costNum = Number(product.currentCost);
    const hasValidSellPrice = !isNaN(sellNum) && sellNum > 0;
    const margin =
      isOwner && hasValidSellPrice && !isNaN(costNum)
        ? Math.round(((sellNum - costNum) / sellNum) * 100)
        : null;
    const isExpanded = expandedProductId === product.id;
    const isCopied = copiedSkuId === product.id;

    // Stock progress bar
    const stockPct = outOfStock
      ? 0
      : lowStock
      ? Math.round((product.stock / product.lowStockThreshold) * 50)
      : Math.min(
          100,
          Math.round((product.stock / (product.lowStockThreshold * 4)) * 100) +
            50
        );
    const barColor = outOfStock
      ? "bg-red-400"
      : lowStock
      ? "bg-amber-400"
      : "bg-emerald-500";

    // Left accent
    const accentColor = outOfStock
      ? "border-l-red-500"
      : lowStock
      ? "border-l-amber-500"
      : "border-l-emerald-500";

    // Zebra + hover + variant styling
    const zebraBase = rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/60";
    const rowBg = isExpanded
      ? "bg-blue-50/30"
      : isVariant
      ? "bg-slate-50/70"
      : zebraBase;

    // Status badge
    const statusBadge =
      (product.status || "Active") === "Active" ? (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          Active
        </span>
      ) : product.status === "Inactive" ? (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
          Inactive
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
          Discontinued
        </span>
      );

    return (
      <Fragment key={product.id || `product-row-${rowIndex}`}>
        {/* Main Row */}
        <tr
          className={`border-b border-slate-100 border-l-4 ${accentColor} ${rowBg} hover:bg-slate-50/80 transition-colors duration-100 group`}
        >
          {/* Row selection checkbox – Owner Only (Selection Mode Active) */}
          {isOwner && isSelectionMode && (
            <td
              className="pl-4 pr-1 py-3.5 w-10 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selectedSet.has(product.id)}
                onChange={() => handleToggleSelectProduct(product.id)}
                className="w-4 h-4 text-navy-950 rounded border-slate-300 focus:ring-navy-600/30 cursor-pointer accent-navy-950"
              />
            </td>
          )}

          {/* Expand toggle */}
          <td className="pl-3 pr-1 py-3.5 w-8">
            <button
              onClick={() =>
                setExpandedProductId(isExpanded ? null : product.id)
              }
              className="p-1 rounded-md hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title={isExpanded ? "Collapse" : "Expand details"}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronRight size={14} />}
            </button>
          </td>

          {/* Product Name & SKU */}
          <td className="px-4 py-3.5 min-w-[120px] sm:min-w-[180px]">
            {isVariant ? (
              <div className="flex items-start gap-2 pl-2 sm:pl-3">
                <CornerDownRight
                  size={14}
                  className="text-navy-500 shrink-0 mt-0.5"
                />
                <button
                  className="text-left w-full cursor-pointer"
                  onClick={() =>
                    setExpandedProductId(isExpanded ? null : product.id)
                  }
                >
                  <p className="font-medium text-slate-800 group-hover:text-navy-700 transition-colors text-[13px] leading-tight flex items-center gap-1.5 flex-wrap">
                    {product.name}
                  </p>
                  <p className="font-mono text-[10px] text-slate-400 mt-0.5 tracking-wide">
                    {product.sku}
                  </p>
                </button>
              </div>
            ) : (
              <button
                className="text-left w-full cursor-pointer"
                onClick={() =>
                  setExpandedProductId(isExpanded ? null : product.id)
                }
              >
                <p className="font-medium text-slate-800 group-hover:text-navy-700 transition-colors text-[13px] leading-tight">
                  {product.name}
                </p>
                <div className="font-mono text-[10px] text-slate-400 mt-0.5 tracking-wide flex items-center gap-1.5 flex-wrap">
                  <span>{product.sku}</span>
                  {product.displayGroup &&
                    product.displayGroup.trim() !== "" && (
                      <span className="text-[10px] text-purple-700 font-bold bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded inline-block">
                        Part of: {product.displayGroup.trim()}
                      </span>
                    )}
                </div>
              </button>
            )}
          </td>

          {/* SKU – Click to Copy */}
          <td className="px-4 py-3.5 hidden md:table-cell">
            <button
              onClick={() => handleCopySku(product)}
              title={isCopied ? "Copied!" : "Click to copy SKU"}
              className={`group/sku inline-flex items-center gap-1.5 font-mono text-xs border rounded-md px-2 py-1 transition-all duration-200 cursor-pointer select-none ${
                isCopied
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-navy-50 hover:border-navy-300 hover:text-navy-700"
              }`}
            >
              {isCopied ? (
                <Check size={11} className="text-emerald-600" />
              ) : (
                <Copy
                  size={11}
                  className="text-slate-400 group-hover/sku:text-navy-500"
                />
              )}
              {isCopied ? "Copied!" : product.sku}
            </button>
          </td>

          {/* Brand */}
          <td className="px-4 py-3.5 hidden lg:table-cell">
            <span className="text-xs text-slate-600">
              {product.brand || <span className="text-slate-300">—</span>}
            </span>
          </td>

          {/* Category */}
          <td className="px-4 py-3.5 hidden lg:table-cell">
            <span className="inline-block text-[10px] font-medium bg-slate-50 border border-slate-200 text-slate-500 px-2 py-0.5 rounded">
              {product.category || "—"}
            </span>
          </td>

          {/* Status */}
          <td className="px-4 py-3.5 text-center hidden xl:table-cell">
            {statusBadge}
          </td>

          {/* Stock */}
          <td className="px-4 py-3.5">
            <div className="flex flex-col items-center gap-1 min-w-[64px]">
              <span
                className={`text-xs font-bold tabular-nums ${
                  outOfStock
                    ? "text-red-600"
                    : lowStock
                    ? "text-amber-600"
                    : "text-slate-800"
                }`}
              >
                {product.stock}{" "}
                <span className="font-normal text-slate-400 text-[9px]">
                  units
                </span>
              </span>
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                  style={{
                    width: `${Math.max(stockPct, outOfStock ? 0 : 3)}%`,
                  }}
                />
              </div>
              <span
                className={`text-[9px] font-medium ${
                  outOfStock
                    ? "text-red-500"
                    : lowStock
                    ? "text-amber-500"
                    : "text-emerald-600"
                }`}
              >
                {outOfStock
                  ? "Out of stock"
                  : lowStock
                  ? "Low"
                  : "Healthy"}
              </span>
            </div>
          </td>

          {/* Cost Price – Owner Only */}
          {isOwner && (
            <td className="px-4 py-3.5 text-right hidden lg:table-cell">
              <span className="text-[13px] font-medium text-slate-500">
                ₹{product.currentCost.toLocaleString()}
              </span>
            </td>
          )}

          {/* Sell Price */}
          <td className="px-4 py-3.5 text-right">
            <span className="text-[13px] font-bold text-slate-800">
              ₹{product.sellPrice.toLocaleString()}
            </span>
          </td>

          {/* Margin % – Owner Only */}
          {isOwner && (
            <td className="px-4 py-3.5 text-right hidden md:table-cell">
              {margin !== null ? (
                <span
                  className={`inline-block text-[11px] font-bold tabular-nums px-2 py-0.5 rounded border ${
                    margin > 0
                      ? margin >= 30
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : margin === 0
                      ? "bg-slate-100 text-slate-700 border-slate-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}
                >
                  {margin}%
                </span>
              ) : (
                <span className="inline-block text-[11px] font-medium text-slate-400 px-2 py-0.5 rounded border border-slate-200 bg-slate-50">
                  N/A
                </span>
              )}
            </td>
          )}

          {/* Row Actions */}
          <td className="px-4 py-3.5">
            <div className="flex items-center justify-center gap-1">
              <Link
                href={`/inventory/${product.id}`}
                title="Open product details"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-navy-700 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <Eye size={15} />
              </Link>

              {isOwner && (
                <button
                  onClick={() => setStockModal(product)}
                  title="Adjust stock"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all cursor-pointer"
                >
                  <Layers size={15} />
                </button>
              )}

              {isOwner && (
                <button
                  onClick={() => {
                    setEditingProduct(product);
                    setShowModal(true);
                  }}
                  title="Edit product"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-navy-700 hover:bg-navy-50 transition-all cursor-pointer"
                >
                  <Pencil size={14} />
                </button>
              )}

              {!isOwner && (
                <span className="text-[10px] text-slate-400 italic px-1">
                  View only
                </span>
              )}
            </div>
          </td>
        </tr>

        {/* Expanded Details Pane */}
        {isExpanded && (
          <tr className={`border-l-4 ${accentColor} bg-slate-50/40`}>
            <td
              colSpan={isOwner ? (isSelectionMode ? 12 : 11) : 9}
              className="px-6 py-5 border-t border-b border-slate-200/60"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Col 1: Vehicle Compatibility */}
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                    <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Info size={13} />
                    </div>
                    <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Vehicle Compatibility
                    </h4>
                  </div>
                  <div className="max-h-36 overflow-y-auto">
                    {product.isUniversalFit ||
                    (product.fitments && product.fitments.length > 0) ? (
                      <div className="space-y-2">
                        {product.isUniversalFit && (
                          <div className="flex items-center gap-2 bg-amber-50/90 rounded-lg px-3 py-2 border border-amber-200">
                            <Sparkles size={13} className="text-amber-600 shrink-0" />
                            <p className="text-xs font-bold text-amber-900">
                              Universal Fit — Compatible with all vehicles
                            </p>
                          </div>
                        )}
                        {product.fitments && product.fitments.length > 0 && (
                          <div>
                            {product.isUniversalFit && (
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Explicit Vehicle Fitments
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {product.fitments.map((fit, idx) => (
                                <span
                                  key={idx}
                                  className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold px-2.5 py-0.5 rounded-lg"
                                >
                                  {formatFitmentDisplay(fit)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/60">
                        <Info size={13} className="text-slate-400 shrink-0" />
                        <p className="text-xs text-slate-500 font-medium italic">
                          No specific vehicles configured for this product.
                        </p>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-50 italic">
                    * Fitments match against sales invoicing checklist.
                  </p>
                </div>

                {/* Col 2: Recent Activity — Live Stock Movement Summary */}
                <ProductExpandedMovementSummary product={product} />

                {/* Col 3: Quick Intelligence */}
                <div className="bg-white rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                    <div className="w-6 h-6 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center">
                      <TrendingUp size={13} />
                    </div>
                    <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Quick Intelligence
                    </h4>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {[
                      {
                        label: "Stock Status",
                        value: outOfStock
                          ? "Out of Stock"
                          : lowStock
                          ? "Low Stock Warning"
                          : "Healthy Stock",
                        cls: outOfStock
                          ? "text-red-600 bg-red-50 border-red-200"
                          : lowStock
                          ? "text-amber-700 bg-amber-50 border-amber-200"
                          : "text-emerald-700 bg-emerald-50 border-emerald-200",
                      },
                      {
                        label: "Suggested Order",
                        value: outOfStock
                          ? `${product.lowStockThreshold * 3} units`
                          : lowStock
                          ? `${product.lowStockThreshold * 2} units`
                          : "0 units (Adequate)",
                        cls: "text-slate-700 bg-slate-50 border-slate-200",
                      },
                      {
                        label: "Replenishment Lead",
                        value: "3 – 5 Days Est.",
                        cls: "text-slate-600 bg-slate-50 border-slate-200",
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0"
                      >
                        <span className="text-slate-500 text-[11px]">
                          {row.label}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${row.cls}`}
                        >
                          {row.value}
                        </span>
                      </div>
                    ))}
                    {isOwner && (
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-500 text-[11px]">
                          Unit Profit
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border text-green-700 bg-green-50 border-green-200">
                          ₹
                          {(
                            product.sellPrice - product.currentCost
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-50 italic">
                    Based on low-stock thresholds &amp; current transaction trends.
                  </p>
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
      <table className="w-full text-sm border-collapse">
        {/* Sticky professional header */}
        <thead className="sticky top-0 z-10 shadow-[0_1px_0_0_theme(colors.slate.200)]">
          <tr className="bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
            {/* Select All Checkbox – Owner Only (Selection Mode Active) */}
            {isOwner && isSelectionMode && (
              <th className="w-10 pl-4 pr-1 py-3 text-center">
                <input
                  type="checkbox"
                  ref={selectAllCheckboxRef}
                  checked={allVisibleSelected}
                  onChange={handleToggleSelectAllVisible}
                  title={
                    allVisibleSelected
                      ? "Deselect all visible products"
                      : "Select all visible products"
                  }
                  className="w-4 h-4 text-navy-950 rounded border-slate-300 focus:ring-navy-600/30 cursor-pointer accent-navy-950"
                />
              </th>
            )}
            {/* Expand toggle column */}
            <th className="w-8 pl-3 pr-1 py-3" />
            {/* Product */}
            <th className="px-4 py-3 text-left">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Product
              </span>
            </th>
            {/* SKU */}
            <th className="px-4 py-3 text-left hidden md:table-cell">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                SKU
              </span>
            </th>
            {/* Brand */}
            <th className="px-4 py-3 text-left hidden lg:table-cell">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Brand
              </span>
            </th>
            {/* Category */}
            <th className="px-4 py-3 text-left hidden lg:table-cell">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Category
              </span>
            </th>
            {/* Status */}
            <th className="px-4 py-3 text-center hidden xl:table-cell">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Status
              </span>
            </th>
            {/* Stock */}
            <th className="px-4 py-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Stock
              </span>
            </th>
            {/* Cost – Owner Only */}
            {isOwner && (
              <th className="px-4 py-3 text-right hidden lg:table-cell">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Cost ₹
                </span>
              </th>
            )}
            {/* Sell Price */}
            <th className="px-4 py-3 text-right">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Sell ₹
              </span>
            </th>
            {/* Margin – Owner Only */}
            {isOwner && (
              <th className="px-4 py-3 text-right hidden md:table-cell">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Margin
                </span>
              </th>
            )}
            {/* Actions */}
            <th className="px-4 py-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Actions
              </span>
            </th>
          </tr>
        </thead>

        <tbody>
          {groupedDisplayItems.map((item, itemIdx) => {
            if (item.type === "standalone") {
              return renderProductRow(item.product, false, itemIdx);
            }

            const isGroupExpanded = expandedGroupNames.has(item.groupName);
            return (
              <Fragment key={`group-${item.groupName}-${itemIdx}`}>
                {/* Group Header Row */}
                <tr className="border-b border-slate-200 border-l-4 border-l-navy-800 bg-slate-100/90 hover:bg-slate-200/60 transition-colors duration-100 group font-sans">
                  {/* Checkbox column if selection mode active */}
                  {isOwner && isSelectionMode && (
                    <td
                      className="pl-4 pr-1 py-3.5 w-10 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={
                          item.variants.length > 0 &&
                          item.variants.every((v) => selectedSet.has(v.id))
                        }
                        onChange={() => {
                          const allSelected = item.variants.every((v) =>
                            selectedSet.has(v.id)
                          );
                          item.variants.forEach((v) => {
                            if (allSelected) {
                              if (selectedSet.has(v.id))
                                handleToggleSelectProduct(v.id);
                            } else {
                              if (!selectedSet.has(v.id))
                                handleToggleSelectProduct(v.id);
                            }
                          });
                        }}
                        className="w-4 h-4 text-navy-950 rounded border-slate-300 focus:ring-navy-600/30 cursor-pointer accent-navy-950"
                      />
                    </td>
                  )}

                  {/* Group Expand Toggle */}
                  <td className="pl-3 pr-1 py-3.5 w-8">
                    <button
                      onClick={() => toggleGroupExpand(item.groupName)}
                      aria-expanded={isGroupExpanded}
                      aria-label={`Toggle variants for ${item.groupName}`}
                      className="p-1 rounded-md bg-white border border-slate-300 hover:bg-navy-50 text-navy-700 hover:text-navy-900 transition-colors cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-navy-500"
                    >
                      {isGroupExpanded ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>
                  </td>

                  {/* Product / Group Base Name */}
                  <td className="px-4 py-3.5 min-w-[120px] sm:min-w-[180px]">
                    <button
                      className="text-left w-full cursor-pointer focus:outline-none"
                      onClick={() => toggleGroupExpand(item.groupName)}
                      aria-expanded={isGroupExpanded}
                      aria-label={`Expand or collapse ${item.groupName}`}
                    >
                      <div className="flex items-center gap-2">
                        <Package size={16} className="text-navy-700 shrink-0" />
                        <div>
                          <p className="font-bold text-navy-950 text-[13px] leading-tight group-hover:text-navy-700 transition-colors flex items-center gap-2">
                            {item.groupName}
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-navy-100 text-navy-800 border border-navy-200 px-2 py-0.5 rounded-full">
                              {item.variants.length} Variants
                            </span>
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 tracking-wide">
                            Display Group • Click to{" "}
                            {isGroupExpanded ? "collapse" : "expand"}
                          </p>
                        </div>
                      </div>
                    </button>
                  </td>

                  {/* SKU */}
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <span className="font-mono text-xs text-slate-400 italic">
                      {item.variants.length} SKUs
                    </span>
                  </td>

                  {/* Brand */}
                  <td className="px-4 py-3.5 hidden lg:table-cell">
                    <span className="text-xs text-slate-700 font-medium">
                      {item.brand || (
                        <span className="text-slate-400 italic">
                          Multiple Brands
                        </span>
                      )}
                    </span>
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3.5 hidden lg:table-cell">
                    <span className="inline-block text-[10px] font-medium bg-white border border-slate-300 text-slate-700 px-2 py-0.5 rounded shadow-xs">
                      {item.category || "Multiple"}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5 text-center hidden xl:table-cell">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-slate-200/80 text-slate-700 border border-slate-300 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-navy-600 inline-block" />
                      Group
                    </span>
                  </td>

                  {/* Combined Stock */}
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col items-center gap-0.5 min-w-[64px]">
                      <span className="text-xs font-bold tabular-nums text-navy-950">
                        {item.totalStock}{" "}
                        <span className="font-normal text-slate-500 text-[9px]">
                          units
                        </span>
                      </span>
                      <span className="text-[9px] font-semibold uppercase text-slate-500 tracking-wider">
                        Combined Stock
                      </span>
                    </div>
                  </td>

                  {/* Cost – Owner Only */}
                  {isOwner && (
                    <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                      <span className="text-xs text-slate-400 italic">—</span>
                    </td>
                  )}

                  {/* Sell Price */}
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-xs text-slate-400 italic">—</span>
                  </td>

                  {/* Margin – Owner Only */}
                  {isOwner && (
                    <td className="px-4 py-3.5 text-right hidden md:table-cell">
                      <span className="text-xs text-slate-400 italic">—</span>
                    </td>
                  )}

                  {/* Actions */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        href={`/inventory/group/${encodeURIComponent(
                          item.groupName
                        )}`}
                        title="Open Display Group"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-navy-950 hover:bg-white border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                      >
                        <Eye size={15} />
                      </Link>

                      <button
                        onClick={() => toggleGroupExpand(item.groupName)}
                        aria-expanded={isGroupExpanded}
                        aria-label={`${
                          isGroupExpanded ? "Collapse" : "Expand"
                        } base group ${item.groupName}`}
                        title={
                          isGroupExpanded
                            ? "Collapse group"
                            : "Expand group variants"
                        }
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-navy-700 hover:text-navy-950 hover:bg-white border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                      >
                        {isGroupExpanded ? (
                          <ChevronUp size={15} />
                        ) : (
                          <ChevronRight size={15} />
                        )}
                      </button>

                      {isOwner && (
                        <button
                          onClick={() => handleEditBaseGroup(item.groupName)}
                          title="Edit Base Display Group"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-navy-700 hover:bg-white border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                        >
                          <Pencil size={14} />
                        </button>
                      )}

                      {isOwner && isGroupExpanded && (
                        <button
                          onClick={() => {
                            setTargetGroupForNewVariant(item.groupName);
                            setShowAddWithVariantModal(true);
                          }}
                          title={`Add new variant to ${item.groupName}`}
                          className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-navy-950 hover:bg-navy-900 text-white cursor-pointer transition-colors shadow-xs ml-1"
                        >
                          <Plus size={13} />
                          <span>+ Add Variant</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Group Expanded Variant Rows */}
                {isGroupExpanded &&
                  item.variants.map((variant, vIdx) =>
                    renderProductRow(variant, true, vIdx)
                  )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
