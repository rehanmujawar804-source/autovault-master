"use client";

import { useState, useMemo, Fragment } from "react";
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
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  VEHICLE FITMENT PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function VehicleFitmentPage() {
  const { state } = useStore();
  const { isOwner } = useRole();

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [expandedFitmentId, setExpandedFitmentId] = useState<string | null>(null);

  // ── Derived Fitments list ─────────────────────────────────────────────────
  const fitments = useMemo(() => {
    const map: Record<
      string,
      {
        brand: string;
        model: string;
        year: string;
        products: { name: string; sku: string; price: number; category: string }[];
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

  // ── Derived filter options ────────────────────────────────────────────────
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

  // ── Filtered fitments ─────────────────────────────────────────────────────
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

  // ── Compatible products panel (when brand, model & year are selected) ──────
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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-navy-950">Vehicle Fitment</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Compatible products by car brand, model &amp; year — managed via Inventory.
          </p>
        </div>
        {isOwner && (
          <Link
            href="/inventory"
            className="flex items-center gap-2 bg-navy-950 hover:bg-navy-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <ExternalLink size={14} />
            Manage in Inventory
          </Link>
        )}
      </div>

      {/* ── Coverage KPI Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {/* Total Rules */}
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-navy-50 flex items-center justify-center flex-shrink-0">
            <Layers size={17} className="text-navy-700" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
              Fitment Rules
            </p>
            <p className="text-2xl font-bold text-slate-900 leading-tight">
              {coverageStats.totalRules}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">vehicle combinations</p>
          </div>
        </div>

        {/* Unique Brands */}
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Car size={17} className="text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
              Brands Covered
            </p>
            <p className="text-2xl font-bold text-slate-900 leading-tight">
              {coverageStats.uniqueBrands}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">unique makes</p>
          </div>
        </div>

        {/* Unique Models */}
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
            <BarChart2 size={17} className="text-violet-500" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
              Models Mapped
            </p>
            <p className="text-2xl font-bold text-slate-900 leading-tight">
              {coverageStats.uniqueModels}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">brand+model pairs</p>
          </div>
        </div>

        {/* Coverage Index */}
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              coverageStats.coverageIndex >= 70
                ? "bg-green-50"
                : coverageStats.coverageIndex >= 40
                ? "bg-amber-50"
                : "bg-red-50"
            }`}
          >
            <ShieldCheck
              size={17}
              className={
                coverageStats.coverageIndex >= 70
                  ? "text-green-500"
                  : coverageStats.coverageIndex >= 40
                  ? "text-amber-500"
                  : "text-red-400"
              }
            />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
              Coverage Index
            </p>
            <p
              className={`text-2xl font-bold leading-tight ${
                coverageStats.coverageIndex >= 70
                  ? "text-green-600"
                  : coverageStats.coverageIndex >= 40
                  ? "text-amber-600"
                  : "text-red-500"
              }`}
            >
              {coverageStats.coverageIndex}%
            </p>
            <p className="text-xs text-slate-400 mt-0.5">products with fitment</p>
          </div>
        </div>
      </div>

      {/* ── Filter Panel ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search brand, model, year, product…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
            />
          </div>

          {/* Brand */}
          <select
            value={selectedBrand}
            onChange={(e) => {
              setSelectedBrand(e.target.value);
              setSelectedModel("");
              setSelectedYear("");
            }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition text-slate-700"
          >
            <option value="">All Brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {/* Model */}
          <select
            value={selectedModel}
            onChange={(e) => {
              setSelectedModel(e.target.value);
              setSelectedYear("");
            }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition text-slate-700"
          >
            <option value="">All Models</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Year */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition text-slate-700"
          >
            <option value="">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Compatible Products Quick Panel (when all 3 selected) ──────────────── */}
      {compatibleProducts.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-4">
          <h2 className="font-semibold text-green-800 mb-3 flex items-center gap-2 text-sm">
            <Car size={15} />
            Compatible products for{" "}
            <span className="font-bold">
              {selectedBrand} {selectedModel} ({selectedYear})
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {compatibleProducts.map((p, i) => (
              <span
                key={i}
                className="bg-white border border-green-200 text-green-800 text-xs px-2.5 py-1 rounded-lg font-medium"
              >
                {p.name}
                <span className="ml-1.5 text-green-500 font-normal">
                  ₹{p.price.toLocaleString()}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Fitment Table ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {fitments.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
              <PackageSearch size={28} className="text-slate-300" />
            </div>
            <div>
              <p className="text-slate-600 text-sm font-semibold">
                No fitment data yet
              </p>
              <p className="text-slate-400 text-xs mt-1 max-w-xs">
                Add vehicle compatibility to your products in Inventory to see them here.
              </p>
            </div>
            {isOwner && (
              <Link
                href="/inventory"
                className="inline-flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-semibold hover:underline transition-colors"
              >
                <ExternalLink size={13} />
                Go to Inventory to add compatibility
              </Link>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
              <XCircle size={20} className="text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">No matching fitments</p>
              <p className="text-xs text-slate-400 mt-0.5">
                No fitment records match the selected filters.
              </p>
            </div>
            <button
              onClick={() => {
                setSearch("");
                setSelectedBrand("");
                setSelectedModel("");
                setSelectedYear("");
              }}
              className="inline-flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-semibold transition-colors cursor-pointer"
            >
              <XCircle size={12} />
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left font-semibold w-8" />
                  <th className="px-5 py-3 text-left font-semibold">Brand</th>
                  <th className="px-5 py-3 text-left font-semibold">Model</th>
                  <th className="px-5 py-3 text-left font-semibold">Year</th>
                  <th className="px-5 py-3 text-left font-semibold">
                    Compatible Products
                  </th>
                  <th className="px-5 py-3 text-right font-semibold">Count</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((fitment) => {
                  const isExpanded = expandedFitmentId === fitment.id;
                  return (
                    <Fragment key={fitment.id}>
                      {/* ── Main Row ── */}
                      <tr
                        onClick={() =>
                          setExpandedFitmentId(isExpanded ? null : fitment.id)
                        }
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${
                          isExpanded
                            ? "bg-amber-50 border-amber-100"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        {/* Expand toggle */}
                        <td className="px-4 py-3.5 text-slate-400">
                          {isExpanded ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </td>

                        {/* Brand */}
                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-slate-800">
                            {fitment.brand}
                          </span>
                        </td>

                        {/* Model */}
                        <td className="px-5 py-3.5 text-slate-700">
                          {fitment.model}
                        </td>

                        {/* Year badge */}
                        <td className="px-5 py-3.5">
                          <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full font-semibold">
                            {fitment.year}
                          </span>
                        </td>

                        {/* Product pills */}
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            {fitment.products.slice(0, 3).map((p, i) => (
                              <span
                                key={i}
                                className="bg-amber-50 text-amber-700 border border-amber-200 text-xs px-2 py-0.5 rounded-md font-medium"
                              >
                                {p.name}
                              </span>
                            ))}
                            {fitment.products.length > 3 && (
                              <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-md">
                                +{fitment.products.length - 3} more
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Count */}
                        <td className="px-5 py-3.5 text-right">
                          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full">
                            <Tag size={10} />
                            {fitment.products.length}
                          </span>
                        </td>
                      </tr>

                      {/* ── Expandable Details Pane ── */}
                      {isExpanded && (
                        <tr className="border-b border-amber-100 bg-amber-50/50">
                          <td colSpan={6} className="px-6 pb-5 pt-2">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                              {/* Products List */}
                              <div className="lg:col-span-2">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                  All Compatible Products
                                </p>
                                <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-slate-50 border-b border-slate-100">
                                        <th className="px-4 py-2 text-left text-slate-400 font-semibold uppercase tracking-wide">
                                          Product Name
                                        </th>
                                        <th className="px-4 py-2 text-left text-slate-400 font-semibold uppercase tracking-wide">
                                          SKU
                                        </th>
                                        <th className="px-4 py-2 text-left text-slate-400 font-semibold uppercase tracking-wide">
                                          Category
                                        </th>
                                        <th className="px-4 py-2 text-right text-slate-400 font-semibold uppercase tracking-wide">
                                          Sell Price
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                      {fitment.products.map((p, i) => (
                                        <tr
                                          key={i}
                                          className="hover:bg-amber-50 transition-colors"
                                        >
                                          <td className="px-4 py-2.5 font-medium text-slate-800">
                                            {p.name}
                                          </td>
                                          <td className="px-4 py-2.5">
                                            <code className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded font-mono">
                                              {p.sku}
                                            </code>
                                          </td>
                                          <td className="px-4 py-2.5 text-slate-500">
                                            {p.category}
                                          </td>
                                          <td className="px-4 py-2.5 text-right font-semibold text-slate-700">
                                            ₹{p.price.toLocaleString()}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Side Info Panel */}
                              <div className="flex flex-col gap-3">
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                    Vehicle Info
                                  </p>
                                  <div className="bg-white rounded-xl border border-amber-100 p-4 space-y-2">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-slate-400">Brand</span>
                                      <span className="font-semibold text-slate-700">
                                        {fitment.brand}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-slate-400">Model</span>
                                      <span className="font-semibold text-slate-700">
                                        {fitment.model}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-slate-400">Year</span>
                                      <span className="font-semibold text-slate-700">
                                        {fitment.year}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-xs border-t border-slate-100 pt-2 mt-1">
                                      <span className="text-slate-400">
                                        Total Parts
                                      </span>
                                      <span className="font-bold text-amber-600">
                                        {fitment.products.length}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Categories */}
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                    Categories
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {[
                                      ...new Set(
                                        fitment.products.map((p) => p.category)
                                      ),
                                    ].map((cat, i) => (
                                      <span
                                        key={i}
                                        className="bg-violet-50 text-violet-700 border border-violet-100 text-xs px-2 py-0.5 rounded-md font-medium"
                                      >
                                        {cat}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {isOwner && (
                                  <Link
                                    href="/inventory"
                                    className="flex items-center justify-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg transition-colors mt-auto"
                                  >
                                    <ExternalLink size={12} />
                                    Edit in Inventory
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
        )}
      </div>

      {/* Footer count */}
      <p className="text-xs text-slate-400 mt-2 px-1">
        Showing {filtered.length} of {fitments.length} fitment rules
      </p>
    </div>
  );
}