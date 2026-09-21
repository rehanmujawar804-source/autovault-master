"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useStore, generateUniqueId } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import {
  X,
  Plus,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Check,
  Package,
  Sparkles,
} from "lucide-react";
import type { Product, VariantOptionDefinition, VehicleFitment } from "@/types";
import { SuggestionInput, getMatchingSuggestions } from "./ProductModals";
import { toTitleCase, addOrMergeFitment } from "@/lib/fitmentUtils";

const INPUT =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-400";

const SKU_REGEX = /^[A-Za-z0-9_-]{3,40}$/;

export interface VariantFormItem {
  id: string;
  productName: string;
  sku: string;
  brand: string;
  category: string;
  status: "Active" | "Inactive" | "Discontinued" | "";
  stock: number | string;
  currentCost: number | string;
  sellPrice: number | string;
  lowStockThreshold: number | string;
  isUniversalFit: boolean;
  fitments: VehicleFitment[];
  selectedVariantValues: Record<string, string>;
  isManualNameOverride: boolean;
  isManualSkuOverride: boolean;
  // Fitment form sub-state per variant item
  newFitBrand: string;
  newFitModel: string;
  newFitYear: string;
  newFitYearTo: string;
  // Field-level error messages per variant card
  errors?: Record<string, string>;
}

interface AddProductWithVariantModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialGroup?: string | null;
}

function computeSuggestedName(
  baseGroup: string,
  variantOptions: VariantOptionDefinition[],
  selectedVariantValues: Record<string, string>
): string {
  const trimmedGroup = baseGroup.trim();
  const selectedVals = variantOptions
    .map((opt) => selectedVariantValues[opt.name])
    .filter((val): val is string => Boolean(val && val.trim()));

  if (trimmedGroup) {
    if (selectedVals.length > 0) {
      return `${trimmedGroup} \u2014 ${selectedVals.join(" \u2014 ")}`;
    }
    return trimmedGroup;
  }
  if (selectedVals.length > 0) {
    return selectedVals.join(" \u2014 ");
  }
  return "";
}

function computeSuggestedSku(
  baseGroup: string,
  variantOptions: VariantOptionDefinition[],
  selectedVariantValues: Record<string, string>
): string {
  const trimmedGroup = baseGroup.trim();
  const selectedVals = variantOptions
    .map((opt) => selectedVariantValues[opt.name])
    .filter((val): val is string => Boolean(val && val.trim()));

  const baseCode = trimmedGroup.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const valCode = selectedVals.map((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "")).join("-");

  if (baseCode) {
    return valCode ? `${baseCode}-${valCode}` : baseCode;
  }
  return valCode;
}

function createInitialVariantItem(
  group: string,
  defaultBrand: string,
  defaultCat: string,
  opts: VariantOptionDefinition[],
  defaultUniversalFit: boolean = false,
  defaultFitments: VehicleFitment[] = []
): VariantFormItem {
  const sel: Record<string, string> = {};
  opts.forEach((o) => {
    sel[o.name] = o.values[0] || "";
  });

  const autoName = computeSuggestedName(group, opts, sel);
  const autoSku = computeSuggestedSku(group, opts, sel);

  return {
    id: generateUniqueId("vf"),
    productName: autoName,
    sku: autoSku,
    brand: defaultBrand,
    category: defaultCat,
    status: "Active",
    stock: 0,
    currentCost: 0,
    sellPrice: 0,
    lowStockThreshold: 5,
    isUniversalFit: defaultUniversalFit,
    fitments: JSON.parse(JSON.stringify(defaultFitments)),
    selectedVariantValues: sel,
    isManualNameOverride: false,
    isManualSkuOverride: false,
    newFitBrand: "",
    newFitModel: "",
    newFitYear: "",
    newFitYearTo: "",
  };
}

