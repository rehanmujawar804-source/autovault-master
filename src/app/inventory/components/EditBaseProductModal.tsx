"use client";

import { useState, useEffect, useMemo } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import { X, Plus, Trash2, AlertCircle, AlertTriangle, Check, Layers, Package } from "lucide-react";
import type { Product, VariantOptionDefinition } from "@/types";

const INPUT =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-400";

interface EditBaseProductModalProps {
  isOpen: boolean;
  groupName: string | null;
  onClose: () => void;
}

export function EditBaseProductModal({
  isOpen,
  groupName,
  onClose,
}: EditBaseProductModalProps) {
  const { state, updateProduct, showToast } = useStore();
  const { isOwner } = useRole();

  const [displayGroupName, setDisplayGroupName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [variantOptions, setVariantOptions] = useState<VariantOptionDefinition[]>([]);
  const [newValueInputs, setNewValueInputs] = useState<Record<number, string>>({});
  const [variantValuesMap, setVariantValuesMap] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);

  // Existing member products of this group
  const memberProducts = useMemo(() => {
    if (!groupName) return [];
    return state.products.filter(
      (p) => p.displayGroup?.trim().toLowerCase() === groupName.trim().toLowerCase()
    );
  }, [state.products, groupName]);

  // Existing categories & brands for suggestions
  const existingCategories = useMemo(() => {
    return Array.from(new Set(state.products.map((p) => p.category).filter(Boolean))).sort();
  }, [state.products]);

  const existingBrands = useMemo(() => {
    return Array.from(new Set(state.products.map((p) => p.brand).filter(Boolean))).sort();
  }, [state.products]);

  // Check duplicate group name warning (non-blocking)
  const duplicateGroupWarning = useMemo(() => {
    const trimmedNew = displayGroupName.trim().toLowerCase();
    const trimmedOriginal = (groupName || "").trim().toLowerCase();
    if (!trimmedNew || trimmedNew === trimmedOriginal) return null;

    const exists = state.products.some(
      (p) => p.displayGroup && p.displayGroup.trim().toLowerCase() === trimmedNew
    );
    return exists ? `⚠️ A display group with the name "${displayGroupName.trim()}" already exists` : null;
  }, [displayGroupName, groupName, state.products]);

  useEffect(() => {
    if (isOpen && groupName) {
      setDisplayGroupName(groupName);
      setError(null);

      const firstMember = memberProducts[0];
      setBrand(firstMember?.brand || "");
      setCategory(firstMember?.category || "");

      // Find initial options from members or default to empty
      const existingOpts = memberProducts.find(
        (m) => m.variantOptions && m.variantOptions.length > 0
      )?.variantOptions;

      if (existingOpts && existingOpts.length > 0) {
        setVariantOptions(JSON.parse(JSON.stringify(existingOpts)));
      } else {
        setVariantOptions([]);
      }

      // Initialize variantValuesMap for existing member products
      const valMap: Record<string, Record<string, string>> = {};
      memberProducts.forEach((m) => {
        valMap[m.id] = m.variantValues ? { ...m.variantValues } : {};
      });
      setVariantValuesMap(valMap);
      setNewValueInputs({});
    }
  }, [isOpen, groupName, memberProducts]);

  if (!isOpen || !groupName || !isOwner) return null;

  // ── Option Handlers ───────────────────────────────────────────────────────

  function handleAddOption() {
    setError(null);
    if (variantOptions.length >= 5) {
      setError("❌ Maximum 5 variant options allowed");
      return;
    }
    setVariantOptions([...variantOptions, { name: "", values: [] }]);
  }

  function handleRemoveOption(index: number) {
    setError(null);
    const next = [...variantOptions];
    next.splice(index, 1);
    setVariantOptions(next);
  }

  function handleOptionNameChange(index: number, name: string) {
    setError(null);
    const oldName = variantOptions[index]?.name;
    const next = [...variantOptions];
    next[index].name = name;
    setVariantOptions(next);

    const oldTrimmed = (oldName || "").trim();
    const newTrimmed = name.trim();

    if (oldTrimmed && newTrimmed && oldTrimmed !== newTrimmed) {
      setVariantValuesMap((prev) => {
        const updatedMap: Record<string, Record<string, string>> = {};
        for (const pid of Object.keys(prev)) {
          const itemVals = { ...prev[pid] };
          if (oldTrimmed in itemVals) {
            const val = itemVals[oldTrimmed];
            delete itemVals[oldTrimmed];
            itemVals[newTrimmed] = val;
          } else {
            const existingKey = Object.keys(itemVals).find(
              (k) => k.toLowerCase() === oldTrimmed.toLowerCase()
            );
            if (existingKey) {
              const val = itemVals[existingKey];
              delete itemVals[existingKey];
              itemVals[newTrimmed] = val;
            }
          }
          updatedMap[pid] = itemVals;
        }
        return updatedMap;
      });
    }
  }

  function handleAddValue(optionIndex: number) {
    setError(null);
    const rawValue = (newValueInputs[optionIndex] || "").trim();
    if (!rawValue) {
      setError("❌ Value is required");
      return;
    }

    const currentOption = variantOptions[optionIndex];
    const exists = currentOption.values.some(
      (v) => v.trim().toLowerCase() === rawValue.toLowerCase()
    );

    if (exists) {
      setError("❌ Value already exists");
      return;
    }

    const next = [...variantOptions];
    next[optionIndex].values.push(rawValue);
    setVariantOptions(next);

    setNewValueInputs({
      ...newValueInputs,
      [optionIndex]: "",
    });
  }

  function handleRemoveValue(optionIndex: number, valueIndex: number) {
    setError(null);
    const next = [...variantOptions];
    next[optionIndex].values.splice(valueIndex, 1);
    setVariantOptions(next);
  }

  function handleVariantValueSelect(productId: string, optionName: string, value: string) {
    setError(null);
    setVariantValuesMap((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        [optionName]: value,
      },
    }));
  }

  // ── Validation & Save ─────────────────────────────────────────────────────

  function handleSave() {
    setError(null);

    const trimmedGroupName = displayGroupName.trim();
    if (!trimmedGroupName) {
      setError("❌ Display Group Name is required");
      return;
    }

    const trimmedCategory = category.trim();
    if (!trimmedCategory) {
      setError("❌ Category is required");
      return;
    }

    const trimmedBrand = brand.trim();

    // Option validations
    if (variantOptions.length === 0) {
      setError("❌ At least one variant option is required");
      return;
    }

    if (variantOptions.length > 5) {
      setError("❌ Maximum 5 variant options allowed");
      return;
    }

    const optionNamesSet = new Set<string>();
    for (let i = 0; i < variantOptions.length; i++) {
      const opt = variantOptions[i];
      const optName = opt.name.trim();

      if (!optName) {
        setError(`❌ Option name is required for Option ${i + 1}`);
        return;
      }

      const lowerName = optName.toLowerCase();
      if (optionNamesSet.has(lowerName)) {
        setError(`❌ Option already exists: "${optName}"`);
        return;
      }
      optionNamesSet.add(lowerName);

      if (opt.values.length === 0) {
        setError(`❌ At least one value is required for variant option "${optName}"`);
        return;
      }
    }

    // Canonical Brand and Category resolution
    const matchedBrand = trimmedBrand
      ? existingBrands.find((b) => b.toLowerCase() === trimmedBrand.toLowerCase()) || trimmedBrand
      : "";
    const matchedCategory = existingCategories.find((c) => c.toLowerCase() === trimmedCategory.toLowerCase()) || trimmedCategory;

    // Existing variants completion check
    for (const m of memberProducts) {
      const pVals = variantValuesMap[m.id] || m.variantValues || {};
      for (const opt of variantOptions) {
        const optName = opt.name.trim();
        const selectedVal = pVals[optName];
        if (!selectedVal || !selectedVal.trim()) {
          setError(`❌ Variant "${m.name}" must have a value for "${optName}".`);
          return;
        }
      }
    }

    // Check for duplicate variant combinations among member products
    const combinationMap = new Map<string, Product>();
    for (const m of memberProducts) {
      const pVals = variantValuesMap[m.id] || m.variantValues || {};
      const comboKey = variantOptions
        .map((opt) => (pVals[opt.name.trim()] || "").trim().toLowerCase())
        .join(" || ");

      if (combinationMap.has(comboKey)) {
        const existingMember = combinationMap.get(comboKey)!;
        setError(
          `❌ Duplicate variant combination detected: "${existingMember.name}" and "${m.name}" have identical active option values.`
        );
        return;
      }
      combinationMap.set(comboKey, m);
    }

    // Clean options array
    const cleanedOptions: VariantOptionDefinition[] = variantOptions.map((opt) => ({
      name: opt.name.trim(),
      values: opt.values.map((v) => v.trim()),
    }));

    // Commit atomic batch update
    memberProducts.forEach((m) => {
      const rawVals = variantValuesMap[m.id] || m.variantValues || {};
      const pVals: Record<string, string> = { ...rawVals };

      const updated: Product = {
        ...m,
        displayGroup: trimmedGroupName,
        brand: matchedBrand,
        category: matchedCategory,
        variantOptions: cleanedOptions,
        variantValues: pVals,
      };
      updateProduct(updated);
    });

    showToast(`Base Product "${trimmedGroupName}" saved successfully`, "success");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-navy-800 border border-navy-700 flex items-center justify-center text-amber-400">
              <Package size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Edit Base Product / Display Group
              </h2>
              <p className="text-xs text-slate-400">
                {groupName} • {memberProducts.length} member variants
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Validation Error Alert */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-4 py-3 rounded-xl flex items-center gap-2 animate-fadeIn">
              <AlertCircle size={16} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Duplicate Group Name Warning Alert */}
          {duplicateGroupWarning && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold px-4 py-3 rounded-xl flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-amber-600" />
              <span>{duplicateGroupWarning}</span>
            </div>
          )}

          {/* Shared Metadata Section */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-1 border-b border-slate-200">
              Base Product Metadata
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Display Group Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={displayGroupName}
                  onChange={(e) => { setDisplayGroupName(e.target.value); setError(null); }}
                  placeholder="e.g. Apollo Amazer"
                  className={INPUT}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Brand
                </label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => { setBrand(e.target.value); setError(null); }}
                  list="base-brand-suggestions"
                  placeholder="e.g. Apollo"
                  className={INPUT}
                />
                <datalist id="base-brand-suggestions">
                  {existingBrands.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => { setCategory(e.target.value); setError(null); }}
                  list="base-category-suggestions"
                  placeholder="e.g. Tyre"
                  className={INPUT}
                />
                <datalist id="base-category-suggestions">
                  {existingCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* Variant Options Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  Variant Options
                  <span className="text-[10px] font-bold bg-navy-100 text-navy-800 px-2 py-0.5 rounded-full border border-navy-200">
                    {variantOptions.length} / 5 Max
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Define up to 5 variant options (e.g. Size, Color) and allowed values.
                </p>
              </div>
              <button
                onClick={handleAddOption}
                disabled={variantOptions.length >= 5}
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                  variantOptions.length >= 5
                    ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-navy-950 hover:bg-navy-900 border-navy-950 text-white shadow-xs"
                }`}
              >
                <Plus size={14} />
                Add Option
              </button>
            </div>

            {/* Option Cards */}
            {variantOptions.length === 0 ? (
              <div className="p-6 border border-dashed border-slate-300 rounded-xl text-center bg-slate-50/50">
                <p className="text-xs text-slate-500 font-medium">
                  No variant options configured yet. Click <strong className="text-slate-700">+ Add Option</strong> to define options like Size or Color.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {variantOptions.map((opt, optIdx) => (
                  <div
                    key={optIdx}
                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 max-w-xs">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Option {optIdx + 1} Name
                        </label>
                        <input
                          type="text"
                          value={opt.name}
                          onChange={(e) => handleOptionNameChange(optIdx, e.target.value)}
                          placeholder="e.g. Size, Color, Pattern"
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 font-semibold"
                        />
                      </div>
                      <button
                        onClick={() => handleRemoveOption(optIdx)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                        title="Remove Option"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Values Pill List */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        Allowed Values
                      </label>

                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {opt.values.length === 0 ? (
                          <span className="text-[11px] text-slate-400 italic">No values added yet.</span>
                        ) : (
                          opt.values.map((val, valIdx) => (
                            <span
                              key={valIdx}
                              className="inline-flex items-center gap-1 text-xs font-semibold bg-navy-50 text-navy-900 border border-navy-200 px-2.5 py-1 rounded-lg"
                            >
                              {val}
                              <button
                                onClick={() => handleRemoveValue(optIdx, valIdx)}
                                className="text-navy-400 hover:text-red-600 p-0.5 rounded transition-colors cursor-pointer"
                                title="Remove value"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      {/* Add Value Input */}
                      <div className="flex items-center gap-2 max-w-sm">
                        <input
                          type="text"
                          value={newValueInputs[optIdx] || ""}
                          onChange={(e) => {
                            setNewValueInputs({
                              ...newValueInputs,
                              [optIdx]: e.target.value,
                            });
                            setError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddValue(optIdx);
                            }
                          }}
                          placeholder={`Add value to ${opt.name || `Option ${optIdx + 1}`}...`}
                          className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1 text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-navy-600"
                        />
                        <button
                          onClick={() => handleAddValue(optIdx)}
                          className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold px-3 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Existing Variants Conformance Table */}
          {memberProducts.length > 0 && variantOptions.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Layers size={14} className="text-navy-700" />
                  Complete Existing Variants ({memberProducts.length})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Every existing variant product must have a valid value selected for all active variant options.
                </p>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase font-bold text-[10px] tracking-wider">
                    <tr>
                      <th className="px-3 py-2">Variant Product</th>
                      <th className="px-3 py-2">SKU</th>
                      {variantOptions.map((opt, i) => (
                        <th key={i} className="px-3 py-2">
                          {opt.name || `Option ${i + 1}`} <span className="text-red-500">*</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {memberProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 font-medium text-slate-800">{p.name}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{p.sku}</td>
                        {variantOptions.map((opt, i) => {
                          const currentVal = variantValuesMap[p.id]?.[opt.name] || p.variantValues?.[opt.name] || "";
                          return (
                            <td key={i} className="px-3 py-2">
                              <select
                                value={currentVal}
                                onChange={(e) => handleVariantValueSelect(p.id, opt.name, e.target.value)}
                                className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:ring-1 focus:ring-navy-600 font-medium"
                              >
                                <option value="">-- Select {opt.name || 'Value'} --</option>
                                {opt.values.map((val) => (
                                  <option key={val} value={val}>
                                    {val}
                                  </option>
                                ))}
                                {/* Retain legacy value if present but removed from active list */}
                                {currentVal && !opt.values.includes(currentVal) && (
                                  <option value={currentVal}>
                                    {currentVal} (Retired)
                                  </option>
                                )}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold text-white bg-navy-950 hover:bg-navy-900 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Check size={14} />
            Save Base Product
          </button>
        </div>
      </div>
    </div>
  );
}
