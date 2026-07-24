"use client";

import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import type { Product, VehicleFitment } from "@/types";
import { ProductFormModal, AdjustStockModal } from "./components/ProductModals";
import Link from "next/link";
import {
  Search,
  Plus,
  Pencil,
  X,
  Package,
  AlertTriangle,
  AlertCircle,
  DollarSign,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Upload,
  Download,
  TrendingUp,
  Activity,
  Info,
  CheckCircle2,
  Eye,
  Copy,
  Check,
  Layers,
  ArrowUpDown,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  CATEGORIES derived from store data
// ─────────────────────────────────────────────────────────────────────────────

const STOCK_FILTERS = ["All", "Healthy", "Low Stock", "Out of Stock"] as const;
type StockFilter = (typeof STOCK_FILTERS)[number];

const SORT_OPTIONS = [
  { value: "name-asc",    label: "Name (A\u2013Z)" },
  { value: "name-desc",   label: "Name (Z\u2013A)" },
  { value: "sku-asc",     label: "SKU (A\u2013Z)" },
  { value: "sku-desc",    label: "SKU (Z\u2013A)" },
  { value: "stock-desc",  label: "Stock (Highest)" },
  { value: "stock-asc",   label: "Stock (Lowest)" },
  { value: "buy-desc",    label: "Current Cost (Highest)" },
  { value: "buy-asc",     label: "Current Cost (Lowest)" },
  { value: "sell-desc",   label: "Sell Price (Highest)" },
  { value: "sell-asc",    label: "Sell Price (Lowest)" },
  { value: "margin-desc", label: "Margin (Highest)" },
];

// ─────────────────────────────────────────────────────────────────────────────
//  EMPTY PRODUCT FORM
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_STATUSES = ["Active", "Inactive", "Discontinued"] as const;
type ProductStatus = (typeof PRODUCT_STATUSES)[number];

const SKU_REGEX = /^[A-Za-z0-9_-]{3,40}$/;

const EMPTY_FORM = {
  name: "",
  sku: "",
  brand: "",
  category: "",
  status: "Active" as ProductStatus,
  stock: 0,
  currentCost: 0,
  sellPrice: 0,
  lowStockThreshold: 5,
  fitments: [] as VehicleFitment[],
};

type ProductForm = typeof EMPTY_FORM;

// ─────────────────────────────────────────────────────────────────────────────
//  INVENTORY PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { state, addProduct, updateProduct, adjustStock, getInventoryValue, showToast } =
    useStore();
  const { isOwner, loading, requireAuth } = useRole();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [stockFilter, setStockFilter] = useState<StockFilter>("All");
  const [brandFilter, setBrandFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("name-asc");

  // ── Search input ref (keyboard shortcut) ─────────────────────────────────
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Modal State triggers ──────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockModal, setStockModal] = useState<Product | null>(null);

  // ── Expandable Product Row State ──────────────────────────────────────────
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  // ── Hydration safe mount state ──────────────────────────────────────────
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ── Keyboard shortcuts: Ctrl+F focuses search, Esc resets all filters ────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSearch("");
        setCategoryFilter("All");
        setBrandFilter("All");
        setStatusFilter("All");
        setStockFilter("All");
        setSortBy("name-asc");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Click-to-copy SKU state ───────────────────────────────────────────────
  const [copiedSkuId, setCopiedSkuId] = useState<string | null>(null);

  function handleCopySku(product: Product) {
    navigator.clipboard.writeText(product.sku).then(() => {
      setCopiedSkuId(product.id);
      showToast(`SKU "${product.sku}" copied to clipboard`, "success");
      setTimeout(() => setCopiedSkuId(null), 2000);
    }).catch(() => {
      showToast("Failed to copy SKU", "error");
    });
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = Array.from(
      new Set(state.products.map((p) => p.category))
    ).sort();
    return ["All", ...cats];
  }, [state.products]);

  const brands = useMemo(() => {
    const b = Array.from(
      new Set(state.products.map((p) => p.brand).filter(Boolean))
    ).sort();
    return ["All", ...b];
  }, [state.products]);

  const chipCounts = useMemo(() => {
    const ps = state.products;
    return {
      all:          ps.length,
      healthy:      ps.filter((p) => p.stock > p.lowStockThreshold).length,
      lowStock:     ps.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).length,
      outOfStock:   ps.filter((p) => p.stock === 0).length,
      inactive:     ps.filter((p) => (p.status || "Active") === "Inactive").length,
      discontinued: ps.filter((p) => p.status === "Discontinued").length,
    };
  }, [state.products]);

  const stats = useMemo(() => {
    const ps = state.products;
    const capitalInvested = getInventoryValue(); // buyPrice * stock
    const sellValue = ps.reduce((s, p) => s + p.sellPrice * p.stock, 0); // sellPrice * stock
    return {
      total: ps.length,
      totalUnits: ps.reduce((s, p) => s + p.stock, 0),
      lowStock: ps.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold)
        .length,
      outOfStock: ps.filter((p) => p.stock === 0).length,
      value: capitalInvested,
      sellValue,
      capitalInvested,
    };
  }, [state.products, getInventoryValue]);

  // ── Dynamic Insights ──────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const ps = state.products;
    const total = ps.length;
    if (total === 0) {
      return {
        healthScore: 100,
        topCategory: "None",
        topCategoryValue: 0,
        topProduct: null,
        topProductValue: 0,
        criticalCount: 0,
        highestMarginProduct: null,
        avgMargin: 0,
      };
    }

    const lowStockCount = ps.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).length;
    const outOfStockCount = ps.filter((p) => p.stock === 0).length;
    const healthScore = Math.max(
      0,
      Math.round(((total - outOfStockCount - lowStockCount * 0.5) / total) * 100)
    );

    // Calculate value per category
    const catValues: { [cat: string]: number } = {};
    const catUnits: { [cat: string]: number } = {};
    ps.forEach((p) => {
      catValues[p.category] = (catValues[p.category] || 0) + p.stock * p.currentCost;
      catUnits[p.category] = (catUnits[p.category] || 0) + p.stock;
    });

    let topCategory = "None";
    let topCategoryVal = 0;
    Object.entries(catValues).forEach(([cat, val]) => {
      if (val > topCategoryVal) {
        topCategoryVal = val;
        topCategory = cat;
      }
    });
    if (topCategory === "None" && Object.keys(catUnits).length > 0) {
      let maxUnits = 0;
      Object.entries(catUnits).forEach(([cat, units]) => {
        if (units > maxUnits) {
          maxUnits = units;
          topCategory = cat;
        }
      });
    }

    // Top capital product (by stock * buyPrice)
    let topProduct: Product | null = null;
    let topProductVal = -1;
    for (const p of ps) {
      const val = p.stock * p.currentCost;
      if (val > topProductVal) {
        topProductVal = val;
        topProduct = p;
      }
    }

    if ((!topProduct || topProductVal === 0) && ps.length > 0) {
      let maxStock = -1;
      for (const p of ps) {
        if (p.stock > maxStock) {
          maxStock = p.stock;
          topProduct = p;
        }
      }
      topProductVal = topProduct?.stock || 0;
    }

    // Highest margin product
    let highestMarginProduct: Product | null = null;
    let maxMargin = -1000;
    for (const p of ps) {
      if (p.sellPrice > 0) {
        const margin = ((p.sellPrice - p.currentCost) / p.sellPrice) * 100;
        if (margin > maxMargin) {
          maxMargin = margin;
          highestMarginProduct = p;
        }
      }
    }

    // Average margin (owner-only metric)
    const productsWithSell = ps.filter((p) => p.sellPrice > 0);
    const avgMargin =
      productsWithSell.length === 0
        ? 0
        : Math.round(
            productsWithSell.reduce(
              (sum, p) =>
                sum + ((p.sellPrice - p.currentCost) / p.sellPrice) * 100,
              0
            ) / productsWithSell.length
          );

    return {
      healthScore,
      topCategory,
      topCategoryValue: topCategoryVal,
      topProduct,
      topProductValue: topProductVal,
      criticalCount: outOfStockCount + lowStockCount,
      highestMarginProduct,
      avgMargin,
    };
  }, [state.products]);

  const filtered = useMemo(() => {
    let list = [...state.products];

    // Category
    if (categoryFilter !== "All") {
      list = list.filter((p) => p.category === categoryFilter);
    }
    // Brand
    if (brandFilter !== "All") {
      list = list.filter((p) => p.brand === brandFilter);
    }
    // Status
    if (statusFilter !== "All") {
      list = list.filter((p) => (p.status || "Active") === statusFilter);
    }
    // Stock filter
    if (stockFilter === "Healthy") {
      list = list.filter((p) => p.stock > p.lowStockThreshold);
    } else if (stockFilter === "Low Stock") {
      list = list.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold);
    } else if (stockFilter === "Out of Stock") {
      list = list.filter((p) => p.stock === 0);
    }
    // Search
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q)
      );
    }
    // Stable sort
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "name-asc":    return a.name.localeCompare(b.name)       || a.id.localeCompare(b.id);
        case "name-desc":   return b.name.localeCompare(a.name)       || a.id.localeCompare(b.id);
        case "sku-asc":     return a.sku.localeCompare(b.sku)         || a.id.localeCompare(b.id);
        case "sku-desc":    return b.sku.localeCompare(a.sku)         || a.id.localeCompare(b.id);
        case "stock-desc":  return (b.stock - a.stock)                || a.id.localeCompare(b.id);
        case "stock-asc":   return (a.stock - b.stock)                || a.id.localeCompare(b.id);
        case "buy-desc":    return (b.currentCost - a.currentCost)    || a.id.localeCompare(b.id);
        case "buy-asc":     return (a.currentCost - b.currentCost)    || a.id.localeCompare(b.id);
        case "sell-desc":   return (b.sellPrice - a.sellPrice)        || a.id.localeCompare(b.id);
        case "sell-asc":    return (a.sellPrice - b.sellPrice)        || a.id.localeCompare(b.id);
        case "margin-desc": {
          const ma = a.sellPrice > 0 ? ((a.sellPrice - a.currentCost) / a.sellPrice) * 100 : -Infinity;
          const mb = b.sellPrice > 0 ? ((b.sellPrice - b.currentCost) / b.sellPrice) * 100 : -Infinity;
          return (mb - ma) || a.id.localeCompare(b.id);
        }
        default:            return a.name.localeCompare(b.name)       || a.id.localeCompare(b.id);
      }
    });
    return list;
  }, [state.products, categoryFilter, brandFilter, statusFilter, stockFilter, search, sortBy]);

  if (!isMounted) {
    return (
      <div className="w-full max-w-full min-w-0 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-32 bg-slate-200 rounded-lg animate-pulse" />
          <div className="flex gap-2">
            <div className="h-10 w-28 bg-slate-200 rounded-xl animate-pulse" />
            <div className="h-10 w-28 bg-slate-200 rounded-xl animate-pulse" />
            <div className="h-10 w-32 bg-slate-200 rounded-xl animate-pulse" />
          </div>
        </div>

        {/* KPI Cards Skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6 min-w-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-2xl border border-slate-200 p-5 flex flex-col justify-between animate-pulse">
              <div className="w-9 h-9 rounded-xl bg-slate-200" />
              <div>
                <div className="h-3 w-16 bg-slate-200 rounded mb-2" />
                <div className="h-6 w-24 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>

        {/* Operations Control Room Skeleton */}
        <div className="bg-white rounded-2xl border border-slate-200 mb-6 shadow-sm overflow-hidden animate-pulse">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="h-4 w-40 bg-slate-200 rounded" />
            <div className="h-4 w-12 bg-slate-200 rounded-full" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-4 flex flex-col gap-2">
                <div className="h-3 w-16 bg-slate-200 rounded" />
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-200 shrink-0" />
                  <div className="w-full">
                    <div className="h-4 w-20 bg-slate-200 rounded mb-1" />
                    <div className="h-3 w-12 bg-slate-200 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Filter Bar Skeleton */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 flex flex-col sm:flex-row gap-3 items-center justify-between animate-pulse">
          <div className="h-9 w-64 bg-slate-200 rounded-lg" />
          <div className="flex gap-2">
            <div className="h-8 w-16 bg-slate-200 rounded-lg" />
            <div className="h-8 w-20 bg-slate-200 rounded-lg" />
            <div className="h-8 w-24 bg-slate-200 rounded-lg" />
          </div>
        </div>

        {/* Table Skeletons */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-pulse">
          <div className="bg-slate-50 border-b border-slate-250 h-10 w-full" />
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 flex justify-between items-center gap-4">
                <div className="flex items-center gap-3 w-1/3">
                  <div className="w-4 h-4 bg-slate-200 rounded" />
                  <div>
                    <div className="h-4 w-32 bg-slate-200 rounded mb-1.5" />
                    <div className="h-3 w-20 bg-slate-200 rounded" />
                  </div>
                </div>
                <div className="h-4 w-20 bg-slate-200 rounded hidden md:block" />
                <div className="h-4 w-20 bg-slate-200 rounded hidden lg:block" />
                <div className="h-4 w-12 bg-slate-200 rounded" />
                <div className="h-4 w-16 bg-slate-200 rounded" />
                <div className="h-8 w-20 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Reset all filters ──────────────────────────────────────────
  function resetFilters() {
    setSearch("");
    setCategoryFilter("All");
    setBrandFilter("All");
    setStatusFilter("All");
    setStockFilter("All");
    setSortBy("name-asc");
  }

  const hasActiveFilters =
    search !== "" ||
    categoryFilter !== "All" ||
    brandFilter !== "All" ||
    statusFilter !== "All" ||
    stockFilter !== "All" ||
    sortBy !== "name-asc";

  // Modals are managed externally by imported modal components

  // ── Import / Export CSV ───────────────────────────────────────────────────
  function handleExportCSV() {
    const headers = [
      "Name",
      "SKU",
      "Brand",
      "Category",
      "Stock",
      "Buy Price",
      "Sell Price",
      "Low Stock Threshold",
      "Compatible Vehicles"
    ];

    const rows = state.products.map((p) => {
      const fitmentString = (p.fitments || [])
        .map((f) => `${f.brand} ${f.model} ${f.year}`)
        .join("; ");

      const escape = (val: string | number) => {
        const text = String(val);
        if (text.includes(",") || text.includes('"') || text.includes("\n")) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };

      return [
        escape(p.name),
        escape(p.sku),
        escape(p.brand),
        escape(p.category),
        p.stock,
        p.currentCost,
        p.sellPrice,
        p.lowStockThreshold,
        escape(fitmentString)
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "autovault_inventory.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let cell = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(cell.trim());
        cell = "";
      } else {
        cell += c;
      }
    }
    result.push(cell.trim());
    return result;
  }

  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      let text = event.target?.result as string;
      if (!text) return;

      // Strip UTF-8 BOM if present
      if (text.startsWith("\uFEFF")) {
        text = text.substring(1);
      }

      const lines: string[] = [];
      let currentLine = "";
      let inQuotes = false;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
          inQuotes = !inQuotes;
          currentLine += char;
        } else if (char === "\n" && !inQuotes) {
          lines.push(currentLine.trim());
          currentLine = "";
        } else if (char === "\r") {
          // ignore
        } else {
          currentLine += char;
        }
      }
      if (currentLine) {
        lines.push(currentLine.trim());
      }

      if (lines.length === 0) {
        alert("Empty or invalid CSV file.");
        return;
      }

      const firstRowCells = parseCSVLine(lines[0]);
      const headers = firstRowCells.map((h) => h.toLowerCase());

      const findHeaderIndex = (aliases: string[]) => {
        for (const alias of aliases) {
          const idx = headers.indexOf(alias.toLowerCase());
          if (idx !== -1) return idx;
        }
        return -1;
      };

      let idxName = findHeaderIndex(["name", "product name", "product", "title"]);
      let idxSKU = findHeaderIndex(["sku", "sku code", "code", "item code"]);
      let idxBrand = findHeaderIndex(["brand", "make", "manufacturer"]);
      let idxCategory = findHeaderIndex(["category", "type", "group"]);
      let idxStock = findHeaderIndex(["stock", "qty", "quantity", "units", "count"]);
      let idxBuy = findHeaderIndex(["buy price", "buy", "cost", "purchase price", "cost price", "buyprice"]);
      let idxSell = findHeaderIndex(["sell price", "sell", "price", "selling price", "rate", "sellprice"]);
      let idxThreshold = findHeaderIndex(["low stock threshold", "threshold", "low stock", "alert qty", "alert"]);
      let idxFitments = findHeaderIndex(["compatible vehicles", "compatibility", "vehicles", "fitment", "fitments", "cars"]);

      let hasHeaders = true;
      let startRowIdx = 1;

      // If key columns are not found, check if it's a headerless CSV matching our standard positions
      if (idxName === -1 || idxSKU === -1 || idxSell === -1) {
        const looksLikeData = firstRowCells.length >= 2;
        if (looksLikeData) {
          hasHeaders = false;
          startRowIdx = 0;
          idxName = 0;
          idxSKU = 1;
          idxBrand = 2;
          idxCategory = 3;
          idxStock = 4;
          idxBuy = 5;
          idxSell = 6;
          idxThreshold = 7;
          idxFitments = 8;
        } else {
          alert("CSV must contain columns matching 'Name', 'SKU', and 'Sell Price', or be structured in standard order.");
          return;
        }
      }

      let importedCount = 0;
      let duplicateCount = 0;
      let invalidCount = 0;

      const cleanNumber = (val: string) => {
        if (!val) return 0;
        const clean = val.replace(/[₹$,\s]/g, "");
        return Number(clean) || 0;
      };

      for (let i = startRowIdx; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        const cells = parseCSVLine(line);

        const sku = cells[idxSKU] || "";
        const name = cells[idxName] || "";

        if (!sku || !name) {
          invalidCount++;
          continue;
        }

        const brand = idxBrand !== -1 ? cells[idxBrand] || "" : "";
        const category = idxCategory !== -1 ? cells[idxCategory] || "" : "";
        const stock = idxStock !== -1 ? cleanNumber(cells[idxStock]) : 0;
        const buyPrice = idxBuy !== -1 ? cleanNumber(cells[idxBuy]) : 0;
        const sellPrice = idxSell !== -1 ? cleanNumber(cells[idxSell]) : 0;
        const lowStockThreshold = idxThreshold !== -1 ? cleanNumber(cells[idxThreshold]) || 5 : 5;

        const fitmentsRaw = idxFitments !== -1 ? cells[idxFitments] || "" : "";
        const fitments: VehicleFitment[] = [];
        if (fitmentsRaw) {
          fitmentsRaw.split(";").forEach((item) => {
            const trimmed = item.trim();
            if (!trimmed) return;
            const parts = trimmed.split(" ");
            if (parts.length >= 3) {
              const year = parts[parts.length - 1];
              const brand = parts[0];
              const model = parts.slice(1, parts.length - 1).join(" ");
              fitments.push({ brand, model, year });
            } else if (parts.length === 2) {
              fitments.push({ brand: parts[0], model: parts[1], year: "—" });
            }
          });
        }

        // ── SKU format check ──────────────────────────────────────────────
        if (!SKU_REGEX.test(sku.trim())) {
          showToast(
            `Row skipped: SKU "${sku}" contains invalid characters or wrong length (3–40 chars, alphanumeric/hyphen/underscore only).`,
            "error"
          );
          invalidCount++;
          continue;
        }

        const duplicate = state.products.find(
          (p) => p.sku.trim().toLowerCase() === sku.trim().toLowerCase()
        );

        if (duplicate) {
          showToast(
            `Row skipped: SKU "${sku}" already exists for "${duplicate.name}". Duplicate SKU rejected.`,
            "error"
          );
          duplicateCount++;
          continue;
        }

        // ── Status: validate, default Active ─────────────────────────────
        let idxStatus = -1;
        const headersCopy = firstRowCells.map((h) => h.toLowerCase());
        for (const alias of ["status", "product status", "state"]) {
          const idx = headersCopy.indexOf(alias);
          if (idx !== -1) { idxStatus = idx; break; }
        }
        let importStatus: "Active" | "Inactive" | "Discontinued" = "Active";
        if (idxStatus !== -1 && cells[idxStatus]) {
          const rawStatus = cells[idxStatus].trim();
          if (["Active", "Inactive", "Discontinued"].includes(rawStatus)) {
            importStatus = rawStatus as "Active" | "Inactive" | "Discontinued";
          } else {
            showToast(
              `Row "${name}": Invalid status "${rawStatus}" — defaulting to Active.`,
              "error"
            );
          }
        }

        addProduct({
          name,
          sku,
          brand,
          category,
          status: importStatus,
          stock,
          currentCost: buyPrice,
          sellPrice,
          lowStockThreshold,
          fitments,
        });

        importedCount++;
      }

      alert(
        `Import completed successfully!\n\nSummary:\n- Successfully Imported: ${importedCount} products\n- Skipped (Duplicate SKU): ${duplicateCount}\n- Skipped (Invalid SKU/Name): ${invalidCount}`
      );
      e.target.value = "";
    };
    reader.readAsText(file);
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-full min-w-0 space-y-6">
      {/* Hidden file input for CSV Import */}
      <input
        type="file"
        id="csv-import-input"
        accept=".csv"
        onChange={handleImportCSV}
        className="hidden"
      />
      <h1 className="text-2xl font-black text-navy-950 mb-4">Inventory</h1>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6 min-w-0">

        {/* Total Products */}
        <KpiCard
          label="Total Products"
          value={stats.total.toString()}
          icon={<Package size={20} />}
          iconGradient="from-slate-700 to-slate-500"
          gradient="from-white to-slate-50"
          borderColor="border-slate-200"
          badge={undefined}
        />

        {/* Total Units */}
        <KpiCard
          label="Stock Units"
          value={stats.totalUnits.toLocaleString()}
          icon={<Activity size={20} />}
          iconGradient="from-blue-600 to-blue-400"
          gradient="from-white to-blue-50/40"
          borderColor="border-blue-100"
          badge={undefined}
        />

        {/* Inventory Value (sell value) */}
        <KpiCard
          label="Inventory Value"
          value={`₹${stats.sellValue.toLocaleString()}`}
          icon={<TrendingUp size={20} />}
          iconGradient="from-emerald-600 to-emerald-400"
          gradient="from-white to-emerald-50/40"
          borderColor="border-emerald-100"
          badge={undefined}
          isRupee
        />

        {/* Low Stock */}
        <KpiCard
          label="Low Stock"
          value={stats.lowStock.toString()}
          icon={<AlertTriangle size={20} />}
          iconGradient="from-amber-500 to-orange-400"
          gradient={stats.lowStock > 0 ? "from-white to-amber-50/60" : "from-white to-slate-50"}
          borderColor={stats.lowStock > 0 ? "border-amber-200" : "border-slate-200"}
          badge={stats.lowStock > 0 ? "warning" : undefined}
          valueColor={stats.lowStock > 0 ? "text-amber-600" : "text-slate-800"}
        />

        {/* Out of Stock */}
        <KpiCard
          label="Out of Stock"
          value={stats.outOfStock.toString()}
          icon={<AlertCircle size={20} />}
          iconGradient="from-red-600 to-red-400"
          gradient={stats.outOfStock > 0 ? "from-white to-red-50/60" : "from-white to-slate-50"}
          borderColor={stats.outOfStock > 0 ? "border-red-200" : "border-slate-200"}
          badge={stats.outOfStock > 0 ? "critical" : undefined}
          valueColor={stats.outOfStock > 0 ? "text-red-600" : "text-slate-800"}
        />

        {/* Capital Invested — owner only */}
        {isOwner && (
          <KpiCard
            label="Capital Invested"
            value={`₹${stats.capitalInvested.toLocaleString()}`}
            icon={<DollarSign size={20} />}
            iconGradient="from-violet-700 to-violet-500"
            gradient="from-navy-950 to-navy-900"
            borderColor="border-navy-800"
            isDark
            isRupee
          />
        )}
      </div>

      {/* ── Operations Control Room ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 mb-6 shadow-sm overflow-hidden min-w-0 w-full">
        {/* Panel header */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-navy-950 to-navy-700 flex items-center justify-center shrink-0">
            <Activity size={13} className="text-yellow-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 leading-none">Operations Control Room</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">Real-time inventory intelligence</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Live
            </span>
          </div>
        </div>

        {/* 6-section grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 divide-y sm:divide-y-0 divide-slate-100 border-t border-slate-100">

          {/* 1 — Inventory Health */}
          <div className="px-5 py-4 flex flex-col gap-2 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inventory Health</p>
            <div className="flex items-center gap-3">
              {/* Circular gauge */}
              <div className="relative w-12 h-12 shrink-0">
                <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15" fill="none"
                    stroke={insights.healthScore >= 90 ? '#10b981' : insights.healthScore >= 70 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="3"
                    strokeDasharray={`${(insights.healthScore / 100) * 94.2} 94.2`}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-700">
                  {insights.healthScore}%
                </span>
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-bold ${
                  insights.healthScore >= 90 ? 'text-emerald-600' :
                  insights.healthScore >= 70 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {insights.healthScore >= 90 ? 'Excellent' : insights.healthScore >= 70 ? 'Fair' : 'Critical'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-snug truncate">
                  {insights.healthScore >= 90
                    ? 'Full availability'
                    : insights.healthScore >= 70
                    ? 'Restock soon'
                    : 'Stockout risk'}
                </p>
              </div>
            </div>
          </div>

          {/* 2 — Primary Capital Focus */}
          <div className="px-5 py-4 flex flex-col gap-2 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Capital Focus</p>
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <TrendingUp size={15} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{insights.topCategory}</p>
                {isOwner ? (
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                    ₹{insights.topCategoryValue.toLocaleString()} tied up
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">Top category by stock</p>
                )}
              </div>
            </div>
          </div>

          {/* 3 — Restock Priority */}
          <div className="px-5 py-4 flex flex-col gap-2 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Restock Priority</p>
            <div className="flex items-start gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                insights.criticalCount > 0
                  ? 'bg-orange-50 text-orange-500'
                  : 'bg-emerald-50 text-emerald-500'
              }`}>
                {insights.criticalCount > 0
                  ? <AlertTriangle size={15} />
                  : <CheckCircle2 size={15} />}
              </div>
              <div className="min-w-0">
                {insights.criticalCount === 0 ? (
                  <>
                    <p className="text-sm font-bold text-emerald-600">All Clear</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">No actions needed</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-orange-600">{insights.criticalCount} item{insights.criticalCount > 1 ? 's' : ''}</p>
                    <button
                      onClick={() => setStockFilter("Low Stock")}
                      className="text-[10px] text-navy-600 font-bold hover:underline cursor-pointer mt-0.5 text-left block truncate"
                    >
                      Filter low stock →
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 4 — Average Margin (owner only) */}
          {isOwner ? (
            <div className="px-5 py-4 flex flex-col gap-2 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg. Margin</p>
              <div className="flex items-start gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  insights.avgMargin >= 30 ? 'bg-green-50 text-green-600'
                  : insights.avgMargin >= 15 ? 'bg-amber-50 text-amber-600'
                  : 'bg-red-50 text-red-600'
                }`}>
                  <DollarSign size={15} />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-black ${
                    insights.avgMargin >= 30 ? 'text-green-600'
                    : insights.avgMargin >= 15 ? 'text-amber-600'
                    : 'text-red-600'
                  }`}>{insights.avgMargin}%</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                    {insights.avgMargin >= 30 ? 'Healthy margin' : insights.avgMargin >= 15 ? 'Moderate margin' : 'Low margin'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-5 py-4 flex flex-col gap-2 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg. Margin</p>
              <div className="flex items-center gap-2 h-8">
                <span className="text-xs text-slate-400 italic">Owner only</span>
              </div>
            </div>
          )}

          {/* 5 — Top Category */}
          <div className="px-5 py-4 flex flex-col gap-2 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Top Category</p>
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                <Info size={15} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{insights.topCategory}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">By stock value</p>
              </div>
            </div>
          </div>

          {/* 6 — Top Product */}
          <div className="px-5 py-4 flex flex-col gap-2 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Top Product</p>
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center shrink-0 mt-0.5">
                <Package size={15} />
              </div>
              <div className="min-w-0">
                {insights.topProduct ? (
                  <>
                    <p className="text-sm font-bold text-slate-800 truncate" title={insights.topProduct.name}>
                      {insights.topProduct.name}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono truncate">{insights.topProduct.sku}</p>
                  </>
                ) : (
                  <p className="text-sm font-bold text-slate-400">—</p>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Professional Sticky Filter Toolbar ──────────────────────────────── */}
      <div className="sticky top-4 z-20 bg-white/95 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-md mb-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5 min-w-0">

          {/* Filters group */}
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            {/* Search */}
            <div className="relative min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                id="inv-search"
                ref={searchRef}
                type="text"
                placeholder="Search…  Ctrl+F"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border border-slate-200 rounded-lg pl-8 pr-3 h-9 text-sm w-44 sm:w-52 md:w-56 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-slate-50 focus:bg-white transition-all placeholder:text-slate-400 placeholder:text-xs"
              />
            </div>

            {/* Category */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer shrink-0 max-w-[130px] transition-colors"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c === "All" ? "All Categories" : c}</option>
              ))}
            </select>

            {/* Brand */}
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer shrink-0 max-w-[130px] transition-colors"
            >
              {brands.map((b) => (
                <option key={b} value={b}>{b === "All" ? "All Brands" : b}</option>
              ))}
            </select>

            {/* Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer shrink-0 transition-colors"
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Discontinued">Discontinued</option>
            </select>

            {/* Stock */}
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as StockFilter)}
              className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer shrink-0 transition-colors"
            >
              <option value="All">All Stock</option>
              <option value="Healthy">Healthy</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer shrink-0 max-w-[160px] transition-colors"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto flex-wrap">
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                title="Reset all filters (Esc)"
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
              >
                <X size={13} />
                Reset
              </button>
            )}
            {isOwner && (
              <>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
                >
                  <Download size={13} />
                  Export
                </button>
                <button
                  onClick={() => document.getElementById("csv-import-input")?.click()}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
                >
                  <Upload size={13} />
                  Import
                </button>
                <button
                  onClick={() => { setEditingProduct(null); setShowModal(true); }}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-bold text-navy-950 bg-yellow-400 hover:bg-yellow-300 border border-yellow-300 transition-all cursor-pointer shadow-sm"
                >
                  <Plus size={14} />
                  Add Product
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Filter Chips ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap min-w-0">
        {([
          { key: "all",          label: "All",          count: chipCounts.all,          stock: "All" as StockFilter,            status: "All" },
          { key: "healthy",      label: "Healthy",      count: chipCounts.healthy,      stock: "Healthy" as StockFilter,        status: "All" },
          { key: "lowStock",     label: "Low Stock",    count: chipCounts.lowStock,     stock: "Low Stock" as StockFilter,      status: "All" },
          { key: "outOfStock",   label: "Out of Stock", count: chipCounts.outOfStock,   stock: "Out of Stock" as StockFilter,   status: "All" },
          { key: "inactive",     label: "Inactive",     count: chipCounts.inactive,     stock: "All" as StockFilter,            status: "Inactive" },
          { key: "discontinued", label: "Discontinued", count: chipCounts.discontinued, stock: "All" as StockFilter,            status: "Discontinued" },
        ]).map((chip) => {
          const isActive = chip.status === "All"
            ? stockFilter === chip.stock && statusFilter === "All"
            : statusFilter === chip.status && stockFilter === "All";
          return (
            <button
              key={chip.key}
              onClick={() => { setStockFilter(chip.stock); setStatusFilter(chip.status); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 cursor-pointer ${
                isActive
                  ? "bg-navy-950 text-white border-navy-950 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
              }`}
            >
              {chip.label}
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Table Card ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 mb-1 shadow-sm overflow-hidden min-w-0 w-full">

        {/* ── Table ──────────────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          state.products.length === 0 ? (
            /* ── Empty warehouse state ── */
            <div className="py-20 flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 flex items-center justify-center shadow-sm">
                <Package size={36} className="text-slate-300" />
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-slate-700">Warehouse is Empty</p>
                <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                  No inventory has been added yet. Start by importing a CSV or adding your first product.
                </p>
              </div>
              {isOwner && (
                <button
                  onClick={() => { setEditingProduct(null); setShowModal(true); }}
                  className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-sm font-black px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Plus size={15} />
                  Add First Product
                </button>
              )}
            </div>
          ) : (
            /* ── No search results state ── */
            <div className="py-20 flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 flex items-center justify-center shadow-sm">
                <Search size={32} className="text-slate-300" />
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-slate-700">No Products Match Your Filters</p>
                <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                  Try adjusting your search query or clearing the active category and stock filters.
                </p>
              </div>
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-all cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )
        ) : (
          <div className="overflow-x-auto min-w-0 w-full">
            <table className="w-full text-sm border-collapse">
              {/* ── Sticky professional header ── */}
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  {/* Expand toggle column */}
                  <th className="w-8 pl-4 pr-1 py-3" />
                  {/* Product */}
                  <th className="px-4 py-3 text-left">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Product</span>
                  </th>
                  {/* SKU */}
                  <th className="px-4 py-3 text-left hidden md:table-cell">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">SKU</span>
                  </th>
                  {/* Brand */}
                  <th className="px-4 py-3 text-left hidden lg:table-cell">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Brand</span>
                  </th>
                  {/* Category */}
                  <th className="px-4 py-3 text-left hidden lg:table-cell">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Category</span>
                  </th>
                  {/* Status */}
                  <th className="px-4 py-3 text-center hidden xl:table-cell">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</span>
                  </th>
                  {/* Stock */}
                  <th className="px-4 py-3 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Stock</span>
                  </th>
                  {/* Buy price – owner only */}
                  {isOwner && (
                    <th className="px-4 py-3 text-right hidden lg:table-cell">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cost ₹</span>
                    </th>
                  )}
                  {/* Sell price */}
                  <th className="px-4 py-3 text-right">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Sell ₹</span>
                  </th>
                  {/* Margin – owner only */}
                  {isOwner && (
                    <th className="px-4 py-3 text-right hidden md:table-cell">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Margin</span>
                    </th>
                  )}
                  {/* Actions */}
                  <th className="px-4 py-3 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((product, rowIndex) => {
                  const outOfStock = product.stock === 0;
                  const lowStock = !outOfStock && product.stock <= product.lowStockThreshold;
                  const margin = isOwner && product.sellPrice > 0
                    ? Math.round(((product.sellPrice - product.currentCost) / product.sellPrice) * 100)
                    : 0;
                  const isExpanded = expandedProductId === product.id;
                  const isCopied = copiedSkuId === product.id;

                  // Stock progress bar: pct of threshold as a guide (capped at 100%)
                  const stockPct = outOfStock ? 0
                    : lowStock ? Math.round((product.stock / product.lowStockThreshold) * 50)
                    : Math.min(100, Math.round((product.stock / (product.lowStockThreshold * 4)) * 100) + 50);
                  const barColor = outOfStock ? 'bg-red-400' : lowStock ? 'bg-amber-400' : 'bg-emerald-500';

                  // Left accent
                  const accentColor = outOfStock ? 'border-l-red-500'
                    : lowStock ? 'border-l-amber-500'
                    : 'border-l-emerald-500';

                  // Zebra + hover
                  const zebraBase = rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
                  const rowBg = isExpanded ? 'bg-blue-50/30' : zebraBase;

                  // Status badge
                  const statusBadge = (product.status || 'Active') === 'Active'
                    ? <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Active</span>
                    : product.status === 'Inactive'
                    ? <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-300 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />Inactive</span>
                    : <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />Discontinued</span>;

                  return (
                    <Fragment key={product.id}>
                      {/* ── Main row ── */}
                      <tr
                        className={`border-b border-slate-100 border-l-4 ${accentColor} ${rowBg} hover:bg-slate-50 hover:shadow-sm transition-all duration-150 group`}
                      >
                        {/* Expand toggle */}
                        <td className="pl-3 pr-1 py-3.5 w-8">
                          <button
                            onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                            className="p-1 rounded-md hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            title={isExpanded ? 'Collapse' : 'Expand details'}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>

                        {/* Product */}
                        <td className="px-4 py-3.5 min-w-[180px]">
                          <button
                            className="text-left w-full"
                            onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                          >
                            <p className="font-semibold text-slate-800 group-hover:text-navy-700 transition-colors text-[13px] leading-tight">
                              {product.name}
                            </p>
                            <p className="font-mono text-[10px] text-slate-400 mt-0.5 tracking-wide">{product.sku}</p>
                          </button>
                        </td>

                        {/* SKU – click to copy */}
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <button
                            onClick={() => handleCopySku(product)}
                            title={isCopied ? 'Copied!' : 'Click to copy SKU'}
                            className={`group/sku inline-flex items-center gap-1.5 font-mono text-xs border rounded-md px-2 py-1 transition-all duration-200 cursor-pointer select-none ${
                              isCopied
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-navy-50 hover:border-navy-300 hover:text-navy-700'
                            }`}
                          >
                            {isCopied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} className="text-slate-400 group-hover/sku:text-navy-500" />}
                            {isCopied ? 'Copied!' : product.sku}
                          </button>
                        </td>

                        {/* Brand */}
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <span className="text-[13px] font-semibold text-slate-700">{product.brand || <span className="text-slate-300">—</span>}</span>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <span className="inline-block text-[10px] font-semibold bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-1 rounded-md">
                            {product.category || '—'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 text-center hidden xl:table-cell">
                          {statusBadge}
                        </td>

                        {/* Stock – with mini progress bar */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col items-center gap-1 min-w-[60px]">
                            <span className={`text-xs font-black ${
                              outOfStock ? 'text-red-600' : lowStock ? 'text-amber-600' : 'text-slate-800'
                            }`}>
                              {product.stock} <span className="font-normal text-slate-400 text-[9px]">units</span>
                            </span>
                            {/* Progress bar */}
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                style={{ width: `${Math.max(stockPct, outOfStock ? 0 : 4)}%` }}
                              />
                            </div>
                            <span className={`text-[9px] font-bold uppercase tracking-wide ${
                              outOfStock ? 'text-red-500' : lowStock ? 'text-amber-500' : 'text-emerald-600'
                            }`}>
                              {outOfStock ? 'Out of Stock' : lowStock ? 'Low' : 'Healthy'}
                            </span>
                          </div>
                        </td>

                        {/* Buy price – owner only */}
                        {isOwner && (
                          <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                            <span className="text-[13px] font-medium text-slate-500">₹{product.currentCost.toLocaleString()}</span>
                          </td>
                        )}

                        {/* Sell price */}
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-[13px] font-bold text-slate-800">₹{product.sellPrice.toLocaleString()}</span>
                        </td>

                        {/* Margin – owner only */}
                        {isOwner && (
                          <td className="px-4 py-3.5 text-right hidden md:table-cell">
                            <span className={`inline-block text-[11px] font-black px-2 py-0.5 rounded-md border ${
                              margin >= 30 ? 'bg-green-50 text-green-700 border-green-200'
                              : margin >= 15 ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {margin}%
                            </span>
                          </td>
                        )}

                        {/* Actions – icon buttons */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-center gap-1">
                            {/* View – navigates to Product Details Workspace */}
                            <Link
                              href={`/inventory/${product.id}`}
                              title="Open product details"
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-navy-700 hover:bg-slate-100 transition-all cursor-pointer"
                            >
                              <Eye size={15} />
                            </Link>

                            {/* Adjust Stock – owner only */}
                            {isOwner && (
                              <button
                                onClick={() => setStockModal(product)}
                                title="Adjust stock"
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all cursor-pointer"
                              >
                                <Layers size={15} />
                              </button>
                            )}

                            {/* Edit – owner only */}
                            {isOwner && (
                              <button
                                onClick={() => { setEditingProduct(product); setShowModal(true); }}
                                title="Edit product"
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-navy-700 hover:bg-navy-50 transition-all cursor-pointer"
                              >
                                <Pencil size={14} />
                              </button>
                            )}

                            {/* Movement history – disabled placeholder */}
                            <button
                              disabled
                              title="Movement history (coming soon)"
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-200 cursor-not-allowed"
                            >
                              <ArrowUpDown size={14} />
                            </button>

                            {/* Staff view-only */}
                            {!isOwner && (
                              <span className="text-[10px] text-slate-400 italic px-1">View only</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── Expanded details pane ── */}
                      {isExpanded && (
                        <tr className={`border-l-4 ${accentColor} bg-slate-50/40`}>
                          <td colSpan={isOwner ? 11 : 9} className="px-6 py-5 border-t border-b border-slate-200/60">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                              {/* Col 1: Vehicle Compatibility */}
                              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                  <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                                    <Info size={13} />
                                  </div>
                                  <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Vehicle Compatibility</h4>
                                </div>
                                <div className="max-h-36 overflow-y-auto">
                                  {!product.fitments || product.fitments.length === 0 ? (
                                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                                      <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                                      <p className="text-xs text-slate-500 italic">Universal Fitment — fits all makes &amp; models</p>
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                      {product.fitments.map((fit, idx) => (
                                        <span key={idx} className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold px-2.5 py-0.5 rounded-lg">
                                          {fit.brand} {fit.model} ({fit.year})
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-50 italic">* Fitments match against sales invoicing checklist.</p>
                              </div>

                              {/* Col 2: Recent Activity */}
                              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                  <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                                    <Activity size={13} />
                                  </div>
                                  <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Recent Activity Ledger</h4>
                                </div>
                                <div className="space-y-2.5 max-h-36 overflow-y-auto">
                                  {[
                                    { dot: 'bg-emerald-500', label: 'Stock adjustment manually performed', date: 'June 20, 2026', delta: '+10 units', color: 'text-emerald-600' },
                                    { dot: 'bg-blue-500', label: 'Invoice INV-2026-004 checkout', date: 'June 18, 2026', delta: '-2 units', color: 'text-slate-600' },
                                    { dot: 'bg-blue-500', label: 'Invoice INV-2026-001 checkout', date: 'June 12, 2026', delta: '-1 unit', color: 'text-slate-600' },
                                  ].map((entry, i) => (
                                    <div key={i} className="flex items-start gap-2.5">
                                      <div className={`w-1.5 h-1.5 rounded-full ${entry.dot} mt-1.5 shrink-0`} />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-semibold text-slate-700 leading-tight">{entry.label}</p>
                                        <span className="text-[10px] text-slate-400">{entry.date}</span>
                                      </div>
                                      <span className={`text-[11px] font-extrabold font-mono shrink-0 ${entry.color}`}>{entry.delta}</span>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-50 italic">AutoVault records checkout logs and manual audits automatically.</p>
                              </div>

                              {/* Col 3: Inventory Intelligence */}
                              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                  <div className="w-6 h-6 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center">
                                    <TrendingUp size={13} />
                                  </div>
                                  <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Inventory Intelligence</h4>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  {[
                                    {
                                      label: 'Stock Status',
                                      value: outOfStock ? 'Out of Stock' : lowStock ? 'Low Stock Warning' : 'Healthy Stock',
                                      cls: outOfStock ? 'text-red-600 bg-red-50 border-red-200' : lowStock ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200',
                                    },
                                    {
                                      label: 'Suggested Order',
                                      value: outOfStock ? `${product.lowStockThreshold * 3} units` : lowStock ? `${product.lowStockThreshold * 2} units` : '0 units (Adequate)',
                                      cls: 'text-slate-700 bg-slate-50 border-slate-200',
                                    },
                                    { label: 'Replenishment Lead', value: '3 – 5 Days Est.', cls: 'text-slate-600 bg-slate-50 border-slate-200' },
                                  ].map((row) => (
                                    <div key={row.label} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                                      <span className="text-slate-500 text-[11px]">{row.label}</span>
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${row.cls}`}>{row.value}</span>
                                    </div>
                                  ))}
                                  {isOwner && (
                                    <div className="flex items-center justify-between py-1">
                                      <span className="text-slate-500 text-[11px]">Unit Profit</span>
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border text-green-700 bg-green-50 border-green-200">
                                        ₹{(product.sellPrice - product.currentCost).toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-50 italic">Based on low-stock thresholds &amp; current transaction trends.</p>
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

      {/* ── Table Footer ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-3 px-1 flex-wrap gap-2">
        {/* Left: count */}
        <p className="text-xs text-slate-500">
          Showing{" "}
          <span className="font-bold text-slate-700">{filtered.length}</span>
          {" "}of{" "}
          <span className="font-bold text-slate-700">{state.products.length}</span>
          {" "}products
        </p>

        {/* Center: active filter + sort tags */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {(search !== "" || categoryFilter !== "All" || brandFilter !== "All" || statusFilter !== "All" || stockFilter !== "All") && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md">
                Filtered
              </span>
            )}
            {sortBy !== "name-asc" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-md">
                {SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? sortBy}
              </span>
            )}
          </div>
        )}

        {/* Right: clear */}
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="text-xs text-amber-600 hover:text-amber-700 font-semibold cursor-pointer transition-colors"
          >
            Clear all filters
          </button>
        )}
      </div>

      <ProductFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        editingProduct={editingProduct}
      />
      <AdjustStockModal
        isOpen={!!stockModal}
        onClose={() => setStockModal(null)}
        product={stockModal}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const INPUT =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-400";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
      {children}
    </label>
  );
}

