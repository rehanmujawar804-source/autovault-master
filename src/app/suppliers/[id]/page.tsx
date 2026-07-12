"use client";

import { use, useMemo, useState, useEffect, memo, useCallback } from "react";
import { useStore } from "@/lib/store";
import type { Purchase, SupplierPayment, PaymentMethod, PurchaseLineItem, PurchaseReturn, PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from "@/types";
import { useRole } from "@/hooks/useRole";
import Link from "next/link";
import {
  ArrowLeft,
  Truck,
  Phone,
  Mail,
  MapPin,
  Package,
  ShoppingBag,
  Plus,
  CheckCircle,
  XCircle,
  X,
  AlertCircle,
  Calendar,
  Hash,
  DollarSign,
  MessageSquare,
  Activity,
  ChevronRight,
  Pencil,
  Coins,
  Info,
  Trash2,
  CornerDownLeft,
  FileText,
  Printer,
  Copy,
  Ban,
} from "lucide-react";
import type { Supplier, Product } from "@/types";

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

const INPUT =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-400";

const PO_STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Sent: "bg-blue-50 text-blue-700 border-blue-200",
  "Supplier Confirmed": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Partially Delivered": "bg-amber-50 text-amber-700 border-amber-200",
  Completed: "bg-emerald-550 text-emerald-800 border-emerald-200",
  Cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

// ─────────────────────────────────────────────
//  SUPPLIER INVOICE MODAL (Sprint 4.4 + enhancements)
// ─────────────────────────────────────────────

interface SupplierInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier;
  products: Product[];
  purchaseCount: number; // for ERP record number preview
  initialPO?: PurchaseOrder | null; // Sprint 4.6 — pre-fill from PO conversion
}

function blankRow(): PurchaseLineItem {
  return { id: crypto.randomUUID(), productId: "", quantity: "", buyPrice: "" };
}

// ── Text Highlight Helper ───────────────────────────────────────────────────

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const safeQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`(${safeQuery})`, "gi");
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 text-slate-900 font-bold rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
}

// ── Searchable Product Combobox ──────────────────────────────────────────────

interface ProductSearchProps {
  value: string;
  onChange: (productId: string) => void;
  products: Product[];
  rowIdx: number;
}

