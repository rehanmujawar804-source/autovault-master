"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import Link from "next/link";
import { formatPurchaseDate, sortPurchasesDescending } from "@/lib/dateUtils";
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
  Wallet,
  Phone,
  Mail,
  MessageSquare,
  Copy,
  MoreVertical,
  Calendar,
  ArrowUpDown,
  SlidersHorizontal,
  Sparkles,
  Clock,
  CreditCard,
  FileText,
  Check,
  ExternalLink,
  FilePlus,
  AlertTriangle,
} from "lucide-react";
import type { Supplier, PaymentMethod } from "@/types";

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

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 30) return `${diffDays}d ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  } catch {
    return "";
  }
}

const INPUT =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-400";

import {
  validateAndNormalizeSupplierForm,
  validateSupplierName,
  validateContactPerson,
  validatePhone,
  validateWhatsApp,
  validateEmail,
  validateAddress,
  validateGST,
  validateNotes,
} from "@/lib/validationUtils";

// ─────────────────────────────────────────────
//  SUPPLIER FORM MODAL
// ─────────────────────────────────────────────

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSupplier: Supplier | null;
}

function SupplierFormModal({ isOpen, onClose, editingSupplier }: SupplierFormModalProps) {
  const { state, addSupplier, updateSupplier, showToast } = useStore();

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [initialized, setInitialized] = useState<string | null>(null);

  const suppliers = state.suppliers || [];

  // Initialize form when the modal becomes visible
  if (isOpen) {
    const key = editingSupplier ? editingSupplier.id : "__new__";
    if (initialized !== key) {
      setInitialized(key);
      if (editingSupplier) {
        setForm({
          name: editingSupplier.name,
          contactPerson: editingSupplier.contactPerson || "",
          phone: editingSupplier.phone || "",
          whatsApp: editingSupplier.whatsApp || "",
          email: editingSupplier.email || "",
          address: editingSupplier.address || "",
          gst: editingSupplier.gst || "",
          notes: editingSupplier.notes || "",
          status: editingSupplier.status,
        });
      } else {
        setForm(blankForm);
      }
      setFieldErrors({});
      setFormError("");
    }
  }

  if (!isOpen) return null;

  function setField<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    if ((key === "phone" || key === "email") && fieldErrors.contactMethod) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.contactMethod;
        return next;
      });
    }
    if (formError) setFormError("");
  }

  function handleBlur(fieldName: keyof typeof form) {
    let err: string | null = null;
    const currentId = editingSupplier?.id;

    if (fieldName === "name") {
      err = validateSupplierName(form.name, suppliers, currentId);
    } else if (fieldName === "contactPerson") {
      err = validateContactPerson(form.contactPerson);
    } else if (fieldName === "phone") {
      err = validatePhone(form.phone, suppliers, currentId);
    } else if (fieldName === "whatsApp") {
      err = validateWhatsApp(form.whatsApp, suppliers, currentId);
    } else if (fieldName === "email") {
      err = validateEmail(form.email, suppliers, currentId);
    } else if (fieldName === "address") {
      err = validateAddress(form.address);
    } else if (fieldName === "gst") {
      err = validateGST(form.gst, suppliers, currentId);
    } else if (fieldName === "notes") {
      err = validateNotes(form.notes);
    }

    if (fieldName === "phone" || fieldName === "email") {
      if (form.phone.trim() || form.email.trim()) {
        if (fieldErrors.contactMethod) {
          setFieldErrors((prev) => {
            const next = { ...prev };
            delete next.contactMethod;
            return next;
          });
        }
      }
    }

    if (err) {
      setFieldErrors((prev) => ({ ...prev, [fieldName]: err! }));
    } else if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  }

  function handleClose() {
    setInitialized(null);
    setFieldErrors({});
    setFormError("");
    onClose();
  }

  function handleSave() {
    const currentId = editingSupplier?.id;
    const validationResult = validateAndNormalizeSupplierForm(form, suppliers, currentId);

    if (!validationResult.isValid) {
      setFieldErrors(validationResult.errors);
      setFormError("Please fix the validation errors before saving.");
      return;
    }

    try {
      const { normalizedData } = validationResult;
      if (editingSupplier) {
        updateSupplier({
          ...editingSupplier,
          ...normalizedData,
        });
        showToast(`"${normalizedData.name}" updated successfully.`, "success");
      } else {
        addSupplier(normalizedData);
        showToast(`"${normalizedData.name}" added successfully.`, "success");
      }
      handleClose();
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
              onBlur={() => handleBlur("name")}
              maxLength={100}
              autoComplete="organization"
              className={`${INPUT} ${fieldErrors.name ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
              autoFocus
            />
            {fieldErrors.name && (
              <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                <AlertCircle size={12} className="shrink-0" />
                {fieldErrors.name}
              </p>
            )}
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
              onBlur={() => handleBlur("contactPerson")}
              maxLength={80}
              autoComplete="name"
              className={`${INPUT} ${fieldErrors.contactPerson ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
            />
            {fieldErrors.contactPerson && (
              <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                <AlertCircle size={12} className="shrink-0" />
                {fieldErrors.contactPerson}
              </p>
            )}
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Contact Details
              </span>
              <span className="text-[11px] text-slate-400">
                Phone or Email required
              </span>
            </div>

            {fieldErrors.contactMethod && (
              <div className="flex items-start gap-1.5 text-xs text-red-600 font-medium bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{fieldErrors.contactMethod}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Phone</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="98765 43210"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  onBlur={() => handleBlur("phone")}
                  maxLength={20}
                  className={`${INPUT} ${fieldErrors.phone || fieldErrors.contactMethod ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                />
                {fieldErrors.phone && (
                  <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle size={12} className="shrink-0" />
                    {fieldErrors.phone}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">WhatsApp</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="98765 43210"
                  value={form.whatsApp}
                  onChange={(e) => setField("whatsApp", e.target.value)}
                  onBlur={() => handleBlur("whatsApp")}
                  maxLength={20}
                  className={`${INPUT} ${fieldErrors.whatsApp ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                />
                {fieldErrors.whatsApp && (
                  <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle size={12} className="shrink-0" />
                    {fieldErrors.whatsApp}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Email</label>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="supplier@example.com"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                onBlur={() => handleBlur("email")}
                maxLength={150}
                className={`${INPUT} ${fieldErrors.email || fieldErrors.contactMethod ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
              />
              {fieldErrors.email && (
                <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle size={12} className="shrink-0" />
                  {fieldErrors.email}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Address <span className="text-red-500">*</span>
            </label>
            <textarea
              placeholder="Full business address"
              rows={2}
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              onBlur={() => handleBlur("address")}
              maxLength={300}
              autoComplete="street-address"
              className={`${INPUT} resize-none ${fieldErrors.address ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
            />
            {fieldErrors.address && (
              <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                <AlertCircle size={12} className="shrink-0" />
                {fieldErrors.address}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                GST Number <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                placeholder="29ABCDE1234F1Z5"
                value={form.gst}
                onChange={(e) => setField("gst", e.target.value.toUpperCase())}
                onBlur={() => handleBlur("gst")}
                maxLength={18}
                className={`${INPUT} uppercase ${fieldErrors.gst ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
              />
              {fieldErrors.gst && (
                <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle size={12} className="shrink-0" />
                  {fieldErrors.gst}
                </p>
              )}
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
            <textarea
              placeholder="Any notes about this supplier…"
              rows={3}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              onBlur={() => handleBlur("notes")}
              maxLength={500}
              className={`${INPUT} resize-none ${fieldErrors.notes ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-red-500/20" : ""}`}
            />
            {fieldErrors.notes && (
              <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                <AlertCircle size={12} className="shrink-0" />
                {fieldErrors.notes}
              </p>
            )}
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
//  FLOATING ROW QUICK-ACTION PORTAL MENU
// ─────────────────────────────────────────────

interface FloatingRowMenuProps {
  supplier: Supplier;
  stats: {
    outstandingBalance: number;
    purchaseCount: number;
    lastPurchaseDate: string | null;
  };
  triggerRect: DOMRect;
  isOwner: boolean;
  onClose: () => void;
  onEdit: (s: Supplier, e: React.MouseEvent) => void;
  onRecordPayment: (s: Supplier, balance: number) => void;
  onCopy: (text: string, label: string, id: string) => void;
}

function FloatingRowMenu({
  supplier,
  stats,
  triggerRect,
  isOwner,
  onClose,
  onEdit,
  onRecordPayment,
  onCopy,
}: FloatingRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number; isUpward: boolean }>({
    top: 0,
    right: 0,
    isUpward: false,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function computeCoords() {
      const menuHeight = 250; // Expected approximate height
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      const isUpward = spaceBelow < menuHeight && spaceAbove > menuHeight;

      const top = isUpward
        ? Math.max(10, triggerRect.top - menuHeight - 6)
        : Math.min(window.innerHeight - menuHeight - 10, triggerRect.bottom + 6);

      const right = Math.max(10, window.innerWidth - triggerRect.right);

      setPosition({ top, right, isUpward });
    }

    computeCoords();

    function handleScrollOrResize() {
      onClose();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [triggerRect, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      onClick={onClose}
      data-testid="floating-menu-backdrop"
      aria-hidden="true"
    >
      <div
        ref={menuRef}
        role="menu"
        aria-orientation="vertical"
        aria-label={`Actions for ${supplier.name}`}
        data-testid="floating-supplier-menu"
        data-direction={position.isUpward ? "upward" : "downward"}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: `${position.top}px`,
          right: `${position.right}px`,
        }}
        className={`w-56 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-[10000] text-left divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100 ${
          position.isUpward ? "origin-bottom-right" : "origin-top-right"
        }`}
      >
        {/* Navigation & Primary Profile */}
        <div className="py-1">
          <Link
            href={`/suppliers/${supplier.id}`}
            onClick={onClose}
            role="menuitem"
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-navy-950 transition-colors"
          >
            <ExternalLink size={13} className="text-slate-400" />
            View Profile
          </Link>
          <button
            onClick={(e) => {
              onClose();
              onEdit(supplier, e);
            }}
            role="menuitem"
            className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-navy-950 transition-colors cursor-pointer text-left"
          >
            <Pencil size={13} className="text-slate-400" />
            Edit Supplier
          </button>
          {isOwner && (
            <button
              onClick={() => {
                onClose();
                if (stats.outstandingBalance > 0) {
                  onRecordPayment(supplier, stats.outstandingBalance);
                }
              }}
              role="menuitem"
              disabled={stats.outstandingBalance <= 0}
              className={`w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold transition-colors text-left ${
                stats.outstandingBalance > 0
                  ? "text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                  : "text-slate-400 hover:bg-slate-50 cursor-not-allowed opacity-60"
              }`}
            >
              <Coins size={13} className={stats.outstandingBalance > 0 ? "text-emerald-600" : "text-slate-400"} />
              Record Payment {stats.outstandingBalance > 0 ? `(₹${stats.outstandingBalance.toLocaleString()})` : "(Settled)"}
            </button>
          )}
        </div>

        {/* Workflow Links */}
        <div className="py-1">
          <Link
            href={`/suppliers/${supplier.id}?tab=purchases&action=new-invoice`}
            onClick={onClose}
            role="menuitem"
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-navy-950 transition-colors"
          >
            <FilePlus size={13} className="text-slate-400" />
            New Purchase Invoice
          </Link>
          <Link
            href={`/suppliers/${supplier.id}?tab=purchase_orders&action=new-po`}
            onClick={onClose}
            role="menuitem"
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-navy-950 transition-colors"
          >
            <FileText size={13} className="text-slate-400" />
            Create Purchase Order
          </Link>
        </div>

        {/* Copy Helpers */}
        <div className="py-1">
          <button
            onClick={() => {
              onClose();
              onCopy(supplier.id, "Supplier ID", supplier.id);
            }}
            role="menuitem"
            className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-navy-950 transition-colors cursor-pointer text-left"
          >
            <Copy size={13} className="text-slate-400" />
            Copy Supplier ID
          </button>
          {supplier.phone && (
            <button
              onClick={() => {
                onClose();
                onCopy(supplier.phone!, "Phone number", supplier.id);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-navy-950 transition-colors cursor-pointer text-left"
            >
              <Phone size={13} className="text-slate-400" />
              Copy Phone ({supplier.phone})
            </button>
          )}
          {supplier.email && (
            <button
              onClick={() => {
                onClose();
                onCopy(supplier.email!, "Email address", supplier.id);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-navy-950 transition-colors cursor-pointer text-left"
            >
              <Mail size={13} className="text-slate-400" />
              Copy Email
            </button>
          )}
          {supplier.gst && (
            <button
              onClick={() => {
                onClose();
                onCopy(supplier.gst!, "GSTIN", supplier.id);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-navy-950 transition-colors cursor-pointer text-left"
            >
              <CreditCard size={13} className="text-slate-400" />
              Copy GSTIN ({supplier.gst})
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────
//  SUPPLIERS PAGE (Sprint 1 Upgrades)
// ─────────────────────────────────────────────

type KpiFilter = null | "all" | "active" | "has_outstanding" | "payment_attention" | "purchased_this_month";

type SortOption =
  | "newest"
  | "oldest"
  | "name_asc"
  | "name_desc"
  | "outstanding_desc"
  | "outstanding_asc"
  | "recent_purchase"
  | "most_active";

export default function SuppliersPage() {
  const { state, getTotalSupplierOutstanding, getSupplierOutstandingBalance, recordSupplierPaymentFIFO, showToast } = useStore();
  const { isOwner, loading, requireOwner } = useRole();
  const router = useRouter();

  // ── Owner-only route guard ──────────────────────────────────────────
  useEffect(() => {
    if (!loading) requireOwner();
  }, [loading, requireOwner]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("All");
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [activeMenu, setActiveMenu] = useState<{
    supplier: Supplier;
    stats: {
      outstandingBalance: number;
      purchaseCount: number;
      lastPurchaseDate: string | null;
    };
    triggerRect: DOMRect;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<{ id: string; field: string } | null>(null);

  // ── Lump-Sum FIFO Supplier Payment Modal State ─────────────────────────────
  const [lumpSumSupplier, setLumpSumSupplier] = useState<Supplier | null>(null);
  const [lumpSumAmountInput, setLumpSumAmountInput] = useState("");
  const [lumpSumMethod, setLumpSumMethod] = useState<PaymentMethod>("Cash");
  const [lumpSumNote, setLumpSumNote] = useState("");
  const [lumpSumDerivedPayable, setLumpSumDerivedPayable] = useState(0);

  function openLumpSumModal(supplier: Supplier, currentPayable: number) {
    setLumpSumSupplier(supplier);
    setLumpSumDerivedPayable(currentPayable);
    setLumpSumAmountInput("");
    setLumpSumMethod("Cash");
    setLumpSumNote("");
  }

  function closeLumpSumModal() {
    setLumpSumSupplier(null);
    setLumpSumAmountInput("");
    setLumpSumNote("");
  }

  function handleLumpSumSubmit() {
    if (!lumpSumSupplier) return;
    const numAmount = Math.max(0, Number(lumpSumAmountInput) || 0);
    if (numAmount <= 0) return;

    const getEffectiveDue = (pur: any) => {
      const total = pur.totalAmount ?? (pur.buyPrice * pur.quantity);
      const returns = (state.purchaseReturns || []).filter((r) => r.purchaseId === pur.id);
      const returnedValue = returns.reduce((s, r) => s + r.totalAmount, 0);
      const payments = (state.supplierPayments || []).filter((sp) => sp.purchaseId === pur.id);
      const paid = payments.reduce((s, pay) => s + pay.amount, 0);
      return Math.max(0, total - returnedValue - paid);
    };

    const openPurchases = (state.purchases || [])
      .filter((pur) => pur.supplierId === lumpSumSupplier.id && getEffectiveDue(pur) > 0)
      .sort((a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime());

    let rem = numAmount;
    let totalAllocated = 0;
    let affectedCount = 0;

    for (const pur of openPurchases) {
      if (rem <= 0) break;
      const due = getEffectiveDue(pur);
      const alloc = Math.min(rem, due);
      if (alloc > 0) {
        totalAllocated += alloc;
        affectedCount++;
        rem -= alloc;
      }
    }

    const unallocated = Math.max(0, numAmount - totalAllocated);

    recordSupplierPaymentFIFO({
      supplierId: lumpSumSupplier.id,
      totalAmount: numAmount,
      method: lumpSumMethod,
      note: lumpSumNote.trim() || undefined,
      paidBy: isOwner ? "Owner" : "Staff",
    });

    if (unallocated > 0) {
      showToast(
        `₹${numAmount.toLocaleString()} paid. ₹${totalAllocated.toLocaleString()} applied across ${affectedCount} purchase(s) (₹${unallocated.toLocaleString()} unallocated excess).`,
        "info"
      );
    } else {
      showToast(
        `₹${totalAllocated.toLocaleString()} paid to supplier "${lumpSumSupplier.name}" and applied across ${affectedCount} purchase(s) using FIFO.`,
        "success"
      );
    }

    closeLumpSumModal();
  }

  const lumpSumPreview = useMemo(() => {
    if (!lumpSumSupplier) return { allocations: [], totalAllocated: 0, unallocated: 0 };
    const numAmount = Math.max(0, Number(lumpSumAmountInput) || 0);

    const getEffectiveDue = (pur: any) => {
      const total = pur.totalAmount ?? (pur.buyPrice * pur.quantity);
      const returns = (state.purchaseReturns || []).filter((r) => r.purchaseId === pur.id);
      const returnedValue = returns.reduce((s, r) => s + r.totalAmount, 0);
      const payments = (state.supplierPayments || []).filter((sp) => sp.purchaseId === pur.id);
      const paid = payments.reduce((s, pay) => s + pay.amount, 0);
      return Math.max(0, total - returnedValue - paid);
    };

    const openPurchases = (state.purchases || [])
      .filter((pur) => pur.supplierId === lumpSumSupplier.id && getEffectiveDue(pur) > 0)
      .sort((a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime());

    let rem = numAmount;
    let totalAllocated = 0;

    const allocations = openPurchases.map((pur) => {
      const due = getEffectiveDue(pur);
      const alloc = rem > 0 ? Math.min(rem, due) : 0;
      if (alloc > 0) {
        totalAllocated += alloc;
        rem -= alloc;
      }
      return {
        purchase: pur,
        effectiveDue: due,
        allocated: alloc,
        remainingDue: Math.max(0, due - alloc),
      };
    });

    const unallocated = Math.max(0, numAmount - totalAllocated);
    return { allocations, totalAllocated, unallocated };
  }, [lumpSumSupplier, lumpSumAmountInput, state.purchases, state.purchaseReturns, state.supplierPayments]);

  const suppliers = state.suppliers || [];
  const purchases = state.purchases || [];
  const supplierPayments = state.supplierPayments || [];

  function copyText(text: string, label: string, supplierId?: string) {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      showToast(`${label} copied`, "success");
      if (supplierId) {
        setCopiedField({ id: supplierId, field: label });
        setTimeout(() => setCopiedField(null), 1500);
      }
    } catch {
      showToast(`Failed to copy ${label}`, "error");
    }
  }

  // ── Derived Supplier Statistics & Activity (Memoized) ──────────────────────
  const supplierStats = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const map: Record<
      string,
      {
        productCount: number;
        purchaseCount: number;
        purchaseVolume: number;
        lastPurchaseDate: string | null;
        lastPaymentDate: string | null;
        outstandingBalance: number;
        oldestUnpaidDays: number;
        hasPaymentAttention: boolean;
        hasPurchasedThisMonth: boolean;
        isRecentlyAdded: boolean;
      }
    > = {};

    const getEffectiveDue = (pur: any) => {
      const total = pur.totalAmount ?? (pur.buyPrice * pur.quantity);
      const returns = (state.purchaseReturns || []).filter((r) => r.purchaseId === pur.id);
      const returnedValue = returns.reduce((s, r) => s + r.totalAmount, 0);
      const payments = (state.supplierPayments || []).filter((sp) => sp.purchaseId === pur.id);
      const paid = payments.reduce((s, pay) => s + pay.amount, 0);
      return Math.max(0, total - returnedValue - paid);
    };

    for (const s of suppliers) {
      const sp = purchases.filter((p) => p.supplierId === s.id);
      const pay = supplierPayments.filter((p) => p.supplierId === s.id);
      const productIds = new Set(sp.map((p) => p.productId));
      const sortedPurchases = sortPurchasesDescending(sp);
      const sortedPayments = [...pay].sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
      const outstanding = getSupplierOutstandingBalance(s.id);

      // Unpaid purchases & aging
      const openPurchases = sp.filter((p) => getEffectiveDue(p) > 0);
      let oldestUnpaidDays = 0;
      let hasPaymentAttention = false;

      if (openPurchases.length > 0) {
        const oldestUnpaid = [...openPurchases].sort(
          (a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime()
        )[0];
        const oldestTime = new Date(oldestUnpaid.createdAt || oldestUnpaid.date).getTime();
        oldestUnpaidDays = Math.max(0, Math.floor((now.getTime() - oldestTime) / (1000 * 60 * 60 * 24)));
        hasPaymentAttention = oldestUnpaidDays >= 30;
      }

      const hasPurchasedThisMonth = sp.some((p) => {
        try {
          return new Date(p.date || p.createdAt) >= startOfMonth;
        } catch {
          return false;
        }
      });

      const isRecentlyAdded = (now.getTime() - new Date(s.createdAt).getTime()) <= 7 * 24 * 60 * 60 * 1000;
      const purchaseVolume = sp.reduce((acc, p) => acc + (p.totalAmount ?? (p.buyPrice * p.quantity)), 0);

      map[s.id] = {
        productCount: productIds.size,
        purchaseCount: sp.length,
        purchaseVolume,
        lastPurchaseDate: sortedPurchases[0] ? formatPurchaseDate(sortedPurchases[0]) : null,
        lastPaymentDate: sortedPayments[0] ? sortedPayments[0].date || sortedPayments[0].createdAt || null : null,
        outstandingBalance: outstanding,
        oldestUnpaidDays,
        hasPaymentAttention,
        hasPurchasedThisMonth,
        isRecentlyAdded,
      };
    }
    return map;
  }, [suppliers, purchases, supplierPayments, state.purchaseReturns, getSupplierOutstandingBalance]);

  // ── KPI Metrics ────────────────────────────────────────────────────────────
  const kpiData = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const totalCount = suppliers.length;
    const activeCount = suppliers.filter((s) => s.status === "Active").length;
    const activePercent = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0;

    let totalOutstandingVal = 0;
    let suppliersWithDuesCount = 0;
    let attentionSupplierCount = 0;
    let attentionTotalAmount = 0;

    for (const s of suppliers) {
      const stats = supplierStats[s.id];
      if (stats) {
        if (stats.outstandingBalance > 0) {
          totalOutstandingVal += stats.outstandingBalance;
          suppliersWithDuesCount++;
        }
        if (stats.hasPaymentAttention) {
          attentionSupplierCount++;
          attentionTotalAmount += stats.outstandingBalance;
        }
      }
    }

    const currentMonthPurchases = purchases.filter((p) => {
      try {
        return new Date(p.date || p.createdAt) >= startOfMonth;
      } catch {
        return false;
      }
    });
    const currentMonthPurchaseAmount = currentMonthPurchases.reduce(
      (sum, p) => sum + (p.totalAmount ?? (p.buyPrice * p.quantity)),
      0
    );

    return {
      totalCount,
      activeCount,
      activePercent,
      totalOutstandingVal,
      suppliersWithDuesCount,
      attentionSupplierCount,
      attentionTotalAmount,
      currentMonthPurchaseAmount,
      currentMonthPurchaseCount: currentMonthPurchases.length,
    };
  }, [suppliers, purchases, supplierStats]);

  // ── Filtered & Sorted Suppliers Pipeline ───────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return suppliers
      .filter((s) => {
        // Status filter tab
        if (statusFilter !== "All" && s.status !== statusFilter) return false;

        // Interactive KPI Filter
        const stats = supplierStats[s.id];
        if (kpiFilter === "active" && s.status !== "Active") return false;
        if (kpiFilter === "has_outstanding" && (!stats || stats.outstandingBalance <= 0)) return false;
        if (kpiFilter === "payment_attention" && (!stats || !stats.hasPaymentAttention)) return false;
        if (kpiFilter === "purchased_this_month" && (!stats || !stats.hasPurchasedThisMonth)) return false;

        // Search query
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.contactPerson.toLowerCase().includes(q) ||
          s.phone.includes(q) ||
          s.whatsApp.includes(q) ||
          s.email.toLowerCase().includes(q) ||
          (s.gst && s.gst.toLowerCase().includes(q)) ||
          s.address.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const statsA = supplierStats[a.id];
        const statsB = supplierStats[b.id];

        switch (sortBy) {
          case "oldest":
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          case "name_asc":
            return a.name.localeCompare(b.name);
          case "name_desc":
            return b.name.localeCompare(a.name);
          case "outstanding_desc":
            return (statsB?.outstandingBalance ?? 0) - (statsA?.outstandingBalance ?? 0);
          case "outstanding_asc":
            return (statsA?.outstandingBalance ?? 0) - (statsB?.outstandingBalance ?? 0);
          case "recent_purchase": {
            const dateA = statsA?.lastPurchaseDate ? new Date(statsA.lastPurchaseDate).getTime() : 0;
            const dateB = statsB?.lastPurchaseDate ? new Date(statsB.lastPurchaseDate).getTime() : 0;
            return dateB - dateA;
          }
          case "most_active":
            return (statsB?.purchaseCount ?? 0) - (statsA?.purchaseCount ?? 0);
          case "newest":
          default:
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      });
  }, [suppliers, search, statusFilter, kpiFilter, sortBy, supplierStats]);

  // Block render until guard has resolved
  if (loading || !isOwner) return null;

  function openAdd() {
    setEditingSupplier(null);
    setShowModal(true);
  }

  function openEdit(supplier: Supplier, e?: React.MouseEvent) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setEditingSupplier(supplier);
    setShowModal(true);
  }

  function toggleKpiFilter(filter: KpiFilter) {
    if (filter === "all") {
      setKpiFilter(null);
      setStatusFilter("All");
      return;
    }
    if (kpiFilter === filter) {
      setKpiFilter(null);
    } else {
      setKpiFilter(filter);
    }
  }

  const activeFilterLabel = useMemo(() => {
    if (kpiFilter === "active") return `Active Suppliers (${kpiData.activeCount})`;
    if (kpiFilter === "has_outstanding") return `Suppliers with Outstanding Dues (${kpiData.suppliersWithDuesCount})`;
    if (kpiFilter === "payment_attention") return `Payment Attention — Unpaid 30d+ (${kpiData.attentionSupplierCount})`;
    if (kpiFilter === "purchased_this_month") return `Purchased This Month (${filtered.length})`;
    return null;
  }, [kpiFilter, kpiData, filtered.length]);

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <div className="w-9 h-9 rounded-xl bg-navy-950 flex items-center justify-center shadow-sm shrink-0">
              <Truck size={17} className="text-yellow-400" />
            </div>
            <h1 className="text-2xl font-black text-navy-950 tracking-tight">Suppliers</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 pl-11">
            Manage supplier relationships, track purchases, monitor dues, and streamline procurement.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="add-supplier-btn"
            onClick={openAdd}
            className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-sm font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow cursor-pointer"
          >
            <Plus size={16} />
            Add Supplier
          </button>
        </div>
      </div>

      {/* Actionable KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3.5 min-w-0">
        {/* Total Suppliers */}
        <button
          type="button"
          data-kpi="all"
          onClick={() => toggleKpiFilter("all")}
          className={`text-left p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer bg-white relative overflow-hidden min-w-0 ${
            kpiFilter === null && statusFilter === "All"
              ? "border-navy-900 shadow-md ring-2 ring-navy-950/10"
              : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
          }`}
        >
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Total Suppliers</p>
              <p className="text-xl sm:text-2xl font-black text-navy-950 mt-0.5 truncate">{kpiData.totalCount}</p>
              <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">Registered</p>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-navy-50 flex items-center justify-center text-navy-700 shrink-0">
              <Truck size={15} />
            </div>
          </div>
          <span className="text-[10px] font-bold text-navy-700 mt-1.5 block truncate">
            Show all →
          </span>
        </button>

        {/* Active Suppliers */}
        <button
          type="button"
          data-kpi="active"
          onClick={() => toggleKpiFilter("active")}
          className={`text-left p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer bg-white relative overflow-hidden min-w-0 ${
            kpiFilter === "active"
              ? "border-emerald-600 shadow-md ring-2 ring-emerald-600/20 bg-emerald-50/10"
              : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
          }`}
        >
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Active Suppliers</p>
              <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-0.5 truncate">{kpiData.activeCount}</p>
              <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">{kpiData.activePercent}% active</p>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0">
              <CheckCircle size={15} />
            </div>
          </div>
          <span className="text-[10px] font-bold text-emerald-700 mt-1.5 block truncate">
            {kpiFilter === "active" ? "✓ Active" : "Filter active →"}
          </span>
        </button>

        {/* Outstanding Dues */}
        <button
          type="button"
          data-kpi="has_outstanding"
          onClick={() => toggleKpiFilter("has_outstanding")}
          className={`text-left p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer bg-white relative overflow-hidden min-w-0 ${
            kpiFilter === "has_outstanding"
              ? "border-red-600 shadow-md ring-2 ring-red-600/20 bg-red-50/10"
              : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
          }`}
        >
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Outstanding Dues</p>
              <p className="text-lg sm:text-2xl font-black text-red-600 mt-0.5 truncate">
                ₹{kpiData.totalOutstandingVal.toLocaleString()}
              </p>
              <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">{kpiData.suppliersWithDuesCount} owing</p>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600 shrink-0">
              <Coins size={15} />
            </div>
          </div>
          <span className="text-[10px] font-bold text-red-600 mt-1.5 block truncate">
            {kpiFilter === "has_outstanding" ? "✓ Active" : "Filter dues →"}
          </span>
        </button>

        {/* Payment Attention (Unpaid 30d+) */}
        <button
          type="button"
          data-kpi="payment_attention"
          onClick={() => toggleKpiFilter("payment_attention")}
          className={`text-left p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer bg-white relative overflow-hidden min-w-0 ${
            kpiFilter === "payment_attention"
              ? "border-amber-600 shadow-md ring-2 ring-amber-600/20 bg-amber-50/10"
              : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
          }`}
        >
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Payment Attention</p>
              <p className="text-xl sm:text-2xl font-black text-amber-600 mt-0.5 truncate">
                {kpiData.attentionSupplierCount}
              </p>
              <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
                {kpiData.attentionSupplierCount > 0 ? "30d+ unpaid" : "Current"}
              </p>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
              <AlertTriangle size={15} />
            </div>
          </div>
          <span className="text-[10px] font-bold text-amber-700 mt-1.5 block truncate">
            {kpiFilter === "payment_attention" ? "✓ Active" : "Aging dues →"}
          </span>
        </button>

        {/* Purchase Activity (This Month) */}
        <button
          type="button"
          data-kpi="purchased_this_month"
          onClick={() => toggleKpiFilter("purchased_this_month")}
          className={`text-left p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer bg-white relative overflow-hidden col-span-2 sm:col-span-1 min-w-0 ${
            kpiFilter === "purchased_this_month"
              ? "border-blue-600 shadow-md ring-2 ring-blue-600/20 bg-blue-50/10"
              : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
          }`}
        >
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Purchases (Month)</p>
              <p className="text-lg sm:text-2xl font-black text-blue-600 mt-0.5 truncate">
                ₹{kpiData.currentMonthPurchaseAmount.toLocaleString()}
              </p>
              <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">{kpiData.currentMonthPurchaseCount} orders</p>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              <ShoppingBag size={15} />
            </div>
          </div>
          <span className="text-[10px] font-bold text-blue-700 mt-1.5 block truncate">
            {kpiFilter === "purchased_this_month" ? "✓ Active" : "View active →"}
          </span>
        </button>
      </div>

      {/* Active Filter Pill / Banner */}
      {activeFilterLabel && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-50/80 border border-navy-200/80 px-3.5 py-2 rounded-xl text-xs min-w-0">
          <div className="flex items-center gap-2 text-navy-950 font-medium min-w-0">
            <span className="w-2 h-2 rounded-full bg-navy-900 animate-pulse shrink-0" />
            <span className="shrink-0">Active Filter:</span>
            <span className="font-bold bg-white px-2 py-0.5 rounded-md border border-navy-200 text-navy-900 truncate">
              {activeFilterLabel}
            </span>
          </div>
          <button
            onClick={() => setKpiFilter(null)}
            className="inline-flex items-center gap-1 font-bold text-navy-700 hover:text-navy-950 hover:underline cursor-pointer shrink-0"
          >
            <X size={13} />
            Clear Filter
          </button>
        </div>
      )}

      {/* Search + Filter + Sort Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shadow-xs min-w-0">
        {/* Search */}
        <div className="relative flex-1 min-w-0 w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearch("");
            }}
            placeholder="Search suppliers, contact, phone, email, GSTIN…"
            className="w-full pl-8.5 pr-8 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md"
              title="Clear search (Esc)"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Pills & Sort Dropdown */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end min-w-0">
          {/* Status Tabs */}
          <div className="flex gap-0.5 sm:gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
            {(["All", "Active", "Inactive"] as const).map((f) => {
              const count =
                f === "All"
                  ? suppliers.length
                  : f === "Active"
                  ? kpiData.activeCount
                  : suppliers.length - kpiData.activeCount;
              return (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    statusFilter === f
                      ? "bg-navy-950 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>{f}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                      statusFilter === f ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-2 py-1.5 bg-slate-50 text-xs shrink-0 max-w-full">
            <ArrowUpDown size={12} className="text-slate-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name_asc">Name (A–Z)</option>
              <option value="name_desc">Name (Z–A)</option>
              <option value="outstanding_desc">Highest Due</option>
              <option value="outstanding_asc">Lowest Due</option>
              <option value="recent_purchase">Recent Order</option>
              <option value="most_active">Most Orders</option>
            </select>
          </div>
        </div>
      </div>

      {/* Supplier Table & Mobile Card View */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs min-w-0">
        {filtered.length === 0 ? (
          <div className="py-16 sm:py-20 flex flex-col items-center justify-center gap-4 text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
              <Truck size={28} className="text-slate-300" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-800">
                {search
                  ? `No suppliers match "${search}"`
                  : kpiFilter === "has_outstanding"
                  ? "No outstanding supplier balances"
                  : kpiFilter === "payment_attention"
                  ? "All supplier accounts are in good standing"
                  : kpiFilter === "purchased_this_month"
                  ? "No purchases recorded this month"
                  : statusFilter === "Inactive"
                  ? "No inactive suppliers found"
                  : suppliers.length === 0
                  ? "No Suppliers Yet"
                  : "No suppliers match your current filter"}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                {search || kpiFilter || statusFilter !== "All"
                  ? "Try adjusting your search query, status tab, or clearing the active KPI filter."
                  : "Add your first supplier to start tracking purchases, purchase orders, and stock inflow."}
              </p>
            </div>
            {(search || kpiFilter || statusFilter !== "All") && (
              <div className="flex gap-2 mt-1">
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  >
                    Clear Search
                  </button>
                )}
                {(kpiFilter || statusFilter !== "All") && (
                  <button
                    onClick={() => {
                      setKpiFilter(null);
                      setStatusFilter("All");
                    }}
                    className="px-3.5 py-2 text-xs font-bold text-navy-950 bg-yellow-400 hover:bg-yellow-300 rounded-xl transition-colors cursor-pointer"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            )}
            {suppliers.length === 0 && !search && (
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-sm font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm"
              >
                <Plus size={15} />
                Add First Supplier
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View (md and up) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="px-5 py-3.5">Supplier</th>
                    <th className="px-5 py-3.5">Contact Details</th>
                    <th className="px-5 py-3.5">Outstanding Balance</th>
                    <th className="px-5 py-3.5 hidden lg:table-cell">Last Purchase</th>
                    <th className="px-5 py-3.5 hidden xl:table-cell">Last Payment</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((supplier) => {
                    const stats = supplierStats[supplier.id] ?? {
                      productCount: 0,
                      purchaseCount: 0,
                      purchaseVolume: 0,
                      lastPurchaseDate: null,
                      lastPaymentDate: null,
                      outstandingBalance: 0,
                      oldestUnpaidDays: 0,
                      hasPaymentAttention: false,
                      hasPurchasedThisMonth: false,
                      isRecentlyAdded: false,
                    };

                    return (
                      <tr key={supplier.id} className="hover:bg-slate-50/70 transition-colors group">
                        {/* Supplier Name & ID */}
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-navy-50 border border-navy-200/50 flex items-center justify-center shrink-0 mt-0.5">
                              <Truck size={16} className="text-navy-700" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Link
                                  href={`/suppliers/${supplier.id}`}
                                  className="font-bold text-slate-850 hover:text-navy-700 transition-colors text-sm"
                                >
                                  {supplier.name}
                                </Link>
                                {stats.isRecentlyAdded && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded-md">
                                    NEW
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-mono">
                                <span>{supplier.id}</span>
                                <button
                                  type="button"
                                  onClick={() => copyText(supplier.id, "Supplier ID", supplier.id)}
                                  title="Copy Supplier ID"
                                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                                >
                                  {copiedField?.id === supplier.id && copiedField.field === "Supplier ID" ? (
                                    <Check size={11} className="text-emerald-600" />
                                  ) : (
                                    <Copy size={11} />
                                  )}
                                </button>
                                {supplier.gst && (
                                  <>
                                    <span>•</span>
                                    <span className="text-[11px] text-slate-500 font-normal">
                                      GST: {supplier.gst}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Contact Details */}
                        <td className="px-5 py-4 text-xs">
                          {supplier.contactPerson && (
                            <p className="font-semibold text-slate-750">{supplier.contactPerson}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {supplier.phone && (
                              <a
                                href={`tel:${supplier.phone}`}
                                title={`Call ${supplier.phone}`}
                                className="inline-flex items-center gap-1 text-slate-600 hover:text-navy-950 font-medium transition-colors"
                              >
                                <Phone size={12} className="text-slate-400" />
                                {supplier.phone}
                              </a>
                            )}
                            {supplier.whatsApp && (
                              <a
                                href={`https://wa.me/91${supplier.whatsApp}`}
                                target="_blank"
                                rel="noreferrer"
                                title={`WhatsApp ${supplier.whatsApp}`}
                                className="inline-flex items-center text-green-600 hover:text-green-700 p-1 hover:bg-green-50 rounded"
                              >
                                <MessageSquare size={13} />
                              </a>
                            )}
                            {supplier.email && (
                              <a
                                href={`mailto:${supplier.email}`}
                                title={`Email ${supplier.email}`}
                                className="inline-flex items-center text-blue-600 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                              >
                                <Mail size={13} />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Outstanding Balance */}
                        <td className="px-5 py-4">
                          <div>
                            <p
                              className={`text-sm font-black ${
                                stats.outstandingBalance > 0 ? "text-red-600" : "text-slate-500"
                              }`}
                            >
                              ₹{stats.outstandingBalance.toLocaleString()}
                            </p>
                            {stats.outstandingBalance > 0 ? (
                              stats.hasPaymentAttention ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md mt-0.5">
                                  <AlertTriangle size={10} className="shrink-0 text-amber-600" />
                                  30d+ Attention
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400 block mt-0.5">
                                  Oldest: {stats.oldestUnpaidDays}d ago
                                </span>
                              )
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-medium block mt-0.5">
                                Paid / Settled
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Last Purchase */}
                        <td className="px-5 py-4 text-xs hidden lg:table-cell">
                          {stats.lastPurchaseDate ? (
                            <div>
                              <p className="font-semibold text-slate-750">
                                {formatDate(stats.lastPurchaseDate)}
                              </p>
                              <span className="text-[11px] text-slate-400 block mt-0.5">
                                {formatRelativeTime(stats.lastPurchaseDate)} ({stats.purchaseCount} orders)
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No purchases yet</span>
                          )}
                        </td>

                        {/* Last Payment */}
                        <td className="px-5 py-4 text-xs hidden xl:table-cell">
                          {stats.lastPaymentDate ? (
                            <div>
                              <p className="font-semibold text-slate-750">
                                {formatDate(stats.lastPaymentDate)}
                              </p>
                              <span className="text-[11px] text-slate-400 block mt-0.5">
                                {formatRelativeTime(stats.lastPaymentDate)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No payments yet</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                              supplier.status === "Active"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {supplier.status === "Active" ? <CheckCircle size={9} /> : <XCircle size={9} />}
                            {supplier.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isOwner && stats.outstandingBalance > 0 && (
                              <button
                                onClick={() => openLumpSumModal(supplier, stats.outstandingBalance)}
                                title="Record Payment (FIFO)"
                                className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-all shadow-xs cursor-pointer"
                              >
                                <Coins size={12} />
                                Pay
                              </button>
                            )}
                            <button
                              onClick={(e) => openEdit(supplier, e)}
                              title="Edit Supplier"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                            >
                              <Pencil size={13} />
                            </button>
                            <Link
                              href={`/suppliers/${supplier.id}`}
                              title="View Profile"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-navy-50 hover:text-navy-700 transition-colors"
                            >
                              <ChevronRight size={15} />
                            </Link>

                            {/* Row Quick Action Dropdown Menu (...) */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeMenu?.supplier.id === supplier.id) {
                                  setActiveMenu(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setActiveMenu({
                                    supplier,
                                    stats: {
                                      outstandingBalance: stats.outstandingBalance,
                                      purchaseCount: stats.purchaseCount,
                                      lastPurchaseDate: stats.lastPurchaseDate,
                                    },
                                    triggerRect: rect,
                                  });
                                }
                              }}
                              aria-label={`More actions for ${supplier.name}`}
                              aria-haspopup="menu"
                              aria-expanded={activeMenu?.supplier.id === supplier.id}
                              title="More actions"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                            >
                              <MoreVertical size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Touch-Friendly Mobile Card View (< 768px) */}
            <div className="md:hidden divide-y divide-slate-150 min-w-0">
              {filtered.map((supplier) => {
                const stats = supplierStats[supplier.id] ?? {
                  productCount: 0,
                  purchaseCount: 0,
                  purchaseVolume: 0,
                  lastPurchaseDate: null,
                  lastPaymentDate: null,
                  outstandingBalance: 0,
                  oldestUnpaidDays: 0,
                  hasPaymentAttention: false,
                  hasPurchasedThisMonth: false,
                  isRecentlyAdded: false,
                };

                return (
                  <div key={supplier.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/50 transition-colors min-w-0">
                    {/* Header: Name, Status, ID, New */}
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <Link href={`/suppliers/${supplier.id}`} className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-xl bg-navy-50 border border-navy-200/50 flex items-center justify-center shrink-0 mt-0.5">
                          <Truck size={15} className="text-navy-700" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-slate-900 text-sm truncate">{supplier.name}</p>
                            {stats.isRecentlyAdded && (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded-md shrink-0">
                                NEW
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                            {supplier.id}
                          </p>
                        </div>
                      </Link>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                          supplier.status === "Active"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {supplier.status === "Active" ? <CheckCircle size={9} /> : <XCircle size={9} />}
                        {supplier.status}
                      </span>
                    </div>

                    {/* Middle: Financial & Activity stats */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 border border-slate-150 rounded-xl p-2.5 text-xs min-w-0">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Outstanding</span>
                        {isOwner ? (
                          <div className="flex items-center gap-1 mt-0.5 min-w-0">
                            <span className={`font-bold truncate ${stats.outstandingBalance > 0 ? "text-red-600" : "text-slate-600"}`}>
                              ₹{stats.outstandingBalance.toLocaleString()}
                            </span>
                            {stats.hasPaymentAttention && (
                              <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 py-0.5 rounded shrink-0">
                                30d+
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Protected</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Last Purchase</span>
                        <span className="font-medium text-slate-700 mt-0.5 block truncate">
                          {stats.lastPurchaseDate ? formatDate(stats.lastPurchaseDate) : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Contact shortcuts & Action Buttons */}
                    <div className="flex items-center justify-between pt-1 min-w-0 gap-2">
                      <div className="flex items-center gap-1.5 shrink-0">
                        {supplier.phone && (
                          <a
                            href={`tel:${supplier.phone}`}
                            title={`Call ${supplier.phone}`}
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors shrink-0"
                          >
                            <Phone size={12} />
                          </a>
                        )}
                        {supplier.whatsApp && (
                          <a
                            href={`https://wa.me/91${supplier.whatsApp}`}
                            target="_blank"
                            rel="noreferrer"
                            title={`WhatsApp ${supplier.whatsApp}`}
                            className="w-7 h-7 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 flex items-center justify-center transition-colors shrink-0"
                          >
                            <MessageSquare size={12} />
                          </a>
                        )}
                        {supplier.email && (
                          <a
                            href={`mailto:${supplier.email}`}
                            title={`Email ${supplier.email}`}
                            className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center transition-colors shrink-0"
                          >
                            <Mail size={12} />
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isOwner && stats.outstandingBalance > 0 && (
                          <button
                            onClick={() => openLumpSumModal(supplier, stats.outstandingBalance)}
                            className="inline-flex items-center gap-1 bg-green-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-xs cursor-pointer"
                          >
                            <Coins size={12} />
                            Pay
                          </button>
                        )}
                        <button
                          onClick={(e) => openEdit(supplier, e)}
                          title="Edit Supplier"
                          className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center cursor-pointer"
                        >
                          <Pencil size={12} />
                        </button>
                        <Link
                          href={`/suppliers/${supplier.id}`}
                          title="View Profile"
                          className="w-7 h-7 rounded-lg bg-navy-950 text-white flex items-center justify-center"
                        >
                          <ChevronRight size={14} />
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeMenu?.supplier.id === supplier.id) {
                              setActiveMenu(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setActiveMenu({
                                supplier,
                                stats: {
                                  outstandingBalance: stats.outstandingBalance,
                                  purchaseCount: stats.purchaseCount,
                                  lastPurchaseDate: stats.lastPurchaseDate,
                                },
                                triggerRect: rect,
                              });
                            }
                          }}
                          aria-label={`More actions for ${supplier.name}`}
                          aria-haspopup="menu"
                          aria-expanded={activeMenu?.supplier.id === supplier.id}
                          className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center cursor-pointer"
                        >
                          <MoreVertical size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <SupplierFormModal isOpen={showModal} onClose={() => setShowModal(false)} editingSupplier={editingSupplier} />

      {/* Floating Row Quick Action Popover Menu (Portal) */}
      {activeMenu && (
        <FloatingRowMenu
          supplier={activeMenu.supplier}
          stats={activeMenu.stats}
          triggerRect={activeMenu.triggerRect}
          isOwner={isOwner}
          onClose={() => setActiveMenu(null)}
          onEdit={openEdit}
          onRecordPayment={openLumpSumModal}
          onCopy={copyText}
        />
      )}

      {/* Lump-Sum Supplier Payment Modal */}
      {lumpSumSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-5 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
                  <Coins className="text-green-600" size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-navy-950">Record Supplier Payment</h3>
                  <p className="text-xs text-slate-500">Lump-Sum Payment via FIFO — {lumpSumSupplier.name}</p>
                </div>
              </div>
              <button
                onClick={closeLumpSumModal}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Supplier Payable</p>
                <p className="text-2xl font-black text-red-600 mt-0.5">₹{lumpSumDerivedPayable.toLocaleString()}</p>
              </div>
              <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg">
                Return-Aware Outstanding
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Payment Amount (₹)
                  </label>
                  {lumpSumDerivedPayable > 0 && (
                    <button
                      type="button"
                      onClick={() => setLumpSumAmountInput(String(lumpSumDerivedPayable))}
                      className="text-xs font-bold text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 border border-green-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                    >
                      Pay Full Balance (₹{lumpSumDerivedPayable.toLocaleString()})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={lumpSumAmountInput}
                  onChange={(e) => setLumpSumAmountInput(e.target.value)}
                  placeholder="Enter payment amount"
                  className={INPUT}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Payment Method
                </label>
                <select
                  value={lumpSumMethod}
                  onChange={(e) => setLumpSumMethod(e.target.value as PaymentMethod)}
                  className={INPUT}
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={lumpSumNote}
                  onChange={(e) => setLumpSumNote(e.target.value)}
                  placeholder="e.g. Cheque #1042 or Vendor settlement"
                  className={INPUT}
                />
              </div>

              {/* FIFO Allocation Preview */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">
                  FIFO Allocation Preview (Oldest First)
                </label>
                {lumpSumPreview.allocations.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl text-center border border-slate-200">
                    No outstanding purchases to allocate.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-200">
                        <tr>
                          <th className="p-2 font-bold text-slate-600">Invoice</th>
                          <th className="p-2 font-bold text-slate-600 text-right">Due</th>
                          <th className="p-2 font-bold text-slate-600 text-right">Allocated</th>
                          <th className="p-2 font-bold text-slate-600 text-right">Post Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lumpSumPreview.allocations.map((item) => (
                          <tr key={item.purchase.id} className={item.allocated > 0 ? "bg-green-50/40" : ""}>
                            <td className="p-2 font-medium text-slate-800">
                              {item.purchase.invoiceNumber}
                              <span className="block text-[10px] text-slate-400">{formatPurchaseDate(item.purchase)}</span>
                            </td>
                            <td className="p-2 text-right font-medium text-slate-700">₹{item.effectiveDue.toLocaleString()}</td>
                            <td className="p-2 text-right font-bold text-green-600">
                              {item.allocated > 0 ? `₹${item.allocated.toLocaleString()}` : "—"}
                            </td>
                            <td className="p-2 text-right font-medium text-slate-700">₹{item.remainingDue.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Overpayment Warning */}
              {lumpSumPreview.unallocated > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5">
                  <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                  <div className="text-xs text-amber-800">
                    <p className="font-bold">Overpayment Detected</p>
                    <p className="mt-0.5 leading-relaxed">
                      ₹{lumpSumPreview.unallocated.toLocaleString()} exceeds total supplier payable (₹{lumpSumDerivedPayable.toLocaleString()}). Only ₹{lumpSumPreview.totalAllocated.toLocaleString()} will be applied across purchases; no excess expense or ledger record will be created.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={closeLumpSumModal}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLumpSumSubmit}
                disabled={Number(lumpSumAmountInput) <= 0 || lumpSumPreview.allocations.length === 0}
                className="px-5 py-2.5 text-xs font-bold bg-green-600 hover:bg-green-700 text-white rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Confirm & Apply Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
