"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { AppState } from "@/types";
import { useRole } from "@/hooks/useRole";
import { useStore, roundMoney } from "@/lib/store";
import { useRouter } from "next/navigation";
import { applyGlobalTheme } from "@/components/AppShell";
import {
  getAuthUsers,
  updateRoleCredentials,
  resetAuthCredentialsToDefaults,
  getLockoutStatus,
  validatePasswordPolicy,
  OWNER_LOCKOUT_KEY,
  STAFF_LOCKOUT_KEY,
} from "@/lib/authUtils";
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
  CheckCircle,
  AlertCircle,
  Download,
  Upload,
  Image as ImageIcon,
  Mail,
  Database,
  Info,
  Sliders,
  AlertTriangle,
  Lock,
  Eye,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

const SETTINGS_KEY = "autovault_settings";
const LAST_BACKUP_KEY = "autovault_last_backup_timestamp";
const STORE_VERSION = "v3-demo-clean-2026";

export type ThemeMode = "light" | "dark" | "system";

export type ShopSettings = {
  shopName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  gstNumber: string;
  invoicePrefix: string;
  currency: string;
  showLogo: boolean;
  showGST: boolean;
  showAddress: boolean;
  showPhone: boolean;
  footerMessage: string;
  theme: ThemeMode;
};

