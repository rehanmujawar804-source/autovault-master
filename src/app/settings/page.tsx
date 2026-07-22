"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { AppState } from "@/types";
import { useRole } from "@/hooks/useRole";
import { useStore, roundMoney } from "@/lib/store";
import { useRouter } from "next/navigation";
import {
  Save,
  Store,
  User,
  Phone,
  MapPin,
  FileText,
  Shield,
  RotateCcw,
  LogOut,
  Check,
  Activity,
  CheckCircle,
  AlertCircle,
  Download,
  Upload,
} from "lucide-react";

const SETTINGS_KEY = "autovault_settings";

type ShopSettings = {
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  invoicePrefix: string;
  currency: string;
  gstNumber: string;
};

const DEFAULTS: ShopSettings = {
  shopName: "7 Star Car Accessories",
  ownerName: "Owner",
  phone: "9876543210",
  address: "Mumbai, Maharashtra",
  invoicePrefix: "INV",
  currency: "₹",
  gstNumber: "",
};

function loadSettings(): ShopSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SETTINGS PAGE  (Owner only)
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const { isOwner, loading, role, logout } = useRole();
  const { state, reconcileDebtCache, showToast, dispatch, exportStoreAsJSON, getInvoiceOutstanding } = useStore();

  const [settings, setSettings] = useState<ShopSettings>(() => loadSettings());
  const [saved, setSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImport, setPendingImport] = useState<null | { state: AppState; settings?: Record<string, unknown> }>(null);
  const importJsonRef = useRef<HTMLInputElement | null>(null);

  // ── Debt Audit calculations ──────────────────────────────────────────────
  const invoiceDebt = useMemo(() => {
    return (state.invoices ?? [])
      .filter((inv) => !inv.voided)
      .reduce((sum, inv) => sum + getInvoiceOutstanding(inv), 0);
  }, [state.invoices, getInvoiceOutstanding]);

  const cachedDebt = useMemo(() => {
    return (state.customers ?? []).reduce((sum, c) => sum + c.debt, 0);
  }, [state.customers]);

  // Use roundMoney on both sides to avoid float equality false-positives
  // (e.g. 0.30000000000000004 !== 0.3 even when both represent ₹0.30)
  const auditPassed = roundMoney(invoiceDebt) === roundMoney(cachedDebt);

  function handleReconcile() {
    try {
      reconcileDebtCache();
      showToast("Customer debt cache reconciled and corrected!", "success");
    } catch {
      showToast("Reconciliation failed.", "error");
    }
  }

  // Settings are loaded via useState lazy initializer above — no effect needed.

  // ── Owner-only guard ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !isOwner) router.push("/dashboard");
  }, [loading, isOwner, router]);

  function setField<K extends keyof ShopSettings>(key: K, val: string) {
    setSettings((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
  }

  function handleSave() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      showToast("Failed to save settings — storage may be full.", "error");
    }
  }


  function handleResetStore() {
    dispatch({ type: "RESET_STORE" });
    localStorage.removeItem("autovault_store");
    setShowResetConfirm(false);
    router.push("/dashboard");
  }

  function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        // Validate that the backup has the required data collections
        if (
          !Array.isArray(parsed.products) ||
          !Array.isArray(parsed.customers) ||
          !Array.isArray(parsed.invoices)
        ) {
          showToast("Invalid backup file — missing required data collections.", "error");
          return;
        }
        // Safely normalize debtPayments — older backups may not have this field
        const normalizedState: AppState = {
          products: parsed.products ?? [],
          customers: parsed.customers ?? [],
          invoices: (parsed.invoices ?? []).map((inv: any) => ({
            ...inv,
            voided: inv.voided ?? false,
            voidedAt: inv.voidedAt ?? undefined,
            voidReason: inv.voidReason ?? undefined,
            voidedBy: inv.voidedBy ?? undefined,
          })),
          debtPayments: Array.isArray(parsed.debtPayments) ? parsed.debtPayments : [],
          suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
          purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
          stockMovements: Array.isArray(parsed.stockMovements) ? parsed.stockMovements : [],
          supplierPayments: Array.isArray(parsed.supplierPayments) ? parsed.supplierPayments : [],
          financeAccounts: Array.isArray(parsed.financeAccounts) ? parsed.financeAccounts : [],
          financeTransactions: Array.isArray(parsed.financeTransactions) ? parsed.financeTransactions : [],
          holdBills: Array.isArray(parsed.holdBills) ? parsed.holdBills : [],
          holdBillsCounter: typeof parsed.holdBillsCounter === "number" ? parsed.holdBillsCounter : (Array.isArray(parsed.holdBills) ? parsed.holdBills.length : 0),
        };
        // Extract settings if present in backup (newer backup format)
        const settingsPayload: Record<string, unknown> | undefined =
          parsed.settings && typeof parsed.settings === "object" && !Array.isArray(parsed.settings)
            ? parsed.settings
            : undefined;
        setPendingImport({ state: normalizedState, settings: settingsPayload });
        setShowImportConfirm(true);
      } catch {
        showToast("Failed to read backup file. Make sure it is a valid JSON export.", "error");
      } finally {
        // Reset input so the same file can be re-imported if needed
        if (importJsonRef.current) importJsonRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  function handleConfirmImport() {
    if (!pendingImport) return;
    try {
      dispatch({ type: "HYDRATE_STORE", state: pendingImport.state });
      // Restore shop settings if present in backup (backward-compatible: older backups won't have it)
      if (pendingImport.settings) {
        try {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(pendingImport.settings));
          // Reload settings state from the restored data
          setSettings({ ...DEFAULTS, ...(pendingImport.settings as Partial<ShopSettings>) });
        } catch {
          // If settings restore fails, keep current settings — not a blocking error
        }
      }
      showToast("Backup restored successfully! All data has been imported.", "success");
    } catch {
      showToast("Import failed. The backup may be corrupted.", "error");
    } finally {
      setShowImportConfirm(false);
      setPendingImport(null);
    }
  }

  if (loading || !isOwner) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-navy-950">Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Shop configuration — Owner only
          </p>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            saved
              ? "bg-green-600 text-white"
              : "bg-navy-950 hover:bg-navy-800 text-white"
          }`}
        >
          {saved ? <Check size={15} /> : <Save size={15} />}
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Shop Information ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 border-l-4 border-l-yellow-400">
          <h2 className="font-semibold text-slate-800 mb-5 flex items-center gap-2">
            <Store size={16} className="text-navy-700" />
            Shop Information
          </h2>

          <div className="space-y-4">
            <Field
              label="Shop Name"
              value={settings.shopName}
              onChange={(v) => setField("shopName", v)}
              placeholder="e.g. 7 Star Car Accessories"
            />
            <Field
              label="Owner Name"
              value={settings.ownerName}
              onChange={(v) => setField("ownerName", v)}
              placeholder="Your full name"
              icon={<User size={14} />}
            />
            <Field
              label="Phone Number"
              value={settings.phone}
              onChange={(v) => setField("phone", v)}
              placeholder="10-digit mobile"
              type="tel"
              icon={<Phone size={14} />}
            />
            <Field
              label="Address"
              value={settings.address}
              onChange={(v) => setField("address", v)}
              placeholder="Shop address"
              icon={<MapPin size={14} />}
              multiline
            />
            <Field
              label="GST Number (optional)"
              value={settings.gstNumber}
              onChange={(v) => setField("gstNumber", v)}
              placeholder="e.g. 27AAAFA0123A1Z5"
            />
          </div>
        </div>

        {/* ── Invoice Settings ───────────────────────────────────────────── */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 border-l-4 border-l-yellow-400">
            <h2 className="font-semibold text-slate-800 mb-5 flex items-center gap-2">
              <FileText size={16} className="text-navy-700" />
              Invoice Settings
            </h2>

            <div className="space-y-4">
              <Field
                label="Invoice Prefix"
                value={settings.invoicePrefix}
                onChange={(v) => setField("invoicePrefix", v)}
                placeholder="INV"
              />
              <Field
                label="Currency Symbol"
                value={settings.currency}
                onChange={(v) => setField("currency", v)}
                placeholder="₹"
              />
            </div>

            {/* Invoice number preview */}
            <div className="mt-4 bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Invoice number preview</p>
              <p className="font-mono text-sm font-semibold text-slate-800">
                {settings.invoicePrefix}-{new Date().getFullYear()}-0001
              </p>
            </div>
          </div>

          {/* ── Current Session ─────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-5 flex items-center gap-2">
              <Shield size={16} className="text-slate-500" />
              Current Session
            </h2>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2.5 px-4 bg-slate-50 rounded-xl text-sm">
                <span className="text-slate-500">Logged in as</span>
                <span className="font-semibold capitalize text-navy-900">
                  {role ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 px-4 bg-green-50 rounded-xl text-sm">
                <span className="text-slate-500">Access level</span>
                <span className="font-semibold text-green-700">
                  Full Owner Access
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              className="mt-4 w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>

          {/* ── Backup & Restore ─────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <Download size={16} className="text-navy-700" />
              Data Backup &amp; Restore
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Export a full backup of all invoices, customers, and products. Import a backup to restore data on a new device or after a reset.
            </p>
            {/* Hidden file input */}
            <input
              ref={importJsonRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFileChange}
            />
            <div className="flex gap-3">
              <button
                onClick={() => exportStoreAsJSON()}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                <Download size={14} />
                Export JSON Backup
              </button>
              <button
                onClick={() => importJsonRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                <Upload size={14} />
                Import JSON Backup
              </button>
            </div>
          </div>


          <div className="bg-white rounded-2xl border border-slate-200 p-6 border-l-4 border-l-blue-500">
            <h2 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <Activity size={16} className="text-blue-600" />
              System Diagnostics &amp; Audit
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Verify customer profile cached debt totals against transaction ledgers. Corrects cached data drift if found.
            </p>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2.5 px-4 bg-slate-50 rounded-xl text-sm">
                <span className="text-slate-500">Authoritative Invoice Dues</span>
                <span className="font-mono font-bold text-slate-800">
                  ₹{invoiceDebt.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 px-4 bg-slate-50 rounded-xl text-sm">
                <span className="text-slate-500">Cached Customer Debt</span>
                <span className="font-mono font-bold text-slate-800">
                  ₹{cachedDebt.toLocaleString()}
                </span>
              </div>

              {auditPassed ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                  <CheckCircle size={15} className="shrink-0" />
                  <span>Integrity Check Passed. No debt cache drift detected.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 p-3 rounded-xl">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Audit Drift Detected!</p>
                      <p className="font-normal text-slate-650 mt-1 leading-normal">
                        Aggregate customer debt cache does not match outstanding invoice dues. Click reconcile to repair.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleReconcile}
                    className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer"
                  >
                    Reconcile &amp; Repair Cache
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Danger Zone ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-red-200 p-6">
            <h2 className="font-semibold text-red-600 mb-2 flex items-center gap-2">
              <RotateCcw size={16} />
              Danger Zone
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              This will permanently delete all invoices, customers, and stock
              changes. Only the seed data will remain. This action cannot be
              undone.
            </p>

            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full border border-red-300 text-red-600 hover:bg-red-50 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Reset All Data
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-red-600 text-center">
                  Are you absolutely sure?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 border border-slate-200 text-slate-600 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetStore}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl text-sm font-medium transition-colors"
                  >
                    Yes, Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Import Confirm Modal ───────────────────────────────────── */}
      {showImportConfirm && pendingImport && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h2 className="font-bold text-slate-800">Restore Backup</h2>
                <p className="text-xs text-slate-500 mt-0.5">This will overwrite all current data</p>
              </div>
            </div>
              <div className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-900 text-xs">
                <AlertCircle className="shrink-0 text-amber-600" size={18} />
                <div>
                  <p className="font-bold">All current data will be replaced.</p>
                  <p className="mt-1 text-amber-800 leading-relaxed">
                    {(pendingImport.state.invoices ?? []).length} invoices,{" "}
                    {(pendingImport.state.customers ?? []).length} customers,{" "}
                    {(pendingImport.state.products ?? []).length} products,{" "}
                    and {(pendingImport.state.debtPayments ?? []).length} debt payment records will be imported.
                    {pendingImport.settings && (
                      <>{" "}Shop settings from backup will also be restored.</>
                    )}
                    {" "}Your current data will be overwritten. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => { setShowImportConfirm(false); setPendingImport(null); }}
                className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer"
              >
                Yes, Restore Backup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: string;
  icon?: React.ReactNode;
  multiline?: boolean;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon,
  multiline = false,
}: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative rounded-xl border border-slate-200 focus-within:border-yellow-400 focus-within:ring-2 focus-within:ring-yellow-400 bg-slate-50/50 hover:bg-slate-50 focus-within:bg-white transition-all overflow-hidden flex items-stretch">
        {icon && (
          <div className="flex items-center justify-center pl-3.5 text-slate-400">
            {icon}
          </div>
        )}
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="w-full px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none border-none bg-transparent resize-none"
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none border-none bg-transparent"
          />
        )}
      </div>
    </div>
  );
}
