"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import Link from "next/link";
import {
  Truck,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Package,
  ShoppingBag,
  X,
  AlertCircle,
  ChevronRight,
  Pencil,
  Coins,
} from "lucide-react";
import type { Supplier } from "@/types";

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
//  SUPPLIER FORM MODAL
// ─────────────────────────────────────────────

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSupplier: Supplier | null;
}

function SupplierFormModal({ isOpen, onClose, editingSupplier }: SupplierFormModalProps) {
  const { addSupplier, updateSupplier, showToast } = useStore();

  const blankForm = {
    name: "",
    contactPerson: "",
    phone: "",
    whatsApp: "",
    email: "",
    address: "",
    gst: "",
    notes: "",
    status: "Active" as "Active" | "Inactive",
  };

  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState("");
  const [initialized, setInitialized] = useState<string | null>(null);

  // Initialize form when the modal becomes visible
  if (isOpen) {
    const key = editingSupplier ? editingSupplier.id : "__new__";
    if (initialized !== key) {
      setInitialized(key);
      if (editingSupplier) {
        setForm({
          name: editingSupplier.name,
          contactPerson: editingSupplier.contactPerson,
          phone: editingSupplier.phone,
          whatsApp: editingSupplier.whatsApp,
          email: editingSupplier.email,
          address: editingSupplier.address,
          gst: editingSupplier.gst || "",
          notes: editingSupplier.notes,
          status: editingSupplier.status,
        });
      } else {
        setForm(blankForm);
      }
      setFormError("");
    }
  }

  if (!isOpen) return null;

  function setField<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setFormError("");
  }

  function handleClose() {
    setInitialized(null);
    onClose();
  }

  function handleSave() {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError("Supplier name is required.");
      return;
    }
    try {
      if (editingSupplier) {
        updateSupplier({ ...editingSupplier, ...form, name: trimmedName });
        showToast(`"${trimmedName}" updated successfully.`, "success");
      } else {
        addSupplier({ ...form, name: trimmedName });
        showToast(`"${trimmedName}" added successfully.`, "success");
      }
      setInitialized(null);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save supplier.";
      setFormError(msg);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center">
              <Truck size={16} className="text-navy-700" />
            </div>
            <h2 className="font-bold text-slate-800 text-base">
              {editingSupplier ? "Edit Supplier" : "Add New Supplier"}
            </h2>
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

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Supplier Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Minda Industries Ltd."
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              className={INPUT}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Contact Person
            </label>
            <input
              type="text"
              placeholder="e.g. Rajesh Kumar"
              value={form.contactPerson}
              onChange={(e) => setField("contactPerson", e.target.value)}
              className={INPUT}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Phone</label>
              <input type="tel" placeholder="98765 43210" value={form.phone} onChange={(e) => setField("phone", e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">WhatsApp</label>
              <input type="tel" placeholder="98765 43210" value={form.whatsApp} onChange={(e) => setField("whatsApp", e.target.value)} className={INPUT} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Email</label>
            <input type="email" placeholder="supplier@example.com" value={form.email} onChange={(e) => setField("email", e.target.value)} className={INPUT} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Address</label>
            <textarea placeholder="Full business address" rows={2} value={form.address} onChange={(e) => setField("address", e.target.value)} className={INPUT + " resize-none"} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                GST Number <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input type="text" placeholder="29ABCDE1234F1Z5" value={form.gst} onChange={(e) => setField("gst", e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Status</label>
              <select value={form.status} onChange={(e) => setField("status", e.target.value as "Active" | "Inactive")} className={INPUT}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Notes</label>
            <textarea placeholder="Any notes about this supplier…" rows={3} value={form.notes} onChange={(e) => setField("notes", e.target.value)} className={INPUT + " resize-none"} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl sticky bottom-0">
          <button onClick={handleClose} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button onClick={handleSave} className="flex-1 px-4 py-2.5 text-sm font-bold text-navy-950 bg-yellow-400 rounded-xl hover:bg-yellow-300 transition-colors cursor-pointer">
            {editingSupplier ? "Save Changes" : "Add Supplier"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  SUPPLIERS PAGE
// ─────────────────────────────────────────────

export default function SuppliersPage() {
  const { state, getTotalSupplierOutstanding, getSupplierOutstandingBalance } = useStore();
  const { isOwner, loading } = useRole();
  const router = useRouter();

  // ── Owner-only route guard ──────────────────────────────────────────
  useEffect(() => {
    if (!loading && !isOwner) router.push("/dashboard");
  }, [loading, isOwner, router]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("All");
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Block render until guard has resolved
  if (loading || !isOwner) return null;

  const suppliers = state.suppliers || [];
  const purchases = state.purchases || [];

  const kpis = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const totalSuppliers = suppliers.length;
    const activeSuppliers = suppliers.filter((s) => s.status === "Active").length;
    const linkedProductIds = new Set(purchases.map((p) => p.productId));
    const productsLinked = linkedProductIds.size;
    const purchasesThisMonth = purchases.filter((p) => { try { return new Date(p.date) >= startOfMonth; } catch { return false; } }).length;
    return { totalSuppliers, activeSuppliers, productsLinked, purchasesThisMonth };
  }, [suppliers, purchases]);

  const supplierStats = useMemo(() => {
    const map: Record<string, { productCount: number; lastPurchaseDate: string | null; outstandingBalance: number }> = {};
    for (const s of suppliers) {
      const sp = purchases.filter((p) => p.supplierId === s.id);
      const productIds = new Set(sp.map((p) => p.productId));
      const sorted = [...sp].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const outstanding = getSupplierOutstandingBalance(s.id);
      map[s.id] = {
        productCount: productIds.size,
        lastPurchaseDate: sorted[0]?.date ?? null,
        outstandingBalance: outstanding,
      };
    }
    return map;
  }, [suppliers, purchases, state.purchaseReturns, state.supplierPayments, getSupplierOutstandingBalance]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers
      .filter((s) => {
        if (statusFilter !== "All" && s.status !== statusFilter) return false;
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.contactPerson.toLowerCase().includes(q) ||
          s.phone.includes(q) ||
          s.whatsApp.includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.address.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [suppliers, search, statusFilter]);

  function openAdd() { setEditingSupplier(null); setShowModal(true); }
  function openEdit(supplier: Supplier, e: React.MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    setEditingSupplier(supplier); setShowModal(true);
  }

  const totalOutstanding = isOwner ? getTotalSupplierOutstanding() : 0;

  const kpiConfig = [
    { label: "Total Suppliers", value: kpis.totalSuppliers, Icon: Truck, accent: "border-l-[3px] border-l-navy-700 rounded-l-none", iconBg: "bg-navy-50 text-navy-700" },
    { label: "Active Suppliers", value: kpis.activeSuppliers, Icon: CheckCircle, accent: "border-l-[3px] border-l-green-600 rounded-l-none", iconBg: "bg-green-50 text-green-700" },
    { label: "Products Linked", value: kpis.productsLinked, Icon: Package, accent: "border-l-[3px] border-l-blue-500 rounded-l-none", iconBg: "bg-blue-50 text-blue-600" },
    { label: "Purchases This Month", value: kpis.purchasesThisMonth, Icon: ShoppingBag, accent: "border-l-[3px] border-l-amber-500 rounded-l-none", iconBg: "bg-amber-50 text-amber-700" },
    ...(isOwner ? [{ label: "Outstanding Dues", value: `₹${totalOutstanding.toLocaleString()}`, Icon: Coins, accent: "border-l-[3px] border-l-red-500 rounded-l-none", iconBg: "bg-red-50 text-red-700" }] : []),
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <div className="w-8 h-8 rounded-xl bg-navy-950 flex items-center justify-center shadow-sm">
              <Truck size={16} className="text-yellow-400" />
            </div>
            <h1 className="text-2xl font-black text-navy-950 tracking-tight">Suppliers</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 pl-10">
            Manage suppliers, track purchases, and monitor stock inflow.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-sm font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow cursor-pointer shrink-0"
        >
          <Plus size={16} />
          Add Supplier
        </button>
      </div>

      {/* KPI Cards */}
      <div className={`grid grid-cols-2 ${isOwner ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-4`}>
        {kpiConfig.map((card) => (
          <div key={card.label} className={`bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow ${card.accent}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-500 text-sm">{card.label}</p>
                <p className="text-2xl font-semibold text-navy-900 mt-1">{card.value}</p>
              </div>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg}`}>
                <card.Icon size={18} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, contact, phone, email, address…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-400"
          />
        </div>
        <div className="flex gap-2 shrink-0">
          {(["All", "Active", "Inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${statusFilter === f ? "bg-navy-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
              <Truck size={28} className="text-slate-300" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-700">
                {suppliers.length === 0 ? "No Suppliers Yet" : "No Suppliers Match Your Search"}
              </p>
              <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                {suppliers.length === 0 ? "Add your first supplier to start tracking purchases and stock inflow." : "Try adjusting your search or status filter."}
              </p>
            </div>
            {suppliers.length === 0 && (
              <button onClick={openAdd} className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-sm font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer">
                <Plus size={15} />
                Add First Supplier
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="px-5 py-3 text-left"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Supplier</span></th>
                  <th className="px-5 py-3 text-center hidden md:table-cell"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Products</span></th>
                  <th className="px-5 py-3 text-left hidden lg:table-cell"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Last Purchase</span></th>
                  {isOwner && <th className="px-5 py-3 text-right"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Outstanding</span></th>}
                  <th className="px-5 py-3 text-center"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</span></th>
                  <th className="px-5 py-3 text-center"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((supplier) => {
                  const stats = supplierStats[supplier.id] ?? { productCount: 0, lastPurchaseDate: null, outstandingBalance: 0 };
                  return (
                    <tr key={supplier.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-5 py-4">
                        <Link href={`/suppliers/${supplier.id}`} className="block">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-navy-100 to-navy-50 border border-navy-200/50 flex items-center justify-center shrink-0">
                              <Truck size={15} className="text-navy-600" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm leading-tight group-hover:text-navy-800 transition-colors">{supplier.name}</p>
                              {supplier.contactPerson && <p className="text-xs text-slate-400 mt-0.5">{supplier.contactPerson}</p>}
                              {supplier.phone && <p className="text-xs text-slate-400">{supplier.phone}</p>}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-center hidden md:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                          <Package size={12} className="text-slate-500" />
                          {stats.productCount}
                        </span>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className="text-xs text-slate-500">
                          {stats.lastPurchaseDate ? formatDate(stats.lastPurchaseDate) : <span className="text-slate-300 italic">No purchases yet</span>}
                        </span>
                      </td>
                      {isOwner && (
                        <td className="px-5 py-4 text-right">
                          <span className={`text-xs font-bold ${stats.outstandingBalance > 0 ? "text-red-600" : "text-slate-500"}`}>
                            ₹{stats.outstandingBalance.toLocaleString()}
                          </span>
                        </td>
                      )}
                      <td className="px-5 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${supplier.status === "Active" ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                          {supplier.status === "Active" ? <CheckCircle size={9} /> : <XCircle size={9} />}
                          {supplier.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={(e) => openEdit(supplier, e)} title="Edit Supplier" className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer">
                            <Pencil size={13} />
                          </button>
                          <Link href={`/suppliers/${supplier.id}`} title="View Details" className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-navy-50 hover:text-navy-700 transition-colors">
                            <ChevronRight size={15} />
                          </Link>
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

      <SupplierFormModal isOpen={showModal} onClose={() => setShowModal(false)} editingSupplier={editingSupplier} />
    </div>
  );
}

