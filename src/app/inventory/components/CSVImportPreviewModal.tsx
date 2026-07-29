"use client";

import { useState, useEffect, useMemo } from "react";
import { X, CheckCircle, AlertCircle, RefreshCw, PlusCircle, AlertTriangle, FileSpreadsheet } from "lucide-react";
import type { Product, VehicleFitment } from "@/types";
import { formatFitmentDisplay } from "@/lib/fitmentUtils";
import { generateUniqueId, useStore } from "@/lib/store";

export interface CSVImportRowResult {
  rowNumber: number;
  type: "NEW" | "UPDATE" | "ERROR";
  sku: string;
  name: string;
  brand: string;
  category: string;
  stock: number | "";
  buyPrice: number | ""; // maps to currentCost
  sellPrice: number | "";
  lowStockThreshold: number | "";
  status: "Active" | "Inactive" | "Discontinued" | "";
  isUniversalFit: boolean;
  fitments: VehicleFitment[];
  errors: string[];
  fieldErrors?: {
    name?: string;
    sku?: string;
    brand?: string;
    category?: string;
    status?: string;
    stock?: string;
    buyPrice?: string;
    sellPrice?: string;
    lowStockThreshold?: string;
  };
  nameWarning?: string;
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
  const { state } = useStore();
  const [rows, setRows] = useState<CSVImportRowResult[]>(parsedRows);
  const [activeTab, setActiveTab] = useState<"all" | "new" | "update" | "error">("all");

  useEffect(() => {
    const seenSkusInFile = new Map<string, number>();
    const validated = parsedRows.map((r) => {
      const lowerSku = (r.sku || "").trim().toLowerCase();
      const skuMatch = state?.products?.find((p) => p.sku?.trim().toLowerCase() === lowerSku);

      const fieldErrors = { ...(r.fieldErrors || {}) };
      const errors = [...(r.errors || [])];

      if (lowerSku) {
        if (seenSkusInFile.has(lowerSku)) {
          const firstRow = seenSkusInFile.get(lowerSku);
          const dupErr = `Duplicate SKU "${r.sku}" in import file (first seen in row ${firstRow}).`;
          fieldErrors.sku = dupErr;
          if (!errors.includes(dupErr)) {
            errors.push(dupErr);
          }
          return {
            ...r,
            type: "ERROR" as const,
            errors,
            fieldErrors,
            existingProduct: undefined,
          };
        }
        seenSkusInFile.set(lowerSku, r.rowNumber);
      }

      const hasErrors = errors.length > 0;
      return {
        ...r,
        errors,
        fieldErrors,
        type: hasErrors ? ("ERROR" as const) : skuMatch ? ("UPDATE" as const) : ("NEW" as const),
        existingProduct: skuMatch,
      };
    });

    setRows(validated);
  }, [parsedRows, isOpen, state?.products]);

  // Derived existing brands list for convenience selection
  const existingBrands = useMemo(() => {
    const set = new Set<string>();
    if (!state?.products) return [];
    for (const p of state.products) {
      if (p.brand?.trim()) set.add(p.brand.trim());
    }
    return Array.from(set).sort();
  }, [state?.products]);

