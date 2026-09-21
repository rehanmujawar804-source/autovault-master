"use client";

import { useState, useMemo, useEffect, useRef, Fragment, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import type { Product, VehicleFitment } from "@/types";
import { ProductFormModal, AdjustStockModal } from "./components/ProductModals";
import { EditBaseProductModal } from "./components/EditBaseProductModal";
import { AddProductWithVariantModal } from "./components/AddProductWithVariantModal";
import { BulkFitmentModal } from "./components/BulkFitmentModals";
import { CSVImportPreviewModal, type CSVImportRowResult } from "./components/CSVImportPreviewModal";
import { SpreadsheetImportUploadModal } from "./components/SpreadsheetImportUploadModal";
import { InventoryIntelligenceDashboard } from "./components/InventoryIntelligenceDashboard";
import { InventoryDesktopTable } from "./components/InventoryDesktopTable";
import { InventoryTabletView } from "./components/InventoryTabletView";
import { InventoryMobileCards } from "./components/InventoryMobileCards";
import { formatFitmentDisplay, serializeFitmentsForCSV, parseFitmentsFromCSV } from "@/lib/fitmentUtils";
import { generateXLSXWorkbook, generateCSVText, parseSpreadsheetFile, generateBlankXLSXImportTemplate } from "@/lib/spreadsheetUtils";
import { saveRecentImportReport } from "@/lib/recentImportReports";
import { formatStockMovementDate } from "@/lib/dateUtils";
import type { RecentImportReport, ImportReportChangeItem } from "@/types";
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
  CheckSquare,
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
  Sparkles,
  Trash2,
  FileSpreadsheet,
  CornerDownRight,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  CATEGORIES derived from store data
// ─────────────────────────────────────────────────────────────────────────────

const STOCK_FILTERS = ["All", "Healthy", "Low Stock", "Out of Stock"] as const;
type StockFilter = (typeof STOCK_FILTERS)[number];

const SORT_OPTIONS = [
  { value: "name-asc", label: "Name (A\u2013Z)" },
  { value: "name-desc", label: "Name (Z\u2013A)" },
  { value: "sku-asc", label: "SKU (A\u2013Z)" },
  { value: "sku-desc", label: "SKU (Z\u2013A)" },
  { value: "stock-desc", label: "Stock (Highest)" },
  { value: "stock-asc", label: "Stock (Lowest)" },
  { value: "buy-desc", label: "Current Cost (Highest)" },
  { value: "buy-asc", label: "Current Cost (Lowest)" },
  { value: "sell-desc", label: "Sell Price (Highest)" },
  { value: "sell-asc", label: "Sell Price (Lowest)" },
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
  const { state, addProduct, updateProduct, bulkImportProducts, getInventoryValue, showToast } =
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

  // ── CSV / XLSX Import Preview Modal & Export State ──────────────────────
  const [isImportUploadOpen, setIsImportUploadOpen] = useState(false);
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [parsedCSVRows, setParsedCSVRows] = useState<CSVImportRowResult[]>([]);
  const [importFileName, setImportFileName] = useState("autovault_inventory.xlsx");
  const [showExportMenu, setShowExportMenu] = useState(false);

  // ── Expandable Product Row State ──────────────────────────────────────────
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  // ── Display Group Expansion & Editing State (Phase 2 Step 2 & 3) ────────────
  const [expandedGroupNames, setExpandedGroupNames] = useState<Set<string>>(new Set());
  const [editingBaseGroup, setEditingBaseGroup] = useState<string | null>(null);
  const [targetGroupForNewVariant, setTargetGroupForNewVariant] = useState<string | null>(null);
  const [showAddWithVariantModal, setShowAddWithVariantModal] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [showBulkRemoveModal, setShowBulkRemoveModal] = useState(false);

  function toggleGroupExpand(groupName: string) {
    setExpandedGroupNames((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  }

  function handleEditBaseGroup(groupName: string) {
    setEditingBaseGroup(groupName);
  }

  // ── Hydration safe mount state ──────────────────────────────────────────
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // ── Keyboard shortcuts: Ctrl+F focuses search, Esc resets all filters if no modal open ────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        const isAnyModalOpen =
          showModal ||
          Boolean(stockModal) ||
          showAddWithVariantModal ||
          Boolean(editingBaseGroup) ||
          showBulkAssignModal ||
          showBulkRemoveModal ||
          isImportUploadOpen ||
          csvPreviewOpen;

        if (!isAnyModalOpen) {
          setSearch("");
          setCategoryFilter("All");
          setBrandFilter("All");
          setStatusFilter("All");
          setStockFilter("All");
          setSortBy("name-asc");
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    showModal,
    stockModal,
    showAddWithVariantModal,
    editingBaseGroup,
    showBulkAssignModal,
    showBulkRemoveModal,
    isImportUploadOpen,
    csvPreviewOpen,
  ]);

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
      all: ps.length,
      healthy: ps.filter((p) => (p.status || "Active") === "Active" && p.stock > p.lowStockThreshold).length,
      lowStock: ps.filter((p) => {
        const status = p.status || "Active";
        if (status === "Inactive") return false;
        return p.stock > 0 && p.stock <= p.lowStockThreshold;
      }).length,
      outOfStock: ps.filter((p) => (p.status || "Active") === "Active" && p.stock === 0).length,
      inactive: ps.filter((p) => (p.status || "Active") === "Inactive").length,
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
          p.brand.toLowerCase().includes(q) ||
          (p.displayGroup && p.displayGroup.toLowerCase().includes(q)) ||
          (p.variantValues &&
            Object.values(p.variantValues).some(
              (v) => typeof v === "string" && v.toLowerCase().includes(q)
            ))
      );
    }
    // Stable sort
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "name-asc": return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
        case "name-desc": return b.name.localeCompare(a.name) || a.id.localeCompare(b.id);
        case "sku-asc": return a.sku.localeCompare(b.sku) || a.id.localeCompare(b.id);
        case "sku-desc": return b.sku.localeCompare(a.sku) || a.id.localeCompare(b.id);
        case "stock-desc": return (b.stock - a.stock) || a.id.localeCompare(b.id);
        case "stock-asc": return (a.stock - b.stock) || a.id.localeCompare(b.id);
        case "buy-desc": return (b.currentCost - a.currentCost) || a.id.localeCompare(b.id);
        case "buy-asc": return (a.currentCost - b.currentCost) || a.id.localeCompare(b.id);
        case "sell-desc": return (b.sellPrice - a.sellPrice) || a.id.localeCompare(b.id);
        case "sell-asc": return (a.sellPrice - b.sellPrice) || a.id.localeCompare(b.id);
        case "margin-desc": {
          const ma = a.sellPrice > 0 ? ((a.sellPrice - a.currentCost) / a.sellPrice) * 100 : -999999;
          const mb = b.sellPrice > 0 ? ((b.sellPrice - b.currentCost) / b.sellPrice) * 100 : -999999;
          return (mb - ma) || a.id.localeCompare(b.id);
        }
        default: return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      }
    });
    return list;
  }, [state.products, categoryFilter, brandFilter, statusFilter, stockFilter, search, sortBy]);

  // ── UI Grouping Construction (Phase 2 Step 1) ────────────────────────────
  type GroupedDisplayItem =
    | {
      type: "standalone";
      product: Product;
    }
    | {
      type: "group";
      groupName: string;
      brand?: string;
      category?: string;
      variants: Product[];
      totalStock: number;
    };

  const groupedDisplayItems = useMemo<GroupedDisplayItem[]>(() => {
    // 1. Group filtered products by trimmed displayGroup
    const groupMap = new Map<string, Product[]>();

    for (const p of filtered) {
      const dg = p.displayGroup?.trim();
      if (dg) {
        const existing = groupMap.get(dg) || [];
        existing.push(p);
        groupMap.set(dg, existing);
      }
    }

    const result: GroupedDisplayItem[] = [];
    const processedGroups = new Set<string>();

    for (const p of filtered) {
      const dg = p.displayGroup?.trim();
      if (dg) {
        const members = groupMap.get(dg);
        if (members && members.length > 1) {
          if (!processedGroups.has(dg)) {
            processedGroups.add(dg);
            const totalStock = members.reduce((sum, item) => sum + item.stock, 0);

            const firstBrand = members[0].brand;
            const allSameBrand = members.every((m) => m.brand === firstBrand);
            const groupBrand = allSameBrand ? firstBrand : undefined;

            const firstCat = members[0].category;
            const allSameCat = members.every((m) => m.category === firstCat);
            const groupCategory = allSameCat ? firstCat : undefined;

            result.push({
              type: "group",
              groupName: dg,
              brand: groupBrand,
              category: groupCategory,
              variants: members,
              totalStock,
            });
          }
          continue;
        }
      }
      result.push({
        type: "standalone",
        product: p,
      });
    }

    return result;
  }, [filtered]);



  // ── Multi-select state & logic (Phase 2C Owner-Only) ──────────────────────
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  function toggleSelectionMode() {
    if (isSelectionMode) {
      setSelectedProductIds([]);
      setIsSelectionMode(false);
    } else {
      setIsSelectionMode(true);
    }
  }

  const selectedSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);

  const visibleIds = useMemo(() => filtered.map((p) => p.id), [filtered]);

  const allVisibleSelected = useMemo(() => {
    return visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  }, [visibleIds, selectedSet]);

  const someVisibleSelected = useMemo(() => {
    return visibleIds.some((id) => selectedSet.has(id)) && !allVisibleSelected;
  }, [visibleIds, selectedSet, allVisibleSelected]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  function handleToggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedProductIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedProductIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }

  function handleToggleSelectProduct(productId: string) {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  }

  const selectedProductsList = useMemo(() => {
    return state.products.filter((p) => selectedSet.has(p.id));
  }, [state.products, selectedSet]);

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

  // ── Import / Export Spreadsheet (XLSX & CSV) ─────────────────────────────
  async function handleExportXLSX() {
    try {
      const blob = await generateXLSXWorkbook(state.products);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `autovault_inventory_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Inventory workbook exported to Excel (.xlsx)", "success");
    } catch {
      showToast("Failed to export XLSX file.", "error");
    }
  }

  function handleExportCSV() {
    try {
      const csvContent = generateCSVText(state.products);
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `autovault_inventory_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Inventory exported to CSV (.csv)", "success");
    } catch {
      showToast("Failed to export CSV file.", "error");
    }
  }

  async function handleContinueToPreview(file: File) {
    setIsImportUploadOpen(false);
    setImportFileName(file.name);

    try {
      const results = await parseSpreadsheetFile(file, state.products);
      setParsedCSVRows(results);
      setCsvPreviewOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse uploaded spreadsheet.";
      showToast(msg, "error");
    }
  }

  async function handleDownloadSampleTemplate() {
    try {
      const blob = await generateBlankXLSXImportTemplate(state.products);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `autovault_products_template.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Blank XLSX import template downloaded", "success");
    } catch {
      showToast("Failed to download template.", "error");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-full min-w-0 space-y-6">

      {/* ── Page Header with action buttons ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-navy-950">Inventory</h1>
        {isOwner && (
          <div className="flex items-center gap-2 flex-wrap min-w-0 w-full sm:w-auto">
            {/* Export Dropdown Menu (Primary: XLSX, Secondary: CSV) */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu((prev) => !prev)}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer shadow-xs"
              >
                <FileSpreadsheet size={14} className="text-emerald-600" />
                Export
                <ChevronDown size={12} className="text-slate-400" />
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 mt-1.5 z-40 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1 text-xs animate-in fade-in-50 zoom-in-95 duration-100">
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportXLSX();
                      }}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 text-left font-bold text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <FileSpreadsheet size={15} className="text-emerald-600" />
                        Export XLSX
                      </span>
                      <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                        Primary
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportCSV();
                      }}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer border-t border-slate-100"
                    >
                      <Download size={14} className="text-slate-400" />
                      Export CSV
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Import Button (Supports .xlsx, .xls, .csv) */}
            <button
              onClick={() => setIsImportUploadOpen(true)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer shadow-xs"
            >
              <Upload size={13} className="text-navy-950" />
              Import<span className="hidden sm:inline"> Spreadsheet</span>
            </button>

            {/* Add Product Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-bold text-navy-950 bg-yellow-400 hover:bg-yellow-300 border border-yellow-300 transition-colors cursor-pointer shadow-sm"
              >
                <Plus size={14} />
                Add Product
                <ChevronDown size={13} className={`transition-transform ${showAddMenu ? "rotate-180" : ""}`} />
              </button>

              {showAddMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowAddMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 overflow-hidden animate-fadeIn">
                    <button
                      onClick={() => {
                        setEditingProduct(null);
                        setShowModal(true);
                        setShowAddMenu(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-navy-900 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Package size={14} className="text-slate-400" />
                      <div>
                        <div className="font-bold">Add Standard Product</div>
                        <div className="text-[10px] text-slate-400 font-normal">Single SKU item without options</div>
                      </div>
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      onClick={() => {
                        setShowAddWithVariantModal(true);
                        setShowAddMenu(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-navy-900 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Layers size={14} className="text-amber-500" />
                      <div>
                        <div className="font-bold">Add Product with Variant</div>
                        <div className="text-[10px] text-slate-400 font-normal">Create base group &amp; option family</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Inventory Intelligence Dashboard (Unified KPI & Intelligence Hub) ── */}
      <InventoryIntelligenceDashboard state={state} getInventoryValue={getInventoryValue} />

      {/* ── Operations Control Room ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 mb-6 overflow-hidden min-w-0 w-full">
        {/* Panel header */}
        <div className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
          <div className="w-6 h-6 rounded-md bg-navy-950 flex items-center justify-center shrink-0">
            <Activity size={12} className="text-yellow-400" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-700 leading-none">Operations Control Room</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">Real-time inventory intelligence</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
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
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">
                  {insights.healthScore}%
                </span>
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-bold ${insights.healthScore >= 90 ? 'text-emerald-600' :
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
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${insights.criticalCount > 0
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
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${insights.avgMargin >= 30 ? 'bg-green-50 text-green-600'
                    : insights.avgMargin >= 15 ? 'bg-amber-50 text-amber-600'
                      : 'bg-red-50 text-red-600'
                  }`}>
                  <DollarSign size={15} />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${insights.avgMargin >= 30 ? 'text-green-600'
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
      <div className="sticky top-4 z-20 bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm mb-3 p-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">

          {/* Filters group */}
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            {/* Search */}
            <div className="relative min-w-0 w-full sm:w-auto flex-1 sm:flex-none">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                id="inv-search"
                ref={searchRef}
                type="text"
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border border-slate-200 rounded-lg pl-8 pr-3 h-8 text-xs w-full sm:w-44 md:w-52 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 bg-slate-50/80 focus:bg-white transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Category */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-8 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-600 bg-slate-50/80 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer shrink-0 w-full sm:w-auto max-w-full sm:max-w-[130px] transition-colors"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c === "All" ? "All Categories" : c}</option>
              ))}
            </select>

            {/* Brand */}
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="h-8 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-600 bg-slate-50/80 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer shrink-0 w-full sm:w-auto max-w-full sm:max-w-[130px] transition-colors"
            >
              {brands.map((b) => (
                <option key={b} value={b}>{b === "All" ? "All Brands" : b}</option>
              ))}
            </select>

            {/* Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-600 bg-slate-50/80 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer shrink-0 w-full sm:w-auto transition-colors"
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
              className="h-8 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-600 bg-slate-50/80 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer shrink-0 w-full sm:w-auto transition-colors"
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
              className="h-8 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-600 bg-slate-50/80 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer shrink-0 w-full sm:w-auto max-w-full sm:max-w-[160px] transition-colors"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Selection Mode Toggle Button (Owner Only) */}
            {isOwner && (
              <button
                type="button"
                onClick={toggleSelectionMode}
                title={isSelectionMode ? "Exit Selection Mode (Clear Selection)" : "Enable Selection Mode"}
                className={`h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${isSelectionMode
                    ? "bg-navy-950 text-white border-navy-950 shadow-xs"
                    : "bg-slate-50/80 text-slate-600 hover:bg-slate-100 border-slate-200"
                  }`}
              >
                <CheckSquare size={13} className={isSelectionMode ? "text-yellow-400" : "text-slate-500"} />
                <span>{isSelectionMode ? "Exit Selection" : "Select"}</span>
                {isSelectionMode && selectedProductIds.length > 0 && (
                  <span className="bg-yellow-400 text-navy-950 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                    {selectedProductIds.length}
                  </span>
                )}
              </button>
            )}

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                title="Reset all filters (Esc)"
                className="flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 bg-transparent hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all cursor-pointer"
              >
                <X size={12} />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Filter Chips ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap min-w-0">
        {([
          { key: "all", label: "All", count: chipCounts.all, stock: "All" as StockFilter, status: "All" },
          { key: "healthy", label: "Healthy", count: chipCounts.healthy, stock: "Healthy" as StockFilter, status: "All" },
          { key: "lowStock", label: "Low Stock", count: chipCounts.lowStock, stock: "Low Stock" as StockFilter, status: "All" },
          { key: "outOfStock", label: "Out of Stock", count: chipCounts.outOfStock, stock: "Out of Stock" as StockFilter, status: "All" },
          { key: "inactive", label: "Inactive", count: chipCounts.inactive, stock: "All" as StockFilter, status: "Inactive" },
          { key: "discontinued", label: "Discontinued", count: chipCounts.discontinued, stock: "All" as StockFilter, status: "Discontinued" },
        ]).map((chip) => {
          const isActive = chip.status === "All"
            ? stockFilter === chip.stock && statusFilter === "All"
            : statusFilter === chip.status && stockFilter === "All";
          return (
            <button
              key={chip.key}
              onClick={() => { setStockFilter(chip.stock); setStatusFilter(chip.status); }}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-full text-xs font-semibold border transition-all duration-150 cursor-pointer ${isActive
                  ? "bg-navy-950 text-white border-navy-950 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                }`}
            >
              {chip.label}
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
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
            <div className="py-20 flex flex-col items-center gap-5">
              <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-slate-200">
                <rect x="8" y="20" width="56" height="40" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M8 28h56" stroke="currentColor" strokeWidth="2" />
                <path d="M28 20V12h16v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M26 42h20M26 50h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="58" cy="54" r="10" fill="white" stroke="currentColor" strokeWidth="2" />
                <path d="M55 54h6M58 51v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">Warehouse is Empty</p>
                <p className="text-xs text-slate-400 mt-1.5 max-w-[280px] mx-auto leading-relaxed">
                  No products added yet. Use <strong className="text-slate-500">Import</strong> to upload a CSV or XLSX spreadsheet or add your first product manually.
                </p>
              </div>
              {isOwner && (
                <button
                  onClick={() => { setEditingProduct(null); setShowModal(true); }}
                  className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-sm font-bold px-5 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  Add First Product
                </button>
              )}
            </div>
          ) : (
            /* ── No search results state ── */
            <div className="py-20 flex flex-col items-center gap-5">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-slate-200">
                <circle cx="28" cy="28" r="18" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M41 41l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M22 28h12M28 22v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">No Products Match</p>
                <p className="text-xs text-slate-400 mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                  Try adjusting your search or clearing the active filters.
                </p>
              </div>
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer border border-slate-200"
              >
                <X size={12} />
                Clear Filters
              </button>
            </div>
          )
        ) : (
          <>
            {/* Mobile Card View (<768px) */}
            <div className="block md:hidden">
              <InventoryMobileCards
                groupedDisplayItems={groupedDisplayItems}
                isOwner={isOwner}
                isSelectionMode={isSelectionMode}
                selectedSet={selectedSet}
                allVisibleSelected={allVisibleSelected}
                selectAllCheckboxRef={selectAllCheckboxRef}
                handleToggleSelectAllVisible={handleToggleSelectAllVisible}
                handleToggleSelectProduct={handleToggleSelectProduct}
                expandedProductId={expandedProductId}
                setExpandedProductId={setExpandedProductId}
                copiedSkuId={copiedSkuId}
                handleCopySku={handleCopySku}
                setStockModal={setStockModal}
                setEditingProduct={setEditingProduct}
                setShowModal={setShowModal}
                expandedGroupNames={expandedGroupNames}
                toggleGroupExpand={toggleGroupExpand}
                handleEditBaseGroup={handleEditBaseGroup}
                setTargetGroupForNewVariant={setTargetGroupForNewVariant}
                setShowAddWithVariantModal={setShowAddWithVariantModal}
              />
            </div>

            {/* Tablet View (768px - 1023px) */}
            <div className="hidden md:block lg:hidden">
              <InventoryTabletView
                groupedDisplayItems={groupedDisplayItems}
                isOwner={isOwner}
                isSelectionMode={isSelectionMode}
                selectedSet={selectedSet}
                allVisibleSelected={allVisibleSelected}
                selectAllCheckboxRef={selectAllCheckboxRef}
                handleToggleSelectAllVisible={handleToggleSelectAllVisible}
                handleToggleSelectProduct={handleToggleSelectProduct}
                expandedProductId={expandedProductId}
                setExpandedProductId={setExpandedProductId}
                copiedSkuId={copiedSkuId}
                handleCopySku={handleCopySku}
                setStockModal={setStockModal}
                setEditingProduct={setEditingProduct}
                setShowModal={setShowModal}
                expandedGroupNames={expandedGroupNames}
                toggleGroupExpand={toggleGroupExpand}
                handleEditBaseGroup={handleEditBaseGroup}
                setTargetGroupForNewVariant={setTargetGroupForNewVariant}
                setShowAddWithVariantModal={setShowAddWithVariantModal}
              />
            </div>

            {/* Desktop View (>=1024px) */}
            <div className="hidden lg:block">
              <InventoryDesktopTable
                groupedDisplayItems={groupedDisplayItems}
                isOwner={isOwner}
                isSelectionMode={isSelectionMode}
                selectedSet={selectedSet}
                allVisibleSelected={allVisibleSelected}
                selectAllCheckboxRef={selectAllCheckboxRef}
                handleToggleSelectAllVisible={handleToggleSelectAllVisible}
                handleToggleSelectProduct={handleToggleSelectProduct}
                expandedProductId={expandedProductId}
                setExpandedProductId={setExpandedProductId}
                copiedSkuId={copiedSkuId}
                handleCopySku={handleCopySku}
                setStockModal={setStockModal}
                setEditingProduct={setEditingProduct}
                setShowModal={setShowModal}
                expandedGroupNames={expandedGroupNames}
                toggleGroupExpand={toggleGroupExpand}
                handleEditBaseGroup={handleEditBaseGroup}
                setTargetGroupForNewVariant={setTargetGroupForNewVariant}
                setShowAddWithVariantModal={setShowAddWithVariantModal}
              />
            </div>
          </>
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
      <EditBaseProductModal
        isOpen={!!editingBaseGroup}
        groupName={editingBaseGroup}
        onClose={() => setEditingBaseGroup(null)}
      />
      <AddProductWithVariantModal
        isOpen={showAddWithVariantModal}
        initialGroup={targetGroupForNewVariant}
        onClose={() => {
          setShowAddWithVariantModal(false);
          setTargetGroupForNewVariant(null);
        }}
      />

      {/* ── Sticky Owner Bulk Action Toolbar (Phase 2C) ───────────────────── */}
      {isOwner && selectedProductIds.length > 0 && (
        <div className="sticky bottom-6 z-30 bg-navy-950 text-white rounded-2xl p-4 shadow-2xl border border-navy-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="bg-yellow-400 text-navy-950 font-black text-xs px-3 py-1 rounded-full shadow-xs">
              {selectedProductIds.length} Selected
            </span>
            <span className="text-xs text-slate-300 font-semibold">
              Bulk Vehicle Fitment Management
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setShowBulkAssignModal(true)}
              className="inline-flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm cursor-pointer active:scale-95"
            >
              <Plus size={14} />
              Bulk Assign Fitment
            </button>

            <button
              onClick={() => setShowBulkRemoveModal(true)}
              className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm cursor-pointer active:scale-95"
            >
              <Trash2 size={14} />
              Bulk Remove Fitment
            </button>

            <button
              onClick={() => setSelectedProductIds([])}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2.5 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <X size={14} />
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* ── Bulk Fitment Modals ── */}
      <BulkFitmentModal
        isOpen={showBulkAssignModal}
        mode="assign"
        onClose={() => setShowBulkAssignModal(false)}
        selectedProducts={selectedProductsList}
        onSuccess={() => setSelectedProductIds([])}
      />

      <BulkFitmentModal
        isOpen={showBulkRemoveModal}
        mode="remove"
        onClose={() => setShowBulkRemoveModal(false)}
        selectedProducts={selectedProductsList}
        onSuccess={() => setSelectedProductIds([])}
      />

      {/* ── Spreadsheet Import Upload Modal ── */}
      <SpreadsheetImportUploadModal
        isOpen={isImportUploadOpen}
        onClose={() => setIsImportUploadOpen(false)}
        onContinue={handleContinueToPreview}
        onDownloadTemplate={handleDownloadSampleTemplate}
      />

      {/* ── CSV Import Preview Modal ── */}
      <CSVImportPreviewModal
        isOpen={csvPreviewOpen}
        fileName={importFileName}
        parsedRows={parsedCSVRows}
        onClose={() => {
          setCsvPreviewOpen(false);
          setParsedCSVRows([]);
        }}
        onConfirm={(payload) => {
          try {
            const beforeProducts = state.products; // Baseline snapshot of current inventory before import
            bulkImportProducts(payload);

            // Compute and record lightweight Recent Import Report
            const timestamp = new Date().toISOString();
            const changes: ImportReportChangeItem[] = [];

            let stockIncreasedCount = 0;
            let stockDecreasedCount = 0;
            let productsWithChangesCount = 0;

            // 1. Added Products
            payload.productsToAdd.forEach((p) => {
              changes.push({
                sku: p.sku,
                productName: p.name,
                action: "ADDED",
                field: "Product",
                previousValue: "—",
                newValue: p.name,
                change: "New Product",
              });

              if (p.stock > 0) {
                stockIncreasedCount++;
                changes.push({
                  sku: p.sku,
                  productName: p.name,
                  action: "ADDED",
                  field: "Initial Stock",
                  previousValue: "—",
                  newValue: String(p.stock),
                  change: `+${p.stock} (Opening Stock)`,
                });
              }

              if (p.sellPrice > 0) {
                changes.push({
                  sku: p.sku,
                  productName: p.name,
                  action: "ADDED",
                  field: "Sell Price",
                  previousValue: "—",
                  newValue: `₹${p.sellPrice.toLocaleString()}`,
                  change: "—",
                });
              }
            });

            // 2. Updated Products (diff against baseline beforeProducts)
            payload.productsToUpdate.forEach((afterProd) => {
              const beforeProd = beforeProducts.find(
                (b) => b.id === afterProd.id || b.sku.trim().toLowerCase() === afterProd.sku.trim().toLowerCase()
              );

              if (!beforeProd) return;

              let hasChange = false;

              // Name
              if (beforeProd.name.trim() !== afterProd.name.trim()) {
                hasChange = true;
                changes.push({
                  sku: afterProd.sku,
                  productName: afterProd.name,
                  action: "UPDATED",
                  field: "Product Name",
                  previousValue: beforeProd.name,
                  newValue: afterProd.name,
                  change: "—",
                });
              }

              // Brand
              if ((beforeProd.brand || "").trim() !== (afterProd.brand || "").trim()) {
                hasChange = true;
                changes.push({
                  sku: afterProd.sku,
                  productName: afterProd.name,
                  action: "UPDATED",
                  field: "Brand",
                  previousValue: beforeProd.brand || "—",
                  newValue: afterProd.brand || "—",
                  change: "—",
                });
              }

              // Category
              if ((beforeProd.category || "").trim() !== (afterProd.category || "").trim()) {
                hasChange = true;
                changes.push({
                  sku: afterProd.sku,
                  productName: afterProd.name,
                  action: "UPDATED",
                  field: "Category",
                  previousValue: beforeProd.category || "—",
                  newValue: afterProd.category || "—",
                  change: "—",
                });
              }

              // Stock
              if (beforeProd.stock !== afterProd.stock) {
                hasChange = true;
                const delta = afterProd.stock - beforeProd.stock;
                if (delta > 0) stockIncreasedCount++;
                if (delta < 0) stockDecreasedCount++;

                changes.push({
                  sku: afterProd.sku,
                  productName: afterProd.name,
                  action: "UPDATED",
                  field: "Stock",
                  previousValue: String(beforeProd.stock),
                  newValue: String(afterProd.stock),
                  change: delta > 0 ? `+${delta}` : `${delta}`,
                });
              }

              // Current Price
              if (beforeProd.currentCost !== afterProd.currentCost) {
                hasChange = true;
                const diff = afterProd.currentCost - beforeProd.currentCost;
                changes.push({
                  sku: afterProd.sku,
                  productName: afterProd.name,
                  action: "UPDATED",
                  field: "Current Price",
                  previousValue: `₹${beforeProd.currentCost.toLocaleString()}`,
                  newValue: `₹${afterProd.currentCost.toLocaleString()}`,
                  change: diff > 0 ? `+₹${diff.toLocaleString()}` : `-₹${Math.abs(diff).toLocaleString()}`,
                });
              }

              // Sell Price
              if (beforeProd.sellPrice !== afterProd.sellPrice) {
                hasChange = true;
                const diff = afterProd.sellPrice - beforeProd.sellPrice;
                changes.push({
                  sku: afterProd.sku,
                  productName: afterProd.name,
                  action: "UPDATED",
                  field: "Sell Price",
                  previousValue: `₹${beforeProd.sellPrice.toLocaleString()}`,
                  newValue: `₹${afterProd.sellPrice.toLocaleString()}`,
                  change: diff > 0 ? `+₹${diff.toLocaleString()}` : `-₹${Math.abs(diff).toLocaleString()}`,
                });
              }

              // Low Stock Threshold
              if (beforeProd.lowStockThreshold !== afterProd.lowStockThreshold) {
                hasChange = true;
                changes.push({
                  sku: afterProd.sku,
                  productName: afterProd.name,
                  action: "UPDATED",
                  field: "Low Stock Threshold",
                  previousValue: String(beforeProd.lowStockThreshold),
                  newValue: String(afterProd.lowStockThreshold),
                  change: "—",
                });
              }

              // Status
              if ((beforeProd.status || "Active") !== (afterProd.status || "Active")) {
                hasChange = true;
                changes.push({
                  sku: afterProd.sku,
                  productName: afterProd.name,
                  action: "UPDATED",
                  field: "Status",
                  previousValue: beforeProd.status || "Active",
                  newValue: afterProd.status || "Active",
                  change: `${beforeProd.status || "Active"} → ${afterProd.status || "Active"}`,
                });
              }

              // Universal Fit
              if ((beforeProd.isUniversalFit ?? false) !== (afterProd.isUniversalFit ?? false)) {
                hasChange = true;
                changes.push({
                  sku: afterProd.sku,
                  productName: afterProd.name,
                  action: "UPDATED",
                  field: "Universal Fit",
                  previousValue: beforeProd.isUniversalFit ? "Yes" : "No",
                  newValue: afterProd.isUniversalFit ? "Yes" : "No",
                  change: "—",
                });
              }

              // Compatible Vehicles
              const beforeFit = serializeFitmentsForCSV(beforeProd.fitments);
              const afterFit = serializeFitmentsForCSV(afterProd.fitments);
              if (beforeFit !== afterFit) {
                hasChange = true;
                changes.push({
                  sku: afterProd.sku,
                  productName: afterProd.name,
                  action: "UPDATED",
                  field: "Compatible Vehicles",
                  previousValue: beforeFit || "None",
                  newValue: afterFit || "None",
                  change: "—",
                });
              }

              if (hasChange) {
                productsWithChangesCount++;
              }
            });

            const errorCount = parsedCSVRows.filter((r) => r.type === "ERROR").length;
            const unchangedCount = Math.max(0, payload.productsToUpdate.length - productsWithChangesCount);

            const report: RecentImportReport = {
              id: `imp-${Date.now()}`,
              date: timestamp,
              fileName: importFileName,
              totalRows: parsedCSVRows.length,
              addedCount: payload.productsToAdd.length,
              updatedCount: payload.productsToUpdate.length,
              unchangedCount,
              errorCount,
              stockIncreasedCount,
              stockDecreasedCount,
              changes,
            };

            saveRecentImportReport(report);

            showToast(
              `Import completed! ${payload.productsToAdd.length} products added, ${payload.productsToUpdate.length} products updated.`,
              "success"
            );
          } catch {
            showToast("Failed to apply CSV import.", "error");
          } finally {
            setCsvPreviewOpen(false);
            setParsedCSVRows([]);
          }
        }}
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
    <span className="text-[9px] font-bold uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full">
      Critical
    </span>
  ) : badge === "warning" ? (
    <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
      Alert
    </span>
  ) : null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${borderColor} bg-gradient-to-br ${gradient} p-4 flex flex-col gap-3
        transition-shadow duration-200 cursor-default hover:shadow-md`}
    >
      {/* Icon + badge row */}
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${iconGradient} flex items-center justify-center text-white shrink-0`}>
          {icon}
        </div>
        {badgeEl}
      </div>

      {/* Value */}
      <div>
        <p className={`text-[10px] font-medium uppercase tracking-wider mb-1 ${labelColor}`}>{label}</p>
        <p className={`text-xl font-bold tracking-tight ${valueColor ?? textBase} ${isRupee ? 'text-lg' : ''
          }`}>
          {value}
        </p>
      </div>
    </div>
  );
}
