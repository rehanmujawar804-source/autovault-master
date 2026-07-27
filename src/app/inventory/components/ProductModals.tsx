"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { X, AlertCircle, AlertTriangle } from "lucide-react";
import type { Product, VehicleFitment } from "@/types";
import {
  toTitleCase,
  addOrMergeFitment,
  formatFitmentDisplay,
} from "@/lib/fitmentUtils";

const PRODUCT_STATUSES = ["Active", "Inactive", "Discontinued"] as const;
type ProductStatus = (typeof PRODUCT_STATUSES)[number];

const SKU_REGEX = /^[A-Za-z0-9_-]{3,40}$/;

const EMPTY_FORM = {
  name: "",
  sku: "",
  brand: "",
  category: "",
  status: "Active" as ProductStatus,
  stock: 0 as number | "",
  currentCost: 0 as number | "",
  sellPrice: 0 as number | "",
  lowStockThreshold: 5 as number | "",
  fitments: [] as VehicleFitment[],
  isUniversalFit: false,
};

type ProductForm = typeof EMPTY_FORM;

const INPUT =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-400";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
      {children}
    </label>
  );
}

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingProduct: Product | null;
}

export function ProductFormModal({
  isOpen,
  onClose,
  editingProduct,
}: ProductFormModalProps) {
  const { state, addProduct, updateProduct, showToast } = useStore();

  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formWarning, setFormWarning] = useState("");

  // Fitment entry state
  const [newFitBrand, setNewFitBrand] = useState("");
  const [newFitModel, setNewFitModel] = useState("");
  const [newFitYear, setNewFitYear] = useState("");
  const [newFitYearTo, setNewFitYearTo] = useState("");

  useEffect(() => {
    if (editingProduct) {
      setForm({
        name: editingProduct.name,
        sku: editingProduct.sku,
        brand: editingProduct.brand || "",
        category: editingProduct.category || "",
        status: (editingProduct.status as ProductStatus) || "Active",
        stock: editingProduct.stock,
        currentCost: editingProduct.currentCost,
        sellPrice: editingProduct.sellPrice,
        lowStockThreshold: editingProduct.lowStockThreshold || 5,
        fitments: editingProduct.fitments || [],
        isUniversalFit: editingProduct.isUniversalFit ?? false,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setFormError("");
    setFormWarning("");
    setNewFitBrand("");
    setNewFitModel("");
    setNewFitYear("");
    setNewFitYearTo("");
  }, [editingProduct, isOpen]);

  if (!isOpen) return null;

  function setField<K extends keyof ProductForm>(key: K, val: ProductForm[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setFormError("");
    setFormWarning("");
  }

  function handleSave() {
    setFormError("");
    setFormWarning("");

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError("Product name is required.");
      return;
    }
    if (trimmedName.length < 3) {
      setFormError("Product name must be at least 3 characters.");
      return;
    }
    if (trimmedName.length > 100) {
      setFormError("Product name must not exceed 100 characters.");
      return;
    }

    const trimmedSku = form.sku.trim();
    if (!trimmedSku) {
      setFormError("SKU is required.");
      return;
    }
    if (!SKU_REGEX.test(trimmedSku)) {
      setFormError(
        "SKU must be 3–40 characters and contain only letters, numbers, hyphens (-), or underscores (_)."
      );
      return;
    }

    const duplicateSKU = state.products.find(
      (p) =>
        p.sku.trim().toLowerCase() === trimmedSku.toLowerCase() &&
        (!editingProduct || p.id !== editingProduct.id)
    );
    if (duplicateSKU) {
      setFormError(
        `SKU "${trimmedSku}" is already used by "${duplicateSKU.name}". SKU must be unique.`
      );
      return;
    }

    if (editingProduct) {
      const editCost = form.currentCost === "" ? 0 : Number(form.currentCost);
      const editSellPrice = form.sellPrice === "" ? 0 : Number(form.sellPrice);
      const editStock = form.stock === "" ? 0 : Number(form.stock);
      const editLowStock = form.lowStockThreshold === "" ? 5 : Number(form.lowStockThreshold);

      if (editCost < 0) {
        setFormError("Current cost cannot be negative.");
        return;
      }
      if (editSellPrice < 0) {
        setFormError("Sell price cannot be negative.");
        return;
      }

      if (!Number.isInteger(editStock) || editStock < 0) {
        setFormError("Stock must be a whole number (0 or more).");
        return;
      }
      if (!Number.isInteger(editLowStock) || editLowStock < 1) {
        setFormError("Low stock threshold must be a whole number of at least 1.");
        return;
      }

      if (editSellPrice > 0 && editCost > 0 && editSellPrice < editCost) {
        setFormWarning(
          `Warning: Sell Price (₹${editSellPrice}) is less than Current Cost (₹${editCost}). This product will be sold at a loss.`
        );
      }

      try {
        updateProduct({
          ...editingProduct,
          ...form,
          name: trimmedName,
          sku: editingProduct.sku,
          brand: form.brand.trim(),
          category: form.category.trim(),
          currentCost: editCost,
          sellPrice: editSellPrice,
          stock: editStock,
          lowStockThreshold: editLowStock,
        });
        showToast(`"${trimmedName}" updated successfully.`, "success");
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save product.";
        setFormError(msg);
      }
    } else {
      // NEW PRODUCT CREATION VALIDATION
      const trimmedCategory = form.category.trim();
      if (!trimmedCategory) {
        setFormError("Category is required.");
        return;
      }

      if (form.stock === "" || form.stock === null || form.stock === undefined || isNaN(Number(form.stock))) {
        setFormError("Initial stock is required.");
        return;
      }
      const stockNum = Number(form.stock);
      if (stockNum < 0) {
        setFormError("Initial stock cannot be negative.");
        return;
      }
      if (!Number.isInteger(stockNum)) {
        setFormError("Initial stock must be a whole number (0 or more).");
        return;
      }

      if (form.sellPrice === "" || form.sellPrice === null || form.sellPrice === undefined || isNaN(Number(form.sellPrice))) {
        setFormError("Sell price is required.");
        return;
      }
      const sellPriceNum = Number(form.sellPrice);
      if (sellPriceNum < 0) {
        setFormError("Sell price cannot be negative.");
        return;
      }

      if (form.lowStockThreshold === "" || form.lowStockThreshold === null || form.lowStockThreshold === undefined || isNaN(Number(form.lowStockThreshold))) {
        setFormError("Low stock alert is required.");
        return;
      }
      const lowStockNum = Number(form.lowStockThreshold);
      if (lowStockNum < 0) {
        setFormError("Low stock alert cannot be negative.");
        return;
      }
      if (!Number.isInteger(lowStockNum)) {
        setFormError("Low stock alert must be a whole number.");
        return;
      }

      const costNum = form.currentCost === "" ? 0 : Number(form.currentCost);
      if (sellPriceNum > 0 && costNum > 0 && sellPriceNum < costNum) {
        setFormWarning(
          `Warning: Sell Price (₹${sellPriceNum}) is less than Current Cost (₹${costNum}). This product will be sold at a loss.`
        );
      }

      try {
        addProduct({
          ...form,
          name: trimmedName,
          sku: trimmedSku,
          brand: form.brand.trim(),
          category: trimmedCategory,
          status: form.status || "Active",
          stock: stockNum,
          currentCost: costNum,
          sellPrice: sellPriceNum,
          lowStockThreshold: lowStockNum,
        });
        showToast(`"${trimmedName}" added successfully.`, "success");
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save product.";
        setFormError(msg);
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="font-bold text-slate-800 text-base">
            {editingProduct ? "Edit Product" : "Add New Product"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {formError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}
          {formWarning && !formError && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{formWarning}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <FieldLabel>Product Name *</FieldLabel>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="e.g. LED Headlight H7"
                className={INPUT}
              />
            </div>

            <div>
              <FieldLabel>SKU *{editingProduct && <span className="ml-1 text-slate-400 normal-case font-normal">(read-only)</span>}</FieldLabel>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => !editingProduct && setField("sku", e.target.value.toUpperCase())}
                readOnly={!!editingProduct}
                maxLength={40}
                placeholder="e.g. LED-001 (3–40 chars, alphanumeric, - or _)"
                className={`${INPUT} ${editingProduct ? "bg-slate-100 text-slate-500 cursor-not-allowed select-all" : "font-mono"}`}
              />
            </div>

            <div>
              <FieldLabel>Brand</FieldLabel>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setField("brand", e.target.value)}
                placeholder="e.g. Philips"
                className={INPUT}
              />
            </div>

            <div>
              <FieldLabel>Category *</FieldLabel>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setField("category", e.target.value)}
                placeholder="e.g. Lights"
                className={INPUT}
              />
            </div>

            <div className="col-span-1">
              <FieldLabel>Status</FieldLabel>
              <select
                value={form.status}
                onChange={(e) => setField("status", e.target.value as ProductStatus)}
                className={INPUT}
              >
                {PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {!editingProduct && (
              <div>
                <FieldLabel>Initial Stock *</FieldLabel>
                <input
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => setField("stock", e.target.value === "" ? "" : Number(e.target.value))}
                  className={INPUT}
                />
              </div>
            )}

            {editingProduct && (
              <div>
                <FieldLabel>Current Cost (₹) — Manual Fallback</FieldLabel>
                <input
                  type="number"
                  min="0"
                  value={form.currentCost}
                  onChange={(e) => setField("currentCost", e.target.value === "" ? "" : Number(e.target.value))}
                  className={INPUT}
                />
              </div>
            )}

            <div>
              <FieldLabel>Sell Price (₹) *</FieldLabel>
              <input
                type="number"
                min="0"
                value={form.sellPrice}
                onChange={(e) => setField("sellPrice", e.target.value === "" ? "" : Number(e.target.value))}
                className={INPUT}
              />
            </div>

            <div>
              <FieldLabel>Low Stock Alert (units) *</FieldLabel>
              <input
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={(e) => setField("lowStockThreshold", e.target.value === "" ? "" : Number(e.target.value))}
                className={INPUT}
              />
            </div>
          </div>

          {Number(form.currentCost) > 0 && Number(form.sellPrice) > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-xs">
              <span className="text-green-700 font-medium">
                Margin:{" "}
                {Math.round(((Number(form.sellPrice) - Number(form.currentCost)) / Number(form.sellPrice)) * 100)}
                % &nbsp;|&nbsp; Profit per unit: ₹
                {(Number(form.sellPrice) - Number(form.currentCost)).toLocaleString()}
              </span>
            </div>
          )}

          {/* Universal Fit Toggle Section */}
          <div className="border-t border-slate-150 pt-4 space-y-2">
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
              <div>
                <label htmlFor="isUniversalFitToggle" className="text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
                  <span>Universal Fit</span>
                  {form.isUniversalFit && (
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-200">
                      Active
                    </span>
                  )}
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                  This product is compatible with all vehicle makes and models.
                </p>
              </div>
              <input
                id="isUniversalFitToggle"
                type="checkbox"
                checked={form.isUniversalFit ?? false}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  if (isChecked) {
                    if (form.fitments.length > 0) {
                      showToast("Universal Fit enabled. Specific vehicle fitments have been cleared.", "info");
                    }
                    setForm((prev) => ({
                      ...prev,
                      isUniversalFit: true,
                      fitments: [],
                    }));
                    setNewFitBrand("");
                    setNewFitModel("");
                    setNewFitYear("");
                    setNewFitYearTo("");
                  } else {
                    setForm((prev) => ({
                      ...prev,
                      isUniversalFit: false,
                    }));
                  }
                }}
                className="w-4.5 h-4.5 text-navy-950 rounded border-slate-300 focus:ring-navy-600/30 cursor-pointer accent-navy-950"
              />
            </div>
          </div>

          <div className="border-t border-slate-150 pt-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Vehicle Compatibility (Fitment)
            </h3>

            {form.isUniversalFit ? (
              <div className="bg-purple-50 border border-purple-200 text-purple-900 text-xs p-3 rounded-xl flex items-start gap-2">
                <AlertCircle size={15} className="text-purple-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Universal Fit is enabled.</strong> This product automatically applies to all vehicle makes and models. Specific vehicle fitments cannot coexist with Universal Fit.
                </span>
              </div>
            ) : form.fitments.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                No specific vehicles configured for this product.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200/60">
                {form.fitments.map((fit, idx) => (
                  <span
                    key={idx}
                    className="bg-amber-50 text-amber-800 border border-amber-200 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-semibold"
                  >
                    {fit.brand} {fit.model} ({fit.yearTo && fit.yearTo !== fit.year ? `${fit.year}–${fit.yearTo}` : fit.year})
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          fitments: prev.fitments.filter((_, i) => i !== idx),
                        }));
                      }}
                      className="text-slate-400 hover:text-red-650 focus:outline-none transition-colors cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {!form.isUniversalFit && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-600">
                    Add Compatible Vehicle Model
                  </p>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Leave Year To empty for a single-year fitment.
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <input
                      type="text"
                      placeholder="Brand (Honda)"
                      value={newFitBrand}
                      onChange={(e) => setNewFitBrand(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-600/25 focus:border-navy-600 transition-all"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Model (City)"
                      value={newFitModel}
                      onChange={(e) => setNewFitModel(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-600/25 focus:border-navy-600 transition-all"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Year From (2018)"
                      value={newFitYear}
                      onChange={(e) => setNewFitYear(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-600/25 focus:border-navy-600 transition-all"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Year To (2022)"
                      value={newFitYearTo}
                      onChange={(e) => setNewFitYearTo(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-600/25 focus:border-navy-600 transition-all"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full bg-navy-950 hover:bg-navy-800 text-white text-xs py-2 rounded-lg font-semibold transition-colors cursor-pointer"
                  onClick={() => {
                    if (form.isUniversalFit) {
                      showToast("Cannot add specific fitments to a Universal Fit product.", "error");
                      return;
                    }

                    const brand = toTitleCase(newFitBrand);
                    const model = toTitleCase(newFitModel);
                    const year = newFitYear.trim();
                    const yearToRaw = newFitYearTo.trim();

                    if (!brand || !model || !year) {
                      showToast("Please fill in Brand, Model, and Year to add fitment.", "error");
                      return;
                    }

                    const YEAR_REGEX = /^\d{4}$/;
                    if (!YEAR_REGEX.test(year)) {
                      showToast("Year must be a valid 4-digit year (e.g. 2018).", "error");
                      return;
                    }

                    let yearTo: string | undefined = undefined;
                    if (yearToRaw) {
                      if (!YEAR_REGEX.test(yearToRaw)) {
                        showToast("Year To must be a valid 4-digit year (e.g. 2022).", "error");
                        return;
                      }
                      if (Number(yearToRaw) < Number(year)) {
                        showToast("Year To must be greater than or equal to Year.", "error");
                        return;
                      }
                      if (yearToRaw !== year) {
                        yearTo = yearToRaw;
                      }
                    }

                    const newFitment: VehicleFitment = {
                      brand,
                      model,
                      year,
                      ...(yearTo ? { yearTo } : {}),
                    };

                    const result = addOrMergeFitment(form.fitments, newFitment);

                    if (result.isRedundant) {
                      showToast("This vehicle fitment is already covered by an existing range.", "info");
                      return;
                    }

                    setForm((prev) => ({
                      ...prev,
                      fitments: result.fitments,
                    }));

                    if (result.wasMerged) {
                      showToast("Vehicle fitment range updated and merged successfully.", "success");
                    } else {
                      showToast("Vehicle fitment added.", "success");
                    }

                    setNewFitBrand("");
                    setNewFitModel("");
                    setNewFitYear("");
                    setNewFitYearTo("");
                  }}
                >
                  + Add Compatible Vehicle
                </button>
            </div>
          )}
        </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 bg-navy-950 hover:bg-navy-800 text-white py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            {editingProduct ? "Save Changes" : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AdjustStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

export function AdjustStockModal({
  isOpen,
  onClose,
  product,
}: AdjustStockModalProps) {
  const { adjustStock, showToast } = useStore();
  const [stockDelta, setStockDelta] = useState("");
  const [reasonNote, setReasonNote] = useState("");

  useEffect(() => {
    setStockDelta("");
    setReasonNote("");
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  function handleStockAdjust(direction: "add" | "remove") {
    if (!product) return;
    const delta = Number(stockDelta);
    if (isNaN(delta) || delta <= 0 || !Number.isInteger(delta)) {
      showToast("Please enter a valid positive whole number for stock quantity.", "error");
      return;
    }
    const trimmedNote = reasonNote.trim();
    if (!trimmedNote) {
      showToast("Please provide a reason or note for this stock adjustment.", "error");
      return;
    }
    if (direction === "remove" && delta > product.stock) {
      showToast(`Cannot adjust stock down by ${delta}. Only ${product.stock} units available.`, "error");
      return;
    }
    try {
      adjustStock(product.id, direction === "add" ? delta : -delta, trimmedNote);
      showToast(`Adjusted stock for "${product.name}" successfully!`, "success");
      onClose();
    } catch (err) {
      showToast("Failed to adjust stock.", "error");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div>
            <h2 className="font-bold text-slate-800 text-base">Adjust Stock</h2>
            <p className="text-xs text-slate-500 mt-0.5">{product.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">Current Stock</p>
            <p className="text-3xl font-bold text-slate-800">{product.stock}</p>
            <p className="text-xs text-slate-400 mt-0.5 font-semibold">units</p>
          </div>

          <div>
            <FieldLabel>Quantity to Add or Remove *</FieldLabel>
            <input
              type="number"
              min="1"
              placeholder="Enter units..."
              value={stockDelta}
              onChange={(e) => setStockDelta(e.target.value)}
              className={INPUT}
              autoFocus
            />
          </div>

          <div>
            <FieldLabel>Reason / Note *</FieldLabel>
            <input
              type="text"
              placeholder="e.g. Stock count correction, damaged item, customer return..."
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              className={INPUT}
            />
          </div>

          {Number(stockDelta) > 0 && (
            <div className="grid grid-cols-2 gap-3 text-center text-sm">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-xs text-green-600 mb-1">After Adding</p>
                <p className="font-bold text-green-700">
                  {product.stock + Number(stockDelta)}
                </p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs text-red-600 mb-1">After Removing</p>
                <p className="font-bold text-red-700">
                  {Math.max(0, product.stock - Number(stockDelta))}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={() => handleStockAdjust("remove")}
            disabled={!stockDelta || Number(stockDelta) <= 0 || !reasonNote.trim()}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            &minus; Remove
          </button>
          <button
            type="button"
            onClick={() => handleStockAdjust("add")}
            disabled={!stockDelta || Number(stockDelta) <= 0 || !reasonNote.trim()}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}
