"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
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
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  VEHICLE FITMENT PAGE — PHASE 1 UI/UX ENHANCEMENT
// ─────────────────────────────────────────────────────────────────────────────

export default function VehicleFitmentPage() {
  const { state } = useStore();
  const { isOwner, loading, requireAuth } = useRole();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  // ── Filters State ────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [expandedFitmentId, setExpandedFitmentId] = useState<string | null>(null);

  // ── Derived Fitments List ─────────────────────────────────────────────────
  // Aggregates fitment data directly from state.products (Read-Only)
  const fitments = useMemo(() => {
    const map: Record<
      string,
      {
        brand: string;
        model: string;
        year: string;
        products: {
          name: string;
          sku: string;
          price: number;
          category: string;
          stock: number;
          lowStockThreshold: number;
        }[];
      }
    > = {};

    for (const product of state.products) {
      const productFitments = product.fitments || [];
      for (const fit of productFitments) {
        const key = `${fit.brand.trim()}|${fit.model.trim()}|${fit.year.trim()}`;
        if (!map[key]) {
          map[key] = {
            brand: fit.brand,
            model: fit.model,
            year: fit.year,
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
          });
        }
      }
    }

    return Object.entries(map).map(([, value], idx) => ({
      id: `derived-fit-${idx}`,
      brand: value.brand,
      model: value.model,
      year: value.year,
      products: value.products,
    }));
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

  const years = useMemo(
    () =>
      [
        ...new Set(
          fitments
            .filter(
              (f) =>
                (!selectedBrand || f.brand === selectedBrand) &&
                (!selectedModel || f.model === selectedModel)
            )
            .map((f) => f.year)
        ),
      ].sort((a, b) => Number(b) - Number(a)),
    [fitments, selectedBrand, selectedModel]
  );

  // ── Filtered Fitments Search & Select Logic ──────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fitments.filter((f) => {
      const matchSearch =
        !q ||
        f.brand.toLowerCase().includes(q) ||
        f.model.toLowerCase().includes(q) ||
        f.year.includes(q) ||
        f.products.some((p) => p.name.toLowerCase().includes(q));
      const matchBrand = !selectedBrand || f.brand === selectedBrand;
      const matchModel = !selectedModel || f.model === selectedModel;
      const matchYear = !selectedYear || f.year === selectedYear;
      return matchSearch && matchBrand && matchModel && matchYear;
    });
  }, [fitments, search, selectedBrand, selectedModel, selectedYear]);

  // ── Compatible Products Quick Panel Match ─────────────────────────────────
  const compatibleProducts = useMemo(() => {
    if (!selectedBrand || !selectedModel || !selectedYear) return [];
    const match = fitments.find(
      (f) =>
        f.brand === selectedBrand &&
        f.model === selectedModel &&
        f.year === selectedYear
    );
    return match ? match.products : [];
  }, [fitments, selectedBrand, selectedModel, selectedYear]);

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
      (p) => p.fitments && p.fitments.length > 0
    ).length;
    const coverageIndex =
      totalProducts > 0
        ? Math.round((productsWithFitment / totalProducts) * 100)
        : 0;
    return { totalRules, uniqueBrands, uniqueModels, coverageIndex };
  }, [fitments, state.products]);

  // Check if any filter is currently active
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
                Vehicle Fitment
              </h1>
              <p className="text-sm text-slate-500 font-normal">
                Find compatible products by vehicle make, model, and year.
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

        {/* Models Mapped */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs hover:border-slate-300 transition-all">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0 text-violet-600">
            <BarChart2 size={18} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              Models Mapped
            </p>
            <p className="text-2xl font-black text-slate-900 leading-tight">
              {coverageStats.uniqueModels}
            </p>
            <p className="text-xs text-slate-500 font-medium">brand+model pairs</p>
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
            <p className="text-xs text-slate-500 font-medium">products with fitment</p>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls Panel ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4 shadow-xs">
        {/* Global Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search vehicles or compatible products..."
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

        {/* Stepper Label */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <SlidersHorizontal size={13} className="text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Cascading Vehicle Selector
          </span>
        </div>

        {/* Cascading 3-Step Vehicle Selectors (Make -> Model -> Year) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* STEP 1: MAKE / BRAND */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
              <span>Step 1: Make</span>
              {selectedBrand && (
                <span className="text-emerald-600 font-semibold text-[10px]">Active</span>
              )}
            </label>
            <div className="relative">
              <select
                value={selectedBrand}
                onChange={(e) => {
                  setSelectedBrand(e.target.value);
                  setSelectedModel("");
                  setSelectedYear("");
                }}
                className="w-full appearance-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all font-medium text-slate-800 pr-8 cursor-pointer"
              >
                <option value="">All Makes (Brands)</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>
          </div>

          {/* STEP 2: MODEL (Dependent on Make) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
              <span>Step 2: Model</span>
              {selectedModel ? (
                <span className="text-emerald-600 font-semibold text-[10px]">Active</span>
              ) : !selectedBrand ? (
                <span className="text-slate-400 text-[10px]">Select Make First</span>
              ) : null}
            </label>
            <div className="relative">
              <select
                disabled={!selectedBrand && models.length === 0}
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  setSelectedYear("");
                }}
                className={`w-full appearance-none border rounded-xl px-3.5 py-2.5 text-sm transition-all font-medium pr-8 ${
                  !selectedBrand
                    ? "bg-slate-100/70 border-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-slate-50 border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 text-slate-800 cursor-pointer"
                }`}
              >
                <option value="">
                  {!selectedBrand ? "Select Make First..." : "All Models"}
                </option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>
          </div>

          {/* STEP 3: YEAR (Dependent on Model & Make) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
              <span>Step 3: Year</span>
              {selectedYear ? (
                <span className="text-emerald-600 font-semibold text-[10px]">Active</span>
              ) : !selectedModel ? (
                <span className="text-slate-400 text-[10px]">Select Model First</span>
              ) : null}
            </label>
            <div className="relative">
              <select
                disabled={!selectedModel && years.length === 0}
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className={`w-full appearance-none border rounded-xl px-3.5 py-2.5 text-sm transition-all font-medium pr-8 ${
                  !selectedModel
                    ? "bg-slate-100/70 border-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-slate-50 border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 text-slate-800 cursor-pointer"
                }`}
              >
                <option value="">
                  {!selectedModel ? "Select Model First..." : "All Years"}
                </option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Match Panel (Triggers when Make + Model + Year are all selected) ── */}
      {selectedBrand && selectedModel && selectedYear && (
        <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-5 shadow-xs transition-all animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-emerald-200/60">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <Car size={16} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                  Vehicle Selected
                </p>
                <h3 className="text-base font-black text-emerald-950">
                  {selectedBrand} {selectedModel}{" "}
                  <span className="font-semibold text-emerald-800">
                    ({selectedYear})
                  </span>
                </h3>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs">
              <Sparkles size={13} />
              {compatibleProducts.length} Compatible Product
              {compatibleProducts.length === 1 ? "" : "s"} Found
            </div>
          </div>

          {compatibleProducts.length === 0 ? (
            <p className="text-xs font-medium text-emerald-700 italic">
              No products found associated with this specific vehicle selection.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {compatibleProducts.map((p, i) => (
                <div
                  key={i}
                  className="bg-white border border-emerald-200 text-emerald-950 text-xs px-3 py-1.5 rounded-xl font-semibold flex items-center gap-2 shadow-xs"
                >
                  <span>{p.name}</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                    ₹{p.price.toLocaleString()}
                  </span>
                  {renderStockBadge(p.stock, p.lowStockThreshold)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Main Vehicle Groups Presentation ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        {fitments.length === 0 ? (
          /* Empty State 1: No Fitment Data in Store */
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
                Go to Inventory to Add Vehicle Compatibility
              </Link>
            )}
          </div>
        ) : filtered.length === 0 ? (
          /* Empty State 2: No Filter Matches */
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
          /* Fitments Results List / Table */
          <div>
            {/* Desktop Table View */}
            <div className="overflow-x-auto hidden sm:block">
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
                  {filtered.map((fitment) => {
                    const isExpanded = expandedFitmentId === fitment.id;
                    return (
                      <Fragment key={fitment.id}>
                        {/* Main Row */}
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
                          {/* Toggle Icon */}
                          <td className="px-4 py-4 text-slate-400">
                            <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-600">
                              {isExpanded ? (
                                <ChevronUp size={14} />
                              ) : (
                                <ChevronDown size={14} />
                              )}
                            </div>
                          </td>

                          {/* Brand */}
                          <td className="px-5 py-4 font-bold text-navy-950">
                            {fitment.brand}
                          </td>

                          {/* Model */}
                          <td className="px-5 py-4 text-slate-700 font-medium">
                            {fitment.model}
                          </td>

                          {/* Year */}
                          <td className="px-5 py-4">
                            <span className="bg-slate-100 text-slate-700 border border-slate-200/60 text-xs px-2.5 py-1 rounded-lg font-bold">
                              {fitment.year}
                            </span>
                          </td>

                          {/* Product Preview Pills */}
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

                          {/* Count Badge */}
                          <td className="px-5 py-4 text-right">
                            <span className="inline-flex items-center gap-1 bg-navy-50 text-navy-800 border border-navy-100 text-xs font-bold px-3 py-1 rounded-full">
                              <Tag size={11} className="text-navy-600" />
                              {fitment.products.length} Part
                              {fitment.products.length === 1 ? "" : "s"}
                            </span>
                          </td>
                        </tr>

                        {/* Expandable Product List Drawer */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70 border-b border-slate-200/80">
                            <td colSpan={6} className="px-6 py-5">
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                {/* Left Section: Detailed Compatible Products Table */}
                                <div className="lg:col-span-2 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                      <PackageSearch size={14} />
                                      All Compatible Products ({fitment.products.length})
                                    </p>
                                  </div>
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
                                          <tr
                                            key={i}
                                            className="hover:bg-amber-50/40 transition-colors"
                                          >
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
                                              {renderStockBadge(p.stock, p.lowStockThreshold)}
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

                                {/* Right Section: Summary Info Card */}
                                <div className="space-y-4 flex flex-col justify-between">
                                  <div className="space-y-3">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                      Vehicle Summary
                                    </p>
                                    <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-2.5 text-xs shadow-2xs">
                                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                        <span className="text-slate-400 font-medium">Make</span>
                                        <span className="font-bold text-navy-950">
                                          {fitment.brand}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                        <span className="text-slate-400 font-medium">Model</span>
                                        <span className="font-bold text-navy-950">
                                          {fitment.model}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                        <span className="text-slate-400 font-medium">Year</span>
                                        <span className="font-bold text-slate-800">
                                          {fitment.year}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center pt-1">
                                        <span className="text-slate-500 font-semibold">
                                          Total Compatible Parts
                                        </span>
                                        <span className="font-extrabold text-amber-600 text-sm">
                                          {fitment.products.length}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Categories Tag Cloud */}
                                    <div className="space-y-1.5">
                                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                        Categories Covered
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {[
                                          ...new Set(
                                            fitment.products.map((p) => p.category)
                                          ),
                                        ].map((cat, idx) => (
                                          <span
                                            key={idx}
                                            className="bg-violet-50 text-violet-700 border border-violet-100 text-xs px-2.5 py-0.5 rounded-md font-medium"
                                          >
                                            {cat}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Existing Owner-only CTA inside expanded pane */}
                                  {isOwner && (
                                    <Link
                                      href="/inventory"
                                      className="inline-flex items-center justify-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition-colors shadow-2xs mt-2"
                                    >
                                      <ExternalLink size={12} className="text-amber-500" />
                                      Edit Fitments in Inventory
                                    </Link>
                                  )}
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

            {/* Mobile / Small Screen Fallback Card View */}
            <div className="block sm:hidden divide-y divide-slate-100">
              {filtered.map((fitment) => {
                const isExpanded = expandedFitmentId === fitment.id;
                return (
                  <div key={fitment.id} className="p-4 space-y-3">
                    <div
                      onClick={() =>
                        setExpandedFitmentId(isExpanded ? null : fitment.id)
                      }
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-navy-950 text-base">
                            {fitment.brand} {fitment.model}
                          </span>
                          <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-md font-bold">
                            {fitment.year}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {fitment.products.length} compatible product
                          {fitment.products.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="pt-3 border-t border-slate-100 space-y-3">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Compatible Parts List
                        </p>
                        <div className="space-y-2">
                          {fitment.products.map((p, i) => (
                            <div
                              key={i}
                              className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-xs space-y-1.5"
                            >
                              <div className="flex justify-between font-bold text-slate-900">
                                <span>{p.name}</span>
                                <span>₹{p.price.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center text-[11px] text-slate-500">
                                <span>SKU: {p.sku}</span>
                                <span>{p.category}</span>
                              </div>
                              <div className="pt-1">
                                {renderStockBadge(p.stock, p.lowStockThreshold)}
                              </div>
                            </div>
                          ))}
                        </div>
                        {isOwner && (
                          <Link
                            href="/inventory"
                            className="w-full flex items-center justify-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold py-2 rounded-xl transition-colors"
                          >
                            <ExternalLink size={12} className="text-amber-500" />
                            Manage in Inventory
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer Rule Count */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Showing <strong className="text-slate-600">{filtered.length}</strong> of{" "}
          <strong className="text-slate-600">{fitments.length}</strong> fitment rules
        </span>
        <span>AutoVault ERP — Vehicle Fitment Engine</span>
      </div>
    </div>
  );
}