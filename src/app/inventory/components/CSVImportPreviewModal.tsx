"use client";

import { useState } from "react";
import { X, CheckCircle, AlertCircle, RefreshCw, PlusCircle, AlertTriangle, FileSpreadsheet } from "lucide-react";
import type { Product, VehicleFitment } from "@/types";
import { formatFitmentDisplay } from "@/lib/fitmentUtils";
import { generateUniqueId } from "@/lib/store";

export interface CSVImportRowResult {
  rowNumber: number;
  type: "NEW" | "UPDATE" | "ERROR";
  sku: string;
  name: string;
  brand: string;
  category: string;
  stock: number;
  buyPrice: number;
  sellPrice: number;
  lowStockThreshold: number;
  status: "Active" | "Inactive" | "Discontinued";
  isUniversalFit: boolean;
  fitments: VehicleFitment[];
  errors: string[];
  existingProduct?: Product;
}

interface CSVImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    productsToAdd: Product[];
    productsToUpdate: Product[];
    stockAdjustments: Array<{ productId: string; delta: number }>;
  }) => void;
  parsedRows: CSVImportRowResult[];
  fileName?: string;
}

export function CSVImportPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  parsedRows,
  fileName = "autovault_inventory.csv",
}: CSVImportPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<"all" | "new" | "update" | "error">("all");

  if (!isOpen) return null;

  const newRows = parsedRows.filter((r) => r.type === "NEW");
  const updateRows = parsedRows.filter((r) => r.type === "UPDATE");
  const errorRows = parsedRows.filter((r) => r.type === "ERROR");

  const validCount = newRows.length + updateRows.length;

  const filteredRows = parsedRows.filter((row) => {
    if (activeTab === "new") return row.type === "NEW";
    if (activeTab === "update") return row.type === "UPDATE";
    if (activeTab === "error") return row.type === "ERROR";
    return true;
  });

  function handleApplyImport() {
    if (validCount === 0) return;

    const timestamp = new Date().toISOString();

    const productsToAdd: Product[] = newRows.map((r) => ({
      id: generateUniqueId("p"),
      name: r.name,
      sku: r.sku,
      brand: r.brand,
      category: r.category,
      stock: r.stock,
      currentCost: r.buyPrice,
      sellPrice: r.sellPrice,
      lowStockThreshold: r.lowStockThreshold,
      status: r.status,
      isUniversalFit: r.isUniversalFit,
      fitments: r.fitments,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    const productsToUpdate: Product[] = [];
    const stockAdjustments: Array<{ productId: string; delta: number }> = [];

    for (const r of updateRows) {
      if (!r.existingProduct) continue;

      const updatedProd: Product = {
        ...r.existingProduct,
        name: r.name,
        brand: r.brand,
        category: r.category,
        currentCost: r.buyPrice,
        sellPrice: r.sellPrice,
        lowStockThreshold: r.lowStockThreshold,
        status: r.status,
        isUniversalFit: r.isUniversalFit,
        fitments: r.fitments,
        stock: r.stock,
        updatedAt: timestamp,
      };

      productsToUpdate.push(updatedProd);

      const delta = r.stock - r.existingProduct.stock;
      if (delta !== 0) {
        stockAdjustments.push({
          productId: r.existingProduct.id,
          delta,
        });
      }
    }

    onConfirm({
      productsToAdd,
      productsToUpdate,
      stockAdjustments,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="text-navy-950" size={20} />
              <h2 className="font-bold text-slate-800 text-lg">Spreadsheet Import Verification Preview</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              File: <span className="font-mono font-semibold text-slate-700">{fileName}</span> — Review changes before applying to catalog state.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="p-5 bg-white border-b border-slate-200 space-y-4 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-center">
              <span className="text-xs font-semibold text-slate-500 block uppercase tracking-wider">Total Rows</span>
              <span className="text-2xl font-black text-slate-800 font-mono">{parsedRows.length}</span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl text-center">
              <div className="flex items-center justify-center gap-1 text-emerald-700 text-xs font-bold uppercase tracking-wider">
                <PlusCircle size={14} /> New Products
              </div>
              <span className="text-2xl font-black text-emerald-800 font-mono">{newRows.length}</span>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl text-center">
              <div className="flex items-center justify-center gap-1 text-blue-700 text-xs font-bold uppercase tracking-wider">
                <RefreshCw size={14} /> Existing Updates
              </div>
              <span className="text-2xl font-black text-blue-800 font-mono">{updateRows.length}</span>
            </div>

            <div className={`p-3.5 rounded-xl text-center border ${errorRows.length > 0 ? "bg-red-50 border-red-200 text-red-900" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
              <div className="flex items-center justify-center gap-1 text-xs font-bold uppercase tracking-wider">
                <AlertCircle size={14} className={errorRows.length > 0 ? "text-red-600" : "text-slate-400"} /> Errors / Skipped
              </div>
              <span className="text-2xl font-black font-mono">{errorRows.length}</span>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center justify-between border-b border-slate-150 pb-1">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "all"
                    ? "bg-navy-950 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                All Rows ({parsedRows.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("new")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "new"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                New ({newRows.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("update")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "update"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Updates ({updateRows.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("error")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "error"
                    ? "bg-red-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Errors ({errorRows.length})
              </button>
            </div>

            {errorRows.length > 0 && (
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md flex items-center gap-1">
                <AlertTriangle size={12} />
                {errorRows.length} invalid row{errorRows.length > 1 ? "s" : ""} will be skipped during import.
              </span>
            )}
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {filteredRows.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm italic">
              No rows match the selected tab filter.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-3">Row #</th>
                    <th className="py-3 px-3">Action</th>
                    <th className="py-3 px-3">SKU</th>
                    <th className="py-3 px-3">Name</th>
                    <th className="py-3 px-3">Brand / Cat</th>
                    <th className="py-3 px-3">Stock</th>
                    <th className="py-3 px-3 text-right">Cost (₹)</th>
                    <th className="py-3 px-3 text-right">Sell (₹)</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Universal Fit</th>
                    <th className="py-3 px-3">Details / Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {filteredRows.map((r) => {
                    const isNew = r.type === "NEW";
                    const isUpdate = r.type === "UPDATE";
                    const isError = r.type === "ERROR";

                    const stockDelta = r.existingProduct ? r.stock - r.existingProduct.stock : 0;

                    return (
                      <tr
                        key={r.rowNumber}
                        className={`transition-colors ${
                          isError
                            ? "bg-red-50/70 hover:bg-red-50"
                            : isUpdate
                            ? "bg-blue-50/30 hover:bg-blue-50/50"
                            : "bg-emerald-50/20 hover:bg-emerald-50/40"
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-500">#{r.rowNumber}</td>
                        <td className="py-2.5 px-3">
                          {isNew && (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <PlusCircle size={10} /> NEW
                            </span>
                          )}
                          {isUpdate && (
                            <span className="bg-blue-100 text-blue-800 border border-blue-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <RefreshCw size={10} /> UPDATE
                            </span>
                          )}
                          {isError && (
                            <span className="bg-red-100 text-red-800 border border-red-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <AlertCircle size={10} /> ERROR
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{r.sku || "—"}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900 max-w-[180px] truncate" title={r.name}>
                          {r.name || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {r.brand || "—"} <span className="text-slate-400">/</span> {r.category || "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          {isUpdate && stockDelta !== 0 ? (
                            <span className="flex items-center gap-1">
                              <span className="text-slate-500 line-through">{r.existingProduct?.stock}</span>
                              <span className="text-slate-800">{r.stock}</span>
                              <span className={`text-[10px] font-extrabold px-1 rounded ${stockDelta > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                                {stockDelta > 0 ? `+${stockDelta}` : stockDelta}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-800">{r.stock}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-right text-slate-700">₹{r.buyPrice.toLocaleString()}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-right text-slate-900">₹{r.sellPrice.toLocaleString()}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              r.status === "Active"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : r.status === "Inactive"
                                ? "bg-slate-100 text-slate-700 border-slate-300"
                                : "bg-amber-50 text-amber-800 border-amber-200"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {r.isUniversalFit ? (
                            <span className="bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Universal
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Specific</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 max-w-[220px]">
                          {isError ? (
                            <ul className="text-[11px] text-red-700 space-y-0.5 list-disc list-inside font-medium">
                              {r.errors.map((err, idx) => (
                                <li key={idx}>{err}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-medium truncate block">
                              {r.fitments.length > 0
                                ? r.fitments.map(formatFitmentDisplay).join(", ")
                                : r.isUniversalFit
                                ? "Fits all vehicles"
                                : "No vehicles attached"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {validCount > 0 ? (
              <span>
                Ready to apply <strong className="text-slate-800">{validCount} valid products</strong> ({newRows.length} additions, {updateRows.length} updates).
              </span>
            ) : (
              <span className="text-red-600 font-semibold">
                No valid rows found to import. Please resolve spreadsheet errors and try again.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none border border-slate-300 hover:bg-slate-200/80 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={validCount === 0}
              onClick={handleApplyImport}
              className="flex-1 sm:flex-none bg-navy-950 hover:bg-navy-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle size={15} className="text-emerald-400" />
              Apply Import Changes ({validCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