function ProductSearchCombobox({ value, onChange, products, rowIdx }: ProductSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = products.find((p) => p.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q))
    );
  }, [products, query]);

  function choose(p: Product) {
    onChange(p.id);
    setQuery("");
    setOpen(false);
  }

  function handleFocus() {
    setQuery("");
    setOpen(true);
  }

  function handleBlur() {
    setTimeout(() => setOpen(false), 200);
  }

  const displayValue = open ? query : (selected ? selected.name : "");

  return (
    <div className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Search by name, SKU, brand…"
        aria-label={`Product search row ${rowIdx + 1}`}
        className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-450"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto">
          {filtered.slice(0, 30).map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => choose(p)}
              className="w-full flex flex-col px-3.5 py-2 text-left hover:bg-navy-50 border-b border-slate-100 last:border-0 transition-colors"
            >
              <div className="w-full flex justify-between items-start gap-2">
                <span className="text-xs font-black text-slate-800">
                  <HighlightedText text={p.name} query={query} />
                </span>
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 border ${
                  p.stock === 0
                    ? "bg-red-50 border-red-200 text-red-700"
                    : p.stock <= p.lowStockThreshold
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-green-50 border-green-200 text-green-700"
                }`}>
                  Stock: {p.stock}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-slate-450 font-mono mt-1">
                <span>SKU: <HighlightedText text={p.sku} query={query} /></span>
                {p.brand && <span>Brand: <HighlightedText text={p.brand} query={query} /></span>}
                <span>Last Cost: ₹{p.currentCost.toLocaleString()}</span>
                <span>Selling: ₹{p.sellPrice.toLocaleString()}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-3 text-center text-xs text-slate-400">
          No matching products found.
        </div>
      )}
    </div>
  );
}

// ── Memoized Product Row Item ───────────────────────────────────────────────

interface RowItemProps {
  row: PurchaseLineItem;
  idx: number;
  products: Product[];
  error?: { quantity?: string; buyPrice?: string; productId?: string };
  onChangeProduct: (id: string, productId: string) => void;
  onChangeQty: (id: string, qty: string) => void;
  onChangePrice: (id: string, price: string) => void;
  onDuplicate: (row: PurchaseLineItem) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
}

const SupplierInvoiceRowItem = memo(({
  row,
  idx,
  products,
  error,
  onChangeProduct,
  onChangeQty,
  onChangePrice,
  onDuplicate,
  onDelete,
  canDelete,
}: RowItemProps) => {
  const selectedProduct = products.find((p) => p.id === row.productId);

  const rowQty = parseInt(row.quantity) || 0;
  const rowPrice = parseFloat(row.buyPrice) || 0;
  const rowTotal = rowQty * rowPrice;

  // Margin calculation
  const sellPrice = selectedProduct?.sellPrice ?? 0;
  const marginAbs = rowPrice > 0 ? sellPrice - rowPrice : null;
  const marginPct = rowPrice > 0 && sellPrice > 0
    ? ((sellPrice - rowPrice) / rowPrice * 100)
    : null;

  return (
    <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-3 space-y-2 hover:border-slate-300 transition-all">
      {/* Header section: name, sku, brand, and stock level badge with health colors */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          {selectedProduct ? (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-bold text-xs text-slate-800">{selectedProduct.name}</span>
              <span className="text-[9px] text-slate-450 font-mono">
                SKU: {selectedProduct.sku} {selectedProduct.brand ? `· Brand: ${selectedProduct.brand}` : ""}
              </span>
            </div>
          ) : (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Line {idx + 1}: Select Product
            </span>
          )}
        </div>

        {selectedProduct && (
          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${
            selectedProduct.stock === 0
              ? "bg-red-50 border-red-200 text-red-700 animate-pulse"
              : selectedProduct.stock <= selectedProduct.lowStockThreshold
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : "bg-green-50 border-green-200 text-green-700"
          }`}>
            {selectedProduct.stock === 0
              ? "Out of Stock"
              : selectedProduct.stock <= selectedProduct.lowStockThreshold
              ? `Low Stock: ${selectedProduct.stock}`
              : `Stock: ${selectedProduct.stock}`}
          </span>
        )}
      </div>

      {/* Row 1: Search Combobox */}
      <div className="w-full">
        <ProductSearchCombobox
          value={row.productId}
          onChange={(productId) => onChangeProduct(row.id, productId)}
          products={products}
          rowIdx={idx}
        />
        {error?.productId && (
          <span className="text-[9px] font-extrabold text-red-500 mt-1 block pl-1">{error.productId}</span>
        )}
      </div>

      {/* Row 2: Qty | Buy Price | Margin info | Total | Actions */}
      <div className="grid grid-cols-[80px_110px_1fr_90px_60px] gap-2 items-start pt-1">
        {/* Qty */}
        <div>
          <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Qty</label>
          <input
            type="number"
            min="1"
            step="1"
            placeholder="0"
            value={row.quantity}
            onChange={(e) => onChangeQty(row.id, e.target.value)}
            className={`w-full border rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all ${
              error?.quantity ? "border-red-400 bg-red-50/50" : "border-slate-200 bg-white"
            }`}
          />
          {error?.quantity && (
            <span className="text-[9px] font-extrabold text-red-500 mt-0.5 block leading-tight">{error.quantity}</span>
          )}
        </div>

        {/* Buy Price */}
        <div>
          <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Buy Price (₹)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={row.buyPrice}
            onChange={(e) => onChangePrice(row.id, e.target.value)}
            className={`w-full border rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all ${
              error?.buyPrice ? "border-red-400 bg-red-50/50" : "border-slate-200 bg-white"
            }`}
          />
          {error?.buyPrice && (
            <span className="text-[9px] font-extrabold text-red-500 mt-0.5 block leading-tight">{error.buyPrice}</span>
          )}
        </div>

        {/* Margin Preview */}
        <div className="text-left pl-1 self-center">
          {selectedProduct ? (
            <div className="space-y-0.5">
              <p className="text-[9px] text-slate-400 leading-tight">
                Last: <span className="font-bold text-slate-700">₹{selectedProduct.currentCost.toLocaleString()}</span> • Sell: <span className="font-bold text-slate-700">₹{selectedProduct.sellPrice.toLocaleString()}</span>
              </p>
              {marginAbs !== null && marginPct !== null && (
                <p className={`text-[9px] font-extrabold leading-tight ${marginAbs >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                  Margin: {marginAbs >= 0 ? "▲" : "▼"} ₹{Math.abs(marginAbs).toLocaleString()} ({marginPct.toFixed(1)}%)
                </p>
              )}
            </div>
          ) : (
            <span className="text-[9px] text-slate-300 pl-1">—</span>
          )}
        </div>

        {/* Total Display */}
        <div className="text-right self-center pr-1">
          <span className={`text-xs font-black ${rowTotal > 0 ? "text-slate-800" : "text-slate-350"}`}>
            ₹{rowTotal.toLocaleString()}
          </span>
        </div>

        {/* Action Shortcuts: Duplicate and Delete */}
        <div className="flex gap-1 justify-end self-center pt-0.5">
          <button
            type="button"
            onClick={() => onDuplicate(row)}
            title="Duplicate Row"
            className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Plus size={11} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(row.id)}
            disabled={!canDelete}
            title="Delete Row"
            className="w-6 h-6 rounded-md bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
});

SupplierInvoiceRowItem.displayName = "SupplierInvoiceRowItem";

// ── Success Overlay component ────────────────────────────────────────────────

interface SuccessOverlayProps {
  purchases: number;
  movements: number;
  finance: number;
}

function SuccessOverlay({ purchases, movements, finance }: SuccessOverlayProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <CheckCircle size={36} className="animate-bounce" />
        </div>
        <div>
          <h2 className="text-lg font-black tracking-tight text-white">✅ Supplier Invoice Recorded</h2>
          <p className="text-xs text-slate-400 mt-1">Updates written to transaction logs successfully</p>
        </div>
        <div className="w-full bg-slate-850 border border-slate-800 rounded-xl p-4 text-left space-y-2 mt-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Database Records Generated:</p>
          <div className="flex justify-between text-xs font-mono border-b border-slate-800 pb-1.5">
            <span className="text-slate-400">Purchase Records</span>
            <span className="text-emerald-400 font-bold">{purchases}</span>
          </div>
          <div className="flex justify-between text-xs font-mono border-b border-slate-800 pb-1.5">
            <span className="text-slate-400">Stock Movements</span>
            <span className="text-emerald-400 font-bold">{movements}</span>
          </div>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">Finance Transactions</span>
            <span className="text-emerald-400 font-bold">{finance}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          Closing...
        </div>
      </div>
    </div>
  );
}

// ── Main Modal ───────────────────────────────────────────────────────────────

function SupplierInvoiceModal({ isOpen, onClose, supplier, products, purchaseCount, initialPO }: SupplierInvoiceModalProps) {
  const { addPurchaseBatch, showToast } = useStore();

  const today = new Date().toISOString().split("T")[0];

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [paidInput, setPaidInput] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<PurchaseLineItem[]>([blankRow()]);
  const [formError, setFormError] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Bulk Paste panel state
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState("");

  // Success screen state
  const [successState, setSuccessState] = useState<{
    purchases: number;
    movements: number;
    finance: number;
  } | null>(null);

  // Reset form when modal opens
  if (isOpen && !initialized) {
    setInitialized(true);
    setInvoiceNumber("");
    setDate(today);
    setPaymentMethod("Cash");
    setPaidInput("");
    setFormError("");
    setShowBulkPaste(false);
    setBulkPasteText("");
    setSuccessState(null);

    // Pre-fill from PO conversion: only remaining quantities
    if (initialPO) {
      setNotes(`Received against ${initialPO.poNumber}`);
      const poRows: PurchaseLineItem[] = initialPO.items
        .filter((item) => item.quantity - item.receivedQuantity > 0)
        .map((item) => ({
          id: crypto.randomUUID(),
          productId: item.productId,
          quantity: String(item.quantity - item.receivedQuantity),
          buyPrice: String(item.expectedBuyPrice),
          expectedBuyPrice: String(item.expectedBuyPrice),
        }));
      setRows(poRows.length > 0 ? poRows : [blankRow()]);
    } else {
      setNotes("");
      setRows([blankRow()]);
    }
  }

  // ── Callbacks for Memoized Row Performance ──────────────────────────────────
  const onChangeProduct = useCallback((id: string, productId: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, productId } : r));
  }, []);

  const onChangeQty = useCallback((id: string, quantity: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, quantity } : r));
  }, []);

  const onChangePrice = useCallback((id: string, buyPrice: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, buyPrice } : r));
  }, []);

  const onDuplicate = useCallback((row: PurchaseLineItem) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === row.id);
      const newRow = {
        id: crypto.randomUUID(),
        productId: row.productId,
        quantity: row.quantity,
        buyPrice: row.buyPrice,
      };
      if (idx === -1) return [...prev, newRow];
      const copy = [...prev];
      copy.splice(idx + 1, 0, newRow);
      return copy;
    });
  }, []);

  const onDelete = useCallback((id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, blankRow()]);
  }, []);

  // ── Bulk Paste Import Handler ──────────────────────────────────────────────
  const handleImportBulk = useCallback((text: string) => {
    const lines = text.split(/\r?\n/);
    const newItems: PurchaseLineItem[] = [];
    const unrecognizedSKUs: string[] = [];

    for (const line of lines) {
      const clean = line.trim();
      if (!clean) continue;

      // Match whitespace split
      const parts = clean.split(/\s+/);
      if (parts.length >= 1) {
        const sku = parts[0];
        const qty = parts[1] || "1";
        const buyPrice = parts[2] || "0";

        // Find product by SKU
        const matched = products.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
        if (matched) {
          newItems.push({
            id: crypto.randomUUID(),
            productId: matched.id,
            quantity: qty,
            buyPrice: buyPrice,
          });
        } else {
          unrecognizedSKUs.push(sku);
        }
      }
    }

    if (newItems.length > 0) {
      setRows((prev) => {
        // If the single initial row is blank/empty, replace it
        const isInitialEmpty = prev.length === 1 && !prev[0].productId && !prev[0].quantity && !prev[0].buyPrice;
        return isInitialEmpty ? newItems : [...prev, ...newItems];
      });
      showToast(`Imported ${newItems.length} products.`, "success");
    }

    if (unrecognizedSKUs.length > 0) {
      showToast(`Skipped ${unrecognizedSKUs.length} unknown SKUs: ${unrecognizedSKUs.join(", ")}`, "info");
    }
  }, [products, showToast]);

  if (!isOpen) return null;

  function handleClose() {
    setInitialized(false);
    onClose();
  }

  // ── Live Summary Calculations ─────────────────
  const subtotal = rows.reduce((s, r) => {
    const qty = parseInt(r.quantity) || 0;
    const price = parseFloat(r.buyPrice) || 0;
    return s + qty * price;
  }, 0);

  const totalPaid = Math.min(Math.max(parseFloat(paidInput) || 0, 0), subtotal);
  const balance = Math.max(0, subtotal - totalPaid);
  const totalUnits = rows.reduce((s, r) => s + (parseInt(r.quantity) || 0), 0);
  const productCount = rows.filter((r) => r.productId).length;

  // ERP purchase preview sequence
  const year = new Date().getFullYear();
  const firstNum = purchaseCount + 1;
  const lastNum = purchaseCount + rows.length;
  const purPreview = rows.length === 1
    ? `PUR-${year}-${String(firstNum).padStart(5, "0")}`
    : `PUR-${year}-${String(firstNum).padStart(5, "0")} → ${String(lastNum).padStart(5, "0")}`;

  // ── Inline Validation Logic ───────────────────
  const rowErrors: Record<string, { quantity?: string; buyPrice?: string; productId?: string }> = {};
  rows.forEach((r) => {
    rowErrors[r.id] = {};
    if (!r.productId) {
      rowErrors[r.id].productId = "Please select product";
    }
    const qVal = parseInt(r.quantity);
    if (!r.quantity) {
      rowErrors[r.id].quantity = "Qty required";
    } else if (isNaN(qVal) || qVal <= 0) {
      rowErrors[r.id].quantity = "Must be > 0";
    }
    const pVal = parseFloat(r.buyPrice);
    if (!r.buyPrice) {
      rowErrors[r.id].buyPrice = "Price required";
    } else if (isNaN(pVal) || pVal < 0) {
      rowErrors[r.id].buyPrice = "Must be >= 0";
    }
  });

  const isFormValid = rows.length > 0 && Object.values(rowErrors).every(
    (err) => !err.productId && !err.quantity && !err.buyPrice
  );

  // ── Validation & Save ─────────────────────────
  function handleSave() {
    if (!isFormValid) return;

    if (!date) { setFormError("Please select a date."); return; }

    const rawPaid = parseFloat(paidInput) || 0;
    if (rawPaid < 0) { setFormError("Amount paid cannot be negative."); return; }
    if (rawPaid > subtotal) { setFormError("Amount paid cannot exceed the invoice total."); return; }

    const items = rows.map((r) => ({
      productId: r.productId,
      quantity: parseInt(r.quantity),
      buyPrice: parseFloat(r.buyPrice),
      expectedBuyPrice: r.expectedBuyPrice ? parseFloat(r.expectedBuyPrice) : undefined,
    }));

    try {
      addPurchaseBatch({
        supplierId: supplier.id,
        invoiceNumber: invoiceNumber.trim(),
        date,
        notes: notes.trim(),
        paymentMethod,
        totalPaid: rawPaid,
        items,
        purchaseOrderId: initialPO?.id,
      });

      // Show success screen animations
      setSuccessState({
        purchases: items.length,
        movements: items.length,
        finance: rawPaid > 0 ? items.length : 0,
      });

      // Auto close after 2s
      setTimeout(() => {
        setSuccessState(null);
        setInitialized(false);
        onClose();
      }, 2000);

    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to record invoice.");
    }
  }

  return (
    <>
      {successState && (
        <SuccessOverlay
          purchases={successState.purchases}
          movements={successState.movements}
          finance={successState.finance}
        />
      )}

      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        {/* Modal — flex column so sticky summary+footer stay outside scroll */}
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col animate-in zoom-in-95 duration-150">

          {/* ── Header ── */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200 shrink-0 rounded-t-2xl">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <ShoppingBag size={16} className="text-emerald-700" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 text-base leading-tight">Record Supplier Invoice</h2>
                <p className="text-[10px] text-slate-400 leading-tight">{supplier.name}</p>
              </div>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* ── Scrollable body ── */}
          <div className="overflow-y-auto flex-1 p-5 space-y-4">

            {/* Error Banner */}
            {formError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl shrink-0">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Invoice Header: Number | Date | Payment Method */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Supplier Invoice No.
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-5482"
                  value={invoiceNumber}
                  onChange={(e) => { setInvoiceNumber(e.target.value); setFormError(""); }}
                  className={INPUT}
                />
                {/* ERP purchase number preview */}
                <p className="text-[10px] text-slate-400 mt-1 font-mono pl-1 leading-tight">
                  ERP: <span className="font-bold text-navy-800">{purPreview}</span>
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setFormError(""); }}
                  className={INPUT}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => { setPaymentMethod(e.target.value as PaymentMethod); setFormError(""); }}
                  className={INPUT}
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card / Bank</option>
                </select>
              </div>
            </div>

            {/* Products Section Header & Bulk Import Actions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider">Products</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBulkPaste(!showBulkPaste);
                      setBulkPasteText("");
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Bulk Paste
                  </button>
                  <button
                    type="button"
                    onClick={addRow}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus size={13} />
                    Add Row
                  </button>
                </div>
              </div>

              {/* Bulk Paste Expansion */}
              {showBulkPaste && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 animate-in slide-in-from-top-2 duration-150">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                      Bulk Paste (Format: SKU Qty BuyPrice)
                    </label>
                    <textarea
                      rows={3}
                      placeholder={"OF-101 2 145\nAF-201 1 620"}
                      value={bulkPasteText}
                      onChange={(e) => setBulkPasteText(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all font-mono placeholder:text-slate-350"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowBulkPaste(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!bulkPasteText.trim()}
                      onClick={() => {
                        handleImportBulk(bulkPasteText);
                        setBulkPasteText("");
                        setShowBulkPaste(false);
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Import Rows
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* List of Product Rows (Memoized for peak performance) */}
            <div className="space-y-2.5">
              {rows.map((row, idx) => (
                <SupplierInvoiceRowItem
                  key={row.id}
                  row={row}
                  idx={idx}
                  products={products}
                  error={rowErrors[row.id]}
                  onChangeProduct={onChangeProduct}
                  onChangeQty={onChangeQty}
                  onChangePrice={onChangePrice}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                  canDelete={rows.length > 1}
                />
              ))}
            </div>

            {/* Add Row helper button at bottom */}
            {rows.length >= 3 && (
              <button
                type="button"
                onClick={addRow}
                className="w-full py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-dashed border-emerald-300 rounded-xl transition-colors cursor-pointer"
              >
                + Add Another Product
              </button>
            )}

            {/* Notes field */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Notes (optional)</label>
              <textarea
                placeholder="Any notes about this invoice…"
                rows={2}
                value={notes}
                onChange={(e) => { setNotes(e.target.value); }}
                className={INPUT + " resize-none"}
              />
            </div>
          </div>

          {/* ── Sticky Summary & Action Footer ── */}
          <div className="shrink-0 border-t border-slate-200 bg-slate-50/95 rounded-b-2xl">

            {/* Rich 8-Card ERP Summary Grid */}
            <div className="px-5 pt-4 pb-3">
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                <div className="bg-white border border-slate-200 rounded-xl p-2 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Products</p>
                  <p className="text-sm font-black text-slate-800 mt-0.5">{productCount}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-2 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Units</p>
                  <p className="text-sm font-black text-slate-800 mt-0.5">{totalUnits}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-2 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Subtotal</p>
                  <p className="text-sm font-black text-slate-800 mt-0.5">₹{subtotal.toLocaleString()}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-2 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">GST</p>
                  <p className="text-sm font-black text-slate-450 mt-0.5">₹0</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-2 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Discount</p>
                  <p className="text-sm font-black text-slate-450 mt-0.5">₹0</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-2 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Grand Total</p>
                  <p className="text-sm font-black text-slate-800 mt-0.5">₹{subtotal.toLocaleString()}</p>
                </div>
                <div className="bg-white border border-emerald-250 rounded-xl p-2 text-center">
                  <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Paid</p>
                  <p className="text-sm font-black text-emerald-700 mt-0.5">₹{totalPaid.toLocaleString()}</p>
                </div>
                <div className={`border rounded-xl p-2 text-center ${balance > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
                  <p className={`text-[9px] font-bold uppercase tracking-wider ${balance > 0 ? "text-amber-600" : "text-slate-400"}`}>Balance</p>
                  <p className={`text-sm font-black mt-0.5 ${balance > 0 ? "text-amber-700" : "text-slate-400"}`}>₹{balance.toLocaleString()}</p>
                </div>
              </div>

              {/* Amount Paid Inline Input */}
              <div className="mt-3 flex items-center gap-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 pl-1">
                  Amount Paid (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Leave 0 for full credit"
                  value={paidInput}
                  onChange={(e) => { setPaidInput(e.target.value); setFormError(""); }}
                  className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-400 font-bold"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 px-5 py-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isFormValid}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Record Invoice →
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}






// ─────────────────────────────────────────────
//  EDIT SUPPLIER MODAL (inline)
// ─────────────────────────────────────────────

interface EditSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier;
}

function EditSupplierModal({ isOpen, onClose, supplier }: EditSupplierModalProps) {
  const { updateSupplier, showToast } = useStore();

  const [form, setForm] = useState({
    name: supplier.name,
    contactPerson: supplier.contactPerson,
    phone: supplier.phone,
    whatsApp: supplier.whatsApp,
    email: supplier.email,
    address: supplier.address,
    gst: supplier.gst || "",
    notes: supplier.notes,
    status: supplier.status,
  });
  const [formError, setFormError] = useState("");

  if (!isOpen) return null;

  function setField<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setFormError("");
  }

  function handleSave() {
    if (!form.name.trim()) { setFormError("Supplier name is required."); return; }
    try {
      updateSupplier({ ...supplier, ...form, name: form.name.trim() });
      showToast("Supplier updated.", "success");
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center"><Truck size={16} className="text-navy-700" /></div>
            <h2 className="font-bold text-slate-800 text-base">Edit Supplier</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {formError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              <AlertCircle size={15} className="shrink-0 mt-0.5" /><span>{formError}</span>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Supplier Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} className={INPUT} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Contact Person</label>
            <input type="text" value={form.contactPerson} onChange={(e) => setField("contactPerson", e.target.value)} className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Phone</label><input type="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} className={INPUT} /></div>
            <div><label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">WhatsApp</label><input type="tel" value={form.whatsApp} onChange={(e) => setField("whatsApp", e.target.value)} className={INPUT} /></div>
          </div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Email</label><input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} className={INPUT} /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Address</label><textarea rows={2} value={form.address} onChange={(e) => setField("address", e.target.value)} className={INPUT + " resize-none"} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">GST <span className="text-slate-400 font-normal">(optional)</span></label><input type="text" value={form.gst} onChange={(e) => setField("gst", e.target.value)} className={INPUT} /></div>
            <div><label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Status</label>
              <select value={form.status} onChange={(e) => setField("status", e.target.value as "Active" | "Inactive")} className={INPUT}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Notes</label><textarea rows={3} value={form.notes} onChange={(e) => setField("notes", e.target.value)} className={INPUT + " resize-none"} /></div>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl sticky bottom-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">Cancel</button>
          <button onClick={handleSave} className="flex-1 px-4 py-2.5 text-sm font-bold text-navy-950 bg-yellow-400 rounded-xl hover:bg-yellow-300 transition-colors cursor-pointer">Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  PURCHASE ORDER MODAL (Sprint 4.6)
// ─────────────────────────────────────────────

interface POModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier;
  products: Product[];
  existingPO?: PurchaseOrder | null; // null → create, PurchaseOrder → edit
}

interface POLineItem {
  id: string;
  productId: string;
  quantity: string;
  expectedBuyPrice: string;
}

function blankPORow(): POLineItem {
  return { id: crypto.randomUUID(), productId: "", quantity: "", expectedBuyPrice: "" };
}

function PurchaseOrderModal({ isOpen, onClose, supplier, products, existingPO }: POModalProps) {
  const { state, createPurchaseOrder, updatePurchaseOrder, showToast } = useStore();

  const today = new Date().toISOString().split("T")[0];
  const oneWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const isPOPartiallyDelivered = existingPO?.status === "Partially Delivered";

  const [expectedDelivery, setExpectedDelivery] = useState(oneWeek);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<POLineItem[]>([blankPORow()]);
  const [formError, setFormError] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Reset / seed when modal opens
  if (isOpen && !initialized) {
    setInitialized(true);
    setFormError("");
    if (existingPO) {
      setExpectedDelivery(existingPO.expectedDeliveryDate || oneWeek);
      setNotes(existingPO.notes || "");
      const isPartiallyDelivered = existingPO.status === "Partially Delivered";
      setRows(
        existingPO.items.map((item) => ({
          id: item.id || crypto.randomUUID(),
          productId: item.productId,
          // When partially delivered, show remaining qty only
          quantity: isPartiallyDelivered
            ? String(Math.max(0, item.quantity - item.receivedQuantity))
            : String(item.quantity),
          expectedBuyPrice: String(item.expectedBuyPrice),
        }))
      );
    } else {
      setExpectedDelivery(oneWeek);
      setNotes("");
      setRows([blankPORow()]);
    }
  }

  function handleClose() {
    setInitialized(false);
    onClose();
  }

  const estTotal = rows.reduce((s, r) => {
    const qty = parseInt(r.quantity) || 0;
    const price = parseFloat(r.expectedBuyPrice) || 0;
    return s + qty * price;
  }, 0);

  // Inline validation
  const rowErrors: Record<string, { quantity?: string; buyPrice?: string; productId?: string }> = {};
  rows.forEach((r) => {
    rowErrors[r.id] = {};
    if (!r.productId) rowErrors[r.id].productId = "Select product";
    const qVal = parseInt(r.quantity);
    if (!r.quantity) rowErrors[r.id].quantity = "Required";
    else if (isNaN(qVal) || qVal <= 0) rowErrors[r.id].quantity = "> 0";
    const pVal = parseFloat(r.expectedBuyPrice);
    if (!r.expectedBuyPrice) rowErrors[r.id].buyPrice = "Required";
    else if (isNaN(pVal) || pVal < 0) rowErrors[r.id].buyPrice = ">= 0";
  });

  const isFormValid =
    rows.length > 0 &&
    Object.values(rowErrors).every((e) => !e.productId && !e.quantity && !e.buyPrice);

  function handleSave() {
    if (!isFormValid) { setFormError("Please fix all row errors before saving."); return; }
    if (!expectedDelivery) { setFormError("Expected delivery date is required."); return; }
    setFormError("");

    const items: PurchaseOrderItem[] = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      quantity: parseInt(r.quantity),
      expectedBuyPrice: parseFloat(r.expectedBuyPrice),
      receivedQuantity: 0,
    }));

    if (existingPO) {
      // Edit — preserve received quantities
      const mergedItems: PurchaseOrderItem[] = items.map((item) => {
        const orig = existingPO.items.find((i) => i.id === item.id);
        return { ...item, receivedQuantity: orig?.receivedQuantity ?? 0 };
      });
      updatePurchaseOrder(
        existingPO.id,
        expectedDelivery,
        notes.trim(),
        mergedItems,
        existingPO.status
      );
      showToast(`${existingPO.poNumber} updated`, "success");
    } else {
      createPurchaseOrder({
        supplierId: supplier.id,
        expectedDeliveryDate: expectedDelivery,
        notes: notes.trim(),
        items,
        status: "Draft",
      });
      showToast("Purchase Order created", "success");
    }

    setInitialized(false);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-black text-slate-800">
              {existingPO ? `Edit ${existingPO.poNumber}` : "New Purchase Order"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {supplier.name} · Planning document only — no stock or finance changes
            </p>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Metadata row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                Expected Delivery Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={expectedDelivery}
                min={today}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                Notes / Reference
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Diwali restock"
                className={INPUT}
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-600">Items</label>
              {!isPOPartiallyDelivered && (
                <button
                  type="button"
                  onClick={() => setRows((prev) => [...prev, blankPORow()])}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-600 cursor-pointer"
                >
                  <Plus size={12} /> Add Row
                </button>
              )}
            </div>

            <div className="space-y-2">
              {rows.map((row, idx) => {
                const errs = rowErrors[row.id] || {};
                const qty = parseInt(row.quantity) || 0;
                const price = parseFloat(row.expectedBuyPrice) || 0;
                const rowTotal = qty * price;
                const selectedProduct = products.find((p) => p.id === row.productId);

                // Compute historical pricing statistics for smart price suggestions
                const productPurchases = (state.purchases || []).filter((p) => p.productId === row.productId);
                const lastBuyPurchase = [...productPurchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                const lastBuy = lastBuyPurchase ? lastBuyPurchase.buyPrice : null;
                const avgBuy = productPurchases.length > 0
                  ? productPurchases.reduce((s, p) => s + p.buyPrice, 0) / productPurchases.length
                  : null;
                const lowestBuy = productPurchases.length > 0
                  ? Math.min(...productPurchases.map((p) => p.buyPrice))
                  : null;
                const catalogCost = selectedProduct ? selectedProduct.currentCost : null;

                return (
                  <div key={row.id} className="grid grid-cols-[1fr_80px_90px_60px_24px] gap-2 items-start bg-slate-50 border border-slate-200 rounded-xl p-3">
                    {/* Product */}
                    <div>
                      {isPOPartiallyDelivered ? (
                        <div className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-slate-100 text-slate-500 font-semibold select-none">
                          {selectedProduct?.name || "Unknown Product"}
                        </div>
                      ) : (
                        <ProductSearchCombobox
                          value={row.productId}
                          onChange={(pid) => setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, productId: pid } : r))}
                          products={products}
                          rowIdx={idx}
                        />
                      )}
                      {errs.productId && <p className="text-[10px] text-red-500 mt-0.5">{errs.productId}</p>}

                      {selectedProduct && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-slate-400 mt-1 select-none font-medium leading-none">
                          {lastBuy !== null && (
                            <span>Last: <strong className="text-slate-600 font-bold">₹{lastBuy.toLocaleString()}</strong></span>
                          )}
                          {avgBuy !== null && (
                            <span>Avg: <strong className="text-slate-600 font-bold">₹{Math.round(avgBuy).toLocaleString()}</strong></span>
                          )}
                          {lowestBuy !== null && (
                            <span>Low: <strong className="text-slate-600 font-bold">₹{lowestBuy.toLocaleString()}</strong></span>
                          )}
                          {catalogCost !== null && (
                            <span>Catalog: <strong className="text-slate-600 font-bold">₹{catalogCost.toLocaleString()}</strong></span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Qty */}
                    <div>
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={row.quantity}
                        disabled={isPOPartiallyDelivered}
                        onChange={(e) => setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, quantity: e.target.value } : r))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 disabled:opacity-60 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                      {errs.quantity && <p className="text-[10px] text-red-500 mt-0.5">{errs.quantity}</p>}
                    </div>

                    {/* Expected Buy Price */}
                    <div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="₹ Price"
                        value={row.expectedBuyPrice}
                        disabled={isPOPartiallyDelivered}
                        onChange={(e) => setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, expectedBuyPrice: e.target.value } : r))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 disabled:opacity-60 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                      {errs.buyPrice && <p className="text-[10px] text-red-500 mt-0.5">{errs.buyPrice}</p>}
                    </div>

                    {/* Row total */}
                    <div className="text-right pt-2 text-xs font-bold text-slate-700">
                      {rowTotal > 0 ? `₹${rowTotal.toLocaleString()}` : "—"}
                    </div>

                    {/* Delete row */}
                    {isPOPartiallyDelivered ? (
                      <div className="w-6 h-6 shrink-0" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== row.id) : prev)}
                        disabled={rows.length === 1}
                        className="mt-1.5 w-6 h-6 rounded-md bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-red-700">
              {formError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-slate-400 font-medium">Est. Total: </span>
            <span className="font-extrabold text-slate-800">₹{estTotal.toLocaleString()}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={handleClose} className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isFormValid}
              className="px-5 py-2.5 text-sm font-bold text-navy-950 bg-yellow-400 rounded-xl hover:bg-yellow-300 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {existingPO ? "Save Changes" : "Create PO"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  PO PRINT SLIP OVERLAY (Sprint 4.6)
// ─────────────────────────────────────────────

function POPrintSlip({ po, supplier, products, onClose }: { po: PurchaseOrder; supplier: Supplier; products: Product[]; onClose: () => void }) {
  const estTotal = po.items.reduce((s, item) => s + item.quantity * item.expectedBuyPrice, 0);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Print header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">Purchase Order</p>
            <h2 className="text-xl font-extrabold tracking-tight mt-0.5">{po.poNumber}</h2>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${PO_STATUS_COLOR[po.status]}`}>
            {po.status}
          </span>
        </div>

        {/* Supplier & meta */}
        <div className="px-6 py-4 grid grid-cols-2 gap-4 border-b border-slate-100 text-xs">
          <div>
            <p className="text-slate-400 font-semibold">Supplier</p>
            <p className="font-bold text-slate-800 mt-0.5">{supplier.name}</p>
            {supplier.phone && <p className="text-slate-500">{supplier.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-slate-400 font-semibold">Expected Delivery</p>
            <p className="font-bold text-slate-800 mt-0.5">{formatDate(po.expectedDeliveryDate)}</p>
            <p className="text-slate-400 mt-1 font-semibold">Created</p>
            <p className="text-slate-600">{formatDate(po.createdAt)}</p>
          </div>
        </div>

        {/* Items table */}
        <div className="px-6 py-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-slate-400 font-semibold pb-2">Product</th>
                <th className="text-center text-slate-400 font-semibold pb-2">Qty</th>
                <th className="text-right text-slate-400 font-semibold pb-2">Unit Price</th>
                <th className="text-right text-slate-400 font-semibold pb-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {po.items.map((item) => {
                const product = products.find((p) => p.id === item.productId);
                return (
                  <tr key={item.id} className="py-2">
                    <td className="py-2 font-semibold text-slate-800">{product?.name || "Unknown"}</td>
                    <td className="py-2 text-center text-slate-600">{item.quantity}</td>
                    <td className="py-2 text-right text-slate-600">₹{item.expectedBuyPrice.toLocaleString()}</td>
                    <td className="py-2 text-right font-bold text-slate-800">₹{(item.quantity * item.expectedBuyPrice).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200">
                <td colSpan={3} className="pt-3 text-right font-bold text-slate-600 text-sm">Estimated Total</td>
                <td className="pt-3 text-right font-extrabold text-slate-800 text-sm">₹{estTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {po.notes && (
          <div className="px-6 pb-3">
            <p className="text-xs text-slate-500 italic">&ldquo;{po.notes}&rdquo;</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-[10px] text-slate-400">AutoVault ERP · For Supplier Acknowledgement Only</p>
          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-800 rounded-xl hover:bg-slate-700 cursor-pointer transition-colors"
            >
              <Printer size={13} /> Print
            </button>
            <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  SUPPLIER DETAILS PAGE
// ─────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview", icon: Truck },
  { id: "products", label: "Products Supplied", icon: Package },
  { id: "purchases", label: "Purchase History", icon: ShoppingBag },
  { id: "purchase_orders", label: "Purchase Orders", icon: FileText },
  { id: "payments", label: "Payment History", icon: Coins },
  { id: "activity", label: "Activity", icon: Activity },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SupplierDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const {
    state,
    showToast,
    addPurchaseBatch,
    addPurchaseReturn,
    recordSupplierPayment,
    getSupplierPaymentsBySupplier,
    getPurchaseReturnsByPurchase,
    getPurchaseReturnsBySupplier,
    updatePurchase,
    createPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    completePurchaseOrder,
    markPurchaseOrderSent,
    markPurchaseOrderCancelled,
    confirmPurchaseOrder,
  } = useStore();
  const { isOwner } = useRole();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showEditSupplier, setShowEditSupplier] = useState(false);
  const [payPurchase, setPayPurchase] = useState<Purchase | null>(null);
  const [editPurchase, setEditPurchase] = useState<Purchase | null>(null);
  const [returnPurchase, setReturnPurchase] = useState<Purchase | null>(null);

  const [showAddPO, setShowAddPO] = useState(false);
  const [editPO, setEditPO] = useState<PurchaseOrder | null>(null);
  const [printPO, setPrintPO] = useState<PurchaseOrder | null>(null);
  const [convertingPO, setConvertingPO] = useState<PurchaseOrder | null>(null);
  const [expandedTimelines, setExpandedTimelines] = useState<Record<string, boolean>>({});

  const handleConvertPOToInvoice = useCallback((po: PurchaseOrder) => {
    setConvertingPO(po);
    setShowAddPurchase(true);
  }, []);

  const supplier = useMemo(() => (state.suppliers || []).find((s) => s.id === id), [state.suppliers, id]);
  const purchases = useMemo(() => (state.purchases || []).filter((p) => p.supplierId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [state.purchases, id]);
  const products = state.products || [];

  // Products this supplier has supplied (via purchases)
  const suppliedProducts = useMemo(() => {
    const productIds = new Set(purchases.map((p) => p.productId));
    return products.filter((p) => productIds.has(p.id));
  }, [purchases, products]);

  // Summary KPIs for this supplier
  const kpis = useMemo(() => {
    const totalPurchases = purchases.length;
    const totalUnits = purchases.reduce((sum, p) => sum + p.quantity, 0);

    const lifetimePurchase = purchases.reduce((sum, p) => sum + (p.totalAmount ?? (p.buyPrice * p.quantity)), 0);

    const payments = getSupplierPaymentsBySupplier(id);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

    const returns = getPurchaseReturnsBySupplier(id);
    const returnsCount = returns.length;
    const totalRefunded = returns.reduce((s, r) => s + r.refundAmount, 0);
    const totalReturnedValue = returns.reduce((s, r) => s + r.totalAmount, 0);

    // Outstanding = Original Purchase Total - Total Returned Value - Total Paid
    const outstanding = purchases.reduce((sum, p) => {
      const totalForP = p.totalAmount ?? (p.buyPrice * p.quantity);
      const returnsForP = returns.filter((r) => r.purchaseId === p.id);
      const returnedValue = returnsForP.reduce((s, r) => s + r.totalAmount, 0);
      const paymentsForP = payments.filter((sp) => sp.purchaseId === p.id);
      const paid = paymentsForP.reduce((s, pay) => s + pay.amount, 0);
      return sum + Math.max(0, totalForP - returnedValue - paid);
    }, 0);

    const lastPurchaseVal = purchases[0] ? (purchases[0].totalAmount ?? (purchases[0].buyPrice * purchases[0].quantity)) : 0;
    const lastPurchaseDate = purchases[0]?.date ?? null;
    const lastPurchase = purchases[0] ? `₹${lastPurchaseVal.toLocaleString()} (${formatDate(lastPurchaseDate)})` : "—";

    const averagePurchase = totalPurchases > 0 ? lifetimePurchase / totalPurchases : 0;

    return {
      totalPurchases,
      totalUnits,
      lifetimePurchase,
      outstanding,
      lastPurchase,
      averagePurchase,
      lastPurchaseDate,
      returnsCount,
      totalPaid,
      totalRefunded,
      totalReturnedValue,
    };
  }, [purchases, id, getSupplierPaymentsBySupplier, getPurchaseReturnsBySupplier]);

  // Activity feed: all purchases as events
  const activityFeed = useMemo(() => {
    return purchases.map((p) => {
      const product = products.find((pr) => pr.id === p.productId);
      return {
        id: p.id,
        date: p.date,
        title: `Purchase: ${product?.name ?? "Unknown Product"}`,
        detail: `${p.quantity} units × ₹${p.buyPrice.toLocaleString()} = ₹${(p.buyPrice * p.quantity).toLocaleString()} • ${p.paymentStatus}`,
        invoice: p.invoiceNumber,
        type: "purchase" as const,
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [purchases, products]);

  if (!supplier) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Truck size={26} className="text-slate-300" />
        </div>
        <div>
          <p className="font-bold text-slate-700">Supplier not found</p>
          <p className="text-sm text-slate-400 mt-1">The supplier you are looking for does not exist.</p>
        </div>
        <Link href="/suppliers" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:text-navy-900">
          <ArrowLeft size={14} />
          Back to Suppliers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1.5">
          <Link href="/suppliers" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-navy-950 font-semibold transition-colors">
            <ArrowLeft size={13} />
            Back to Suppliers
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-navy-950 tracking-tight">{supplier.name}</h1>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${supplier.status === "Active" ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
              {supplier.status === "Active" ? <CheckCircle size={9} /> : <XCircle size={9} />}
              {supplier.status}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {supplier.contactPerson || "No contact person specified"}
            {supplier.phone ? ` • ${supplier.phone}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isOwner && (
            <button onClick={() => setShowEditSupplier(true)} className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all cursor-pointer">
              <Pencil size={14} />
              Edit
            </button>
          )}
          <button onClick={() => setShowAddPurchase(true)} className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-sm font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow cursor-pointer">
            <Plus size={16} />
            Record Invoice
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${isOwner ? "lg:grid-cols-4 xl:grid-cols-9" : "lg:grid-cols-2"} gap-4`}>
        {[
          { label: "Total Purchases", value: kpis.totalPurchases, icon: ShoppingBag, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Units Received", value: kpis.totalUnits, icon: Package, color: "text-purple-700", bg: "bg-purple-50" },
          ...(isOwner ? [
            { label: "Lifetime Purchases", value: `₹${kpis.lifetimePurchase.toLocaleString()}`, icon: DollarSign, color: "text-emerald-700", bg: "bg-emerald-50" },
            { label: "Outstanding Dues", value: `₹${kpis.outstanding.toLocaleString()}`, icon: Coins, color: "text-rose-600", bg: "bg-rose-50" },
            { label: "Total Paid", value: `₹${kpis.totalPaid.toLocaleString()}`, icon: Coins, color: "text-blue-700", bg: "bg-blue-50" },
            { label: "Returns", value: `${kpis.returnsCount} items`, icon: CornerDownLeft, color: "text-rose-700", bg: "bg-rose-50" },
            { label: "Refunded", value: `₹${kpis.totalRefunded.toLocaleString()}`, icon: DollarSign, color: "text-emerald-700", bg: "bg-emerald-50" },
            { label: "Last Purchase", value: kpis.lastPurchase, icon: Calendar, color: "text-amber-700", bg: "bg-amber-50" },
            { label: "Average Purchase", value: `₹${Math.round(kpis.averagePurchase).toLocaleString()}`, icon: CheckCircle, color: "text-blue-700", bg: "bg-blue-50" },
          ] : []),
        ].map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-sm transition-shadow">
            <div className="flex flex-col justify-between h-full gap-2">
              <div className="min-w-0">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">{card.label}</p>
                <p className="text-sm font-black text-slate-800 mt-1 truncate" title={String(card.value)}>{card.value}</p>
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 self-end ${card.bg} ${card.color}`}>
                <card.icon size={16} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.filter(tab => tab.id !== "payments" || isOwner).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? "border-navy-950 text-navy-950"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm min-h-[300px]">

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div className="grid md:grid-cols-2 gap-8">
            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2">Contact Information</h3>
              <div className="space-y-3">
                {[
                  { icon: Phone, label: "Phone", value: supplier.phone || "—" },
                  { icon: Phone, label: "WhatsApp", value: supplier.whatsApp || "—" },
                  { icon: Mail, label: "Email", value: supplier.email || "—" },
                  { icon: MapPin, label: "Address", value: supplier.address || "—" },
                  { icon: Hash, label: "GST Number", value: supplier.gst || "—" },
                ].map((row) => (
                  <div key={row.label} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                      <row.icon size={13} className="text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{row.label}</p>
                      <p className="text-sm text-slate-700 mt-0.5 break-words">{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2">Notes</h3>
              {supplier.notes ? (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{supplier.notes}</p>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
                  <MessageSquare size={20} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No notes added yet.</p>
                </div>
              )}

              {/* Meta */}
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2">Record Info</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-slate-400 font-semibold uppercase tracking-wider text-[9px]">Created</p>
                    <p className="text-slate-700 font-bold mt-0.5">{formatDate(supplier.createdAt)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-slate-400 font-semibold uppercase tracking-wider text-[9px]">Status</p>
                    <p className={`font-bold mt-0.5 ${supplier.status === "Active" ? "text-green-700" : "text-slate-500"}`}>{supplier.status}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PRODUCTS SUPPLIED TAB ── */}
        {activeTab === "products" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800">Products Supplied</h3>
              <span className="text-[10px] font-bold text-slate-500 uppercase border border-slate-200 rounded-md px-2 py-0.5">
                {suppliedProducts.length} Product{suppliedProducts.length !== 1 ? "s" : ""}
              </span>
            </div>

            {suppliedProducts.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center"><Package size={20} className="text-slate-300" /></div>
                <div>
                  <p className="text-sm font-bold text-slate-700">No Products Yet</p>
                  <p className="text-xs text-slate-400 mt-0.5 max-w-xs leading-relaxed">Products will appear here after the first purchase is recorded from this supplier.</p>
                </div>
                <button onClick={() => setShowAddPurchase(true)} className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer">
                  <Plus size={13} />
                  Add First Purchase
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Product</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 hidden md:table-cell">Category</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Current Cost</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Stock</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {suppliedProducts.map((product) => {
                      const productPurchases = purchases.filter((p) => p.productId === product.id);
                      const totalPurchasedQty = productPurchases.reduce((sum, p) => sum + p.quantity, 0);
                      return (
                        <tr key={product.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/inventory/${product.id}`} className="font-bold text-slate-800 hover:text-navy-800 hover:underline text-sm">{product.name}</Link>
                            <p className="text-xs text-slate-400 mt-0.5">{totalPurchasedQty} units purchased total</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{product.category || "—"}</td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">
                            {isOwner ? `₹${(product.currentCost || 0).toLocaleString()}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-bold ${product.stock <= product.lowStockThreshold ? "text-red-600" : "text-slate-700"}`}>
                              {product.stock}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Link href={`/inventory/${product.id}`} className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:bg-navy-50 hover:text-navy-700 transition-colors">
                              <ChevronRight size={14} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── PURCHASE HISTORY TAB ── */}
        {activeTab === "purchases" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800">Purchase History</h3>
              <button onClick={() => setShowAddPurchase(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer">
                <Plus size={13} />
                Add Purchase
              </button>
            </div>

            {purchases.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center"><ShoppingBag size={20} className="text-slate-300" /></div>
                <div>
                  <p className="text-sm font-bold text-slate-700">No Purchases Yet</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Record the first purchase from {supplier.name} to get started.</p>
                </div>
                <button onClick={() => setShowAddPurchase(true)} className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer">
                  <Plus size={13} />
                  Record First Purchase
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Invoice</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Date</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Product</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Qty</th>
                      {isOwner && <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Rate</th>}
                      {isOwner && <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</th>}
                      {isOwner && <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Paid</th>}
                      {isOwner && <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Due</th>}
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchases.map((pur) => {
                      const product = products.find((p) => p.id === pur.productId);
                      const total = pur.totalAmount ?? (pur.buyPrice * pur.quantity);
                      
                      // Derive paid, due and status dynamically from actual payments
                      const paymentsForP = getSupplierPaymentsBySupplier(id).filter(sp => sp.purchaseId === pur.id);
                      const paid = paymentsForP.reduce((s, pay) => s + pay.amount, 0);
                      const due = Math.max(0, total - paid);
                      const computedStatus = due <= 0 ? "Paid" : (paid > 0 ? "Partial" : "Credit");

                      const statusColors = computedStatus === "Paid"
                        ? "bg-green-100 text-green-800 border-green-200"
                        : computedStatus === "Partial"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : "bg-red-100 text-red-800 border-red-200";
                      return (
                        <tr key={pur.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-slate-400">{pur.invoiceNumber || "—"}</td>
                          <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(pur.date)}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                            {product ? (
                              <Link href={`/inventory/${product.id}`} className="hover:text-navy-700 hover:underline">{product.name}</Link>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-right font-bold text-slate-700">{pur.quantity}</td>
                          {isOwner && <td className="px-4 py-3 text-xs text-right text-slate-600">₹{pur.buyPrice.toLocaleString()}</td>}
                          {isOwner && <td className="px-4 py-3 text-xs text-right font-bold text-slate-800">₹{total.toLocaleString()}</td>}
                          {isOwner && <td className="px-4 py-3 text-xs text-right text-green-700 font-semibold">₹{paid.toLocaleString()}</td>}
                          {isOwner && (
                            <td className="px-4 py-3 text-xs text-right font-bold">
                              <span className={due > 0 ? "text-red-600" : "text-slate-400"}>
                                ₹{due.toLocaleString()}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors}`}>
                              {computedStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Link href={`/inventory/${product?.id ?? ""}`} title="View Product" className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:bg-navy-50 hover:text-navy-700 transition-colors">
                                <ChevronRight size={13} />
                              </Link>
                              {isOwner && (
                                <button
                                  onClick={() => setEditPurchase(pur)}
                                  title="Edit Purchase"
                                  className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                                >
                                  <Pencil size={13} />
                                </button>
                              )}
                              {isOwner && due > 0 && (
                                <button
                                  onClick={() => setPayPurchase(pur)}
                                  title="Record Payment"
                                  className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-amber-500 hover:bg-amber-50 hover:text-amber-700 transition-colors cursor-pointer"
                                >
                                  <Coins size={13} />
                                </button>
                              )}
                              {isOwner && (pur.quantity - (pur.returnedQuantity ?? 0)) > 0 && (
                                <button
                                  onClick={() => setReturnPurchase(pur)}
                                  title="Return Stock"
                                  className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                                >
                                  <CornerDownLeft size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {/* ── PAYMENTS TAB ── */}
        {activeTab === "payments" && isOwner && (() => {
          const supplierPayments = getSupplierPaymentsBySupplier(id);
          const purchasesWithTimeline = purchases.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-800">Ledger Timeline</h3>
                <span className="text-xs text-slate-400 font-medium">{purchasesWithTimeline.length} purchase ledger{purchasesWithTimeline.length !== 1 ? "s" : ""}</span>
              </div>
              {purchasesWithTimeline.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center"><Coins size={20} className="text-slate-300" /></div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">No Purchases or Payments recorded</p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Purchases and their payment timeline will appear here.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {purchasesWithTimeline.map((pur) => {
                    const product = products.find((p) => p.id === pur.productId);
                    const total = pur.totalAmount ?? (pur.buyPrice * pur.quantity);
                    
                    // Get all payments for this purchase, sorted chronologically (oldest first)
                    const paymentsForP = supplierPayments
                      .filter((sp) => sp.purchaseId === pur.id)
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                    const returnsForP = getPurchaseReturnsByPurchase(pur.id)
                      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                    type TimelineEvent = 
                      | { type: "payment"; id: string; date: string; amount: number; method: PaymentMethod; isUpfront?: boolean; paidBy: string; note?: string }
                      | { type: "return"; id: string; date: string; qty: number; buyPrice: number; totalAmount: number; refundAmount: number; reason: string; returnedBy: string };

                    const allEvents: TimelineEvent[] = [
                      ...paymentsForP.map((p): TimelineEvent => ({
                        type: "payment",
                        id: p.id,
                        date: p.date,
                        amount: p.amount,
                        method: p.method,
                        isUpfront: p.isUpfront,
                        paidBy: p.paidBy,
                        note: p.note,
                      })),
                      ...returnsForP.map((r): TimelineEvent => ({
                        type: "return",
                        id: r.id,
                        date: r.createdAt,
                        qty: r.quantity,
                        buyPrice: r.buyPrice,
                        totalAmount: r.totalAmount,
                        refundAmount: r.refundAmount,
                        reason: r.reason,
                        returnedBy: r.returnedBy,
                      })),
                    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    
                    // Compute timeline events with remaining balance step-by-step
                    let runningPaid = 0;
                    let runningReturned = 0;
                    const timelineEvents = allEvents.map((ev) => {
                      if (ev.type === "payment") {
                        runningPaid += ev.amount;
                      } else {
                        runningReturned += ev.totalAmount;
                      }
                      const runningBalance = Math.max(0, Math.round((total - runningReturned - runningPaid) * 100) / 100);
                      return {
                        ...ev,
                        remaining: runningBalance,
                      };
                    });

                    const finalOutstanding = Math.max(0, Math.round((total - runningReturned - runningPaid) * 100) / 100);
                    const isFullyPaid = finalOutstanding <= 0;

                    return (
                      <div key={pur.id} className="bg-slate-50/50 border border-slate-200 rounded-2xl p-5 space-y-4 hover:bg-slate-50/80 transition-all">
                        {/* Header */}
                        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                          <div>
                            <span className="text-[10px] font-mono font-bold text-slate-400 block tracking-wider uppercase">
                              Invoice: {pur.invoiceNumber || "No Invoice"}
                            </span>
                            <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                              {product?.name ?? "Unknown Product"}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-slate-500 block">Total Cost</span>
                            <span className="font-extrabold text-slate-800 text-sm block">₹{total.toLocaleString()}</span>
                          </div>
                        </div>

                        {pur.expectedBuyPrice !== undefined && (() => {
                          const varianceAmt = pur.buyPrice - pur.expectedBuyPrice;
                          const variancePct = pur.expectedBuyPrice > 0 ? (varianceAmt / pur.expectedBuyPrice) * 100 : 0;
                          return (
                            <div className="bg-white border border-slate-150 rounded-xl p-3 flex items-center justify-between text-xs">
                              <div>
                                <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Cost Variance Analysis</p>
                                <div className="flex items-center gap-3 mt-1.5 text-slate-500 font-semibold">
                                  <span>Expected Unit: <strong className="text-slate-700 font-bold">₹{pur.expectedBuyPrice.toLocaleString()}</strong></span>
                                  <span>Actual Unit: <strong className="text-slate-700 font-bold">₹{pur.buyPrice.toLocaleString()}</strong></span>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Deviation</p>
                                <span className={`inline-block font-black text-xs mt-1.5 ${varianceAmt > 0 ? "text-rose-600" : varianceAmt < 0 ? "text-emerald-600" : "text-slate-500"}`}>
                                  {varianceAmt > 0 ? "+" : ""}{varianceAmt.toLocaleString()} ({varianceAmt > 0 ? "+" : ""}{variancePct.toFixed(1)}%)
                                </span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Vertical Timeline */}
                        <div className="relative border-l-2 border-slate-200 ml-3 pl-5 space-y-4 py-1">
                          {/* Purchase Created Event */}
                          <div className="relative">
                            <span className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-slate-400 bg-white flex items-center justify-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            </span>
                            <div>
                              <p className="text-xs font-bold text-slate-700">Purchase Declared</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(pur.date)} · Initial Liability: ₹{total.toLocaleString()}</p>
                            </div>
                          </div>

                          {/* Events */}
                          {timelineEvents.map((ev, index) => {
                            if (ev.type === "payment") {
                              const methodColors: Record<PaymentMethod, string> = {
                                Cash: "bg-emerald-100 text-emerald-800 border-emerald-200",
                                UPI: "bg-blue-100 text-blue-800 border-blue-200",
                                Card: "bg-purple-100 text-purple-800 border-purple-200",
                                Credit: "bg-red-100 text-red-800 border-red-200",
                              };
                              return (
                                <div key={ev.id} className="relative">
                                  <span className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-emerald-500 bg-white flex items-center justify-center">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  </span>
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <p className="text-xs font-bold text-slate-700">
                                        {ev.isUpfront ? "Upfront Payment" : `Payment #${index}`}
                                      </p>
                                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${methodColors[ev.method] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                                        {ev.method}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-800 font-semibold">
                                      Paid ₹{ev.amount.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">· Balance remaining: ₹{ev.remaining.toLocaleString()}</span>
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      {formatDate(ev.date)} · Paid by {ev.paidBy} {ev.note ? `· "${ev.note}"` : ""}
                                    </p>
                                  </div>
                                </div>
                              );
                            } else {
                              return (
                                <div key={ev.id} className="relative">
                                  <span className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-rose-500 bg-white flex items-center justify-center">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                  </span>
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <p className="text-xs font-bold text-slate-700">
                                        Returned Qty: {ev.qty}
                                      </p>
                                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full border bg-rose-50 text-rose-700 border-rose-200">
                                        Return
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-800 font-semibold">
                                      {ev.refundAmount > 0 ? `Refunded ₹${ev.refundAmount.toLocaleString()}` : "Adjustment only"}
                                      <span className="text-[10px] text-slate-400 font-normal"> · Value: ₹{ev.totalAmount.toLocaleString()} · Balance remaining: ₹{ev.remaining.toLocaleString()}</span>
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      {formatDate(ev.date)} · Reason: "{ev.reason}" · Returned by {ev.returnedBy}
                                    </p>
                                  </div>
                                </div>
                              );
                            }
                          })}
                        </div>

                        {/* Footer Status summary */}
                        <div className="flex items-center justify-between bg-white border border-slate-150 rounded-xl p-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-medium">Status:</span>
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                              isFullyPaid
                                ? "bg-green-100 text-green-800 border-green-200"
                                : (runningPaid > 0 || runningReturned > 0)
                                ? "bg-amber-100 text-amber-800 border-amber-200"
                                : "bg-red-100 text-red-800 border-red-200"
                            }`}>
                              {isFullyPaid ? "Paid" : (runningPaid > 0 || runningReturned > 0) ? "Partial" : "Credit"}
                            </span>
                          </div>
                          <div className="font-semibold text-slate-700">
                            Outstanding: <span className={finalOutstanding > 0 ? "text-red-600 font-bold" : "text-slate-400"}>₹{finalOutstanding.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── PURCHASE ORDERS TAB ── */}
        {activeTab === "purchase_orders" && (() => {
          const pos = (state.purchaseOrders || [])
            .filter((po) => po.supplierId === id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-800">Purchase Orders</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Planning documents · No impact on stock or finance until converted</p>
                </div>
                {isOwner && (
                  <button
                    onClick={() => setShowAddPO(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-navy-950 bg-yellow-400 px-3 py-1.5 rounded-xl hover:bg-yellow-300 transition-colors cursor-pointer"
                  >
                    <Plus size={13} />
                    Create PO
                  </button>
                )}
              </div>

              {pos.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <FileText size={20} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">No Purchase Orders</p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Create purchase orders to plan inventory restocking before committing a purchase.
                    </p>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => setShowAddPO(true)}
                      className="inline-flex items-center gap-2 text-xs font-bold text-navy-950 bg-yellow-400 px-3 py-2 rounded-xl hover:bg-yellow-300 transition-colors cursor-pointer mt-2"
                    >
                      <Plus size={13} />
                      Create First PO
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pos.map((po) => {
                    const estTotal = po.items.reduce((s, item) => s + item.quantity * item.expectedBuyPrice, 0);
                    const totalUnits = po.items.reduce((s, item) => s + item.quantity, 0);
                    const receivedUnits = po.items.reduce((s, item) => s + item.receivedQuantity, 0);
                    const remainingUnits = Math.max(0, totalUnits - receivedUnits);
                    const isEditable = po.status === "Draft" || po.status === "Sent" || po.status === "Supplier Confirmed";
                    const isLimitedEdit = po.status === "Partially Delivered";
                    const isTerminal = po.status === "Completed" || po.status === "Cancelled";
                    const canConvert = !isTerminal && remainingUnits > 0;

                    return (
                      <div key={po.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
                        {/* Card header */}
                        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Purchase Order</span>
                            <span className="font-extrabold text-slate-800 text-sm block mt-0.5">{po.poNumber}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${PO_STATUS_COLOR[po.status]}`}>
                            {po.status}
                          </span>
                        </div>

                        {/* Card body */}
                        <div className="px-5 py-4 flex-1 space-y-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                            <div>
                              <p className="text-slate-400 font-medium">Created</p>
                              <p className="font-bold text-slate-700 mt-0.5">{formatDate(po.createdAt)}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-medium">Expected Delivery</p>
                              <p className="font-bold text-slate-700 mt-0.5">{formatDate(po.expectedDeliveryDate)}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-medium">Items / Units</p>
                              <p className="font-bold text-slate-700 mt-0.5">{po.items.length} products · {totalUnits} units</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-medium">Est. Value</p>
                              <p className="font-bold text-slate-700 mt-0.5">₹{estTotal.toLocaleString()}</p>
                            </div>
                          </div>

                          {po.status === "Partially Delivered" && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 font-semibold">
                              ⚡ {receivedUnits} of {totalUnits} units received · {remainingUnits} remaining
                            </div>
                          )}

                          {po.notes && (
                            <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs text-slate-500 italic">
                              &ldquo;{po.notes}&rdquo;
                            </div>
                          )}

                          {/* Chronological Activity Timeline (oldest -> newest stored, rendered oldest -> newest) */}
                          <div className="border-t border-slate-100 pt-3">
                            <button
                              onClick={() => setExpandedTimelines((prev) => ({ ...prev, [po.id]: !prev[po.id] }))}
                              className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 font-bold select-none cursor-pointer transition-colors"
                            >
                              <span className="flex items-center gap-1.5">
                                <Activity size={12} className="text-slate-400" />
                                PO Activity Log ({po.activityLog?.length || 0})
                              </span>
                              <span className="text-[10px]">{expandedTimelines[po.id] ? "▲ Hide" : "▼ Show"}</span>
                            </button>

                            {expandedTimelines[po.id] && (
                              <div className="mt-3 pl-3.5 border-l-2 border-slate-200 space-y-3 py-1 animate-in slide-in-from-top-1 duration-150">
                                {(po.activityLog || []).map((log) => {
                                  const icons = {
                                    Created: "●",
                                    Edited: "✏",
                                    Sent: "📨",
                                    Confirmed: "✔",
                                    Delivery: "📦",
                                    Completed: "✔",
                                    Cancelled: "❌",
                                  };
                                  const colors = {
                                    Created: "text-slate-500",
                                    Edited: "text-slate-600 font-medium",
                                    Sent: "text-blue-600 font-semibold",
                                    Confirmed: "text-indigo-600 font-bold",
                                    Delivery: "text-amber-600 font-medium",
                                    Completed: "text-emerald-600 font-black",
                                    Cancelled: "text-rose-600 font-bold",
                                  };
                                  return (
                                    <div key={log.id} className="text-[11px] leading-relaxed relative pl-1">
                                      <span className="absolute -left-[19.5px] top-0 font-bold bg-white text-xs px-0.5">
                                        {icons[log.type] || "•"}
                                      </span>
                                      <div>
                                        <p className={`${colors[log.type]} font-bold`}>
                                          {log.type} {log.type === "Confirmed" ? "by Supplier" : ""}
                                        </p>
                                        <p className="text-slate-600 text-[10px]">{log.notes}</p>
                                        <p className="text-[9px] text-slate-400 mt-0.5">{formatDate(log.date)}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card footer actions */}
                        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2 flex-wrap justify-end bg-slate-50/50">
                          {/* Print */}
                          <button
                            onClick={() => setPrintPO(po)}
                            title="Print PO Slip"
                            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                          >
                            <Printer size={14} />
                          </button>

                          {/* Duplicate */}
                          <button
                            onClick={() => {
                              const deliveryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
                              createPurchaseOrder({
                                supplierId: po.supplierId,
                                expectedDeliveryDate: deliveryDate,
                                notes: `Copy of ${po.poNumber}${po.notes ? " · " + po.notes : ""}`,
                                items: po.items.map((it) => ({ ...it, id: crypto.randomUUID(), receivedQuantity: 0 })),
                                status: "Draft",
                              });
                              showToast(`Duplicated ${po.poNumber} as Draft`, "success");
                            }}
                            title="Duplicate as Draft"
                            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                          >
                            <Copy size={14} />
                          </button>

                          {/* Edit — Draft, Sent, or Partially Received */}
                          {(isEditable || isLimitedEdit) && (
                            <button
                              onClick={() => setEditPO(po)}
                              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                            >
                              {isLimitedEdit ? "Edit Notes" : "Edit"}
                            </button>
                          )}

                          {/* Mark as Sent (Draft only) */}
                          {po.status === "Draft" && (
                            <button
                              onClick={() => {
                                markPurchaseOrderSent(po.id);
                                showToast(`${po.poNumber} marked as Sent`, "success");
                              }}
                              className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors"
                            >
                              Mark Sent
                            </button>
                          )}

                          {/* Confirm PO (Sent only) */}
                          {po.status === "Sent" && (
                            <button
                              onClick={() => {
                                confirmPurchaseOrder(po.id);
                                showToast(`${po.poNumber} confirmed by supplier`, "success");
                              }}
                              className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg cursor-pointer transition-colors"
                            >
                              Confirm
                            </button>
                          )}

                          {/* Cancel — non-terminal */}
                          {!isTerminal && (
                            <button
                              onClick={() => {
                                markPurchaseOrderCancelled(po.id);
                                showToast(`${po.poNumber} cancelled`, "info");
                              }}
                              title="Cancel PO"
                              className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg cursor-pointer transition-colors"
                            >
                              <Ban size={14} />
                            </button>
                          )}

                          {/* Delete — Draft only */}
                          {po.status === "Draft" && (
                            <button
                              onClick={() => {
                                deletePurchaseOrder(po.id);
                                showToast(`${po.poNumber} deleted`, "error");
                              }}
                              title="Delete PO"
                              className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg cursor-pointer transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}

                          {/* Convert → Receive Stock */}
                          {canConvert && (
                            <button
                              onClick={() => handleConvertPOToInvoice(po)}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer transition-all shadow-sm"
                            >
                              Receive Stock →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── ACTIVITY TAB ── */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            <h3 className="text-base font-black text-slate-800">Activity Feed</h3>
            {activityFeed.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center"><Activity size={20} className="text-slate-300" /></div>
                <div>
                  <p className="text-sm font-bold text-slate-700">No Activity Yet</p>
                  <p className="text-xs text-slate-400 mt-0.5">Activity will appear here after the first purchase is recorded.</p>
                </div>
              </div>
            ) : (
              <div className="relative border-l-2 border-slate-100 ml-4 pl-6 space-y-5">
                {activityFeed.map((event) => (
                  <div key={event.id} className="relative">
                    <span className="absolute -left-[31px] top-2 w-4 h-4 rounded-full border-2 border-emerald-500 bg-white flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    </span>
                    <div className="bg-slate-50/50 border border-slate-150 rounded-xl p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-800 leading-tight">{event.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{event.detail}</p>
                          {event.invoice && (
                            <p className="text-[10px] text-slate-400 font-mono mt-1">Invoice: {event.invoice}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">{formatDate(event.date)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <SupplierInvoiceModal
        isOpen={showAddPurchase}
        onClose={() => {
          setShowAddPurchase(false);
          setConvertingPO(null);
        }}
        supplier={supplier}
        products={products}
        purchaseCount={state.purchases?.length ?? 0}
        initialPO={convertingPO}
      />
      <EditSupplierModal
        isOpen={showEditSupplier}
        onClose={() => setShowEditSupplier(false)}
        supplier={supplier}
      />
      {payPurchase && supplier && (
        <RecordSupplierPaymentModal
          purchase={payPurchase}
          supplierId={supplier.id}
          products={products}
          onClose={() => setPayPurchase(null)}
          recordSupplierPayment={recordSupplierPayment}
        />
      )}
      {editPurchase && (
        <EditPurchaseModal
          isOpen={!!editPurchase}
          onClose={() => setEditPurchase(null)}
          purchase={editPurchase}
          products={products}
        />
      )}
      {returnPurchase && supplier && (
        <ReturnPurchaseModal
          purchase={returnPurchase}
          supplier={supplier}
          products={products}
          onClose={() => setReturnPurchase(null)}
          addPurchaseReturn={addPurchaseReturn}
        />
      )}

      {/* Purchase Order Modals (Sprint 4.6) */}
      {supplier && (
        <PurchaseOrderModal
          isOpen={showAddPO}
          onClose={() => setShowAddPO(false)}
          supplier={supplier}
          products={products}
          existingPO={null}
        />
      )}
      {editPO && supplier && (
        <PurchaseOrderModal
          isOpen={!!editPO}
          onClose={() => setEditPO(null)}
          supplier={supplier}
          products={products}
          existingPO={editPO}
        />
      )}
      {printPO && supplier && (
        <POPrintSlip
          po={printPO}
          supplier={supplier}
          products={products}
          onClose={() => setPrintPO(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  RECORD SUPPLIER PAYMENT MODAL
// ─────────────────────────────────────────────

interface RecordSupplierPaymentModalProps {
  purchase: Purchase;
  supplierId: string;
  products: Product[];
  onClose: () => void;
  recordSupplierPayment: (payment: Omit<SupplierPayment, "id">) => void;
}

function RecordSupplierPaymentModal({
  purchase,
  supplierId,
  products,
  onClose,
  recordSupplierPayment,
}: RecordSupplierPaymentModalProps) {
  const { showToast } = useStore();

  const total = purchase.totalAmount ?? (purchase.buyPrice * purchase.quantity);
  const paid = purchase.amountPaid ?? (purchase.paymentStatus === "Paid" ? total : 0);
  const due = purchase.dueAmount ?? (total - paid);
  const product = products.find((p) => p.id === purchase.productId);

  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [paidBy, setPaidBy] = useState<"Owner" | "Staff" | "">("Owner");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const parsedAmount = Math.round(parseFloat(amount) * 100) / 100 || 0;
  const remaining = Math.max(0, due - parsedAmount);
  const willClear = parsedAmount >= due;

  const INPUT = "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-400";

  const METHOD_COLORS: Record<PaymentMethod, string> = {
    Cash: "bg-emerald-50 text-emerald-700 border-emerald-200",
    UPI: "bg-blue-50 text-blue-700 border-blue-200",
    Card: "bg-purple-50 text-purple-700 border-purple-200",
    Credit: "bg-red-50 text-red-600 border-red-200",
  };

  function handleSubmit() {
    setError("");
    if (!paidBy) { setError("Please select who is making this payment."); return; }
    if (parsedAmount <= 0) { setError("Payment amount must be greater than ₹0."); return; }
    
    // Decimal precision validation
    if (amount.includes(".")) {
      const decimalPart = amount.split(".")[1];
      if (decimalPart && decimalPart.length > 2) {
        setError("Payment amount cannot have more than 2 decimal places.");
        return;
      }
    }

    if (parsedAmount > due) { setError(`Cannot exceed outstanding due of ₹${due.toLocaleString()}.`); return; }

    // Future date validation
    const todayStr = new Date().toISOString().split("T")[0];
    if (paymentDate > todayStr) {
      setError("Payment date cannot be in the future.");
      return;
    }

    recordSupplierPayment({
      supplierId,
      purchaseId: purchase.id,
      amount: parsedAmount,
      date: paymentDate + "T12:00:00.000Z",
      method,
      note: note.trim() || undefined,
      paidBy: paidBy as "Owner" | "Staff",
    });

    showToast(`₹${parsedAmount.toLocaleString()} payment recorded.`, "success");
    setSuccess(true);
    setTimeout(() => onClose(), 1500);
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div>
            <h2 className="font-bold text-slate-800 text-base">Record Payment</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {product?.name ?? "Unknown Product"}
              {purchase.invoiceNumber ? ` · ${purchase.invoiceNumber}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="p-10 flex flex-col items-center text-center">
            <CheckCircle size={48} className="text-green-500 mb-3" />
            <p className="font-bold text-slate-800">Payment Recorded!</p>
            <p className="text-xs text-slate-500 mt-1">Closing automatically…</p>
          </div>
        ) : (
          <>
            {/* Purchase Summary */}
            <div className="px-5 pt-5">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-3 text-center text-xs">
                <div>
                  <p className="text-slate-400">Total</p>
                  <p className="font-bold text-slate-800 text-sm mt-1">₹{total.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-400">Paid</p>
                  <p className="font-bold text-green-700 text-sm mt-1">₹{paid.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-400">Due</p>
                  <p className="font-bold text-red-600 text-sm mt-1">₹{due.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={due}
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError(""); }}
                  className={INPUT}
                  autoFocus
                />
                {parsedAmount > 0 && (
                  <p className={`text-xs mt-1.5 font-semibold ${willClear ? "text-green-600" : "text-amber-600"}`}>
                    {willClear
                      ? "✓ Clears this purchase fully → Paid"
                      : `₹${remaining.toLocaleString()} still outstanding after payment`}
                  </p>
                )}
              </div>

              {/* Method */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {(["Cash", "UPI", "Card", "Credit"] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        method === m
                          ? "bg-slate-900 border-slate-900 text-white"
                          : `${METHOD_COLORS[m]} hover:opacity-80`
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Paid By */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Paid By <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  {(["Owner", "Staff"] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setPaidBy(role)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        paidBy === role
                          ? "bg-slate-900 border-slate-900 text-white"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Payment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => { setPaymentDate(e.target.value); setError(""); }}
                  className={INPUT}
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Paid via NEFT"
                  className={INPUT}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSubmit} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-navy-950 rounded-xl hover:bg-navy-800 transition-colors cursor-pointer">
                Record Payment
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  EDIT PURCHASE MODAL
// ─────────────────────────────────────────────

interface EditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: Purchase;
  products: Product[];
}

function EditPurchaseModal({ isOpen, onClose, purchase, products }: EditPurchaseModalProps) {
  const { updatePurchase, showToast } = useStore();
  const product = products.find((p) => p.id === purchase.productId);

  const [invoiceNumber, setInvoiceNumber] = useState(purchase.invoiceNumber || "");
  const [date, setDate] = useState(purchase.date || "");
  const [notes, setNotes] = useState(purchase.notes || "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setInvoiceNumber(purchase.invoiceNumber || "");
      setDate(purchase.date || "");
      setNotes(purchase.notes || "");
      setError("");
    }
  }, [isOpen, purchase]);

  if (!isOpen) return null;

  function handleSave() {
    if (!date) {
      setError("Please select a date.");
      return;
    }

    try {
      updatePurchase(purchase.id, invoiceNumber.trim(), date, notes.trim());
      showToast("Purchase updated successfully.", "success");
      onClose();
    } catch (err) {
      setError("Failed to update purchase.");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center">
              <Pencil size={16} className="text-navy-700" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-base leading-tight">Edit Purchase</h2>
              <p className="text-[10px] text-slate-400 leading-tight">{product?.name ?? "Unknown Product"}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Immutable Fields Information Alert */}
          <div className="bg-slate-50 border border-slate-150 rounded-xl px-4 py-3 text-xs text-slate-500 leading-relaxed flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5 text-navy-600" />
            <span>
              Product, Quantity, Buy Price, and Supplier are immutable. Correcting these values requires a reversal and recording a new purchase.
            </span>
          </div>

          {/* Invoice Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Invoice Number</label>
            <input type="text" placeholder="e.g. INV-2025-001" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={INPUT} />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Date <span className="text-red-500">*</span>
            </label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Notes</label>
            <textarea placeholder="Any notes about this purchase…" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT + " resize-none"} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl sticky bottom-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button onClick={handleSave} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-navy-950 rounded-xl hover:bg-navy-800 transition-colors cursor-pointer">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  RETURN PURCHASE MODAL  (Sprint 4.5)
// ─────────────────────────────────────────────

interface ReturnPurchaseModalProps {
  purchase: Purchase;
  supplier: Supplier;
  products: Product[];
  onClose: () => void;
  addPurchaseReturn: (
    record: Omit<PurchaseReturn, "id" | "createdAt" | "originalPurchaseQuantity" | "originalPurchaseValue">,
    refundMethod: PaymentMethod | "Adjustment"
  ) => void;
}

function ReturnPurchaseModal({
  purchase,
  supplier,
  products,
  onClose,
  addPurchaseReturn,
}: ReturnPurchaseModalProps) {
  const { showToast } = useStore();
  const product = products.find((p) => p.id === purchase.productId);

  const availableQty = purchase.quantity - (purchase.returnedQuantity ?? 0);
  const maxRefund = roundMoney(availableQty * purchase.buyPrice);

  const [qty, setQty] = useState("1");
  const [refundInput, setRefundInput] = useState(String(roundMoney(1 * purchase.buyPrice)));
  const [refundMethod, setRefundMethod] = useState<PaymentMethod | "Adjustment">("Cash");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const parsedQty = Math.floor(parseFloat(qty) || 0);
  const parsedRefund = Math.round(parseFloat(refundInput) * 100) / 100 || 0;
  const returnTotal = roundMoney(parsedQty * purchase.buyPrice);

  // Auto-recalculate refund when qty changes
  function handleQtyChange(val: string) {
    setQty(val);
    const q = Math.floor(parseFloat(val) || 0);
    if (q > 0) setRefundInput(String(roundMoney(q * purchase.buyPrice)));
    setError("");
  }

  function validate(): string | null {
    if (!reason.trim()) return "Please enter a reason for the return.";
    if (parsedQty <= 0 || !Number.isInteger(parsedQty)) return "Return quantity must be a whole positive number.";
    if (parsedQty > availableQty) return `Cannot return more than ${availableQty} unit(s) available on this purchase.`;
    if (parsedRefund < 0) return "Refund amount cannot be negative.";
    if (parsedRefund > returnTotal) return `Refund cannot exceed return value of ₹${returnTotal.toLocaleString()}.`;
    if (refundMethod !== "Adjustment" && parsedRefund === 0) return "Enter the refund amount, or choose 'Adjustment' if no money is returned.";
    return null;
  }

  function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");

    addPurchaseReturn(
      {
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        productId: purchase.productId,
        quantity: parsedQty,
        buyPrice: purchase.buyPrice,
        totalAmount: returnTotal,
        refundAmount: refundMethod === "Adjustment" ? 0 : parsedRefund,
        reason: reason.trim(),
        returnedBy: "Owner",
      },
      refundMethod
    );

    showToast(
      `Return recorded: ${parsedQty} unit(s) of ${product?.name ?? "product"}`,
      "success"
    );
    setSuccess(true);
    setTimeout(() => onClose(), 2000);
  }

  const REFUND_METHODS: { value: PaymentMethod | "Adjustment"; label: string; color: string }[] = [
    { value: "Cash",       label: "Cash",       color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { value: "UPI",        label: "UPI",        color: "bg-blue-50 text-blue-700 border-blue-200" },
    { value: "Card",       label: "Bank/Card",  color: "bg-purple-50 text-purple-700 border-purple-200" },
    { value: "Adjustment", label: "Adjustment", color: "bg-slate-100 text-slate-600 border-slate-200" },
  ];

  const INPUT_CLS =
    "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-500 transition-all placeholder:text-slate-400";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
              <CornerDownLeft size={16} className="text-rose-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-base leading-tight">Return to Supplier</h2>
              <p className="text-[10px] text-slate-400 leading-tight">{supplier.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {success ? (
          <div className="p-12 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle size={36} className="text-green-500" />
            </div>
            <p className="font-bold text-slate-800">Return Recorded!</p>
            <div className="text-xs text-slate-500 space-y-1">
              <p>{parsedQty} unit(s) removed from stock</p>
              {parsedRefund > 0 && <p>₹{parsedRefund.toLocaleString()} {refundMethod} refund logged</p>}
              <p className="text-slate-400 mt-2">Closing…</p>
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 p-5 space-y-4">

            {/* Purchase Summary Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Original Purchase</p>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{product?.name ?? "Unknown Product"}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Invoice: {purchase.invoiceNumber || "—"} · {purchase.quantity} units @ ₹{purchase.buyPrice.toLocaleString()}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400">Returnable</p>
                  <p className="text-sm font-extrabold text-slate-800">{availableQty} unit{availableQty !== 1 ? "s" : ""}</p>
                </div>
              </div>
              {/* Stock info */}
              <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-center text-xs">
                <div>
                  <p className="text-slate-400">Current Stock</p>
                  <p className="font-bold text-slate-800 mt-0.5">{product?.stock ?? "?"} units</p>
                </div>
                <div>
                  <p className="text-slate-400">After Return</p>
                  <p className={`font-bold mt-0.5 ${parsedQty > 0 && product ? (product.stock - parsedQty < 0 ? "text-red-600" : "text-slate-800") : "text-slate-800"}`}>
                    {product ? Math.max(0, product.stock - parsedQty) : "?"} units
                  </p>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Return Qty */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Quantity to Return <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                max={availableQty}
                value={qty}
                onChange={(e) => handleQtyChange(e.target.value)}
                className={INPUT_CLS}
                autoFocus
              />
              <p className="text-[10px] text-slate-400 mt-1 pl-1">
                Max returnable: {availableQty} unit{availableQty !== 1 ? "s" : ""}
                {parsedQty > 0 && (
                  <span className="text-slate-600 font-semibold"> · Return value: ₹{returnTotal.toLocaleString()}</span>
                )}
              </p>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Damaged goods, Wrong part supplied, Excess stock"
                value={reason}
                onChange={(e) => { setReason(e.target.value); setError(""); }}
                className={INPUT_CLS + " resize-none"}
              />
            </div>

            {/* Refund Method */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Refund Method</label>
              <div className="grid grid-cols-4 gap-2">
                {REFUND_METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => { setRefundMethod(m.value); setError(""); }}
                    className={`py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      refundMethod === m.value
                        ? "bg-slate-900 border-slate-900 text-white"
                        : `${m.color} hover:opacity-80`
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Refund Amount — hidden for Adjustment */}
            {refundMethod !== "Adjustment" && (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Refund Amount (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={returnTotal}
                  value={refundInput}
                  onChange={(e) => { setRefundInput(e.target.value); setError(""); }}
                  className={INPUT_CLS}
                />
                {parsedRefund > 0 && parsedRefund < returnTotal && (
                  <p className="text-[10px] text-amber-600 font-semibold mt-1 pl-1">
                    Partial refund — ₹{roundMoney(returnTotal - parsedRefund).toLocaleString()} written off
                  </p>
                )}
                {parsedRefund === returnTotal && returnTotal > 0 && (
                  <p className="text-[10px] text-green-600 font-semibold mt-1 pl-1">
                    Full refund of ₹{returnTotal.toLocaleString()}
                  </p>
                )}
              </div>
            )}
            {refundMethod === "Adjustment" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 flex gap-2">
                <Info size={14} className="shrink-0 mt-0.5 text-amber-600" />
                <span>No refund will be recorded. The return will reduce supplier outstanding and reduce stock without creating a finance entry.</span>
              </div>
            )}

          </div>
        )}

        {/* Footer */}
        {!success && (
          <div className="flex gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-500 transition-colors cursor-pointer"
            >
              Record Return →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small inline helper — mirrors the one in store but available in this module */
function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}