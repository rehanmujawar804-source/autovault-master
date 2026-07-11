"use client";

import { use, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
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
} from "lucide-react";
import type { Supplier, Purchase, Product } from "@/types";

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

// ─────────────────────────────────────────────
//  ADD PURCHASE MODAL
// ─────────────────────────────────────────────

interface AddPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier;
  products: Product[];
}

function AddPurchaseModal({ isOpen, onClose, supplier, products }: AddPurchaseModalProps) {
  const { addPurchase, showToast } = useStore();

  const blankForm = {
    productId: "",
    quantity: "",
    buyPrice: "",
    invoiceNumber: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    paymentStatus: "Paid" as "Paid" | "Credit",
  };

  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (isOpen && !initialized) {
    setInitialized(true);
    setForm(blankForm);
    setFormError("");
  }

  if (!isOpen) return null;

  function setField<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setFormError("");
  }

  function handleClose() {
    setInitialized(false);
    onClose();
  }

  function handleSave() {
    if (!form.productId) { setFormError("Please select a product."); return; }
    const qty = parseInt(form.quantity, 10);
    const price = parseFloat(form.buyPrice);
    if (!qty || qty <= 0) { setFormError("Quantity must be a positive number."); return; }
    if (isNaN(price) || price < 0) { setFormError("Buy price must be a valid non-negative number."); return; }
    if (!form.date) { setFormError("Please select a date."); return; }

    try {
      addPurchase({
        supplierId: supplier.id,
        productId: form.productId,
        quantity: qty,
        buyPrice: price,
        invoiceNumber: form.invoiceNumber.trim(),
        date: form.date,
        notes: form.notes.trim(),
        paymentStatus: form.paymentStatus,
      });
      showToast("Purchase recorded successfully.", "success");
      setInitialized(false);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to record purchase.";
      setFormError(msg);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <ShoppingBag size={16} className="text-emerald-700" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-base leading-tight">Add Purchase</h2>
              <p className="text-[10px] text-slate-400 leading-tight">{supplier.name}</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {formError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Product */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Product <span className="text-red-500">*</span>
            </label>
            <select value={form.productId} onChange={(e) => setField("productId", e.target.value)} className={INPUT}>
              <option value="">— Select a product —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Quantity + Buy Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input type="number" min="1" placeholder="0" value={form.quantity} onChange={(e) => setField("quantity", e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Buy Price (₹) <span className="text-red-500">*</span>
              </label>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.buyPrice} onChange={(e) => setField("buyPrice", e.target.value)} className={INPUT} />
            </div>
          </div>

          {/* Invoice Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Invoice Number</label>
            <input type="text" placeholder="e.g. INV-2025-001" value={form.invoiceNumber} onChange={(e) => setField("invoiceNumber", e.target.value)} className={INPUT} />
          </div>

          {/* Date + Payment Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Date <span className="text-red-500">*</span>
              </label>
              <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Payment Status</label>
              <select value={form.paymentStatus} onChange={(e) => setField("paymentStatus", e.target.value as "Paid" | "Credit")} className={INPUT}>
                <option value="Paid">Paid</option>
                <option value="Credit">Credit</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Notes</label>
            <textarea placeholder="Any notes about this purchase…" rows={2} value={form.notes} onChange={(e) => setField("notes", e.target.value)} className={INPUT + " resize-none"} />
          </div>

          {/* Summary preview */}
          {form.productId && form.quantity && form.buyPrice && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-emerald-800 mb-1">Purchase Summary</p>
              <div className="flex justify-between items-center text-xs text-emerald-700">
                <span>{parseInt(form.quantity) || 0} units × ₹{parseFloat(form.buyPrice).toLocaleString() || "0"}</span>
                <span className="font-bold text-base text-emerald-900">
                  = ₹{((parseInt(form.quantity) || 0) * (parseFloat(form.buyPrice) || 0)).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl sticky bottom-0">
          <button onClick={handleClose} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button onClick={handleSave} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-500 transition-colors cursor-pointer">
            Record Purchase
          </button>
        </div>
      </div>
    </div>
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
//  SUPPLIER DETAILS PAGE
// ─────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview", icon: Truck },
  { id: "products", label: "Products Supplied", icon: Package },
  { id: "purchases", label: "Purchase History", icon: ShoppingBag },
  { id: "activity", label: "Activity", icon: Activity },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SupplierDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state } = useStore();
  const { isOwner } = useRole();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showEditSupplier, setShowEditSupplier] = useState(false);

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
    const totalSpend = purchases.reduce((sum, p) => sum + p.buyPrice * p.quantity, 0);
    const totalUnits = purchases.reduce((sum, p) => sum + p.quantity, 0);
    const lastPurchase = purchases[0]?.date ?? null;
    return { totalPurchases, totalSpend, totalUnits, lastPurchase };
  }, [purchases]);

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
            Add Purchase
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Purchases", value: kpis.totalPurchases, icon: ShoppingBag, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total Spend", value: `₹${kpis.totalSpend.toLocaleString()}`, icon: DollarSign, color: "text-emerald-700", bg: "bg-emerald-50" },
          { label: "Units Received", value: kpis.totalUnits, icon: Package, color: "text-purple-700", bg: "bg-purple-50" },
          { label: "Last Purchase", value: formatDate(kpis.lastPurchase), icon: Calendar, color: "text-amber-700", bg: "bg-amber-50" },
        ].map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-slate-500 text-xs">{card.label}</p>
                <p className="text-lg font-bold text-slate-800 mt-1 truncate">{card.value}</p>
              </div>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${card.bg} ${card.color}`}>
                <card.icon size={18} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
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
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Date</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Product</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Qty</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Unit Cost</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 hidden md:table-cell">Invoice</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchases.map((pur) => {
                      const product = products.find((p) => p.id === pur.productId);
                      return (
                        <tr key={pur.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 text-xs text-slate-600">{formatDate(pur.date)}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                            {product ? (
                              <Link href={`/inventory/${product.id}`} className="hover:text-navy-700 hover:underline">{product.name}</Link>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-right font-bold text-slate-700">{pur.quantity}</td>
                          <td className="px-4 py-3 text-xs text-right text-slate-600">
                            {isOwner ? `₹${pur.buyPrice.toLocaleString()}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-right font-bold text-slate-800">
                            {isOwner ? `₹${(pur.buyPrice * pur.quantity).toLocaleString()}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-400 hidden md:table-cell">{pur.invoiceNumber || "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pur.paymentStatus === "Paid" ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                              {pur.paymentStatus}
                            </span>
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
      <AddPurchaseModal
        isOpen={showAddPurchase}
        onClose={() => setShowAddPurchase(false)}
        supplier={supplier}
        products={products}
      />
      <EditSupplierModal
        isOpen={showEditSupplier}
        onClose={() => setShowEditSupplier(false)}
        supplier={supplier}
      />
    </div>
  );
}