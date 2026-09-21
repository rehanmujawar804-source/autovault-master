"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import { X, AlertCircle, AlertTriangle } from "lucide-react";
import type { Product, VehicleFitment, FinanceCategory } from "@/types";
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

export function getMatchingSuggestions(
  query: string,
  candidates: string[],
  currentSelfName?: string
): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const selfLower = currentSelfName ? currentSelfName.trim().toLowerCase() : null;

  const exactMatches: string[] = [];
  const startsWithMatches: string[] = [];
  const includesMatches: string[] = [];

  for (const item of candidates) {
    const itemLower = item.trim().toLowerCase();

    // Avoid confusing self-match suggestion if entered text is simply its current name
    if (selfLower && itemLower === selfLower && trimmed === selfLower) {
      continue;
    }

    if (itemLower === trimmed) {
      exactMatches.push(item);
    } else if (itemLower.startsWith(trimmed)) {
      startsWithMatches.push(item);
    } else if (itemLower.includes(trimmed)) {
      includesMatches.push(item);
    }
  }

  const combined = [...exactMatches, ...startsWithMatches, ...includesMatches];
  return combined.slice(0, 8);
}

export interface SuggestionInputProps {
  label?: React.ReactNode;
  value: string;
  onChange: (val: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  id?: string;
  maxLength?: number;
}

export function SuggestionInput({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  readOnly = false,
  id,
  maxLength,
}: SuggestionInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const showSuggestions = isOpen && suggestions.length > 0 && !readOnly;

  return (
    <div className="relative" ref={containerRef}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setIsOpen(false);
          }
        }}
        maxLength={maxLength}
        placeholder={placeholder}
        className={className}
        readOnly={readOnly}
        autoComplete="off"
      />
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto z-50 py-1">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(item);
                setIsOpen(false);
              }}
              className="w-full text-left px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-navy-950 font-medium transition-colors cursor-pointer flex items-center justify-between"
            >
              <span>{item}</span>
            </button>
          ))}
        </div>
      )}
    </div>
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
  const { isOwner } = useRole();

  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formWarning, setFormWarning] = useState("");
  const [pendingCostChange, setPendingCostChange] = useState<{ updatedProduct: Product; oldCost: number; newCost: number } | null>(null);

  // Fitment entry state
  const [newFitBrand, setNewFitBrand] = useState("");
  const [newFitModel, setNewFitModel] = useState("");
  const [newFitYear, setNewFitYear] = useState("");
  const [newFitYearTo, setNewFitYearTo] = useState("");

  // Variant configuration state for display group variants
  const isVariant = Boolean(editingProduct && editingProduct.displayGroup);

  const activeGroupOptions = useMemo(() => {
    if (!isVariant || !editingProduct?.displayGroup) return [];
    const groupMembers = state.products.filter(
      (p) => p.displayGroup?.trim().toLowerCase() === editingProduct.displayGroup!.trim().toLowerCase()
    );
    return groupMembers.find((m) => m.variantOptions && m.variantOptions.length > 0)?.variantOptions || [];
  }, [isVariant, editingProduct?.displayGroup, state.products]);

  const [variantValues, setVariantValues] = useState<Record<string, string>>({});

  // Derived canonical brands map: lowercase -> canonical stored string
  const canonicalBrands = useMemo(() => {
    const map = new Map<string, string>();
    if (!state?.products) return map;
    for (const p of state.products) {
      if (!p.brand) continue;
      const trimmed = p.brand.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, trimmed);
      }
    }
    return map;
  }, [state?.products]);

  // Derived canonical categories map: lowercase -> canonical stored string
  const canonicalCategories = useMemo(() => {
    const map = new Map<string, string>();
    if (!state?.products) return map;
    for (const p of state.products) {
      if (!p.category) continue;
      const trimmed = p.category.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, trimmed);
      }
    }
    return map;
  }, [state?.products]);

  // Deduplicated list of product names
  const existingProductNames = useMemo(() => {
    const nameMap = new Map<string, string>();
    if (!state?.products) return [];
    for (const p of state.products) {
      if (!p.name) continue;
      const trimmed = p.name.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (!nameMap.has(lower)) {
        nameMap.set(lower, trimmed);
      }
    }
    return Array.from(nameMap.values());
  }, [state?.products]);

  // Dynamic suggestions for Product Name
  const nameSuggestions = useMemo(() => {
    return getMatchingSuggestions(
      form.name,
      existingProductNames,
      editingProduct?.name
    );
  }, [form.name, existingProductNames, editingProduct]);

  // Deduplicated list of product SKUs
  const existingSkus = useMemo(() => {
    const skuMap = new Map<string, string>();
    if (!state?.products) return [];
    for (const p of state.products) {
      if (!p.sku) continue;
      const trimmed = p.sku.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (!skuMap.has(lower)) {
        skuMap.set(lower, trimmed);
      }
    }
    return Array.from(skuMap.values());
  }, [state?.products]);

  // Dynamic suggestions for SKU
  const skuSuggestions = useMemo(() => {
    return getMatchingSuggestions(
      form.sku,
      existingSkus,
      editingProduct?.sku
    );
  }, [form.sku, existingSkus, editingProduct]);

  // Non-blocking duplicate product name warning
  const nameWarning = useMemo(() => {
    const trimmed = form.name.trim();
    if (!trimmed) return "";
    const exists = state.products.some(
      (p) =>
        p.name.trim().toLowerCase() === trimmed.toLowerCase() &&
        (!editingProduct || p.id !== editingProduct.id)
    );
    return exists ? `⚠️ Product name already exists: ${trimmed}` : "";
  }, [form.name, state.products, editingProduct]);

  // Non-blocking existing SKU warning
  const skuWarning = useMemo(() => {
    const trimmed = form.sku.trim();
    if (!trimmed) return "";
    const exists = state.products.some(
      (p) =>
        p.sku.trim().toLowerCase() === trimmed.toLowerCase() &&
        (!editingProduct || p.id !== editingProduct.id)
    );
    return exists ? `⚠️ Existing SKU: ${trimmed}` : "";
  }, [form.sku, state.products, editingProduct]);

  // Dynamic suggestions for Brand
  const brandSuggestions = useMemo(() => {
    const brandList = Array.from(canonicalBrands.values());
    return getMatchingSuggestions(form.brand, brandList);
  }, [form.brand, canonicalBrands]);

  // Dynamic suggestions for Category
  const categorySuggestions = useMemo(() => {
    const categoryList = Array.from(canonicalCategories.values());
    return getMatchingSuggestions(form.category, categoryList);
  }, [form.category, canonicalCategories]);

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
      setVariantValues(editingProduct.variantValues ? { ...editingProduct.variantValues } : {});
    } else {
      setForm(EMPTY_FORM);
      setVariantValues({});
    }
    setFormError("");
    setFormWarning("");
    setPendingCostChange(null);
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

    // Case-insensitive canonicalization for Brand
    let finalBrand = form.brand.trim();
    if (finalBrand) {
      const canonicalMatch = canonicalBrands.get(finalBrand.toLowerCase());
      if (canonicalMatch) {
        finalBrand = canonicalMatch;
      }
    }

    // Case-insensitive canonicalization for Category
    let rawCategory = form.category.trim();
    let finalCategory = rawCategory;
    if (rawCategory) {
      const canonicalMatch = canonicalCategories.get(rawCategory.toLowerCase());
      if (canonicalMatch) {
        finalCategory = canonicalMatch;
      }
    }

    if (editingProduct) {
      if (!finalCategory) {
        setFormError("Category is required.");
        return;
      }

      if (!form.status || !PRODUCT_STATUSES.includes(form.status)) {
        setFormError("Status is required.");
        return;
      }

      if (isVariant) {
        for (const opt of activeGroupOptions) {
          const val = variantValues[opt.name];
          if (!val || !val.trim()) {
            setFormError(`Variant must have a value for "${opt.name}".`);
            return;
          }
        }

        // Duplicate variant combination check across sibling variants in same display group
        if (editingProduct?.displayGroup && activeGroupOptions.length > 0) {
          const currentGroupLower = editingProduct.displayGroup.trim().toLowerCase();
          const targetComboKey = activeGroupOptions
            .map((opt) => (variantValues[opt.name] || "").trim().toLowerCase())
            .join(" || ");

          const conflictingSibling = state.products.find((p) => {
            if (p.id === editingProduct.id) return false;
            if (!p.displayGroup || p.displayGroup.trim().toLowerCase() !== currentGroupLower) return false;
            const siblingVals = p.variantValues || {};
            const siblingComboKey = activeGroupOptions
              .map((opt) => (siblingVals[opt.name] || "").trim().toLowerCase())
              .join(" || ");
            return siblingComboKey === targetComboKey;
          });

          if (conflictingSibling) {
            setFormError(
              `❌ Duplicate variant combination detected: Variant "${conflictingSibling.name}" already uses this option combination.`
            );
            return;
          }
        }
      }

      if (form.currentCost === "" || form.currentCost === null || form.currentCost === undefined || isNaN(Number(form.currentCost))) {
        setFormError("Current cost is required.");
        return;
      }
      const editCost = Number(form.currentCost);
      if (editCost < 0) {
        setFormError("Current cost cannot be negative.");
        return;
      }

      if (form.sellPrice === "" || form.sellPrice === null || form.sellPrice === undefined || isNaN(Number(form.sellPrice))) {
        setFormError("Sell price is required.");
        return;
      }
      const editSellPrice = Number(form.sellPrice);
      if (editSellPrice < 0) {
        setFormError("Sell price cannot be negative.");
        return;
      }

      if (form.lowStockThreshold === "" || form.lowStockThreshold === null || form.lowStockThreshold === undefined || isNaN(Number(form.lowStockThreshold))) {
        setFormError("Low stock alert is required.");
        return;
      }
      const editLowStock = Number(form.lowStockThreshold);
      if (editLowStock < 0) {
        setFormError("Low stock alert cannot be negative.");
        return;
      }
      if (!Number.isInteger(editLowStock)) {
        setFormError("Low stock alert must be a whole number.");
        return;
      }

      if (editSellPrice > 0 && editCost > 0 && editSellPrice < editCost) {
        setFormWarning(
          `Warning: Sell Price (₹${editSellPrice}) is less than Current Cost (₹${editCost}). This product will be sold at a loss.`
        );
      }

      const updatedProductObj: Product = {
        ...editingProduct,
        ...form,
        name: trimmedName,
        sku: trimmedSku,
        brand: finalBrand,
        category: finalCategory,
        status: form.status,
        currentCost: editCost,
        sellPrice: editSellPrice,
        stock: editingProduct.stock,
        lowStockThreshold: editLowStock,
        ...(isVariant
          ? { variantValues: { ...(editingProduct.variantValues || {}), ...variantValues } }
          : {}),
      };

      if (editCost !== editingProduct.currentCost) {
        setPendingCostChange({
          updatedProduct: updatedProductObj,
          oldCost: editingProduct.currentCost,
          newCost: editCost,
        });
        return;
      }

      try {
        updateProduct(updatedProductObj);
        showToast(`"${trimmedName}" updated successfully.`, "success");
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save product.";
        setFormError(msg);
      }
    } else {
      // NEW PRODUCT CREATION VALIDATION
      if (!finalCategory) {
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

      // Opening Cost is required when Initial Stock > 0
      if (stockNum > 0) {
        if (form.currentCost === "" || form.currentCost === null || form.currentCost === undefined || isNaN(Number(form.currentCost))) {
          setFormError("Opening Cost is required when Initial Stock is greater than 0.");
          return;
        }
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
          brand: finalBrand,
          category: finalCategory,
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 shrink-0">
          <h2 className="font-bold text-slate-800 text-base">
            {editingProduct ? (isVariant ? `Edit Variant — ${editingProduct.name}` : "Edit Product") : "Add New Product"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isVariant && (
              <div className="col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Variant Configuration ({editingProduct?.displayGroup})
                  </h3>
                  <span className="text-[10px] font-bold text-navy-800 bg-navy-100 border border-navy-200 px-2.5 py-0.5 rounded-full">
                    Display Group Variant
                  </span>
                </div>

                {activeGroupOptions.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No active variant options defined for this display group.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeGroupOptions.map((opt) => {
                      const currentVal = variantValues[opt.name] || "";
                      const isRetiredVal = Boolean(currentVal && !opt.values.includes(currentVal));

                      return (
                        <div key={opt.name}>
                          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
                            {opt.name} <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={currentVal}
                            onChange={(e) => {
                              setVariantValues((prev) => ({ ...prev, [opt.name]: e.target.value }));
                              setFormError("");
                            }}
                            className={INPUT}
                          >
                            <option value="">-- Select {opt.name} --</option>
                            {opt.values.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                            {isRetiredVal && (
                              <option value={currentVal}>
                                {currentVal} (Retired)
                              </option>
                            )}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="col-span-2">
              <SuggestionInput
                label="Product Name *"
                value={form.name}
                onChange={(val) => setField("name", val)}
                suggestions={nameSuggestions}
                placeholder="e.g. LED Headlight H7"
                className={INPUT}
              />
              {nameWarning && (
                <p className="text-[10px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} className="shrink-0 text-amber-600" />
                  <span>{nameWarning}</span>
                </p>
              )}
            </div>

            <div>
              <SuggestionInput
                label="SKU *"
                value={form.sku}
                onChange={(val) => setField("sku", val.toUpperCase())}
                suggestions={skuSuggestions}
                maxLength={40}
                placeholder="e.g. LED-001 (3–40 chars, alphanumeric, - or _)"
                className={`${INPUT} font-mono`}
              />
              {skuWarning && (
                <p className="text-[10px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} className="shrink-0 text-amber-600" />
                  <span>{skuWarning}</span>
                </p>
              )}
            </div>

            <div>
              <SuggestionInput
                label="Brand"
                value={form.brand}
                onChange={(val) => setField("brand", val)}
                suggestions={brandSuggestions}
                placeholder="e.g. Philips"
                className={INPUT}
              />
            </div>

            <div>
              <SuggestionInput
                label="Category *"
                value={form.category}
                onChange={(val) => setField("category", val)}
                suggestions={categorySuggestions}
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

            {!editingProduct ? (
              <>
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
                <div>
                  <FieldLabel>Opening Stock Cost (₹ per unit)</FieldLabel>
                  <input
                    type="number"
                    min="0"
                    value={form.currentCost}
                    onChange={(e) => setField("currentCost", e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 100"
                    className={INPUT}
                  />
                </div>
              </>
            ) : (
              <div>
                <FieldLabel>Current Cost (₹) * — Manual Fallback</FieldLabel>
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

          {Number(form.currentCost) > 0 && Number(form.sellPrice) > 0 && (() => {
            const cost = Number(form.currentCost);
            const sell = Number(form.sellPrice);
            const unitProfit = sell - cost;
            const marginPct = sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0;
            const containerStyle = unitProfit > 0
              ? "bg-green-50 border-green-200 text-green-700"
              : unitProfit === 0
              ? "bg-slate-100 border-slate-200 text-slate-700"
              : "bg-red-50 border-red-200 text-red-700";

            return (
              <div className={`border rounded-lg px-4 py-2.5 text-xs ${containerStyle}`}>
                <span className="font-semibold">
                  Margin: {marginPct}% &nbsp;|&nbsp; Profit per unit: {
                    unitProfit < 0 ? `-₹${Math.abs(unitProfit).toLocaleString()}` : `₹${unitProfit.toLocaleString()}`
                  }
                </span>
              </div>
            );
          })()}

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
                className="w-5 h-5 text-navy-950 rounded border-slate-300 focus:ring-navy-600/30 cursor-pointer accent-navy-950"
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
                      placeholder="Make"
                      value={newFitBrand}
                      onChange={(e) => setNewFitBrand(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-600/25 focus:border-navy-600 transition-all"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Model"
                      value={newFitModel}
                      onChange={(e) => setNewFitModel(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-600/25 focus:border-navy-600 transition-all"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Year From"
                      value={newFitYear}
                      onChange={(e) => setNewFitYear(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-600/25 focus:border-navy-600 transition-all"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Year To"
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

        <div className="flex gap-3 p-5 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer bg-white"
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

      {/* CHANGE 4 — Current Cost Administrative Change Confirmation Dialog */}
      {pendingCostChange && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[70] animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Confirm Current Cost Update</h3>
                <p className="text-xs text-slate-500 font-medium">Administrative Inventory Cost Correction</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed space-y-2">
              <p className="font-semibold text-slate-700">
                Changing Current Cost from <span className="font-bold text-slate-900">₹{pendingCostChange.oldCost.toLocaleString()}</span> to <span className="font-bold text-amber-700">₹{pendingCostChange.newCost.toLocaleString()}</span> will immediately affect:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 font-medium">
                <li>Inventory Value</li>
                <li>Gross Profit</li>
                <li>Margin %</li>
                <li>Inventory Intelligence Dashboard</li>
                <li>Financial inventory valuation</li>
              </ul>
              <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 font-medium mt-2">
                This should only be used to correct costing errors.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingCostChange(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    updateProduct(pendingCostChange.updatedProduct);
                    showToast(`"${pendingCostChange.updatedProduct.name}" cost updated successfully.`, "success");
                    setPendingCostChange(null);
                    onClose();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Failed to save product.";
                    setFormError(msg);
                    setPendingCostChange(null);
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow transition-all cursor-pointer"
              >
                Update Cost
              </button>
            </div>
          </div>
        </div>
      )}
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
  const { adjustStock, updateProduct, showToast } = useStore();
  const [stockDelta, setStockDelta] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [recordExpense, setRecordExpense] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState<FinanceCategory>("Other Operating Expense");
  const [openingCostInput, setOpeningCostInput] = useState("");

  useEffect(() => {
    setStockDelta("");
    setReasonNote("");
    setRecordExpense(false);
    setExpenseCategory("Other Operating Expense");
    setOpeningCostInput("");
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
    if (direction === "add" && product.currentCost === 0) {
      const costVal = Number(openingCostInput);
      if (isNaN(costVal) || costVal < 0 || openingCostInput.trim() === "") {
        showToast("Please enter a valid Opening Cost (₹ per unit) for this product.", "error");
        return;
      }
      try {
        updateProduct({ ...product, currentCost: costVal });
      } catch {
        showToast("Failed to update opening cost.", "error");
        return;
      }
    }
    try {
      adjustStock(
        product.id,
        direction === "add" ? delta : -delta,
        trimmedNote,
        direction === "remove" ? recordExpense : false,
        expenseCategory
      );
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

          {product.currentCost === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5 text-xs">
              <FieldLabel>Opening Cost (₹ per unit) *</FieldLabel>
              <p className="text-amber-800 text-[11px] font-medium">
                Current Cost is ₹0. Entering opening cost initializes unit cost for COGS and inventory valuation when adding stock.
              </p>
              <input
                type="number"
                min="0"
                placeholder="e.g. 120"
                value={openingCostInput}
                onChange={(e) => setOpeningCostInput(e.target.value)}
                className={INPUT}
              />
            </div>
          )}

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

          {Number(stockDelta) > 0 && (
            <div className="space-y-2 border-t border-slate-150 pt-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={recordExpense}
                  onChange={(e) => setRecordExpense(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-navy-950 focus:ring-navy-600 cursor-pointer accent-navy-950"
                />
                <span>Record Financial Loss on Removal (Write-off Expense)</span>
              </label>
              <p className="text-[10px] text-slate-400 pl-6 font-medium">
                Applies only when removing stock.
              </p>
              {recordExpense && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 text-xs">
                  <p className="text-amber-800 font-medium">
                    Logs an operating expense of ₹{((Number(stockDelta) || 0) * product.currentCost).toLocaleString()} ({stockDelta} units × ₹{product.currentCost} current cost).
                  </p>
                  <div>
                    <FieldLabel>Expense Category</FieldLabel>
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value as FinanceCategory)}
                      className={INPUT}
                    >
                      <option value="Other Operating Expense">Other Operating Expense</option>
                      <option value="Maintenance & Repair">Maintenance & Repair</option>
                      <option value="Office & Shop Expense">Office & Shop Expense</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={() => handleStockAdjust("remove")}
            disabled={!stockDelta || Number(stockDelta) <= 0 || !reasonNote.trim()}
            title="Remove stock quantity from current inventory"
            aria-label="Remove stock"
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            &minus; Remove
          </button>
          <button
            type="button"
            onClick={() => handleStockAdjust("add")}
            disabled={
              !stockDelta ||
              Number(stockDelta) <= 0 ||
              !reasonNote.trim() ||
              (product.currentCost === 0 && (!openingCostInput.trim() || isNaN(Number(openingCostInput)) || Number(openingCostInput) < 0))
            }
            title="Add stock quantity to current inventory"
            aria-label="Add stock"
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}
