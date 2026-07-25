"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import { formatFitmentDisplay, isFitmentMatch } from "@/lib/fitmentUtils";
import { SearchableSelect } from "@/components/SearchableSelect";
import Link from "next/link";
import {
  Search,
  Car,
  ChevronDown,
  ChevronUp,
  Tag,
  Layers,
  BarChart2,
  ShieldCheck,
  PackageSearch,
  ExternalLink,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  SlidersHorizontal,
  Globe,
  Info,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  VEHICLE FITMENT PAGE — PHASE 2A (REVERSE SEARCH + UNIVERSAL FIT)
// ─────────────────────────────────────────────────────────────────────────────

export default function VehicleFitmentPage() {
  const { state } = useStore();
  const { isOwner, loading, requireAuth } = useRole();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  // ── View Mode State (By Vehicle vs By Product Reverse Search) ─────────────
  const [viewMode, setViewMode] = useState<"by-vehicle" | "by-product">("by-vehicle");

  // ── Filters State ────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [expandedFitmentId, setExpandedFitmentId] = useState<string | null>(null);

  // ── Derived Fitments List (By Vehicle Mode) ──────────────────────────────
  // Aggregates explicit vehicle fitment data directly from state.products (Read-Only)
  const fitments = useMemo(() => {
    const map: Record<
      string,
      {
        brand: string;
        model: string;
        year: string;
        yearTo?: string;
        products: {
          name: string;
          sku: string;
          price: number;
          category: string;
          stock: number;
          lowStockThreshold: number;
          isUniversalFit?: boolean;
          status?: string;
        }[];
      }
    > = {};

    for (const product of state.products) {
      const productFitments = product.fitments || [];
      for (const fit of productFitments) {
        const key = `${fit.brand.trim()}|${fit.model.trim()}|${fit.year.trim()}${fit.yearTo ? `–${fit.yearTo.trim()}` : ""}`;
        if (!map[key]) {
          map[key] = {
            brand: fit.brand,
            model: fit.model,
            year: fit.year,
            yearTo: fit.yearTo,
            products: [],
          };
        }
        const alreadyAdded = map[key].products.some((p) => p.name === product.name);
        if (!alreadyAdded) {
          map[key].products.push({
            name: product.name,
            sku: product.sku || "—",
            price: product.sellPrice ?? 0,
            category: product.category || "Uncategorized",
            stock: product.stock ?? 0,
            lowStockThreshold: product.lowStockThreshold ?? 5,
            isUniversalFit: product.isUniversalFit,
            status: product.status || "Active",
          });
        }
      }
    }

    return Object.entries(map).map(([, value], idx) => ({
      id: `derived-fit-${idx}`,
      brand: value.brand,
      model: value.model,
      year: value.year,
      yearTo: value.yearTo,
      products: value.products,
    }));
  }, [state.products]);

  // ── Universal Fit Products Collection ────────────────────────────────────
  const universalProducts = useMemo(() => {
    return state.products.filter((p) => p.isUniversalFit === true);
  }, [state.products]);

  // ── Derived Filter Options (Cascading Dependencies) ──────────────────────
  const brands = useMemo(
    () => [...new Set(fitments.map((f) => f.brand))].sort(),
    [fitments]
  );

  const models = useMemo(
    () =>
      [
        ...new Set(
          fitments
            .filter((f) => !selectedBrand || f.brand === selectedBrand)
            .map((f) => f.model)
        ),
      ].sort(),
    [fitments, selectedBrand]
  );

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const product of state.products) {
      for (const fit of product.fitments || []) {
        const sameBrand = !selectedBrand || fit.brand.trim().toLowerCase() === selectedBrand.trim().toLowerCase();
        const sameModel = !selectedModel || fit.model.trim().toLowerCase() === selectedModel.trim().toLowerCase();
        if (sameBrand && sameModel) {
          const fromYear = Number(fit.year);
          const toYear = Number(fit.yearTo || fit.year);
          if (!isNaN(fromYear) && !isNaN(toYear)) {
            for (let y = fromYear; y <= toYear; y++) {
              set.add(String(y));
            }
          } else if (fit.year) {
            set.add(fit.year);
          }
        }
      }
    }
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [state.products, selectedBrand, selectedModel]);

  // ── Filtered Fitments Search & Select Logic (By Vehicle Mode) ────────────
  const filteredFitments = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selYearNum = Number(selectedYear);
    return fitments.filter((f) => {
      const yearDisplay = f.yearTo && f.yearTo !== f.year ? `${f.year}–${f.yearTo}` : f.year;
      const matchSearch =
        !q ||
        f.brand.toLowerCase().includes(q) ||
        f.model.toLowerCase().includes(q) ||
        yearDisplay.includes(q) ||
        f.products.some((p) => p.name.toLowerCase().includes(q));
      const matchBrand = !selectedBrand || f.brand === selectedBrand;
      const matchModel = !selectedModel || f.model === selectedModel;
      
      let matchYear = true;
      if (selectedYear) {
        const fromYear = Number(f.year);
        const toYear = Number(f.yearTo || f.year);
        matchYear = !isNaN(fromYear) && !isNaN(toYear) && !isNaN(selYearNum) && fromYear <= selYearNum && selYearNum <= toYear;
      }

      return matchSearch && matchBrand && matchModel && matchYear;
    });
  }, [fitments, search, selectedBrand, selectedModel, selectedYear]);

  // ── Quick Match Panel Results (Separated into Explicit vs Universal) ─────
  const quickMatchResults = useMemo(() => {
    if (!selectedBrand || !selectedModel || !selectedYear) {
      return { explicit: [], universal: [] };
    }

    const explicitProducts = state.products.filter((p) => {
      if (p.isUniversalFit) return false;
      return (p.fitments || []).some((f) =>
        isFitmentMatch(f, selectedBrand, selectedModel, selectedYear)
      );
    });

    // Section A: Explicit Vehicle-Specific Products (excluding Universal Fit to prevent duplicates)
    const explicit = explicitProducts.map((p) => ({
      name: p.name,
      sku: p.sku || "—",
      price: p.sellPrice ?? 0,
      category: p.category || "Uncategorized",
      stock: p.stock ?? 0,
      lowStockThreshold: p.lowStockThreshold ?? 5,
      isUniversalFit: p.isUniversalFit,
    }));

    // Section B: Universal Fit Products (Fits all vehicles)
    const universal = universalProducts;

    return { explicit, universal };
  }, [state.products, selectedBrand, selectedModel, selectedYear, universalProducts]);

  // ── Reverse Search Products (By Product Mode) ────────────────────────────
  const productSearchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.products;
    return state.products.filter((p) => {
      const matchName = p.name.toLowerCase().includes(q);
      const matchSku = p.sku ? p.sku.toLowerCase().includes(q) : false;
      const matchCategory = p.category ? p.category.toLowerCase().includes(q) : false;
      return matchName || matchSku || matchCategory;
    });
  }, [state.products, search]);

  // ── Coverage Statistics ──────────────────────────────────────────────────
  const coverageStats = useMemo(() => {
    const totalRules = fitments.length;
    const uniqueBrands = new Set(
      fitments.map((f) => f.brand.trim().toLowerCase())
    ).size;
    const uniqueModels = new Set(
      fitments.map((f) => `${f.brand.trim()}|${f.model.trim()}`.toLowerCase())
    ).size;
    const totalProducts = state.products.length;
    const productsWithFitment = state.products.filter(
      (p) => p.isUniversalFit || (p.fitments && p.fitments.length > 0)
    ).length;
    const coverageIndex =
      totalProducts > 0
        ? Math.round((productsWithFitment / totalProducts) * 100)
        : 0;
    return {
      totalRules,
      uniqueBrands,
      uniqueModels,
      coverageIndex,
      universalCount: universalProducts.length,
    };
  }, [fitments, state.products, universalProducts]);

  const hasActiveFilters = Boolean(
    search || selectedBrand || selectedModel || selectedYear
  );

  const handleClearFilters = () => {
    setSearch("");
    setSelectedBrand("");
    setSelectedModel("");
    setSelectedYear("");
  };

  // Helper renderer for stock status badge (Read-Only)
  const renderStockBadge = (stock: number, threshold: number) => {
    if (stock <= 0) {
      return (
        <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200/80 text-[11px] px-2 py-0.5 rounded-md font-semibold">
          <XCircle size={11} className="text-red-500" /> Out of Stock
        </span>
      );
    }
    if (stock <= threshold) {
      return (
        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200/80 text-[11px] px-2 py-0.5 rounded-md font-semibold">
          <AlertTriangle size={11} className="text-amber-500" /> {stock} Low Stock
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] px-2 py-0.5 rounded-md font-semibold">
        <CheckCircle2 size={11} className="text-emerald-500" /> {stock} in stock
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-navy-950 text-amber-400 flex items-center justify-center shadow-xs">
              <Car size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-navy-950 tracking-tight">
                Vehicle Fitment Engine
              </h1>
              <p className="text-sm text-slate-500 font-normal">
                Search compatibility by vehicle selection or perform reverse product lookups.
              </p>
            </div>
          </div>
        </div>

        {/* Existing Role-based CTA: Visible ONLY to Owner users; Staff remains view-only */}
        {isOwner && (
          <Link
            href="/inventory"
            className="inline-flex items-center justify-center gap-2 bg-navy-950 hover:bg-navy-850 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-xs hover:shadow-md active:scale-98 cursor-pointer"
          >
            <ExternalLink size={14} className="text-amber-400" />
            Manage Fitments in Inventory
          </Link>
        )}
      </div>

      {/* ── View Mode Switcher (By Vehicle vs By Product) ────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-3 shadow-xs">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setViewMode("by-vehicle")}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === "by-vehicle"
                ? "bg-navy-950 text-amber-400 shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <Car size={14} />
            By Vehicle (Make → Model → Year)
          </button>

          <button
            type="button"
            onClick={() => setViewMode("by-product")}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === "by-product"
                ? "bg-navy-950 text-amber-400 shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <PackageSearch size={14} />
            By Product (Reverse Fitment Search)
          </button>
        </div>

        <div className="text-xs font-medium text-slate-500 px-2 flex items-center gap-2">
          {viewMode === "by-vehicle" ? (
            <span>Showing vehicle-to-product mappings</span>
          ) : (
            <span>Showing product-to-vehicle reverse compatibility</span>
          )}
        </div>
      </div>

      {/* ── Coverage KPI Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Rules */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs hover:border-slate-300 transition-all">
          <div className="w-10 h-10 rounded-xl bg-navy-50 border border-navy-100 flex items-center justify-center flex-shrink-0 text-navy-800">
            <Layers size={18} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              Fitment Rules
            </p>
            <p className="text-2xl font-black text-slate-900 leading-tight">
              {coverageStats.totalRules}
            </p>
            <p className="text-xs text-slate-500 font-medium">vehicle combinations</p>
          </div>
        </div>

        {/* Brands Covered */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs hover:border-slate-300 transition-all">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
            <Car size={18} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              Brands Covered
            </p>
            <p className="text-2xl font-black text-slate-900 leading-tight">
              {coverageStats.uniqueBrands}
            </p>
            <p className="text-xs text-slate-500 font-medium">unique makes</p>
          </div>
        </div>

        {/* Universal Fit Products */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs hover:border-slate-300 transition-all">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0 text-amber-600">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              Universal Fit
            </p>
            <p className="text-2xl font-black text-slate-900 leading-tight">
              {coverageStats.universalCount}
            </p>
            <p className="text-xs text-slate-500 font-medium">fits all vehicles</p>
          </div>
        </div>

        {/* Coverage Index */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs hover:border-slate-300 transition-all">
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${
              coverageStats.coverageIndex >= 70
                ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                : coverageStats.coverageIndex >= 40
                ? "bg-amber-50 border-amber-100 text-amber-600"
                : "bg-rose-50 border-rose-100 text-rose-500"
            }`}
          >
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              Coverage Index
            </p>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-black leading-tight ${
                  coverageStats.coverageIndex >= 70
                    ? "text-emerald-600"
                    : coverageStats.coverageIndex >= 40
                    ? "text-amber-600"
                    : "text-rose-500"
                }`}
              >
                {coverageStats.coverageIndex}%
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">products configured</p>
          </div>
        </div>
      </div>

      {/* ── MODE 1: BY VEHICLE VIEW ─────────────────────────────────────────── */}
      {viewMode === "by-vehicle" && (
        <div className="space-y-6">
          {/* Search & Cascading Filter Controls Panel */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  type="text"
                  placeholder="Search vehicle make, model, year, or part..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all font-medium text-slate-800 placeholder:text-slate-400"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="inline-flex items-center justify-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 px-3.5 py-2.5 rounded-xl font-semibold transition-colors cursor-pointer"
                >
                  <XCircle size={13} />
                  Clear All Filters
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              <SlidersHorizontal size={13} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Cascading Vehicle Selector
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* STEP 1: MAKE / BRAND */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                  <span>Step 1: Make</span>
                  {selectedBrand && (
                    <span className="text-emerald-600 font-semibold text-[10px]">Active</span>
                  )}
                </label>
                <SearchableSelect
                  value={selectedBrand}
                  onChange={(val) => {
                    setSelectedBrand(val);
                    setSelectedModel("");
                    setSelectedYear("");
                  }}
                  options={brands}
                  placeholder="All Makes (Brands)"
                  allOptionLabel="All Makes (Brands)"
                  dark={false}
                />
              </div>

              {/* STEP 2: MODEL */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                  <span>Step 2: Model</span>
                  {selectedModel ? (
                    <span className="text-emerald-600 font-semibold text-[10px]">Active</span>
                  ) : !selectedBrand ? (
                    <span className="text-slate-400 text-[10px]">Select Make First</span>
                  ) : null}
                </label>
                <SearchableSelect
                  disabled={!selectedBrand && models.length === 0}
                  value={selectedModel}
                  onChange={(val) => {
                    setSelectedModel(val);
                    setSelectedYear("");
                  }}
                  options={models}
                  placeholder={!selectedBrand ? "Select Make First..." : "All Models"}
                  allOptionLabel="All Models"
                  dark={false}
                />
              </div>

              {/* STEP 3: YEAR */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                  <span>Step 3: Year</span>
                  {selectedYear ? (
                    <span className="text-emerald-600 font-semibold text-[10px]">Active</span>
                  ) : !selectedModel ? (
                    <span className="text-slate-400 text-[10px]">Select Model First</span>
                  ) : null}
                </label>
                <SearchableSelect
                  disabled={!selectedModel && years.length === 0}
                  value={selectedYear}
                  onChange={(val) => setSelectedYear(val)}
                  options={years}
                  placeholder={!selectedModel ? "Select Model First..." : "All Years"}
                  allOptionLabel="All Years"
                  dark={false}
                />
              </div>
            </div>
          </div>

          {/* Quick Match Panel (Separated into Explicit vs Universal) */}
          {selectedBrand && selectedModel && selectedYear && (
            <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-200/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <Car size={16} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                      Vehicle Selection Match
                    </p>
                    <h3 className="text-base font-black text-emerald-950">
                      {selectedBrand} {selectedModel}{" "}
                      <span className="font-semibold text-emerald-800">
                        ({selectedYear})
                      </span>
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs">
                    <Sparkles size={13} />
                    {quickMatchResults.explicit.length + quickMatchResults.universal.length} Total Matches
                  </span>
                </div>
              </div>

              {/* Section A: Compatible Products (Vehicle-Specific) */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Car size={14} className="text-emerald-700" />
                  Section A — Vehicle-Specific Compatible Products ({quickMatchResults.explicit.length})
                </h4>

                {quickMatchResults.explicit.length === 0 ? (
                  <p className="text-xs text-emerald-700 italic bg-white/60 p-3 rounded-xl border border-emerald-200/50">
                    No explicit vehicle-specific products configured for {selectedBrand} {selectedModel} ({selectedYear}).
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {quickMatchResults.explicit.map((p, i) => (
                      <div
                        key={i}
                        className="bg-white border border-emerald-200 text-emerald-950 text-xs px-3 py-1.5 rounded-xl font-semibold flex items-center gap-2 shadow-xs"
                      >
                        <span>{p.name}</span>
                        <code className="text-[11px] text-slate-500 font-mono">{p.sku}</code>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                          ₹{p.price.toLocaleString()}
                        </span>
                        {renderStockBadge(p.stock, p.lowStockThreshold)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section B: Universal Fit Products */}
              <div className="space-y-2 pt-2 border-t border-emerald-200/60">
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe size={14} className="text-amber-600" />
                  Section B — Universal Fit Products ({quickMatchResults.universal.length})
                </h4>

                {quickMatchResults.universal.length === 0 ? (
                  <p className="text-xs text-amber-700 italic bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/50">
                    No Universal Fit products currently flagged in inventory.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {quickMatchResults.universal.map((p) => (
                      <div
                        key={p.id}
                        className="bg-amber-50/90 border border-amber-200 text-amber-950 text-xs px-3 py-1.5 rounded-xl font-semibold flex items-center gap-2 shadow-xs"
                      >
                        <Sparkles size={12} className="text-amber-600" />
                        <span>{p.name}</span>
                        <code className="text-[11px] text-amber-700 font-mono">{p.sku}</code>
                        <span className="text-amber-800 font-bold bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200">
                          ₹{p.sellPrice.toLocaleString()}
                        </span>
                        {renderStockBadge(p.stock, p.lowStockThreshold)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Fitment Vehicle Groups Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            {fitments.length === 0 ? (
              <div className="p-16 text-center flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300">
                  <PackageSearch size={32} />
                </div>
                <div className="max-w-md">
                  <h3 className="text-slate-800 text-base font-bold">
                    No Vehicle Fitment Data Yet
                  </h3>
                  <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                    Vehicle compatibility information is added directly to products inside Inventory. Once products are tagged with car brands and models, they will automatically appear here.
                  </p>
                </div>
                {isOwner && (
                  <Link
                    href="/inventory"
                    className="inline-flex items-center gap-2 text-xs text-white bg-navy-950 hover:bg-navy-850 px-4 py-2.5 rounded-xl font-semibold transition-colors shadow-xs"
                  >
                    <ExternalLink size={13} className="text-amber-400" />
                    Go to Inventory to Add Compatibility
                  </Link>
                )}
              </div>
            ) : filteredFitments.length === 0 ? (
              <div className="p-14 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500">
                  <XCircle size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    No Matching Vehicle Fitments Found
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    No fitment records match your current vehicle selection or search query.
                  </p>
                </div>
                <button
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3.5 py-2 rounded-xl font-semibold transition-colors cursor-pointer mt-1"
                >
                  <XCircle size={13} />
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs text-slate-500 uppercase tracking-wider font-semibold">
                      <th className="px-4 py-3.5 text-left w-10" />
                      <th className="px-5 py-3.5 text-left">Make / Brand</th>
                      <th className="px-5 py-3.5 text-left">Model</th>
                      <th className="px-5 py-3.5 text-left">Year</th>
                      <th className="px-5 py-3.5 text-left">Compatible Parts Preview</th>
                      <th className="px-5 py-3.5 text-right">Compatible Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFitments.map((fitment) => {
                      const isExpanded = expandedFitmentId === fitment.id;
                      return (
                        <Fragment key={fitment.id}>
                          <tr
                            onClick={() =>
                              setExpandedFitmentId(isExpanded ? null : fitment.id)
                            }
                            className={`cursor-pointer transition-colors ${
                              isExpanded
                                ? "bg-amber-50/60 border-l-4 border-l-amber-500"
                                : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td className="px-4 py-4 text-slate-400">
                              <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-600">
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </div>
                            </td>
                            <td className="px-5 py-4 font-bold text-navy-950">
                              {fitment.brand}
                            </td>
                            <td className="px-5 py-4 text-slate-700 font-medium">
                              {fitment.model}
                            </td>
                            <td className="px-5 py-4">
                              <span className="bg-slate-100 text-slate-700 border border-slate-200/60 text-xs px-2.5 py-1 rounded-lg font-bold">
                                {fitment.yearTo && fitment.yearTo !== fitment.year ? `${fitment.year}–${fitment.yearTo}` : fitment.year}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-wrap gap-1.5">
                                {fitment.products.slice(0, 3).map((p, i) => (
                                  <span
                                    key={i}
                                    className="bg-amber-50 text-amber-800 border border-amber-200/80 text-xs px-2.5 py-0.5 rounded-md font-medium"
                                  >
                                    {p.name}
                                  </span>
                                ))}
                                {fitment.products.length > 3 && (
                                  <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-md font-medium">
                                    +{fitment.products.length - 3} more
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <span className="inline-flex items-center gap-1 bg-navy-50 text-navy-800 border border-navy-100 text-xs font-bold px-3 py-1 rounded-full">
                                <Tag size={11} className="text-navy-600" />
                                {fitment.products.length} Part{fitment.products.length === 1 ? "" : "s"}
                              </span>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-50/70 border-b border-slate-200/80">
                              <td colSpan={6} className="px-6 py-5">
                                <div className="space-y-3">
                                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <PackageSearch size={14} />
                                    All Compatible Products for {fitment.brand} {fitment.model} ({fitment.yearTo && fitment.yearTo !== fitment.year ? `${fitment.year}–${fitment.yearTo}` : fitment.year})
                                  </p>
                                  <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200/60 text-slate-500 uppercase tracking-wider font-semibold">
                                          <th className="px-4 py-2.5 text-left">Product Name</th>
                                          <th className="px-4 py-2.5 text-left">SKU</th>
                                          <th className="px-4 py-2.5 text-left">Category</th>
                                          <th className="px-4 py-2.5 text-left">Stock Status</th>
                                          <th className="px-4 py-2.5 text-right">Sell Price</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {fitment.products.map((p, i) => (
                                          <tr key={i} className="hover:bg-amber-50/40 transition-colors">
                                            <td className="px-4 py-3 font-semibold text-slate-900">
                                              {p.name}
                                            </td>
                                            <td className="px-4 py-3">
                                              <code className="bg-slate-100 text-slate-600 text-[11px] px-2 py-0.5 rounded font-mono">
                                                {p.sku}
                                              </code>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 font-medium">
                                              {p.category}
                                            </td>
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                {p.status === "Inactive" ? (
                                                  <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
                                                    Inactive
                                                  </span>
                                                ) : p.status === "Discontinued" ? (
                                                  <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                                                    Discontinued
                                                  </span>
                                                ) : null}
                                                {renderStockBadge(p.stock, p.lowStockThreshold)}
                                              </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-900">
                                              ₹{p.price.toLocaleString()}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODE 2: BY PRODUCT REVERSE FITMENT SEARCH VIEW ──────────────────── */}
      {viewMode === "by-product" && (
        <div className="space-y-6">
          {/* Search Bar for Product Mode */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3 shadow-xs">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
              <PackageSearch size={15} className="text-amber-500" />
              Search Product catalog to reverse-lookup vehicle compatibility
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search products by Name, SKU, or Category (e.g., 'LED', 'SKU-101', 'Lighting')..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all font-medium text-slate-800 placeholder:text-slate-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Showing {productSearchResults.length} of {state.products.length} products
            </p>
          </div>

          {/* Product Results List */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            {productSearchResults.length === 0 ? (
              <div className="p-14 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                  <PackageSearch size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    No Matching Products Found
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    No products match your current search criteria.
                  </p>
                </div>
                <button
                  onClick={() => setSearch("")}
                  className="text-xs text-navy-950 font-semibold underline hover:text-navy-800 cursor-pointer"
                >
                  Reset Search
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs text-slate-500 uppercase tracking-wider font-semibold">
                      <th className="px-5 py-3.5 text-left">Product Name</th>
                      <th className="px-4 py-3.5 text-left">SKU</th>
                      <th className="px-4 py-3.5 text-left">Category</th>
                      <th className="px-4 py-3.5 text-right">Sell Price</th>
                      <th className="px-4 py-3.5 text-left">Stock Status</th>
                      <th className="px-5 py-3.5 text-left">Vehicle Compatibility State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productSearchResults.map((prod) => {
                      const fitmentsList = prod.fitments || [];

                      return (
                        <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-5 py-4 font-bold text-navy-950">
                            {prod.name}
                          </td>
                          <td className="px-4 py-4">
                            <code className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-md font-mono">
                              {prod.sku}
                            </code>
                          </td>
                          <td className="px-4 py-4 text-slate-600 font-medium">
                            {prod.category || "Uncategorized"}
                          </td>
                          <td className="px-4 py-4 text-right font-black text-slate-900">
                            ₹{prod.sellPrice.toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            {renderStockBadge(prod.stock, prod.lowStockThreshold)}
                          </td>
                          <td className="px-5 py-4">
                            {prod.isUniversalFit || fitmentsList.length > 0 ? (
                              <div className="space-y-2">
                                {prod.isUniversalFit && (
                                  <span className="inline-flex items-center gap-1.5 bg-amber-100/90 text-amber-900 border border-amber-300/80 text-xs px-3 py-1 rounded-xl font-bold shadow-2xs">
                                    <Sparkles size={13} className="text-amber-600" />
                                    Universal Fit — Compatible with all vehicles
                                  </span>
                                )}
                                {fitmentsList.length > 0 && (
                                  <div className="space-y-1">
                                    {prod.isUniversalFit && (
                                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                        Explicit Vehicle Fitments
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-1 max-w-md">
                                      {fitmentsList.slice(0, 4).map((f, idx) => (
                                        <span
                                          key={idx}
                                          className="bg-slate-100 text-slate-700 text-[11px] px-2 py-0.5 rounded font-medium border border-slate-200/60"
                                        >
                                          {formatFitmentDisplay(f)}
                                        </span>
                                      ))}
                                      {fitmentsList.length > 4 && (
                                        <span className="bg-slate-100 text-slate-500 text-[11px] px-1.5 py-0.5 rounded font-medium">
                                          +{fitmentsList.length - 4} more
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 text-xs px-2.5 py-1 rounded-lg font-medium">
                                <Info size={12} className="text-slate-400" />
                                No Fitment Configured
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
        </div>
      )}

      {/* Footer info */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1 pt-2 border-t border-slate-200/60">
        <span>
          AutoVault ERP — Vehicle Fitment Engine (Phase 2A)
        </span>
        <span>
          Role: <strong className="text-slate-600 uppercase">{isOwner ? "Owner (Full Access)" : "Staff (Read-Only)"}</strong>
        </span>
      </div>
    </div>
  );
}