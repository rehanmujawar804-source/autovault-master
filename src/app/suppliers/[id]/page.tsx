"use client";

import { use, useMemo, useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import type { Purchase, SupplierPayment, PaymentMethod } from "@/types";
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
    paymentStatus: "Paid" as "Paid" | "Partial" | "Credit",
    amountPaid: "",
    paymentMethod: "Cash" as PaymentMethod,
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

    const total = qty * price;
    let paid = 0;
    
    if (form.paymentStatus === "Paid") {
      paid = total;
    } else if (form.paymentStatus === "Credit") {
      paid = 0;
    } else if (form.paymentStatus === "Partial") {
      const parsedPaid = parseFloat(form.amountPaid);
      if (isNaN(parsedPaid) || parsedPaid <= 0) {
        setFormError("Please enter a valid amount paid.");
        return;
      }
      if (parsedPaid >= total) {
        setFormError("Amount paid cannot be equal to or greater than the total purchase amount. Select 'Paid' instead.");
        return;
      }
      paid = parsedPaid;
    }

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
        amountPaid: paid,
        paymentMethod: form.paymentStatus !== "Credit" ? form.paymentMethod : undefined,
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
              <select value={form.paymentStatus} onChange={(e) => setField("paymentStatus", e.target.value as "Paid" | "Partial" | "Credit")} className={INPUT}>
                <option value="Paid">Paid</option>
                <option value="Partial">Partial</option>
                <option value="Credit">Credit</option>
              </select>
            </div>
          </div>

          {/* Conditional Payment Method dropdown for Paid / Partial */}
          {form.paymentStatus !== "Credit" && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Payment Method</label>
              <select value={form.paymentMethod} onChange={(e) => setField("paymentMethod", e.target.value as PaymentMethod)} className={INPUT}>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
              </select>
            </div>
          )}

          {/* Conditional Amount Paid input for Partial */}
          {form.paymentStatus === "Partial" && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Amount Paid (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="How much was paid upfront?"
                value={form.amountPaid}
                onChange={(e) => setField("amountPaid", e.target.value)}
                className={INPUT}
              />
              {form.quantity && form.buyPrice && form.amountPaid && (() => {
                const total = (parseInt(form.quantity) || 0) * (parseFloat(form.buyPrice) || 0);
                const paid = parseFloat(form.amountPaid) || 0;
                const due = Math.max(0, total - paid);
                return due > 0 ? (
                  <p className="text-xs text-amber-600 font-semibold mt-1">
                    ₹{due.toLocaleString()} remaining (Credit)
                  </p>
                ) : null;
              })()}
            </div>
          )}

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
              {form.paymentStatus === "Partial" && form.amountPaid && (
                <div className="mt-2 pt-2 border-t border-emerald-200 flex justify-between text-xs text-emerald-700">
                  <span>Due after payment:</span>
                  <span className="font-bold text-amber-700">
                    ₹{Math.max(0, ((parseInt(form.quantity) || 0) * (parseFloat(form.buyPrice) || 0)) - (parseFloat(form.amountPaid) || 0)).toLocaleString()}
                  </span>
                </div>
              )}
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
  { id: "payments", label: "Payment History", icon: Coins },
  { id: "activity", label: "Activity", icon: Activity },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SupplierDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state, recordSupplierPayment, getSupplierPaymentsBySupplier, updatePurchase } = useStore();
  const { isOwner } = useRole();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showEditSupplier, setShowEditSupplier] = useState(false);
  const [payPurchase, setPayPurchase] = useState<Purchase | null>(null);
  const [editPurchase, setEditPurchase] = useState<Purchase | null>(null);

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

    const outstanding = purchases.reduce((sum, p) => {
      const paymentsForP = getSupplierPaymentsBySupplier(id).filter(sp => sp.purchaseId === p.id);
      const paidForP = paymentsForP.reduce((s, pay) => s + pay.amount, 0);
      const totalForP = p.totalAmount ?? (p.buyPrice * p.quantity);
      return sum + Math.max(0, totalForP - paidForP);
    }, 0);

    const lastPurchaseVal = purchases[0] ? (purchases[0].totalAmount ?? (purchases[0].buyPrice * purchases[0].quantity)) : 0;
    const lastPurchaseDate = purchases[0]?.date ?? null;
    const lastPurchase = purchases[0] ? `₹${lastPurchaseVal.toLocaleString()} (${formatDate(lastPurchaseDate)})` : "—";

    const averagePurchase = totalPurchases > 0 ? lifetimePurchase / totalPurchases : 0;

    return { totalPurchases, totalUnits, lifetimePurchase, outstanding, lastPurchase, averagePurchase, lastPurchaseDate };
  }, [purchases, id, getSupplierPaymentsBySupplier]);

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
      <div className={`grid grid-cols-2 md:grid-cols-3 ${isOwner ? "lg:grid-cols-6" : "lg:grid-cols-2"} gap-4`}>
        {[
          { label: "Total Purchases", value: kpis.totalPurchases, icon: ShoppingBag, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Units Received", value: kpis.totalUnits, icon: Package, color: "text-purple-700", bg: "bg-purple-50" },
          ...(isOwner ? [
            { label: "Lifetime Purchases", value: `₹${kpis.lifetimePurchase.toLocaleString()}`, icon: DollarSign, color: "text-emerald-700", bg: "bg-emerald-50" },
            { label: "Outstanding Dues", value: `₹${kpis.outstanding.toLocaleString()}`, icon: Coins, color: "text-rose-600", bg: "bg-rose-50" },
            { label: "Last Purchase", value: kpis.lastPurchase, icon: Calendar, color: "text-amber-700", bg: "bg-amber-50" },
            { label: "Average Purchase", value: `₹${Math.round(kpis.averagePurchase).toLocaleString()}`, icon: CheckCircle, color: "text-blue-700", bg: "bg-blue-50" },
          ] : []),
        ].map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-slate-500 text-xs">{card.label}</p>
                <p className="text-sm font-bold text-slate-800 mt-1 truncate" title={String(card.value)}>{card.value}</p>
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
                    
                    // Compute timeline events with remaining balance step-by-step
                    let runningBalance = total;
                    const timelineEvents = paymentsForP.map((sp) => {
                      runningBalance = Math.max(0, Math.round((runningBalance - sp.amount) * 100) / 100);
                      return {
                        id: sp.id,
                        date: sp.date,
                        amount: sp.amount,
                        method: sp.method,
                        remaining: runningBalance,
                        isUpfront: sp.isUpfront,
                        paidBy: sp.paidBy,
                        note: sp.note,
                      };
                    });

                    const isFullyPaid = runningBalance <= 0;

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

                          {/* Payments Events */}
                          {timelineEvents.map((ev, index) => {
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
                          })}
                        </div>

                        {/* Footer Status summary */}
                        <div className="flex items-center justify-between bg-white border border-slate-150 rounded-xl p-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-medium">Status:</span>
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                              isFullyPaid
                                ? "bg-green-100 text-green-800 border-green-200"
                                : runningBalance < total
                                ? "bg-amber-100 text-amber-800 border-amber-200"
                                : "bg-red-100 text-red-800 border-red-200"
                            }`}>
                              {isFullyPaid ? "Paid" : runningBalance < total ? "Partial" : "Credit"}
                            </span>
                          </div>
                          <div className="font-semibold text-slate-700">
                            Outstanding: <span className={runningBalance > 0 ? "text-red-600 font-bold" : "text-slate-400"}>₹{runningBalance.toLocaleString()}</span>
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