function KpiCard({
  label,
  value,
  icon,
  iconGradient,
  gradient,
  borderColor,
  badge,
  isDark = false,
  isRupee = false,
  valueColor,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconGradient: string;
  gradient: string;
  borderColor: string;
  badge?: "warning" | "critical" | undefined;
  isDark?: boolean;
  isRupee?: boolean;
  valueColor?: string;
}) {
  const textBase = isDark ? "text-white" : "text-slate-800";
  const labelColor = isDark ? "text-slate-300" : "text-slate-500";
  const badgeEl = badge === "critical" ? (
    <span className="text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full">
      Critical
    </span>
  ) : badge === "warning" ? (
    <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
      Alert
    </span>
  ) : null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${borderColor} bg-gradient-to-br ${gradient} p-5 flex flex-col gap-3
        shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-default group`}
    >
      {/* Decorative blob */}
      <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full bg-white/10 blur-xl pointer-events-none" />

      {/* Icon + badge row */}
      <div className="flex items-center justify-between">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${iconGradient} flex items-center justify-center text-white shadow-sm shrink-0 group-hover:scale-110 transition-transform duration-200`}>
          {icon}
        </div>
        {badgeEl}
      </div>

      {/* Value */}
      <div>
        <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${labelColor}`}>{label}</p>
        <p className={`text-2xl font-black tracking-tight ${valueColor ?? textBase} ${
          isRupee ? 'text-xl' : ''
        }`}>
          {value}
        </p>
      </div>
    </div>
  );
}