  // Derived existing categories list for convenience selection
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    if (!state?.products) return [];
    for (const p of state.products) {
      if (p.category?.trim()) set.add(p.category.trim());
    }
    return Array.from(set).sort();
  }, [state?.products]);

  if (!isOpen) return null;

  const newRows = rows.filter((r) => r.type === "NEW");
  const updateRows = rows.filter((r) => r.type === "UPDATE");
  const errorRows = rows.filter((r) => r.type === "ERROR");

  const validCount = newRows.length + updateRows.length;

  const filteredRows = rows.filter((row) => {
    if (activeTab === "new") return row.type === "NEW";
    if (activeTab === "update") return row.type === "UPDATE";
    if (activeTab === "error") return row.type === "ERROR";
    return true;
  });

  function updateRowField(rowNum: number, field: keyof CSVImportRowResult, value: any) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowNumber !== rowNum) return r;

        const updated = { ...r, [field]: value };
        const newFieldErrors: NonNullable<CSVImportRowResult["fieldErrors"]> = {
          ...(r.fieldErrors || {}),
        };

        // Brand canonicalization
        if (field === "brand") {
          const valStr = String(value).trim();
          if (valStr) {
            const match = existingBrands.find((b) => b.toLowerCase() === valStr.toLowerCase());
            updated.brand = match || valStr;
          } else {
            updated.brand = "";
          }
        }

        // Category validation & canonicalization
        if (field === "category") {
          const valStr = String(value).trim();
          if (!valStr) {
            newFieldErrors.category = "Category is required.";
            updated.category = "";
          } else {
            delete newFieldErrors.category;
            const match = existingCategories.find((c) => c.toLowerCase() === valStr.toLowerCase());
            updated.category = match || valStr;
          }
        }

        // Name validation
        if (field === "name") {
          const valStr = String(value).trim();
          if (!valStr) {
            newFieldErrors.name = "Product name is required.";
          } else if (valStr.length < 3) {
            newFieldErrors.name = "Product name must be at least 3 characters.";
          } else if (valStr.length > 100) {
            newFieldErrors.name = "Product name cannot exceed 100 characters.";
          } else {
            delete newFieldErrors.name;
          }
          updated.name = valStr;
        }

        // Status validation
        if (field === "status") {
          if (!value || !["Active", "Inactive", "Discontinued"].includes(value)) {
            newFieldErrors.status = "Status is required.";
          } else {
            delete newFieldErrors.status;
          }
        }

        // Stock validation
        if (field === "stock") {
          const num = Number(value);
          if (value === "" || value === null || value === undefined || isNaN(num) || num < 0 || !Number.isInteger(num)) {
            newFieldErrors.stock = "Initial Stock must be a valid non-negative whole number.";
          } else {
            delete newFieldErrors.stock;
            updated.stock = num;
          }
        }

        // Buy price validation
        if (field === "buyPrice") {
          const num = Number(value);
          if (value === "" || value === null || value === undefined || isNaN(num) || num < 0) {
            newFieldErrors.buyPrice = "Current Cost must be a valid non-negative number.";
          } else {
            delete newFieldErrors.buyPrice;
            updated.buyPrice = num;
          }
        }

        // Sell price validation
        if (field === "sellPrice") {
          const num = Number(value);
          if (value === "" || value === null || value === undefined || isNaN(num) || num < 0) {
            newFieldErrors.sellPrice = "Sell Price must be a valid non-negative number.";
          } else {
            delete newFieldErrors.sellPrice;
            updated.sellPrice = num;
          }
        }

        const remainingErrors = Object.values(newFieldErrors).filter(Boolean) as string[];
        const isStillError = remainingErrors.length > 0;
        const lowerUpdatedSku = (updated.sku || "").trim().toLowerCase();
        const skuMatch = state?.products?.find((p) => (p.sku || "").trim().toLowerCase() === lowerUpdatedSku);

        return {
          ...updated,
          fieldErrors: newFieldErrors,
          errors: remainingErrors,
          type: isStillError ? "ERROR" : skuMatch ? "UPDATE" : "NEW",
          existingProduct: skuMatch,
        };
      })
    );
  }

  function handleApplyImport() {
    if (validCount === 0) return;

    const timestamp = new Date().toISOString();

    const productsToAdd: Product[] = newRows.map((r) => ({
      id: generateUniqueId("p"),
      name: r.name,
      sku: r.sku,
      brand: r.brand,
      category: r.category,
      stock: Number(r.stock) || 0,
      currentCost: Number(r.buyPrice) || 0,
      sellPrice: Number(r.sellPrice) || 0,
      lowStockThreshold: Number(r.lowStockThreshold) || 5,
      status: (r.status as "Active" | "Inactive" | "Discontinued") || "Active",
      isUniversalFit: r.isUniversalFit,
      fitments: r.fitments,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    const productsToUpdate: Product[] = [];
    const stockAdjustments: Array<{ productId: string; delta: number }> = [];

    for (const r of updateRows) {
      if (!r.existingProduct) continue;

      const rStock = Number(r.stock) || 0;

      const updatedProd: Product = {
        ...r.existingProduct,
        name: r.name,
        brand: r.brand,
        category: r.category,
        currentCost: Number(r.buyPrice) || 0,
        sellPrice: Number(r.sellPrice) || 0,
        lowStockThreshold: Number(r.lowStockThreshold) || 5,
        status: (r.status as "Active" | "Inactive" | "Discontinued") || "Active",
        isUniversalFit: r.isUniversalFit,
        fitments: r.fitments,
        stock: rStock,
        updatedAt: timestamp,
      };

      productsToUpdate.push(updatedProd);

      const delta = rStock - r.existingProduct.stock;
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
      {/* Hidden Datalists for Brand & Category Autocomplete */}
      <datalist id="existing-brands-datalist">
        {existingBrands.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <datalist id="existing-categories-datalist">
        {existingCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
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
              <span className="text-2xl font-black text-slate-800 font-mono">{rows.length}</span>
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
                <AlertCircle size={14} className={errorRows.length > 0 ? "text-red-600" : "text-slate-400"} /> Errors / Invalid
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
                All Rows ({rows.length})
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
                {errorRows.length} invalid row{errorRows.length > 1 ? "s" : ""} must be fixed or will be skipped during import.
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
                    <th className="py-3 px-3">SKU *</th>
                    <th className="py-3 px-3">Product Name *</th>
                    <th className="py-3 px-3">Brand</th>
                    <th className="py-3 px-3">Category *</th>
                    <th className="py-3 px-3">Stock *</th>
                    <th className="py-3 px-3 text-right">Cost (₹) *</th>
                    <th className="py-3 px-3 text-right">Sell (₹) *</th>
                    <th className="py-3 px-3">Status *</th>
                    <th className="py-3 px-3">Universal Fit</th>
                    <th className="py-3 px-3">Details / Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {filteredRows.map((r) => {
                    const isNew = r.type === "NEW";
                    const isUpdate = r.type === "UPDATE";
                    const isError = r.type === "ERROR";

                    const currentStockNum = typeof r.stock === "number" ? r.stock : 0;
                    const stockDelta = r.existingProduct ? currentStockNum - r.existingProduct.stock : 0;

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
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          <div>{r.sku || "—"}</div>
                          {r.fieldErrors?.sku && (
                            <span className="text-[10px] text-red-600 font-semibold block mt-0.5">
                              ❌ {r.fieldErrors.sku}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900 min-w-[160px]">
                          <div>{r.name || "—"}</div>
                          {r.nameWarning && (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded inline-block mt-0.5">
                              {r.nameWarning}
                            </span>
                          )}
                          {r.fieldErrors?.name && (
                            <span className="text-[10px] text-red-600 font-semibold block mt-0.5">
                              ❌ {r.fieldErrors.name}
                            </span>
                          )}
                        </td>
                        {/* Brand Column with Convenience Autocomplete */}
                        <td className="py-2.5 px-3 min-w-[130px]">
                          <input
                            type="text"
                            list="existing-brands-datalist"
                            value={r.brand}
                            onChange={(e) => updateRowField(r.rowNumber, "brand", e.target.value)}
                            placeholder="Brand (optional)"
                            className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-navy-600"
                          />
                        </td>
                        {/* Category Column with Convenience Autocomplete */}
                        <td className="py-2.5 px-3 min-w-[140px]">
                          <input
                            type="text"
                            list="existing-categories-datalist"
                            value={r.category}
                            onChange={(e) => updateRowField(r.rowNumber, "category", e.target.value)}
                            placeholder="Category *"
                            className={`w-full border rounded px-2 py-1 text-xs bg-white hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 ${
                              r.fieldErrors?.category ? "border-red-300 focus:ring-red-500 bg-red-50/50" : "border-slate-200 focus:ring-navy-600"
                            }`}
                          />
                          {r.fieldErrors?.category && (
                            <span className="text-[10px] text-red-600 font-semibold block mt-0.5">
                              ❌ {r.fieldErrors.category}
                            </span>
                          )}
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
                            <span className="text-slate-800">{r.stock === "" ? "—" : r.stock}</span>
                          )}
                          {r.fieldErrors?.stock && (
                            <span className="text-[10px] text-red-600 font-semibold block mt-0.5">
                              ❌ {r.fieldErrors.stock}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-right text-slate-700">
                          {r.buyPrice === "" ? "—" : `₹${Number(r.buyPrice).toLocaleString()}`}
                          {r.fieldErrors?.buyPrice && (
                            <span className="text-[10px] text-red-600 font-semibold block mt-0.5 text-left">
                              ❌ {r.fieldErrors.buyPrice}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-right text-slate-900">
                          {r.sellPrice === "" ? "—" : `₹${Number(r.sellPrice).toLocaleString()}`}
                          {r.fieldErrors?.sellPrice && (
                            <span className="text-[10px] text-red-600 font-semibold block mt-0.5 text-left">
                              ❌ {r.fieldErrors.sellPrice}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={r.status}
                            onChange={(e) => updateRowField(r.rowNumber, "status", e.target.value)}
                            className="border border-slate-200 rounded px-1.5 py-1 text-[11px] bg-white hover:bg-slate-50 focus:outline-none"
                          >
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                            <option value="Discontinued">Discontinued</option>
                          </select>
                          {r.fieldErrors?.status && (
                            <span className="text-[10px] text-red-600 font-semibold block mt-0.5">
                              ❌ {r.fieldErrors.status}
                            </span>
                          )}
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