const DEFAULTS: ShopSettings = {
  shopName: "7 Star Car Accessories",
  ownerName: "Owner",
  phone: "7448138484",
  email: "",
  address: "Sambhaji Chowk Road, Near Veershav Bank, Ichalkaranji",
  gstNumber: "",
  invoicePrefix: "INV",
  currency: "₹",
  showLogo: true,
  showGST: true,
  showAddress: true,
  showPhone: true,
  footerMessage: "This is a computerized Cash/Credit Memo. Thank you for shopping with us!",
  theme: "light",
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

function loadLastBackupTime(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SETTINGS PAGE — OWNER CONTROL CENTER (Owner only)
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const { isOwner, loading, role, logout, requireOwner } = useRole();
  const {
    state,
    reconcileDebtCache,
    showToast,
    dispatch,
    exportStoreAsJSON,
    getInvoiceOutstanding,
  } = useStore();

  const [settings, setSettings] = useState<ShopSettings>(() => loadSettings());
  const [saveStatus, setSaveStatus] = useState<"idle" | "unsaved" | "saving" | "saved">("idle");
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(() => loadLastBackupTime());

  // ── Reset Modal State ────────────────────────────────────────────────────
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetInputText, setResetInputText] = useState("");

  // ── Import Modal State ───────────────────────────────────────────────────
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImport, setPendingImport] = useState<null | {
    state: AppState;
    settings?: Record<string, unknown>;
    version?: string;
  }>(null);
  const importJsonRef = useRef<HTMLInputElement | null>(null);

  // ── User Accounts & Security State ───────────────────────────────────────
  const [authUsers, setAuthUsers] = useState(() => getAuthUsers());

  // Lockout Timer States
  const [ownerLockoutSeconds, setOwnerLockoutSeconds] = useState(0);
  const [staffLockoutSeconds, setStaffLockoutSeconds] = useState(0);

  useEffect(() => {
    function checkRoleLockouts() {
      const ownerStatus = getLockoutStatus(OWNER_LOCKOUT_KEY);
      setOwnerLockoutSeconds(ownerStatus.isLocked ? ownerStatus.secondsRemaining : 0);

      const staffStatus = getLockoutStatus(STAFF_LOCKOUT_KEY);
      setStaffLockoutSeconds(staffStatus.isLocked ? staffStatus.secondsRemaining : 0);
    }
    checkRoleLockouts();
    const interval = setInterval(checkRoleLockouts, 1000);
    return () => clearInterval(interval);
  }, []);

  // Owner Card State
  const [currentOwnerUsername, setCurrentOwnerUsername] = useState(() => authUsers.owner.username);
  const [currentOwnerPassword, setCurrentOwnerPassword] = useState("");
  const [newOwnerUsername, setNewOwnerUsername] = useState(() => authUsers.owner.username);
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [confirmOwnerPassword, setConfirmOwnerPassword] = useState("");
  const [ownerError, setOwnerError] = useState("");
  const [ownerSuccess, setOwnerSuccess] = useState("");

  // Staff Card State
  const [currentStaffUsername, setCurrentStaffUsername] = useState(() => authUsers.staff.username);
  const [currentStaffPassword, setCurrentStaffPassword] = useState("");
  const [newStaffUsername, setNewStaffUsername] = useState(() => authUsers.staff.username);
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [confirmStaffPassword, setConfirmStaffPassword] = useState("");
  const [staffError, setStaffError] = useState("");
  const [staffSuccess, setStaffSuccess] = useState("");

  function handleSaveOwnerAccount(e: React.FormEvent) {
    e.preventDefault();
    setOwnerError("");
    setOwnerSuccess("");

    const result = updateRoleCredentials({
      role: "owner",
      currentUsernameInput: currentOwnerUsername,
      currentPasswordInput: currentOwnerPassword,
      newUsernameInput: newOwnerUsername,
      newPasswordInput: newOwnerPassword,
      confirmPasswordInput: confirmOwnerPassword,
    });

    if (result.success) {
      const updated = getAuthUsers();
      setAuthUsers(updated);
      setCurrentOwnerUsername(updated.owner.username);
      setCurrentOwnerPassword("");
      setNewOwnerPassword("");
      setConfirmOwnerPassword("");
      setNewOwnerUsername(updated.owner.username);
      setOwnerSuccess("Owner account credentials saved successfully.");
      showToast("Owner credentials saved successfully!", "success");
    } else {
      setOwnerError(result.error || "Failed to update Owner credentials.");
    }
  }

  function handleSaveStaffAccount(e: React.FormEvent) {
    e.preventDefault();
    setStaffError("");
    setStaffSuccess("");

    const result = updateRoleCredentials({
      role: "staff",
      currentUsernameInput: currentStaffUsername,
      currentPasswordInput: currentStaffPassword,
      newUsernameInput: newStaffUsername,
      newPasswordInput: newStaffPassword,
      confirmPasswordInput: confirmStaffPassword,
    });

    if (result.success) {
      const updated = getAuthUsers();
      setAuthUsers(updated);
      setCurrentStaffUsername(updated.staff.username);
      setCurrentStaffPassword("");
      setNewStaffPassword("");
      setConfirmStaffPassword("");
      setNewStaffUsername(updated.staff.username);
      setStaffSuccess("Staff account credentials saved successfully.");
      showToast("Staff credentials saved successfully!", "success");
    } else {
      setStaffError(result.error || "Failed to update Staff credentials.");
    }
  }

  // ── Owner-only guard ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading) requireOwner();
  }, [loading, requireOwner]);

  // ── Debt Audit calculations ──────────────────────────────────────────────
  const invoiceDebt = useMemo(() => {
    return (state.invoices ?? [])
      .filter((inv) => !inv.voided)
      .reduce((sum, inv) => sum + getInvoiceOutstanding(inv), 0);
  }, [state.invoices, getInvoiceOutstanding]);

  const cachedDebt = useMemo(() => {
    return (state.customers ?? []).reduce((sum, c) => sum + c.debt, 0);
  }, [state.customers]);

  const auditPassed = roundMoney(invoiceDebt) === roundMoney(cachedDebt);

  function handleReconcile() {
    try {
      reconcileDebtCache();
      showToast("Customer debt cache reconciled and corrected!", "success");
    } catch {
      showToast("Reconciliation failed.", "error");
    }
  }

  function setField<K extends keyof ShopSettings>(key: K, val: ShopSettings[K]) {
    setSettings((prev) => {
      const updated = { ...prev, [key]: val };
      if (key === "theme") {
        try {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
          applyGlobalTheme();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("autovault_theme_change"));
          }
        } catch {
          // Non-blocking
        }
      }
      return updated;
    });
    setSaveStatus("unsaved");
  }

  function handleSave() {
    setSaveStatus("saving");
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      applyGlobalTheme();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("autovault_theme_change"));
      }
      setTimeout(() => {
        setSaveStatus("saved");
        showToast("Shop settings saved successfully!", "success");
        setTimeout(() => setSaveStatus("idle"), 2500);
      }, 300);
    } catch {
      setSaveStatus("unsaved");
      showToast("Failed to save settings — browser storage may be full.", "error");
    }
  }

  function handleExportBackup() {
    try {
      exportStoreAsJSON();
      const timestamp = new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      localStorage.setItem(LAST_BACKUP_KEY, timestamp);
      setLastBackupTime(timestamp);
      showToast("Full JSON backup exported successfully!", "success");
    } catch {
      showToast("Failed to export JSON backup.", "error");
    }
  }

  function handleResetStore() {
    if (resetInputText.trim() !== "RESET") {
      showToast("Please type RESET exactly to confirm.", "error");
      return;
    }
    dispatch({ type: "RESET_STORE" });
    localStorage.removeItem("autovault_store");
    resetAuthCredentialsToDefaults();
    const defaultAuth = getAuthUsers();
    setAuthUsers(defaultAuth);
    setCurrentOwnerUsername(defaultAuth.owner.username);
    setCurrentOwnerPassword("");
    setNewOwnerUsername(defaultAuth.owner.username);
    setNewOwnerPassword("");
    setConfirmOwnerPassword("");
    setCurrentStaffUsername(defaultAuth.staff.username);
    setCurrentStaffPassword("");
    setNewStaffUsername(defaultAuth.staff.username);
    setNewStaffPassword("");
    setConfirmStaffPassword("");
    setShowResetConfirm(false);
    setResetInputText("");
    showToast("Store and login credentials reset successfully. Reverted to baseline clean state.", "info");
    router.push("/dashboard");
  }

  function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (
          !Array.isArray(parsed.products) ||
          !Array.isArray(parsed.customers) ||
          !Array.isArray(parsed.invoices)
        ) {
          showToast("Invalid backup file — missing required data collections.", "error");
          return;
        }

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
          salesReturns: Array.isArray(parsed.salesReturns) ? parsed.salesReturns : [],
          salesReturnCounter: typeof parsed.salesReturnCounter === "number" ? parsed.salesReturnCounter : (Array.isArray(parsed.salesReturns) ? parsed.salesReturns.length : 0),
          purchaseReturns: Array.isArray(parsed.purchaseReturns) ? parsed.purchaseReturns : [],
          purchaseOrders: Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders : [],
          purchaseOrderCounter: typeof parsed.purchaseOrderCounter === "number" ? parsed.purchaseOrderCounter : (Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders.length : 0),
          holdBills: Array.isArray(parsed.holdBills) ? parsed.holdBills : [],
          holdBillsCounter: typeof parsed.holdBillsCounter === "number" ? parsed.holdBillsCounter : (Array.isArray(parsed.holdBills) ? parsed.holdBills.length : 0),
        };

        const settingsPayload: Record<string, unknown> | undefined =
          parsed.settings && typeof parsed.settings === "object" && !Array.isArray(parsed.settings)
            ? parsed.settings
            : undefined;

        setPendingImport({
          state: normalizedState,
          settings: settingsPayload,
          version: typeof parsed.__v === "string" ? parsed.__v : undefined,
        });
        setShowImportConfirm(true);
      } catch {
        showToast("Failed to read backup file. Make sure it is a valid JSON export.", "error");
      } finally {
        if (importJsonRef.current) importJsonRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  function handleConfirmImport() {
    if (!pendingImport) return;
    try {
      dispatch({ type: "HYDRATE_STORE", state: pendingImport.state });
      if (pendingImport.settings) {
        try {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(pendingImport.settings));
          setSettings({ ...DEFAULTS, ...(pendingImport.settings as Partial<ShopSettings>) });
          applyGlobalTheme();
        } catch {
          // Non-blocking fallback
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

  // Live Next Invoice Preview calculation
  const liveInvoicePreviewNumber = useMemo(() => {
    const prefix = settings.invoicePrefix.trim() || "INV";
    const year = new Date().getFullYear();
    const count = (state.invoices ?? []).length + 1;
    return `${prefix}-${year}-${String(count).padStart(4, "0")}`;
  }, [settings.invoicePrefix, state.invoices]);

  // Basic lightweight field validation feedback
  const phoneInvalid = settings.phone.trim() !== "" && !/^\d{10}$/.test(settings.phone.trim());
  const emailInvalid = settings.email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email.trim());
  const gstInvalid = settings.gstNumber.trim() !== "" && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(settings.gstNumber.trim().toUpperCase());

  if (loading || !isOwner) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* ── Top Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-navy-950">Settings</h1>
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Owner Control Center
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage business identity, print configuration, appearance theme, system health, and backup safety.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveStatus === "unsaved" && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Unsaved Changes
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer ${
              saveStatus === "saved"
                ? "bg-emerald-600 text-white"
                : saveStatus === "unsaved"
                ? "bg-navy-950 hover:bg-navy-800 text-white ring-2 ring-yellow-400/50"
                : "bg-navy-950 hover:bg-navy-800 text-white"
            }`}
          >
            {saveStatus === "saved" ? (
              <Check size={16} />
            ) : saveStatus === "saving" ? (
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {saveStatus === "saved"
              ? "Saved!"
              : saveStatus === "saving"
              ? "Saving..."
              : "Save Settings"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left Column ──────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* ── Section 1: Business Profile ─────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 border-l-4 border-l-yellow-400 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Store size={18} className="text-navy-950" />
                1. Business Profile
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Core identity details used across newly created printed documents and business records.
              </p>
            </div>

            <div className="space-y-4">
              <Field
                id="shop-name-input"
                label="Shop Name"
                value={settings.shopName}
                onChange={(v) => setField("shopName", v)}
                placeholder="e.g. 7 Star Car Accessories"
                icon={<Store size={14} />}
                required
              />

              <Field
                id="owner-name-input"
                label="Owner Name"
                value={settings.ownerName}
                onChange={(v) => setField("ownerName", v)}
                placeholder="Owner / Proprietor full name"
                icon={<User size={14} />}
              />

              <div>
                <Field
                  id="phone-input"
                  label="Phone Number"
                  value={settings.phone}
                  onChange={(v) => setField("phone", v)}
                  placeholder="10-digit mobile number"
                  type="tel"
                  icon={<Phone size={14} />}
                />
                {phoneInvalid && (
                  <p className="text-[11px] font-semibold text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> Standard Indian mobile numbers are 10 digits.
                  </p>
                )}
              </div>

              <div>
                <Field
                  id="email-input"
                  label="Business Email"
                  value={settings.email}
                  onChange={(v) => setField("email", v)}
                  placeholder="e.g. contact@7starcaraccessories.com"
                  type="email"
                  icon={<Mail size={14} />}
                />
                {emailInvalid && (
                  <p className="text-[11px] font-semibold text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> Please enter a valid email format.
                  </p>
                )}
              </div>

              <Field
                id="address-input"
                label="Shop Address"
                value={settings.address}
                onChange={(v) => setField("address", v)}
                placeholder="Full address (Street, Landmark, City, Pincode)"
                icon={<MapPin size={14} />}
                multiline
              />

              <div>
                <Field
                  id="gst-input"
                  label="GSTIN / Tax Number (optional)"
                  value={settings.gstNumber}
                  onChange={(v) => setField("gstNumber", v.toUpperCase())}
                  placeholder="e.g. 27AAAFA0123A1Z5"
                  icon={<FileText size={14} />}
                />
                {gstInvalid ? (
                  <p className="text-[11px] font-semibold text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> GSTIN format should match standard 15-character structure (e.g. 27AAAFA0123A1Z5).
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1">
                    GSTIN will appear on newly created printable invoices if enabled below.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Section 2: Business Branding ─────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 border-l-4 border-l-navy-900 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <ImageIcon size={18} className="text-navy-950" />
                2. Business Branding
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Invoice header brand preview &amp; asset explanation.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              <div className="w-20 h-20 bg-navy-950 rounded-xl p-2 flex items-center justify-center shrink-0 border border-slate-300 shadow-sm">
                <img
                  src="/7star-logo-invoice.png"
                  alt="Current Logo"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="space-y-1 text-center sm:text-left text-xs">
                <p className="font-bold text-slate-800">Current Logo Asset</p>
                <p className="text-slate-500 font-mono text-[11px]">/public/7star-logo-invoice.png</p>
                <div className="flex items-center gap-1 text-[11px] text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 inline-block mt-1">
                  <Info size={13} className="inline text-navy-700 mr-1" />
                  Logo file uploading is intentionally disabled to preserve database performance.
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 leading-relaxed">
              <p className="font-bold text-blue-950 flex items-center gap-1.5 mb-1">
                <CheckCircle size={14} className="text-blue-600" />
                Dynamic Header for New Invoices Only
              </p>
              Changing your <span className="font-bold">Shop Name</span>, <span className="font-bold">Address</span>, or <span className="font-bold">Phone</span> above dynamically updates the business identity on <span className="font-bold">newly generated invoices</span> while existing historical invoices retain their creation snapshot.
            </div>
          </div>

          {/* ── Section 4: Appearance (Theme Mode) ────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 border-l-4 border-l-purple-600 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Sun size={18} className="text-amber-500" />
                4. Appearance &amp; Theme
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Customize global ERP workstation theme mode (Light, Dark, System Default).
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setField("theme", "light")}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all cursor-pointer ${
                  settings.theme === "light"
                    ? "bg-amber-50 border-amber-400 text-amber-900 font-bold ring-2 ring-amber-400/40 shadow-xs"
                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Sun size={20} className={settings.theme === "light" ? "text-amber-600 mb-1" : "text-slate-400 mb-1"} />
                <span className="text-xs">Light</span>
              </button>

              <button
                type="button"
                onClick={() => setField("theme", "dark")}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all cursor-pointer ${
                  settings.theme === "dark"
                    ? "bg-navy-950 border-navy-900 text-white font-bold ring-2 ring-yellow-400/50 shadow-xs"
                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Moon size={20} className={settings.theme === "dark" ? "text-yellow-400 mb-1" : "text-slate-400 mb-1"} />
                <span className="text-xs">Dark</span>
              </button>

              <button
                type="button"
                onClick={() => setField("theme", "system")}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all cursor-pointer ${
                  settings.theme === "system"
                    ? "bg-blue-50 border-blue-400 text-blue-900 font-bold ring-2 ring-blue-400/40 shadow-xs"
                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Monitor size={20} className={settings.theme === "system" ? "text-blue-600 mb-1" : "text-slate-400 mb-1"} />
                <span className="text-xs">System</span>
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
              <span className="font-bold text-slate-800">Theme Preference:</span>{" "}
              <span className="capitalize font-semibold">{settings.theme} Mode</span>. Printable invoices and PDF exports will always retain crisp light paper formatting for printing compatibility.
            </div>
          </div>

          {/* ── Section 5: User Accounts & Security ─────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 border-l-4 border-l-blue-600 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Lock size={18} className="text-blue-600" />
                5. User Accounts &amp; Security
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage login credentials for Owner and Staff accounts. Mandatory re-authentication required.
              </p>
            </div>

            {/* Owner Account Card */}
            <form onSubmit={handleSaveOwnerAccount} autoComplete="off" className="bg-slate-50 border border-slate-200 rounded-xl p-4.5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <User size={16} className="text-blue-600" />
                  Owner Account Credentials
                </h3>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                  Primary Admin
                </span>
              </div>

              {ownerLockoutSeconds > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg p-2.5 flex items-center justify-between font-medium">
                  <span>Re-authentication locked due to failed attempts</span>
                  <span className="font-mono font-bold bg-amber-200/60 px-2 py-0.5 rounded text-amber-900">{ownerLockoutSeconds}s</span>
                </div>
              )}

              {/* Current Credentials Sub-section */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider text-[10px]">
                  1. Re-Authenticate Current Owner Credentials
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Current Owner Username *</label>
                    <input
                      type="text"
                      autoComplete="off"
                      minLength={3}
                      maxLength={50}
                      placeholder="e.g. owner@autovault.com"
                      value={currentOwnerUsername}
                      onChange={(e) => setCurrentOwnerUsername(e.target.value)}
                      disabled={ownerLockoutSeconds > 0}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Current Owner Password *</label>
                    <input
                      type="password"
                      autoComplete="off"
                      minLength={8}
                      maxLength={64}
                      placeholder="Enter current password"
                      value={currentOwnerPassword}
                      onChange={(e) => setCurrentOwnerPassword(e.target.value)}
                      disabled={ownerLockoutSeconds > 0}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* New Credentials Sub-section */}
              <div className="space-y-2 pt-1 border-t border-slate-200/60">
                <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider text-[10px]">
                  2. Set New Owner Credentials
                </span>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">New Owner Username *</label>
                    <input
                      type="text"
                      autoComplete="off"
                      minLength={3}
                      maxLength={50}
                      placeholder="Owner username / email"
                      value={newOwnerUsername}
                      onChange={(e) => setNewOwnerUsername(e.target.value)}
                      disabled={ownerLockoutSeconds > 0}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">New Owner Password (optional)</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={64}
                        placeholder="Leave blank to keep existing"
                        value={newOwnerPassword}
                        onChange={(e) => setNewOwnerPassword(e.target.value)}
                        disabled={ownerLockoutSeconds > 0}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">Confirm New Password</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={64}
                        placeholder="Confirm new password"
                        value={confirmOwnerPassword}
                        onChange={(e) => setConfirmOwnerPassword(e.target.value)}
                        disabled={ownerLockoutSeconds > 0}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  {newOwnerPassword && (
                    <div className="bg-slate-100/80 border border-slate-200 rounded-lg p-2.5 space-y-1 text-[11px]">
                      <span className="font-bold text-slate-700 block mb-1">New Password Requirements:</span>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                        {(() => {
                          const p = validatePasswordPolicy(newOwnerPassword);
                          return (
                            <>
                              <span className={p.hasMinLength && p.hasMaxLength ? "text-emerald-700 font-semibold" : "text-slate-500"}>
                                {p.hasMinLength && p.hasMaxLength ? "✓" : "○"} 8–64 characters
                              </span>
                              <span className={p.hasUpper ? "text-emerald-700 font-semibold" : "text-slate-500"}>
                                {p.hasUpper ? "✓" : "○"} 1 Uppercase letter (A-Z)
                              </span>
                              <span className={p.hasLower ? "text-emerald-700 font-semibold" : "text-slate-500"}>
                                {p.hasLower ? "✓" : "○"} 1 Lowercase letter (a-z)
                              </span>
                              <span className={p.hasNumber ? "text-emerald-700 font-semibold" : "text-slate-500"}>
                                {p.hasNumber ? "✓" : "○"} 1 Number (0-9)
                              </span>
                              <span className={p.hasSpecial ? "text-emerald-700 font-semibold" : "text-slate-500"}>
                                {p.hasSpecial ? "✓" : "○"} 1 Special char (!@#$%^&*)
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {ownerError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2.5 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{ownerError}</span>
                </div>
              )}
              {ownerSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg p-2.5 flex items-center gap-2">
                  <CheckCircle size={14} className="shrink-0" />
                  <span>{ownerSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={ownerLockoutSeconds > 0}
                className={`w-full font-bold text-xs py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 ${
                  ownerLockoutSeconds > 0
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                    : "bg-navy-950 hover:bg-navy-900 text-white cursor-pointer"
                }`}
              >
                <Save size={14} className="text-yellow-400" />
                {ownerLockoutSeconds > 0 ? `Locked (${ownerLockoutSeconds}s)` : "Save Owner Credentials"}
              </button>
            </form>

            {/* Staff Account Card */}
            <form onSubmit={handleSaveStaffAccount} autoComplete="off" className="bg-slate-50 border border-slate-200 rounded-xl p-4.5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <User size={16} className="text-emerald-600" />
                  Staff Account Credentials
                </h3>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                  POS &amp; Store Access
                </span>
              </div>

              {staffLockoutSeconds > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg p-2.5 flex items-center justify-between font-medium">
                  <span>Re-authentication locked due to failed attempts</span>
                  <span className="font-mono font-bold bg-amber-200/60 px-2 py-0.5 rounded text-amber-900">{staffLockoutSeconds}s</span>
                </div>
              )}

              {/* Current Credentials Sub-section */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider text-[10px]">
                  1. Re-Authenticate Current Staff Credentials
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Current Staff Username *</label>
                    <input
                      type="text"
                      autoComplete="off"
                      minLength={3}
                      maxLength={50}
                      placeholder="e.g. staff@autovault.com"
                      value={currentStaffUsername}
                      onChange={(e) => setCurrentStaffUsername(e.target.value)}
                      disabled={staffLockoutSeconds > 0}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Current Staff Password *</label>
                    <input
                      type="password"
                      autoComplete="off"
                      minLength={8}
                      maxLength={64}
                      placeholder="Enter current staff password"
                      value={currentStaffPassword}
                      onChange={(e) => setCurrentStaffPassword(e.target.value)}
                      disabled={staffLockoutSeconds > 0}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* New Credentials Sub-section */}
              <div className="space-y-2 pt-1 border-t border-slate-200/60">
                <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider text-[10px]">
                  2. Set New Staff Credentials
                </span>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">New Staff Username *</label>
                    <input
                      type="text"
                      autoComplete="off"
                      minLength={3}
                      maxLength={50}
                      placeholder="Staff username / email"
                      value={newStaffUsername}
                      onChange={(e) => setNewStaffUsername(e.target.value)}
                      disabled={staffLockoutSeconds > 0}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">New Staff Password (optional)</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={64}
                        placeholder="Leave blank to keep existing"
                        value={newStaffPassword}
                        onChange={(e) => setNewStaffPassword(e.target.value)}
                        disabled={staffLockoutSeconds > 0}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">Confirm New Password</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={64}
                        placeholder="Confirm new password"
                        value={confirmStaffPassword}
                        onChange={(e) => setConfirmStaffPassword(e.target.value)}
                        disabled={staffLockoutSeconds > 0}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  {newStaffPassword && (
                    <div className="bg-slate-100/80 border border-slate-200 rounded-lg p-2.5 space-y-1 text-[11px]">
                      <span className="font-bold text-slate-700 block mb-1">New Password Requirements:</span>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                        {(() => {
                          const p = validatePasswordPolicy(newStaffPassword);
                          return (
                            <>
                              <span className={p.hasMinLength && p.hasMaxLength ? "text-emerald-700 font-semibold" : "text-slate-500"}>
                                {p.hasMinLength && p.hasMaxLength ? "✓" : "○"} 8–64 characters
                              </span>
                              <span className={p.hasUpper ? "text-emerald-700 font-semibold" : "text-slate-500"}>
                                {p.hasUpper ? "✓" : "○"} 1 Uppercase letter (A-Z)
                              </span>
                              <span className={p.hasLower ? "text-emerald-700 font-semibold" : "text-slate-500"}>
                                {p.hasLower ? "✓" : "○"} 1 Lowercase letter (a-z)
                              </span>
                              <span className={p.hasNumber ? "text-emerald-700 font-semibold" : "text-slate-500"}>
                                {p.hasNumber ? "✓" : "○"} 1 Number (0-9)
                              </span>
                              <span className={p.hasSpecial ? "text-emerald-700 font-semibold" : "text-slate-500"}>
                                {p.hasSpecial ? "✓" : "○"} 1 Special char (!@#$%^&*)
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {staffError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2.5 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{staffError}</span>
                </div>
              )}
              {staffSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg p-2.5 flex items-center gap-2">
                  <CheckCircle size={14} className="shrink-0" />
                  <span>{staffSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={staffLockoutSeconds > 0}
                className={`w-full font-bold text-xs py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 ${
                  staffLockoutSeconds > 0
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                    : "bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
                }`}
              >
                <Save size={14} className="text-emerald-400" />
                {staffLockoutSeconds > 0 ? `Locked (${staffLockoutSeconds}s)` : "Save Staff Credentials"}
              </button>
            </form>
          </div>

          {/* ── Section 7: Current Session & RBAC ───────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Shield size={18} className="text-slate-600" />
                7. Current Session &amp; Access
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="py-3 px-4 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1">
                <span className="text-slate-400 font-medium block">Logged-in User Role</span>
                <span className="font-bold capitalize text-navy-900 text-sm flex items-center gap-1.5">
                  <User size={14} className="text-navy-700" />
                  {role ?? "—"}
                </span>
              </div>
              <div className="py-3 px-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs space-y-1">
                <span className="text-emerald-700 font-medium block">Access Level</span>
                <span className="font-bold text-emerald-900 text-sm flex items-center gap-1.5">
                  <Lock size={14} className="text-emerald-700" />
                  Full Owner Control
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 border border-slate-300 text-slate-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer"
            >
              <LogOut size={16} />
              Logout Current Session
            </button>
          </div>

        </div>

        {/* ── Right Column ─────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* ── Section 3: Invoice & Document Settings ────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 border-l-4 border-l-yellow-400 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Sliders size={18} className="text-navy-950" />
                3. Invoice &amp; Document Settings
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure sequence prefixes, currency display, and printable visibility toggles.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  id="invoice-prefix-input"
                  label="Invoice Number Prefix"
                  value={settings.invoicePrefix}
                  onChange={(v) => setField("invoicePrefix", v.toUpperCase().trim())}
                  placeholder="e.g. INV or BILL"
                />

                <Field
                  id="currency-input"
                  label="Currency Symbol"
                  value={settings.currency}
                  onChange={(v) => setField("currency", v)}
                  placeholder="₹"
                />
              </div>

              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed">
                <p className="font-bold text-amber-950 mb-0.5 flex items-center gap-1">
                  <Info size={13} className="text-amber-700" />
                  Currency Scope Clarification:
                </p>
                The currency symbol configured here applies to document presentation. The canonical Finance module operates strictly under Indian Rupee (₹) accounting standards.
              </div>

              {/* Live Invoice Sequence Preview Card */}
              <div className="bg-slate-900 text-white rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Eye size={13} />
                  Live Invoice Number Generator Preview
                </p>
                <p className="font-mono text-lg font-black tracking-wide text-white">
                  {liveInvoicePreviewNumber}
                </p>
                <p className="text-[10px] text-slate-400">
                  Calculated dynamically for new invoices from Settings Prefix + Current Year + Sequence Count (Total invoices: {state.invoices.length}).
                </p>
              </div>

              {/* Document Display Toggles */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Printable Document Layout Toggles
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <ToggleItem
                    id="toggle-logo"
                    label="Show Logo on Header"
                    checked={settings.showLogo}
                    onChange={(v) => setField("showLogo", v)}
                  />
                  <ToggleItem
                    id="toggle-gst"
                    label="Show GSTIN on Header"
                    checked={settings.showGST}
                    onChange={(v) => setField("showGST", v)}
                  />
                  <ToggleItem
                    id="toggle-address"
                    label="Show Address on Header"
                    checked={settings.showAddress}
                    onChange={(v) => setField("showAddress", v)}
                  />
                  <ToggleItem
                    id="toggle-phone"
                    label="Show Phone on Header"
                    checked={settings.showPhone}
                    onChange={(v) => setField("showPhone", v)}
                  />
                </div>
              </div>

              {/* Footer Notice */}
              <div className="space-y-1.5">
                <label htmlFor="footer-message-input" className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                  Invoice Footer Notice
                </label>
                <textarea
                  id="footer-message-input"
                  value={settings.footerMessage}
                  onChange={(e) => setField("footerMessage", e.target.value)}
                  placeholder="Terms & conditions or thank you message"
                  rows={2}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-slate-50 focus:bg-white text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* ── Section 5: System Health & Data Integrity ────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 border-l-4 border-l-blue-600 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Database size={18} className="text-blue-600" />
                5. System Health &amp; Data Integrity
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time debt ledger reconciliation &amp; database collection status.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 leading-relaxed">
              This integrity check compares authoritative invoice dues against cached customer debt values. If a mismatch is detected, AutoVault can reconcile and repair the cached customer debt values.
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-center py-2.5 px-4 bg-slate-50 rounded-xl text-xs">
                <span className="text-slate-600 font-medium">Authoritative Invoice Dues</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  ₹{invoiceDebt.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 px-4 bg-slate-50 rounded-xl text-xs">
                <span className="text-slate-600 font-medium">Cached Customer Debt</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  ₹{cachedDebt.toLocaleString("en-IN")}
                </span>
              </div>

              {auditPassed ? (
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                  <CheckCircle size={16} className="shrink-0 text-emerald-600" />
                  <span>Integrity Check Passed. Customer debt cache is 100% in sync with invoice ledgers.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 text-xs font-semibold text-red-800 bg-red-50 border border-red-200 p-3 rounded-xl">
                    <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-600" />
                    <div>
                      <p className="font-bold">Debt Cache Drift Detected!</p>
                      <p className="font-normal text-red-700 mt-0.5">
                        Aggregate customer debt cache differs from outstanding invoice dues. Click repair to reconcile.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleReconcile}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    Reconcile &amp; Repair Customer Debt Cache
                  </button>
                </div>
              )}
            </div>

            {/* System Info Readouts */}
            <div className="border-t border-slate-100 pt-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                System Build &amp; Collection Info
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block">Store Version</span>
                  <span className="font-mono font-bold text-slate-800">{STORE_VERSION}</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block">Products Count</span>
                  <span className="font-mono font-bold text-slate-800">{state.products.length}</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block">Customers Count</span>
                  <span className="font-mono font-bold text-slate-800">{state.customers.length}</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block">Invoices Count</span>
                  <span className="font-mono font-bold text-slate-800">{state.invoices.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 6: Data Backup & Restore ─────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Download size={18} className="text-navy-950" />
                6. Data Backup &amp; Restore
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Export full JSON backup of all ERP collections or restore data onto a new device.
              </p>
            </div>

            {/* Hidden file input */}
            <input
              ref={importJsonRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFileChange}
            />

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-700">Backup Collection Summary</span>
                {lastBackupTime && (
                  <span className="text-[10px] text-slate-500 font-medium">
                    Last exported: {lastBackupTime}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-600 font-medium">
                <div>📦 {state.products.length} Products</div>
                <div>👥 {state.customers.length} Customers</div>
                <div>🧾 {state.invoices.length} Invoices</div>
                <div>🚚 {state.suppliers.length} Suppliers</div>
                <div>💼 {state.financeTransactions.length} Finance Txs</div>
                <div>💸 {(state.debtPayments ?? []).length} Debt Payments</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleExportBackup}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
              >
                <Download size={14} />
                Export JSON Backup
              </button>
              <button
                onClick={() => importJsonRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Upload size={14} />
                Import JSON Backup
              </button>
            </div>
          </div>

          {/* ── Section 8: Danger Zone ──────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-red-200 p-6 border-l-4 border-l-red-600 shadow-sm space-y-4">
            <div>
              <h2 className="font-bold text-red-600 text-base flex items-center gap-2">
                <RotateCcw size={18} />
                8. Danger Zone
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                High-impact destructive action. Requires explicit typed confirmation.
              </p>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-900 leading-relaxed">
              <p className="font-bold text-red-950 mb-1 flex items-center gap-1">
                <AlertTriangle size={14} className="text-red-600" />
                Reset Store Warning
              </p>
              Resetting will permanently wipe all invoices, customers, products, stock movements, purchases, suppliers, supplier payments, hold bills, sales/purchase returns, purchase orders, debt repayments, and finance transactions.
            </div>

            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full border border-red-300 text-red-600 hover:bg-red-600 hover:text-white py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Reset All Data
              </button>
            ) : (
              <div className="space-y-3 bg-red-50/50 p-4 rounded-xl border border-red-200">
                <p className="text-xs font-bold text-red-700">
                  Type <span className="font-mono bg-red-200 px-1.5 py-0.5 rounded text-red-950">RESET</span> below to enable confirmation:
                </p>
                <input
                  type="text"
                  value={resetInputText}
                  onChange={(e) => setResetInputText(e.target.value)}
                  placeholder="Type RESET"
                  className="w-full px-3 py-2 text-xs font-mono font-bold border border-red-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowResetConfirm(false);
                      setResetInputText("");
                    }}
                    className="flex-1 border border-slate-300 text-slate-700 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetStore}
                    disabled={resetInputText.trim() !== "RESET"}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      resetInputText.trim() === "RESET"
                        ? "bg-red-600 hover:bg-red-700 text-white shadow-sm"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    Confirm Reset
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Import Confirmation Modal ────────────────────────────────────── */}
      {showImportConfirm && pendingImport && (
        <div className="fixed inset-0 bg-navy-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h2 className="font-bold text-slate-800 text-base">Restore Backup Confirmation</h2>
                <p className="text-xs text-slate-500 mt-0.5">Review backup metadata before importing</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {pendingImport.version && pendingImport.version !== STORE_VERSION && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex gap-2.5 text-amber-900 text-xs">
                  <AlertTriangle size={18} className="shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-bold">Version Difference Notice</p>
                    <p className="mt-0.5 text-amber-800">
                      Backup version (<span className="font-mono">{pendingImport.version}</span>) differs from current store version (<span className="font-mono">{STORE_VERSION}</span>). Data will be safely normalized during restore.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                <p className="font-bold text-slate-800">Backup Metadata Record Counts:</p>
                <div className="grid grid-cols-2 gap-2 text-slate-700 font-medium">
                  <div>📦 Products: {(pendingImport.state.products ?? []).length}</div>
                  <div>👥 Customers: {(pendingImport.state.customers ?? []).length}</div>
                  <div>🧾 Invoices: {(pendingImport.state.invoices ?? []).length}</div>
                  <div>🚚 Suppliers: {(pendingImport.state.suppliers ?? []).length}</div>
                  <div>💼 Finance Txs: {(pendingImport.state.financeTransactions ?? []).length}</div>
                  <div>💸 Debt Payments: {(pendingImport.state.debtPayments ?? []).length}</div>
                </div>
                {pendingImport.settings && (
                  <p className="text-[11px] text-emerald-700 font-bold border-t border-slate-200 pt-2 mt-2">
                    ✓ Shop settings from backup will also be restored.
                  </p>
                )}
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 font-medium">
                Warning: Importing will replace the current ERP data with the selected backup. This action cannot be undone.
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => {
                  setShowImportConfirm(false);
                  setPendingImport(null);
                }}
                className="flex-1 border border-slate-300 text-slate-700 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm"
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

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: string;
  icon?: React.ReactNode;
  multiline?: boolean;
  required?: boolean;
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon,
  multiline = false,
  required = false,
}: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative rounded-xl border border-slate-200 focus-within:border-yellow-400 focus-within:ring-2 focus-within:ring-yellow-400/50 bg-slate-50/70 hover:bg-slate-50 focus-within:bg-white transition-all overflow-hidden flex items-stretch shadow-xs">
        {icon && (
          <div className="flex items-center justify-center pl-3.5 text-slate-400 shrink-0">
            {icon}
          </div>
        )}
        {multiline ? (
          <textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={2}
            className="w-full px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none border-none bg-transparent resize-none leading-relaxed"
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none border-none bg-transparent font-medium"
          />
        )}
      </div>
    </div>
  );
}

interface ToggleItemProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}

function ToggleItem({ id, label, checked, onChange }: ToggleItemProps) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
        checked
          ? "bg-navy-950/5 border-navy-900/30 text-navy-950 font-bold"
          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
      }`}
    >
      <span className="text-xs">{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 text-navy-950 focus:ring-yellow-400 cursor-pointer"
      />
    </label>
  );
}