export function AddProductWithVariantModal({
  isOpen,
  onClose,
  initialGroup,
}: AddProductWithVariantModalProps) {
  const { state, addProduct, showToast } = useStore();
  const { isOwner } = useRole();

  const [displayGroupName, setDisplayGroupName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");

  // Base Product Universal Fit / Compatibility state
  const [baseIsUniversalFit, setBaseIsUniversalFit] = useState(false);
  const [baseFitments, setBaseFitments] = useState<VehicleFitment[]>([]);
  const [baseNewFitBrand, setBaseNewFitBrand] = useState("");
  const [baseNewFitModel, setBaseNewFitModel] = useState("");
  const [baseNewFitYear, setBaseNewFitYear] = useState("");
  const [baseNewFitYearTo, setBaseNewFitYearTo] = useState("");

  const [isGroupAutocompleteOpen, setIsGroupAutocompleteOpen] = useState(false);
  const groupAutocompleteRef = useRef<HTMLDivElement>(null);

  const [variantOptions, setVariantOptions] = useState<VariantOptionDefinition[]>([
    { name: "Size", values: ["195/65 R15"] },
  ]);
  const [newValueInputs, setNewValueInputs] = useState<Record<number, string>>({});

  // Array of variant forms for multi-variant creation
  const [variantForms, setVariantForms] = useState<VariantFormItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Derived canonical brands map: lowercase -> canonical stored string in state.products
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

  // Derived canonical categories map: lowercase -> canonical stored string in state.products
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

  // Derived existing Display Group names for autocomplete
  const existingGroupNames = useMemo(() => {
    const set = new Set<string>();
    state.products.forEach((p) => {
      if (p.displayGroup && p.displayGroup.trim()) {
        set.add(p.displayGroup.trim());
      }
    });
    return Array.from(set).sort();
  }, [state.products]);

  // Derived group suggestions based on typed displayGroupName
  const groupSuggestions = useMemo(() => {
    const query = displayGroupName.trim().toLowerCase();
    if (!query) return [];

    const exact: string[] = [];
    const startsWith: string[] = [];
    const contains: string[] = [];

    for (const name of existingGroupNames) {
      const lower = name.toLowerCase();
      if (lower === query) {
        exact.push(name);
      } else if (lower.startsWith(query)) {
        startsWith.push(name);
      } else if (lower.includes(query)) {
        contains.push(name);
      }
    }

    return [...exact, ...startsWith, ...contains].slice(0, 8);
  }, [displayGroupName, existingGroupNames]);

  // Deduplicated list of product names from ALL state.products for autocomplete
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

  // Deduplicated list of SKUs from ALL state.products for autocomplete
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

  // Check if current displayGroupName matches an existing group
  const isExistingGroupMode = useMemo(() => {
    if (initialGroup && initialGroup.trim()) return true;
    const query = displayGroupName.trim().toLowerCase();
    if (!query) return false;
    return existingGroupNames.some((g) => g.toLowerCase() === query);
  }, [initialGroup, displayGroupName, existingGroupNames]);

  // Duplicate group warning (non-blocking)
  const duplicateGroupWarning = useMemo(() => {
    const query = displayGroupName.trim();
    if (!query) return null;
    const initialLower = (initialGroup || "").trim().toLowerCase();
    if (initialLower && query.toLowerCase() === initialLower) {
      return null;
    }
    const exists = existingGroupNames.some((g) => g.toLowerCase() === query.toLowerCase());
    return exists ? `⚠️ A display group with the name "${query}" already exists` : null;
  }, [displayGroupName, initialGroup, existingGroupNames]);

  // Categories & Brands for autocomplete suggestions
  const existingCategories = useMemo(() => {
    return Array.from(canonicalCategories.values()).sort();
  }, [canonicalCategories]);

  const existingBrands = useMemo(() => {
    return Array.from(canonicalBrands.values()).sort();
  }, [canonicalBrands]);

  // Close autocomplete list when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        groupAutocompleteRef.current &&
        !groupAutocompleteRef.current.contains(event.target as Node)
      ) {
        setIsGroupAutocompleteOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle group selection or typed existing group
  function loadGroupDetails(groupName: string) {
    const trimmed = groupName.trim();
    setDisplayGroupName(trimmed);

    const members = state.products.filter(
      (p) => p.displayGroup?.trim().toLowerCase() === trimmed.toLowerCase()
    );

    // 1. Determine group Brand from members
    let groupBrand = "";
    const memberWithBrand = members.find((p) => p.brand && p.brand.trim());
    if (memberWithBrand) {
      const raw = memberWithBrand.brand.trim();
      groupBrand = canonicalBrands.get(raw.toLowerCase()) || raw;
    } else {
      groupBrand = brand;
    }

    // 2. Determine group Category from members
    let groupCat = "";
    const memberWithCat = members.find((p) => p.category && p.category.trim());
    if (memberWithCat) {
      const raw = memberWithCat.category.trim();
      groupCat = canonicalCategories.get(raw.toLowerCase()) || raw;
    } else {
      groupCat = category;
    }

    setBrand(groupBrand);
    setCategory(groupCat);

    // 3. Base Product Universal Fit / Fitment State
    const isAllUniversal = members.length > 0 && members.every((p) => p.isUniversalFit === true);
    let collectedFitments: VehicleFitment[] = [];
    if (!isAllUniversal) {
      const fitMap = new Map<string, VehicleFitment>();
      members.forEach((p) => {
        if (!p.isUniversalFit && p.fitments) {
          p.fitments.forEach((f) => {
            const key = `${f.brand.toLowerCase()}-${f.model.toLowerCase()}-${f.year.toLowerCase()}-${(f.yearTo || "").toLowerCase()}`;
            if (!fitMap.has(key)) {
              fitMap.set(key, f);
            }
          });
        }
      });
      collectedFitments = Array.from(fitMap.values());
    }

    setBaseIsUniversalFit(isAllUniversal);
    setBaseFitments(collectedFitments);

    // 4. Options
    const existingOpts = members.find(
      (m) => m.variantOptions && m.variantOptions.length > 0
    )?.variantOptions;

    const activeOpts = existingOpts && existingOpts.length > 0
      ? JSON.parse(JSON.stringify(existingOpts))
      : variantOptions;

    if (existingOpts && existingOpts.length > 0) {
      setVariantOptions(activeOpts);
    }

    // 5. Update variant forms
    setVariantForms((prevForms) => {
      if (prevForms.length === 0) {
        return [
          createInitialVariantItem(
            trimmed,
            groupBrand,
            groupCat,
            activeOpts,
            isAllUniversal,
            collectedFitments
          ),
        ];
      }
      return prevForms.map((item) => {
        const newSel: Record<string, string> = {};
        activeOpts.forEach((o: VariantOptionDefinition) => {
          newSel[o.name] = item.selectedVariantValues[o.name] || o.values[0] || "";
        });

        const autoName = computeSuggestedName(trimmed, activeOpts, newSel);
        const autoSku = computeSuggestedSku(trimmed, activeOpts, newSel);

        return {
          ...item,
          brand: groupBrand || item.brand,
          category: groupCat || item.category,
          isUniversalFit: isAllUniversal,
          fitments: JSON.parse(JSON.stringify(collectedFitments)),
          selectedVariantValues: newSel,
          productName: item.isManualNameOverride ? item.productName : autoName,
          sku: item.isManualSkuOverride ? item.sku : autoSku,
        };
      });
    });
  }

  // Reset form on modal open/close
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsGroupAutocompleteOpen(false);
      setNewValueInputs({});
      setBaseNewFitBrand("");
      setBaseNewFitModel("");
      setBaseNewFitYear("");
      setBaseNewFitYearTo("");

      if (initialGroup && initialGroup.trim()) {
        loadGroupDetails(initialGroup.trim());
      } else {
        setDisplayGroupName("");
        setBrand("");
        setCategory("");
        setBaseIsUniversalFit(false);
        setBaseFitments([]);
        const defaultOpts: VariantOptionDefinition[] = [{ name: "Size", values: ["195/65 R15"] }];
        setVariantOptions(defaultOpts);
        setVariantForms([createInitialVariantItem("", "", "", defaultOpts, false, [])]);
      }
    }
  }, [isOpen, initialGroup]);

  // Keep variant forms in sync with displayGroupName and variantOptions changes
  useEffect(() => {
    setVariantForms((prevForms) =>
      prevForms.map((item) => {
        const autoName = computeSuggestedName(displayGroupName, variantOptions, item.selectedVariantValues);
        const autoSku = computeSuggestedSku(displayGroupName, variantOptions, item.selectedVariantValues);

        let updatedName = item.productName;
        if (!item.isManualNameOverride) {
          updatedName = autoName;
        }

        let updatedSku = item.sku;
        if (!item.isManualSkuOverride) {
          updatedSku = autoSku;
        }

        if (updatedName === item.productName && updatedSku === item.sku) {
          return item;
        }

        return {
          ...item,
          productName: updatedName,
          sku: updatedSku,
        };
      })
    );
  }, [displayGroupName, variantOptions]);

  // Sync Brand changes to variant forms if not individually overridden
  function handleBaseBrandChange(newBrand: string) {
    setBrand(newBrand);
    setError(null);
    setVariantForms((prev) =>
      prev.map((item) => ({
        ...item,
        brand: newBrand,
      }))
    );
  }

  // Sync Category changes to variant forms
  function handleBaseCategoryChange(newCategory: string) {
    setCategory(newCategory);
    setError(null);
    setVariantForms((prev) =>
      prev.map((item) => ({
        ...item,
        category: newCategory,
      }))
    );
  }

  // Base Universal Fit toggle handler
  function handleToggleBaseUniversalFit(checked: boolean) {
    setBaseIsUniversalFit(checked);
    if (checked) {
      setBaseFitments([]);
    }
  }

  // Add Base fitment handler
  function handleAddBaseFitment() {
    setError(null);
    if (baseIsUniversalFit) {
      setError("❌ Cannot add specific fitments when Base Universal Fit is enabled.");
      return;
    }

    const brand = toTitleCase(baseNewFitBrand.trim());
    const model = toTitleCase(baseNewFitModel.trim());
    const year = baseNewFitYear.trim();
    const yearToRaw = baseNewFitYearTo.trim();

    if (!brand || !model || !year) {
      setError("❌ Please fill in Make, Model, and From Year for Base Fitment.");
      return;
    }

    const YEAR_REGEX = /^\d{4}$/;
    if (!YEAR_REGEX.test(year)) {
      setError("❌ From Year must be a valid 4-digit year (e.g. 2018).");
      return;
    }

    let yearTo: string | undefined = undefined;
    if (yearToRaw) {
      if (!YEAR_REGEX.test(yearToRaw)) {
        setError("❌ To Year must be a valid 4-digit year (e.g. 2022).");
        return;
      }
      if (Number(yearToRaw) < Number(year)) {
        setError("❌ To Year must be greater than or equal to From Year");
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

    const mergeResult = addOrMergeFitment(baseFitments, newFitment);
    if (mergeResult.isRedundant) {
      setError("⚠️ This base vehicle fitment is already covered by an existing range.");
      return;
    }

    setBaseFitments(mergeResult.fitments);
    setBaseNewFitBrand("");
    setBaseNewFitModel("");
    setBaseNewFitYear("");
    setBaseNewFitYearTo("");

    setVariantForms((prev) =>
      prev.map((item) => {
        if (!item.isUniversalFit) {
          const itemResult = addOrMergeFitment(item.fitments, newFitment);
          return {
            ...item,
            fitments: itemResult.fitments,
          };
        }
        return item;
      })
    );
  }

  // Add Variant fitment handler
  function handleAddVariantFitment(vIdx: number) {
    setError(null);
    const vItem = variantForms[vIdx];
    const formNum = vIdx + 1;

    if (vItem.isUniversalFit) {
      setError(`Variant #${formNum} — ❌ Cannot add specific fitments when Universal Fit is enabled.`);
      return;
    }

    const brand = toTitleCase(vItem.newFitBrand.trim());
    const model = toTitleCase(vItem.newFitModel.trim());
    const year = vItem.newFitYear.trim();
    const yearToRaw = vItem.newFitYearTo.trim();

    if (!brand || !model || !year) {
      setError(`Variant #${formNum} — ❌ Please fill in Make, Model, and From Year for vehicle fitment.`);
      return;
    }

    const YEAR_REGEX = /^\d{4}$/;
    if (!YEAR_REGEX.test(year)) {
      setError(`Variant #${formNum} — ❌ From Year must be a valid 4-digit year (e.g. 2018).`);
      return;
    }

    let yearTo: string | undefined = undefined;
    if (yearToRaw) {
      if (!YEAR_REGEX.test(yearToRaw)) {
        setError(`Variant #${formNum} — ❌ To Year must be a valid 4-digit year (e.g. 2022).`);
        return;
      }
      if (Number(yearToRaw) < Number(year)) {
        setError(`Variant #${formNum} — ❌ To Year must be greater than or equal to From Year`);
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

    const mergeResult = addOrMergeFitment(vItem.fitments, newFitment);
    if (mergeResult.isRedundant) {
      setError(`Variant #${formNum} — ⚠️ Vehicle fitment is already covered by an existing range.`);
      return;
    }

    updateVariantForm(vIdx, {
      fitments: mergeResult.fitments,
      newFitBrand: "",
      newFitModel: "",
      newFitYear: "",
      newFitYearTo: "",
    });
  }

  if (!isOpen || !isOwner) return null;

  // ── Option Handlers ───────────────────────────────────────────────────────

  function handleAddOption() {
    setError(null);
    if (variantOptions.length >= 5) {
      setError("❌ Maximum 5 variant options allowed");
      return;
    }
    const next = [...variantOptions, { name: "", values: [] }];
    setVariantOptions(next);
  }

  function handleRemoveOption(index: number) {
    setError(null);
    const next = [...variantOptions];
    next.splice(index, 1);
    setVariantOptions(next);
  }

  function handleOptionNameChange(index: number, name: string) {
    setError(null);
    const next = [...variantOptions];
    next[index].name = name;
    setVariantOptions(next);
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

    // Auto select value for variant forms if unselected
    setVariantForms((prev) =>
      prev.map((item) => {
        if (!item.selectedVariantValues[currentOption.name]) {
          const updatedSel = {
            ...item.selectedVariantValues,
            [currentOption.name]: rawValue,
          };
          const autoName = computeSuggestedName(displayGroupName, next, updatedSel);
          const autoSku = computeSuggestedSku(displayGroupName, next, updatedSel);
          return {
            ...item,
            selectedVariantValues: updatedSel,
            productName: item.isManualNameOverride ? item.productName : autoName,
            sku: item.isManualSkuOverride ? item.sku : autoSku,
          };
        }
        return item;
      })
    );

    setNewValueInputs({
      ...newValueInputs,
      [optionIndex]: "",
    });
  }

  function handleRemoveValue(optionIndex: number, valueIndex: number) {
    setError(null);
    const next = [...variantOptions];
    const removedVal = next[optionIndex].values[valueIndex];
    next[optionIndex].values.splice(valueIndex, 1);
    setVariantOptions(next);

    const optName = next[optionIndex].name;
    setVariantForms((prev) =>
      prev.map((item) => {
        if (item.selectedVariantValues[optName] === removedVal) {
          const updatedSel = {
            ...item.selectedVariantValues,
            [optName]: next[optionIndex].values[0] || "",
          };
          const autoName = computeSuggestedName(displayGroupName, next, updatedSel);
          const autoSku = computeSuggestedSku(displayGroupName, next, updatedSel);
          return {
            ...item,
            selectedVariantValues: updatedSel,
            productName: item.isManualNameOverride ? item.productName : autoName,
            sku: item.isManualSkuOverride ? item.sku : autoSku,
          };
        }
        return item;
      })
    );
  }

  // ── Variant Form Card Handlers ────────────────────────────────────────────

  function handleAddVariantForm() {
    setError(null);
    const newItem = createInitialVariantItem(
      displayGroupName,
      brand,
      category,
      variantOptions,
      baseIsUniversalFit,
      baseFitments
    );
    setVariantForms([...variantForms, newItem]);
  }

  function handleRemoveVariantForm(index: number) {
    setError(null);
    if (variantForms.length <= 1) return;
    const next = [...variantForms];
    next.splice(index, 1);
    setVariantForms(next);
  }

  function updateVariantForm(index: number, patch: Partial<VariantFormItem>) {
    setError(null);
    setVariantForms((prev) => {
      const next = [...prev];
      const currentItem = next[index];
      const item = { ...currentItem, ...patch };

      if (patch.selectedVariantValues !== undefined) {
        if (!item.isManualNameOverride) {
          item.productName = computeSuggestedName(displayGroupName, variantOptions, item.selectedVariantValues);
        }
        if (!item.isManualSkuOverride) {
          item.sku = computeSuggestedSku(displayGroupName, variantOptions, item.selectedVariantValues);
        }
      }

      next[index] = item;
      return next;
    });
  }

  // ── Atomic Multi-Variant Validation & Save ────────────────────────────────

  function handleSave() {
    setError(null);

    const trimmedGroup = displayGroupName.trim();
    if (!trimmedGroup) {
      setError("❌ Display Group Name is required");
      return;
    }

    const trimmedCategory = category.trim();
    if (!trimmedCategory) {
      setError("❌ Base Category is required");
      return;
    }

    const trimmedBrand = brand.trim();

    // Canonical Base Brand & Category
    const finalBaseBrand = trimmedBrand
      ? canonicalBrands.get(trimmedBrand.toLowerCase()) || trimmedBrand
      : "";
    const finalBaseCategory =
      canonicalCategories.get(trimmedCategory.toLowerCase()) || trimmedCategory;

    // Option validations if creating a brand new display group definition
    if (!isExistingGroupMode) {
      if (variantOptions.length === 0) {
        setError("❌ At least one variant option is required");
        return;
      }

      if (variantOptions.length > 5) {
        setError("❌ Maximum 5 variant options allowed");
        return;
      }

      const namesSet = new Set<string>();
      for (let i = 0; i < variantOptions.length; i++) {
        const opt = variantOptions[i];
        const name = opt.name.trim();
        if (!name) {
          setError(`❌ Option name is required for Option ${i + 1}`);
          return;
        }
        if (namesSet.has(name.toLowerCase())) {
          setError(`❌ Option already exists: "${name}"`);
          return;
        }
        namesSet.add(name.toLowerCase());

        if (opt.values.length === 0) {
          setError(`❌ At least one value is required for variant option "${name}"`);
          return;
        }
      }
    }

    if (variantForms.length === 0) {
      setError("❌ At least one variant product form is required");
      return;
    }

    const cleanedOptions: VariantOptionDefinition[] = variantOptions.map((opt) => ({
      name: opt.name.trim(),
      values: opt.values.map((v) => v.trim()),
    }));

    // Batch validation across all variant form items
    const batchSKUs = new Set<string>();
    const batchCombinations = new Set<string>();
    const preparedProducts: Product[] = [];
    const updatedVariantForms = [...variantForms];
    let totalErrorsCount = 0;
    let firstErrorMessage = "";

    for (let idx = 0; idx < variantForms.length; idx++) {
      const item = variantForms[idx];
      const formNum = idx + 1;
      const itemErrors: Record<string, string> = {};

      // 1. Status Check
      if (!item.status || !["Active", "Inactive", "Discontinued"].includes(item.status)) {
        itemErrors.status = "Status is required.";
      }

      // 2. Product Name check
      const tName = (item.productName || "").trim();
      if (!tName) {
        itemErrors.productName = "Product Name is required.";
      } else if (tName.length < 3) {
        itemErrors.productName = "Product Name must be at least 3 characters.";
      } else if (tName.length > 100) {
        itemErrors.productName = "Product Name must not exceed 100 characters.";
      }

      // 3. SKU check
      const tSku = (item.sku || "").trim();
      if (!tSku) {
        itemErrors.sku = "SKU is required.";
      } else if (!SKU_REGEX.test(tSku)) {
        itemErrors.sku = "SKU must be 3–40 characters and contain only letters, numbers, hyphens (-), or underscores (_).";
      } else {
        const lowerSku = tSku.toLowerCase();
        const dbExists = state.products.find((p) => p.sku.trim().toLowerCase() === lowerSku);
        if (dbExists) {
          itemErrors.sku = `SKU "${tSku}" is already used by "${dbExists.name}". SKU must be unique.`;
        } else if (batchSKUs.has(lowerSku)) {
          itemErrors.sku = `Duplicate SKU "${tSku}" within current forms.`;
        } else {
          batchSKUs.add(lowerSku);
        }
      }

      // 4. Category check per variant
      const rawItemCat = (item.category || finalBaseCategory).trim();
      if (!rawItemCat) {
        itemErrors.category = "Category is required.";
      }

      // 5. Active option conformance & duplicate combination check
      let hasMissingOptionValue = false;
      for (const opt of cleanedOptions) {
        const selectedVal = item.selectedVariantValues[opt.name];
        if (!selectedVal || !selectedVal.trim()) {
          itemErrors[opt.name] = `Value is required for option "${opt.name}".`;
          hasMissingOptionValue = true;
        }
      }

      if (!hasMissingOptionValue && cleanedOptions.length > 0) {
        const combinationKey = cleanedOptions
          .map((opt) => (item.selectedVariantValues[opt.name] || "").trim().toLowerCase())
          .join(" || ");

        const targetGroupLower = trimmedGroup.toLowerCase();
        const existingConflict = state.products.find((p) => {
          if (!p.displayGroup) return false;
          if (p.displayGroup.trim().toLowerCase() !== targetGroupLower) return false;
          const siblingVals = p.variantValues || {};
          const siblingComboKey = cleanedOptions
            .map((opt) => {
              const directVal = siblingVals[opt.name];
              if (directVal !== undefined) return directVal.trim().toLowerCase();
              const optLower = opt.name.trim().toLowerCase();
              const matchKey = Object.keys(siblingVals).find(
                (k) => k.trim().toLowerCase() === optLower
              );
              return (matchKey ? siblingVals[matchKey] : "").trim().toLowerCase();
            })
            .join(" || ");
          return siblingComboKey === combinationKey;
        });

        const scopedBatchKey = `${targetGroupLower}::${combinationKey}`;

        if (existingConflict) {
          itemErrors.combination = `Duplicate variant combination detected: Variant "${existingConflict.name}" already uses this option combination.`;
        } else if (batchCombinations.has(scopedBatchKey)) {
          itemErrors.combination = `Duplicate variant combination in this batch: another variant already uses this option combination.`;
        } else {
          batchCombinations.add(scopedBatchKey);
        }
      }

      // 6. Initial Stock validation
      const rawStockStr = item.stock === null || item.stock === undefined ? "" : String(item.stock).trim();
      if (rawStockStr === "") {
        itemErrors.stock = "Initial stock is required.";
      } else if (isNaN(Number(rawStockStr))) {
        itemErrors.stock = "Initial stock must be a valid number.";
      } else {
        const stockNum = Number(rawStockStr);
        if (stockNum < 0) {
          itemErrors.stock = "Initial stock cannot be negative.";
        } else if (!Number.isInteger(stockNum) || rawStockStr.includes(".")) {
          itemErrors.stock = "Initial stock must be a whole number (0 or more).";
        }
      }

      const parsedStockNum = (rawStockStr !== "" && !isNaN(Number(rawStockStr))) ? Number(rawStockStr) : 0;

      // 7. Cost ₹ validation
      const rawCostStr = item.currentCost === null || item.currentCost === undefined ? "" : String(item.currentCost).trim();
      if (parsedStockNum > 0 && rawCostStr === "") {
        itemErrors.currentCost = "Opening Cost is required when Initial Stock is greater than 0.";
      } else if (rawCostStr !== "") {
        if (isNaN(Number(rawCostStr))) {
          itemErrors.currentCost = "Cost must be a valid number.";
        } else if (Number(rawCostStr) < 0) {
          itemErrors.currentCost = "Cost cannot be negative.";
        }
      }
      const parsedCostNum = (rawCostStr === "" || isNaN(Number(rawCostStr))) ? 0 : Number(rawCostStr);

      // 8. Sell Price ₹ validation
      const rawSellStr = item.sellPrice === null || item.sellPrice === undefined ? "" : String(item.sellPrice).trim();
      if (rawSellStr === "") {
        itemErrors.sellPrice = "Sell price is required.";
      } else if (isNaN(Number(rawSellStr))) {
        itemErrors.sellPrice = "Sell price must be a valid number.";
      } else if (Number(rawSellStr) < 0) {
        itemErrors.sellPrice = "Sell price cannot be negative.";
      }
      const parsedSellNum = (rawSellStr === "" || isNaN(Number(rawSellStr))) ? 0 : Number(rawSellStr);

      // 9. Low Alert validation
      const rawLowStr = item.lowStockThreshold === null || item.lowStockThreshold === undefined ? "" : String(item.lowStockThreshold).trim();
      if (rawLowStr === "") {
        itemErrors.lowStockThreshold = "Low stock alert is required.";
      } else if (isNaN(Number(rawLowStr))) {
        itemErrors.lowStockThreshold = "Low stock alert must be a valid number.";
      } else {
        const lowNum = Number(rawLowStr);
        if (lowNum < 0) {
          itemErrors.lowStockThreshold = "Low stock alert cannot be negative.";
        } else if (!Number.isInteger(lowNum) || rawLowStr.includes(".")) {
          itemErrors.lowStockThreshold = "Low stock alert must be a whole number.";
        }
      }
      const parsedLowNum = (rawLowStr === "" || isNaN(Number(rawLowStr))) ? 5 : Number(rawLowStr);

      if (Object.keys(itemErrors).length > 0) {
        totalErrorsCount += Object.keys(itemErrors).length;
        if (!firstErrorMessage) {
          const firstFieldKey = Object.keys(itemErrors)[0];
          firstErrorMessage = `Variant #${formNum} — ❌ ${itemErrors[firstFieldKey]}`;
        }
        updatedVariantForms[idx] = {
          ...item,
          errors: itemErrors,
        };
      } else {
        updatedVariantForms[idx] = {
          ...item,
          errors: {},
        };

        // Canonical Brand and Category resolution
        const rawItemBrand = (item.brand || finalBaseBrand).trim();
        const matchedBrand = rawItemBrand
          ? canonicalBrands.get(rawItemBrand.toLowerCase()) || rawItemBrand
          : "";
        const matchedCategory =
          canonicalCategories.get(rawItemCat.toLowerCase()) || rawItemCat;

        preparedProducts.push({
          id: generateUniqueId("prod"),
          name: tName,
          sku: tSku,
          brand: matchedBrand,
          category: matchedCategory,
          stock: parsedStockNum,
          currentCost: parsedCostNum,
          sellPrice: parsedSellNum,
          lowStockThreshold: parsedLowNum,
          status: item.status || "Active",
          displayGroup: trimmedGroup,
          variantOptions: cleanedOptions,
          variantValues: { ...item.selectedVariantValues },
          isUniversalFit: item.isUniversalFit ?? false,
          fitments: item.isUniversalFit ? [] : item.fitments || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    if (totalErrorsCount > 0) {
      setVariantForms(updatedVariantForms);
      setError(firstErrorMessage);
      return;
    }

    // Atomic batch creation dispatch
    try {
      preparedProducts.forEach((p) => addProduct(p));
      showToast(
        `Successfully created ${preparedProducts.length} variant product(s) in group "${trimmedGroup}".`,
        "success"
      );
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create variant products.";
      setError(`❌ ${msg}`);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-navy-800 border border-navy-700 flex items-center justify-center text-emerald-400">
              <Package size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isExistingGroupMode
                  ? `Add Variant to "${displayGroupName}"`
                  : "Add Base Product & Variants"}
              </h2>
              <p className="text-xs text-slate-400">
                {isExistingGroupMode
                  ? "Add one or more variant SKUs to an existing Display Group."
                  : "Define Base Product metadata, variant options, and create variant SKUs."}
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
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-4 py-3 rounded-xl flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Base Product Metadata */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-1 border-b border-slate-200">
              1. Base Product Metadata (Display Group)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Display Group Name with Autocomplete */}
              <div className="relative" ref={groupAutocompleteRef}>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between gap-2 flex-wrap">
                  <span>Display Group / Base Name <span className="text-red-500">*</span></span>
                  {initialGroup && initialGroup.trim() ? (
                    <span
                      className="text-[10px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full flex items-center gap-1 max-w-[12rem] sm:max-w-none truncate"
                      title={`Product Family: ${initialGroup.trim()} (Locked)`}
                    >
                      🔒 Product Family: {initialGroup.trim()} (Locked)
                    </span>
                  ) : isExistingGroupMode ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Existing Group
                    </span>
                  ) : null}
                </label>
                <input
                  type="text"
                  value={displayGroupName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDisplayGroupName(val);
                    setIsGroupAutocompleteOpen(true);
                    setError(null);

                    // Auto load group details if typing an existing group name
                    if (existingGroupNames.some((g) => g.toLowerCase() === val.trim().toLowerCase())) {
                      loadGroupDetails(val);
                    }
                  }}
                  onFocus={() => setIsGroupAutocompleteOpen(true)}
                  placeholder="e.g. Apollo Amazer"
                  readOnly={Boolean(initialGroup && initialGroup.trim())}
                  className={`${INPUT} ${initialGroup ? "bg-slate-100 text-slate-600 font-semibold cursor-not-allowed" : ""}`}
                />

                {/* Autocomplete Dropdown List */}
                {isGroupAutocompleteOpen && groupSuggestions.length > 0 && !initialGroup && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto z-50 py-1">
                    {groupSuggestions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          loadGroupDetails(item);
                          setIsGroupAutocompleteOpen(false);
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-navy-50 hover:text-navy-950 transition-colors cursor-pointer flex items-center justify-between"
                      >
                        <span>{item}</span>
                        <span className="text-[10px] text-navy-600 font-bold bg-navy-100 px-1.5 py-0.5 rounded">
                          Existing Group
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Non-blocking Duplicate Group Warning */}
                {duplicateGroupWarning && (
                  <p className="text-[11px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                    <AlertTriangle size={13} className="shrink-0 text-amber-600" />
                    <span>{duplicateGroupWarning}</span>
                  </p>
                )}
              </div>

              {/* Brand Field */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Brand
                </label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => handleBaseBrandChange(e.target.value)}
                  list="add-variant-brand-suggestions"
                  placeholder="e.g. Apollo"
                  className={INPUT}
                />
                <datalist id="add-variant-brand-suggestions">
                  {existingBrands.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>

              {/* Category Field */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => handleBaseCategoryChange(e.target.value)}
                  list="add-variant-cat-suggestions"
                  placeholder="e.g. Tyre"
                  className={INPUT}
                />
                <datalist id="add-variant-cat-suggestions">
                  {existingCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Base Product Universal Fit & Vehicle Fitment Controls */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
                  <span>Base Universal Fit (Default Compatibility for Variants)</span>
                  {baseIsUniversalFit && (
                    <span className="bg-purple-100 text-purple-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-purple-200">
                      Universal Fit
                    </span>
                  )}
                </label>
                <input
                  type="checkbox"
                  checked={baseIsUniversalFit}
                  onChange={(e) => handleToggleBaseUniversalFit(e.target.checked)}
                  className="w-4 h-4 text-navy-950 rounded border-slate-300 focus:ring-navy-600/30 cursor-pointer accent-navy-950"
                />
              </div>

              {!baseIsUniversalFit && (
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Base Vehicle Compatibility (Default Fitments for Variants)
                  </span>

                  {baseFitments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {baseFitments.map((fit, fIdx) => (
                        <span
                          key={fIdx}
                          className="bg-amber-50 text-amber-800 border border-amber-200 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-semibold"
                        >
                          {fit.brand} {fit.model} (
                          {fit.yearTo && fit.yearTo !== fit.year
                            ? `${fit.year}–${fit.yearTo}`
                            : fit.year}
                          )
                          <button
                            type="button"
                            onClick={() => {
                              const nextFits = baseFitments.filter((_, i) => i !== fIdx);
                              setBaseFitments(nextFits);
                              setVariantForms((prev) =>
                                prev.map((item) => {
                                  if (!item.isUniversalFit) {
                                    return {
                                      ...item,
                                      fitments: JSON.parse(JSON.stringify(nextFits)),
                                    };
                                  }
                                  return item;
                                })
                              );
                            }}
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Make (e.g. Honda)"
                      value={baseNewFitBrand}
                      onChange={(e) => setBaseNewFitBrand(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Model (e.g. City)"
                      value={baseNewFitModel}
                      onChange={(e) => setBaseNewFitModel(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="From Year (2018)"
                      value={baseNewFitYear}
                      onChange={(e) => setBaseNewFitYear(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="To Year (2023)"
                      value={baseNewFitYearTo}
                      onChange={(e) => setBaseNewFitYearTo(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBaseFitment}
                    className="w-full mt-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold py-1.5 rounded-lg cursor-pointer transition-colors"
                  >
                    + Add Base Fitment
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Variant Options Definition */}
          {isExistingGroupMode ? (
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  2. Base Product Options (Inherited)
                </h3>
                <span className="text-[10px] font-bold text-navy-800 bg-navy-100 border border-navy-200 px-2 py-0.5 rounded-full">
                  Locked Group Definition
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Active options defined for group &ldquo;{displayGroupName}&rdquo;:{" "}
                <span className="font-bold text-slate-700">
                  {variantOptions.map((o) => o.name).join(", ") || "None"}
                </span>. Option definitions can be modified via Base Product Edit modal.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  2. Variant Options (1 to 5 Max)
                </h3>
                <button
                  type="button"
                  onClick={handleAddOption}
                  disabled={variantOptions.length >= 5}
                  className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-navy-950 hover:bg-navy-900 text-white cursor-pointer disabled:opacity-50"
                >
                  <Plus size={14} /> Add Option
                </button>
              </div>

              {variantOptions.map((opt, optIdx) => (
                <div key={optIdx} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 max-w-xs">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Option {optIdx + 1} Name
                      </label>
                      <input
                        type="text"
                        value={opt.name}
                        onChange={(e) => handleOptionNameChange(optIdx, e.target.value)}
                        placeholder="e.g. Size, Color"
                        className="w-full border border-slate-200 rounded-lg px-3 py-1 text-xs font-semibold bg-slate-50 focus:bg-white"
                      />
                    </div>
                    {variantOptions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(optIdx)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Allowed Active Values
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {opt.values.map((val, valIdx) => (
                        <span key={valIdx} className="inline-flex items-center gap-1 text-xs font-semibold bg-navy-50 text-navy-900 border border-navy-200 px-2.5 py-1 rounded-lg">
                          {val}
                          <button
                            type="button"
                            onClick={() => handleRemoveValue(optIdx, valIdx)}
                            className="text-navy-400 hover:text-red-600 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 max-w-sm">
                      <input
                        type="text"
                        value={newValueInputs[optIdx] || ""}
                        onChange={(e) => setNewValueInputs({ ...newValueInputs, [optIdx]: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddValue(optIdx); } }}
                        placeholder={`Add value to ${opt.name || `Option ${optIdx + 1}`}...`}
                        className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1 text-xs bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddValue(optIdx)}
                        className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold px-3 py-1 rounded-lg cursor-pointer"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Section 3: Variant Product Forms */}
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                3. Variant Product Details ({variantForms.length} Variant{variantForms.length > 1 ? "s" : ""})
                <Sparkles size={13} className="text-amber-500" />
              </h3>
            </div>

            {variantForms.map((vItem, vIdx) => {
              const suggestedName = computeSuggestedName(
                displayGroupName,
                variantOptions,
                vItem.selectedVariantValues
              );
              const suggestedSku = computeSuggestedSku(
                displayGroupName,
                variantOptions,
                vItem.selectedVariantValues
              );

              const nameSuggestions = getMatchingSuggestions(
                vItem.productName,
                existingProductNames
              );

              const skuSuggestions = getMatchingSuggestions(
                vItem.sku,
                existingSkus
              );

              const nameDupWarning = (() => {
                const nameToTest = vItem.productName.trim().toLowerCase();
                if (!nameToTest) return null;
                const existsDb = state.products.some((p) => p.name.trim().toLowerCase() === nameToTest);
                const existsBatch = variantForms.some(
                  (other, idx) => idx !== vIdx && other.productName.trim().toLowerCase() === nameToTest
                );
                return existsDb || existsBatch
                  ? `⚠️ Product name already exists: "${vItem.productName.trim()}"`
                  : null;
              })();

              const skuDupWarning = (() => {
                const skuToTest = vItem.sku.trim().toLowerCase();
                if (!skuToTest) return null;
                const existsDb = state.products.some((p) => p.sku.trim().toLowerCase() === skuToTest);
                const existsBatch = variantForms.some(
                  (other, idx) => idx !== vIdx && other.sku.trim().toLowerCase() === skuToTest
                );
                return existsDb || existsBatch
                  ? `⚠️ Existing SKU: ${vItem.sku.trim()}`
                  : null;
              })();

              const lossWarning = (() => {
                const sellNum = Number(vItem.sellPrice);
                const costNum = Number(vItem.currentCost);
                if (!isNaN(sellNum) && !isNaN(costNum) && sellNum > 0 && costNum > 0 && sellNum < costNum) {
                  return `Warning: Sell Price (₹${sellNum}) is less than Current Cost (₹${costNum}). This product will be sold at a loss.`;
                }
                return null;
              })();

              return (
                <div key={vItem.id} className="bg-slate-50/80 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs relative">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold text-navy-950 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-navy-950 text-white text-[10px] flex items-center justify-center font-extrabold">
                        {vIdx + 1}
                      </span>
                      Variant #{vIdx + 1}
                    </span>

                    {variantForms.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveVariantForm(vIdx)}
                        className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1 bg-white border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} /> Remove Variant
                      </button>
                    )}
                  </div>

                  {/* Variant Configuration (Option Value Selectors) */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1.5">
                      Variant Configuration (Select Option Values)
                    </h4>
                    {variantOptions.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No active options defined.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {variantOptions.map((opt) => (
                          <div key={opt.name}>
                            <label className="block text-xs font-bold text-slate-600 mb-1">
                              {opt.name} <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={vItem.selectedVariantValues[opt.name] || ""}
                              onChange={(e) => {
                                updateVariantForm(vIdx, {
                                  selectedVariantValues: {
                                    ...vItem.selectedVariantValues,
                                    [opt.name]: e.target.value,
                                  },
                                  errors: { ...(vItem.errors || {}), [opt.name]: "", combination: "" },
                                });
                              }}
                              className={`${INPUT} ${vItem.errors?.[opt.name] || vItem.errors?.combination ? "border-red-500 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                            >
                              <option value="">-- Select {opt.name} --</option>
                              {opt.values.map((val) => (
                                <option key={val} value={val}>
                                  {val}
                                </option>
                              ))}
                            </select>
                            {vItem.errors?.[opt.name] && (
                              <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                                <AlertCircle size={12} className="shrink-0 text-red-500" />
                                <span>❌ {vItem.errors[opt.name]}</span>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {vItem.errors?.combination && (
                      <p className="text-[11px] text-red-600 font-semibold mt-2 flex items-center gap-1">
                        <AlertCircle size={12} className="shrink-0 text-red-500" />
                        <span>❌ {vItem.errors.combination}</span>
                      </p>
                    )}
                  </div>

                  {/* Standard Product Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Product Name */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Product Name <span className="text-red-500">*</span>
                      </label>
                      <SuggestionInput
                        value={vItem.productName}
                        onChange={(val) => {
                          updateVariantForm(vIdx, {
                            productName: val,
                            isManualNameOverride: true,
                            errors: { ...(vItem.errors || {}), productName: "" },
                          });
                        }}
                        suggestions={nameSuggestions}
                        placeholder="e.g. Apollo Amazer — 195/65 R15 — Black"
                        className={`${INPUT} ${vItem.errors?.productName ? "border-red-500 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                      />
                      {vItem.errors?.productName && (
                        <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                          <AlertCircle size={12} className="shrink-0 text-red-500" />
                          <span>❌ {vItem.errors.productName}</span>
                        </p>
                      )}
                      {suggestedName ? (
                        <p className="text-[10px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                          <span>💡 Suggested name: {suggestedName}</span>
                          {vItem.isManualNameOverride && (
                            <button
                              type="button"
                              onClick={() => {
                                updateVariantForm(vIdx, {
                                  productName: suggestedName,
                                  isManualNameOverride: false,
                                });
                              }}
                              className="text-navy-600 underline font-bold cursor-pointer ml-1"
                            >
                              (Reset to suggestion)
                            </button>
                          )}
                        </p>
                      ) : null}
                      {nameDupWarning && (
                        <p className="text-[10px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                          <AlertTriangle size={12} className="shrink-0 text-amber-600" />
                          <span>{nameDupWarning}</span>
                        </p>
                      )}
                    </div>

                    {/* SKU */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                        SKU <span className="text-red-500">*</span>
                      </label>
                      <SuggestionInput
                        value={vItem.sku}
                        onChange={(val) => {
                          updateVariantForm(vIdx, {
                            sku: val.toUpperCase(),
                            isManualSkuOverride: true,
                            errors: { ...(vItem.errors || {}), sku: "" },
                          });
                        }}
                        suggestions={skuSuggestions}
                        maxLength={40}
                        placeholder="e.g. AMAZER-19565R15-BLACK"
                        className={`${INPUT} font-mono ${vItem.errors?.sku ? "border-red-500 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                      />
                      {vItem.errors?.sku && (
                        <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                          <AlertCircle size={12} className="shrink-0 text-red-500" />
                          <span>❌ {vItem.errors.sku}</span>
                        </p>
                      )}
                      {suggestedSku ? (
                        <p className="text-[10px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                          <span>💡 Suggested SKU: {suggestedSku}</span>
                          {vItem.isManualSkuOverride && (
                            <button
                              type="button"
                              onClick={() => {
                                updateVariantForm(vIdx, {
                                  sku: suggestedSku,
                                  isManualSkuOverride: false,
                                });
                              }}
                              className="text-navy-600 underline font-bold cursor-pointer ml-1"
                            >
                              (Reset to suggestion)
                            </button>
                          )}
                        </p>
                      ) : null}
                      {skuDupWarning && (
                        <p className="text-[10px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                          <AlertTriangle size={12} className="shrink-0 text-amber-600" />
                          <span>{skuDupWarning}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Brand, Category, Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Brand
                      </label>
                      <input
                        type="text"
                        value={vItem.brand}
                        onChange={(e) => updateVariantForm(vIdx, { brand: e.target.value })}
                        list={`brand-sug-${vIdx}`}
                        className={INPUT}
                      />
                      <datalist id={`brand-sug-${vIdx}`}>
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
                        value={vItem.category}
                        onChange={(e) => updateVariantForm(vIdx, { category: e.target.value, errors: { ...(vItem.errors || {}), category: "" } })}
                        list={`cat-sug-${vIdx}`}
                        className={`${INPUT} ${vItem.errors?.category ? "border-red-500 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                      />
                      {vItem.errors?.category && (
                        <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                          <AlertCircle size={12} className="shrink-0 text-red-500" />
                          <span>❌ {vItem.errors.category}</span>
                        </p>
                      )}
                      <datalist id={`cat-sug-${vIdx}`}>
                        {existingCategories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Status <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={vItem.status}
                        onChange={(e) =>
                          updateVariantForm(vIdx, {
                            status: e.target.value as "Active" | "Inactive" | "Discontinued",
                            errors: { ...(vItem.errors || {}), status: "" },
                          })
                        }
                        className={`${INPUT} ${vItem.errors?.status ? "border-red-500 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Discontinued">Discontinued</option>
                      </select>
                      {vItem.errors?.status && (
                        <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                          <AlertCircle size={12} className="shrink-0 text-red-500" />
                          <span>❌ {vItem.errors.status}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stock, Cost, Price, Threshold */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Initial Stock <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={vItem.stock}
                        onChange={(e) =>
                          updateVariantForm(vIdx, {
                            stock: e.target.value,
                            errors: { ...(vItem.errors || {}), stock: "" },
                          })
                        }
                        placeholder="0"
                        className={`${INPUT} ${vItem.errors?.stock ? "border-red-500 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                      />
                      {vItem.errors?.stock && (
                        <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                          <AlertCircle size={12} className="shrink-0 text-red-500" />
                          <span>❌ {vItem.errors.stock}</span>
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Cost ₹ {Number(vItem.stock) > 0 && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="text"
                        value={vItem.currentCost}
                        onChange={(e) =>
                          updateVariantForm(vIdx, {
                            currentCost: e.target.value,
                            errors: { ...(vItem.errors || {}), currentCost: "" },
                          })
                        }
                        placeholder="0"
                        className={`${INPUT} ${vItem.errors?.currentCost ? "border-red-500 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                      />
                      {vItem.errors?.currentCost && (
                        <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                          <AlertCircle size={12} className="shrink-0 text-red-500" />
                          <span>❌ {vItem.errors.currentCost}</span>
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Sell Price ₹ <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={vItem.sellPrice}
                        onChange={(e) =>
                          updateVariantForm(vIdx, {
                            sellPrice: e.target.value,
                            errors: { ...(vItem.errors || {}), sellPrice: "" },
                          })
                        }
                        placeholder="0"
                        className={`${INPUT} ${vItem.errors?.sellPrice ? "border-red-500 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                      />
                      {vItem.errors?.sellPrice ? (
                        <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                          <AlertCircle size={12} className="shrink-0 text-red-500" />
                          <span>❌ {vItem.errors.sellPrice}</span>
                        </p>
                      ) : lossWarning ? (
                        <p className="text-[10px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                          <AlertTriangle size={12} className="shrink-0 text-amber-600" />
                          <span>{lossWarning}</span>
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Low Alert <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={vItem.lowStockThreshold}
                        onChange={(e) =>
                          updateVariantForm(vIdx, {
                            lowStockThreshold: e.target.value,
                            errors: { ...(vItem.errors || {}), lowStockThreshold: "" },
                          })
                        }
                        placeholder="5"
                        className={`${INPUT} ${vItem.errors?.lowStockThreshold ? "border-red-500 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                      />
                      {vItem.errors?.lowStockThreshold && (
                        <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                          <AlertCircle size={12} className="shrink-0 text-red-500" />
                          <span>❌ {vItem.errors.lowStockThreshold}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Universal Fit & Vehicle Fitment */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
                        <span>Universal Fit</span>
                        {vItem.isUniversalFit && (
                          <span className="bg-purple-100 text-purple-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-purple-200">
                            Active
                          </span>
                        )}
                      </label>
                      <input
                        type="checkbox"
                        checked={vItem.isUniversalFit}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateVariantForm(vIdx, {
                            isUniversalFit: checked,
                            fitments: checked ? [] : vItem.fitments,
                          });
                        }}
                        className="w-4 h-4 text-navy-950 rounded border-slate-300 focus:ring-navy-600/30 cursor-pointer accent-navy-950"
                      />
                    </div>

                    {!vItem.isUniversalFit && (
                      <div className="space-y-2 pt-1 border-t border-slate-100">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          Vehicle Compatibility (Fitment)
                        </span>

                        {vItem.fitments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {vItem.fitments.map((fit, fIdx) => (
                              <span
                                key={fIdx}
                                className="bg-amber-50 text-amber-800 border border-amber-200 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-semibold"
                              >
                                {fit.brand} {fit.model} (
                                {fit.yearTo && fit.yearTo !== fit.year
                                  ? `${fit.year}–${fit.yearTo}`
                                  : fit.year}
                                )
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextFits = vItem.fitments.filter((_, i) => i !== fIdx);
                                    updateVariantForm(vIdx, { fitments: nextFits });
                                  }}
                                  className="text-slate-400 hover:text-red-600 cursor-pointer"
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          <input
                            type="text"
                            placeholder="Make (e.g. Honda)"
                            value={vItem.newFitBrand}
                            onChange={(e) => updateVariantForm(vIdx, { newFitBrand: e.target.value })}
                            className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="Model (e.g. City)"
                            value={vItem.newFitModel}
                            onChange={(e) => updateVariantForm(vIdx, { newFitModel: e.target.value })}
                            className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="From Year (2018)"
                            value={vItem.newFitYear}
                            onChange={(e) => updateVariantForm(vIdx, { newFitYear: e.target.value })}
                            className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="To Year (2023)"
                            value={vItem.newFitYearTo}
                            onChange={(e) => updateVariantForm(vIdx, { newFitYearTo: e.target.value })}
                            className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddVariantFitment(vIdx)}
                          className="w-full mt-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold py-1.5 rounded-lg cursor-pointer transition-colors"
                        >
                          + Add Compatible Vehicle
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add Another Variant Button */}
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={handleAddVariantForm}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-navy-950 hover:bg-navy-900 text-white cursor-pointer transition-colors shadow-sm"
              >
                <Plus size={15} />
                <span>+ Add Another Variant</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold text-white bg-navy-950 hover:bg-navy-900 rounded-xl shadow-sm cursor-pointer flex items-center gap-1.5"
          >
            <Check size={14} /> Save {variantForms.length} Variant Product{variantForms.length > 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

