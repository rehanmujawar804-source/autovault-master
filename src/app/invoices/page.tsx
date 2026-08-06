"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import PrintableInvoice from "@/components/PrintableInvoice";
import PrintableReceipt from "@/components/PrintableReceipt";
import type { Invoice, PaymentMethod, PaymentStatus, DebtPayment } from "@/types";
import Link from "next/link";
import { formatInvoiceDate, formatRepaymentDate, sortInvoicesDescending } from "@/lib/dateUtils";
import {
  Search,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  MessageCircle,
  Printer,
  DollarSign,
  Activity,
  Info,
  X,
  Wallet,
  History,
  Coins,
  TrendingUp,
  ShoppingCart,
  Calendar,
  Car,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  STYLE MAPS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PaymentStatus, string> = {
  Paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Partial: "bg-blue-100 text-blue-700 border-blue-200",
  Debt: "bg-amber-100 text-amber-700 border-amber-200",
  "Partially Returned": "bg-orange-100 text-orange-800 border-orange-200",
  "Fully Returned": "bg-red-100 text-red-800 border-red-200",
  Refunded: "bg-purple-100 text-purple-800 border-purple-200",
  Voided: "bg-slate-200 text-slate-700 border-slate-300",
};

const METHOD_BADGE: Record<string, string> = {
  Cash: "bg-emerald-50 text-emerald-700",
  UPI: "bg-blue-50 text-blue-700",
  Card: "bg-purple-50 text-purple-700",
  Credit: "bg-red-50 text-red-600",
};

const METHOD_COLORS: Record<PaymentMethod, string> = {
  Cash: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPI: "bg-blue-50 text-blue-700 border-blue-200",
  Card: "bg-purple-50 text-purple-700 border-purple-200",
};

const METHOD_DOT: Record<string, string> = {
  Cash: "bg-emerald-500",
  UPI: "bg-blue-500",
  Card: "bg-purple-500",
  Credit: "bg-red-500",
};

type FilterStatus = "All" | PaymentStatus;
type DateRangeOption =
  | "All Time"
  | "Today"
  | "Yesterday"
  | "Last 7 Days"
  | "Last 30 Days"
  | "This Month"
  | "Previous Month"
  | "This Financial Year"
  | "Custom Range";

type SortField = "date" | "invoiceNumber" | "customer" | "total" | "paymentStatus";
type SortOrder = "asc" | "desc";

function matchesDateRange(dateStr: string, option: DateRangeOption, customStart: string, customEnd: string): boolean {
  if (option === "All Time") return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (option === "Today") {
    return d >= todayStart;
  }
  if (option === "Yesterday") {
    const yestStart = new Date(todayStart);
    yestStart.setDate(yestStart.getDate() - 1);
    return d >= yestStart && d < todayStart;
  }
  if (option === "Last 7 Days") {
    const d7 = new Date(todayStart);
    d7.setDate(d7.getDate() - 7);
    return d >= d7;
  }
  if (option === "Last 30 Days") {
    const d30 = new Date(todayStart);
    d30.setDate(d30.getDate() - 30);
    return d >= d30;
  }
  if (option === "This Month") {
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= mStart;
  }
  if (option === "Previous Month") {
    const prevMStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= prevMStart && d < thisMStart;
  }
  if (option === "This Financial Year") {
    const currentYear = now.getFullYear();
    const fyStartYear = now.getMonth() >= 3 ? currentYear : currentYear - 1;
    const fyStart = new Date(fyStartYear, 3, 1);
    return d >= fyStart;
  }
  if (option === "Custom Range") {
    if (customStart) {
      const cStart = new Date(customStart);
      if (d < cStart) return false;
    }
    if (customEnd) {
      const cEnd = new Date(customEnd);
      cEnd.setHours(23, 59, 59, 999);
      if (d > cEnd) return false;
    }
    return true;
  }
  return true;
}

type PageTab = "invoices" | "repayments";

// ─────────────────────────────────────────────────────────────────────────────
//  INVOICES PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const { state, recordDebtPayment, getDebtPaymentsByInvoice, getInvoiceById, getCustomerById, showToast, getInvoiceOutstanding, getTotalOutstandingDebt } = useStore();
  const { loading, requireAuth } = useRole();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  const [activeTab, setActiveTab] = useState<PageTab>("invoices");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("All");
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  // Date Range Filter State (Phase 3)
  const [dateOption, setDateOption] = useState<DateRangeOption>("All Time");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Column Sorting State (Phase 5)
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Repayments tab search
  const [repaySearch, setRepaySearch] = useState("");
  const [repayMethodFilter, setRepayMethodFilter] = useState<string>("All");
  const [voidFilter, setVoidFilter] = useState<"All" | "Normal" | "Voided">("All");

  // ── Collect Payment Modal State ───────────────────────────────────────────
  const [collectInvoice, setCollectInvoice] = useState<Invoice | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>("Cash");
  const [collectNote, setCollectNote] = useState("");
  const [collectSuccess, setCollectSuccess] = useState(false);
  const [collectCollectedBy, setCollectCollectedBy] = useState<"Owner" | "Staff" | "">("");

  // ── Print Receipt Modal State ─────────────────────────────────────────────
  const [printReceiptPayment, setPrintReceiptPayment] = useState<any | null>(null);

  function handleShareReceiptWhatsApp(p: any) {
    const inv = getInvoiceById(p.invoiceId);
    const cust = p.customerId ? getCustomerById(p.customerId) : undefined;
    const phone = cust?.phone || inv?.customerPhone || "";
    if (!phone) {
      showToast("No customer phone number available.", "error");
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    const receiptNo = p.receiptNumber || "Legacy";
    const due = inv ? getInvoiceOutstanding(inv) : 0;
    const msg =
      `Payment Receipt\n\n` +
      `Receipt:\n${receiptNo}\n\n` +
      `Invoice:\n${p.invoiceNumber}\n\n` +
      `Customer:\n${p.customerName}\n\n` +
      `Collected:\n₹${p.amount.toLocaleString()}\n\n` +
      `Remaining Due:\n₹${due.toLocaleString()}\n\n` +
      `Method:\n${p.method}`;

    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const all = state.invoices;
    return {
      total: all.length,
      paid: all.filter((i) => i.paymentStatus === "Paid").length,
      partial: all.filter((i) => i.paymentStatus === "Partial").length,
      debt: all.filter((i) => i.paymentStatus === "Debt").length,
      partiallyReturned: all.filter((i) => i.paymentStatus === "Partially Returned").length,
      fullyReturned: all.filter((i) => i.paymentStatus === "Fully Returned").length,
      refunded: all.filter((i) => i.paymentStatus === "Refunded").length,
      voided: all.filter((i) => i.paymentStatus === "Voided").length,
    };
  }, [state.invoices]);

  // ── Filtered & Sorted Invoices ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...state.invoices];

    // Filter by payment status
    if (filter !== "All") {
      list = list.filter((i) => i.paymentStatus === filter);
    }
    // Filter by void status
    if (voidFilter === "Normal") {
      list = list.filter((i) => !i.voided);
    } else if (voidFilter === "Voided") {
      list = list.filter((i) => i.voided);
    }

    // Filter by Date Range (Phase 3)
    list = list.filter((i) => matchesDateRange(i.createdAt || i.date, dateOption, customStart, customEnd));

    // Enhanced Search: Invoice #, Customer, Phone, Status, Vehicle, Product, SKU
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => {
        if (i.invoiceNumber.toLowerCase().includes(q)) return true;
        if (i.customer.toLowerCase().includes(q)) return true;
        if (i.customerPhone.includes(q)) return true;
        if (i.paymentStatus.toLowerCase().includes(q)) return true;
        if ((i.vehicleNumber || "").toLowerCase().includes(q)) return true;
        if ((i.vehicleModel || "").toLowerCase().includes(q)) return true;
        const hasItemMatch = i.items.some((it) => {
          if (it.name.toLowerCase().includes(q)) return true;
          const liveProd = state.products.find((p) => p.id === it.productId);
          if (liveProd && liveProd.sku.toLowerCase().includes(q)) return true;
          return false;
        });
        return hasItemMatch;
      });
    }

    // Column Sorting (Phase 5)
    list.sort((a, b) => {
      let valA: any;
      let valB: any;
      if (sortField === "invoiceNumber") {
        valA = a.invoiceNumber;
        valB = b.invoiceNumber;
      } else if (sortField === "customer") {
        valA = a.customer;
        valB = b.customer;
      } else if (sortField === "total") {
        valA = a.total;
        valB = b.total;
      } else if (sortField === "paymentStatus") {
        valA = a.paymentStatus;
        valB = b.paymentStatus;
      } else {
        valA = new Date(a.createdAt || a.date).getTime();
        valB = new Date(b.createdAt || b.date).getTime();
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [state.invoices, state.products, filter, voidFilter, dateOption, customStart, customEnd, search, sortField, sortOrder]);

  // ── Repayments data ───────────────────────────────────────────────────────
  const allRepayments = useMemo(() => {
    return [...(state.debtPayments ?? [])]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((p) => {
        const inv = getInvoiceById(p.invoiceId);
        const cust = p.customerId ? getCustomerById(p.customerId) : undefined;
        return { ...p, invoiceNumber: inv?.invoiceNumber ?? "—", customerName: cust?.name ?? inv?.customer ?? "—" };
      });
  }, [state.debtPayments, state.invoices, state.customers]);

  const filteredRepayments = useMemo(() => {
    let list = allRepayments;
    if (repayMethodFilter !== "All") {
      list = list.filter((p) => p.method === repayMethodFilter);
    }
    const q = repaySearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.customerName.toLowerCase().includes(q) ||
          p.invoiceNumber.toLowerCase().includes(q) ||
          p.method.toLowerCase().includes(q) ||
          (p.note ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allRepayments, repayMethodFilter, repaySearch]);

  const repayStats = useMemo(() => {
    const total = allRepayments.reduce((s, p) => s + p.amount, 0);
    const byMethod: Record<string, number> = {};
    allRepayments.forEach((p) => {
      byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
    });
    return { total, count: allRepayments.length, byMethod };
  }, [allRepayments]);

  // ── Total outstanding debt ─────────────────────────────────────────────────
  const totalDue = getTotalOutstandingDebt();

  // ── Collect Payment Handlers ──────────────────────────────────────────────
  function openCollect(inv: Invoice) {
    setCollectInvoice(inv);
    setCollectAmount(String(getInvoiceOutstanding(inv)));
    setCollectMethod("Cash");
    setCollectNote("");
    setCollectCollectedBy("");
    setCollectSuccess(false);
  }

  function closeCollect() {
    setCollectInvoice(null);
    setCollectAmount("");
    setCollectNote("");
    setCollectCollectedBy("");
    setCollectSuccess(false);
  }

  function handleCollectSubmit() {
    if (!collectInvoice || !collectInvoice.customerId) return;
    if (!collectCollectedBy) {
      showToast("Please select who collected this payment.", "error");
      return;
    }
    const amount = Number(collectAmount) || 0;
    if (amount <= 0) {
      showToast("Please enter a valid repayment amount.", "error");
      return;
    }
    if (amount > getInvoiceOutstanding(collectInvoice)) {
      showToast("Repayment amount cannot exceed current outstanding due.", "error");
      return;
    }

    try {
      recordDebtPayment({
        customerId: collectInvoice.customerId,
        invoiceId: collectInvoice.id,
        amount,
        date: new Date().toISOString(),
        method: collectMethod,
        note: collectNote.trim() || undefined,
        collectedBy: collectCollectedBy,
      });
      showToast(`Recorded repayment of ₹${amount.toLocaleString()} successfully!`, "success");
      setCollectSuccess(true);
      setTimeout(() => closeCollect(), 1400);
    } catch (err) {
      showToast("Failed to record repayment.", "error");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
      {/* ── Page header + tab switcher ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-black text-navy-950">Invoice History</h1>
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("invoices")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer min-h-[44px] sm:min-h-0 ${activeTab === "invoices"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
              }`}
          >
            <FileText size={15} />
            Invoices
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${activeTab === "invoices" ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>
              {counts.total}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("repayments")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer min-h-[44px] sm:min-h-0 ${activeTab === "repayments"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
              }`}
          >
            <Coins size={15} />
            Repayments
            {repayStats.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${activeTab === "repayments" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                {repayStats.count}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
           TAB: INVOICES
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "invoices" && (
        <>
          {/* ── Stat Cards ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 mb-6">
            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 ${totalDue > 0 ? "lg:col-span-3" : "lg:col-span-4"}`}>
              <StatCard label="Total Invoices" value={counts.total} icon={<FileText size={16} />} iconBg="bg-slate-100 text-slate-600" />
              <StatCard label="Paid" value={counts.paid} icon={<CheckCircle size={16} />} iconBg="bg-emerald-50 text-emerald-600" valueClass="text-emerald-700" />
              <StatCard label="Partial" value={counts.partial} icon={<Clock size={16} />} iconBg="bg-blue-50 text-blue-500" valueClass="text-blue-600" />
              <StatCard label="Debt / Unpaid" value={counts.debt} icon={<AlertCircle size={16} />} iconBg="bg-amber-50 text-amber-500" valueClass="text-amber-600" />
            </div>
            {totalDue > 0 && (
              <div className="lg:col-span-1 bg-gradient-to-br from-navy-950 to-navy-900 text-white rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden border border-navy-800">
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-navy-800 rounded-full opacity-20 blur-xl" />
                <div className="absolute right-4 top-4">
                  <DollarSign size={24} className="text-yellow-400 opacity-30" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-navy-300 font-semibold mb-1">Outstanding Collections</p>
                  <p className="text-2xl font-extrabold tracking-tight text-yellow-400">₹{totalDue.toLocaleString()}</p>
                </div>
                <div className="mt-3 pt-2 border-t border-navy-800 flex items-center justify-between text-[11px] text-navy-300">
                  <span>Total Dues Pending</span>
                  <button
                    onClick={() => { setActiveTab("repayments"); }}
                    className="font-semibold text-yellow-400 hover:text-yellow-300 cursor-pointer min-h-[36px] flex items-center"
                  >
                    View Repayments →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Search + Filter Bar ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 mb-4 p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
              {/* Search input */}
              <div className="relative w-full md:w-80">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search invoice #, customer, phone, vehicle..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl pl-8 pr-3.5 py-2 text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Status Filter buttons (Horizontal Scroll on Mobile) */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 max-w-full flex-nowrap md:flex-wrap">
                {(["All", "Paid", "Partial", "Debt", "Partially Returned", "Fully Returned", "Refunded", "Voided"] as FilterStatus[]).map((f) => {
                  const getCount = (status: FilterStatus) => {
                    switch (status) {
                      case "All": return counts.total;
                      case "Paid": return counts.paid;
                      case "Partial": return counts.partial;
                      case "Debt": return counts.debt;
                      case "Partially Returned": return counts.partiallyReturned;
                      case "Fully Returned": return counts.fullyReturned;
                      case "Refunded": return counts.refunded;
                      case "Voided": return counts.voided;
                    }
                  };
                  return (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer text-xs shrink-0 whitespace-nowrap ${filter === f ? "bg-navy-950 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                    >
                      {f === "Debt" ? "Debt / Unpaid" : f}
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${filter === f ? "bg-slate-700 text-slate-200" : "bg-slate-200 text-slate-600"}`}>
                        {getCount(f)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date Range & Void Filters Sub-bar (Phase 3) */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <span className="font-bold text-slate-500 flex items-center gap-1 shrink-0">
                  <Calendar size={13} />
                  Date Range:
                </span>
                <select
                  value={dateOption}
                  onChange={(e) => setDateOption(e.target.value as DateRangeOption)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs bg-slate-50 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-400 max-w-full"
                >
                  <option value="All Time">All Time</option>
                  <option value="Today">Today</option>
                  <option value="Yesterday">Yesterday</option>
                  <option value="Last 7 Days">Last 7 Days</option>
                  <option value="Last 30 Days">Last 30 Days</option>
                  <option value="This Month">This Month</option>
                  <option value="Previous Month">Previous Month</option>
                  <option value="This Financial Year">This Financial Year (Apr-Mar)</option>
                  <option value="Custom Range">Custom Range</option>
                </select>

                {dateOption === "Custom Range" && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 w-full sm:w-auto mt-1 sm:mt-0">
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="border border-slate-200 rounded px-2 py-1 text-xs bg-white w-full sm:w-auto"
                    />
                    <span className="text-slate-400 text-center sm:text-left">to</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="border border-slate-200 rounded px-2 py-1 text-xs bg-white w-full sm:w-auto"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500 shrink-0">Filter Status:</span>
                <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-[11px] font-semibold">
                  <button
                    onClick={() => setVoidFilter("All")}
                    className={`px-2.5 py-1 rounded transition cursor-pointer ${voidFilter === "All" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setVoidFilter("Normal")}
                    className={`px-2.5 py-1 rounded transition cursor-pointer ${voidFilter === "Normal" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                  >
                    Normal
                  </button>
                  <button
                    onClick={() => setVoidFilter("Voided")}
                    className={`px-2.5 py-1 rounded transition cursor-pointer ${voidFilter === "Voided" ? "bg-white text-slate-900 shadow-sm text-red-600" : "text-slate-500"}`}
                  >
                    Voided
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            {filtered.length === 0 ? (
              <div className="p-16 text-center bg-white border border-slate-200 rounded-2xl">
                <FileText size={32} className="text-slate-350 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">No invoices found</p>
                <p className="text-slate-350 text-xs mt-1 max-w-sm mx-auto">There are no invoices matching the selected filters. Start billing items to generate invoices.</p>
                <Link
                  href="/billing"
                  className="mt-4 inline-flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95"
                >
                  <ShoppingCart size={13} />
                  POS Billing Terminal
                </Link>
              </div>
            ) : (
              <>
                {/* Desktop/Tablet Table View (>=768px) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide border-b border-slate-200 select-none">
                        <th
                          onClick={() => {
                            if (sortField === "invoiceNumber") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                            else { setSortField("invoiceNumber"); setSortOrder("desc"); }
                          }}
                          className="px-5 py-3 text-left font-semibold cursor-pointer hover:bg-slate-100"
                        >
                          Invoice {sortField === "invoiceNumber" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th
                          onClick={() => {
                            if (sortField === "customer") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                            else { setSortField("customer"); setSortOrder("asc"); }
                          }}
                          className="px-5 py-3 text-left font-semibold cursor-pointer hover:bg-slate-100"
                        >
                          Customer {sortField === "customer" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th className="px-5 py-3 text-left font-semibold hidden md:table-cell">Phone</th>
                        <th className="px-5 py-3 text-left font-semibold hidden lg:table-cell">Method</th>
                        <th
                          onClick={() => {
                            if (sortField === "paymentStatus") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                            else { setSortField("paymentStatus"); setSortOrder("asc"); }
                          }}
                          className="px-5 py-3 text-left font-semibold cursor-pointer hover:bg-slate-100"
                        >
                          Status {sortField === "paymentStatus" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th
                          onClick={() => {
                            if (sortField === "total") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                            else { setSortField("total"); setSortOrder("desc"); }
                          }}
                          className="px-5 py-3 text-right font-semibold cursor-pointer hover:bg-slate-100"
                        >
                          Total {sortField === "total" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th className="px-5 py-3 text-right font-semibold hidden md:table-cell">Due</th>
                        <th
                          onClick={() => {
                            if (sortField === "date") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                            else { setSortField("date"); setSortOrder("desc"); }
                          }}
                          className="px-5 py-3 text-left font-semibold hidden lg:table-cell cursor-pointer hover:bg-slate-100"
                        >
                          Date {sortField === "date" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th className="px-5 py-3 text-center font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((inv) => {
                        const isExpanded = expandedInvoiceId === inv.id;
                        const isPaid = inv.paymentStatus === "Paid";
                        const isPartial = inv.paymentStatus === "Partial";
                        const payments = getDebtPaymentsByInvoice(inv.id);
                        const hasPayments = payments.length > 0;

                        let borderClass = "border-l-4 border-l-transparent";
                        let bgClass = "hover:bg-slate-50/80";
                        if (inv.voided) {
                          borderClass = "border-l-4 border-l-red-400";
                          bgClass = "bg-red-50/30 hover:bg-red-50/50 text-slate-500";
                        } else if (isPaid) {
                          borderClass = "border-l-4 border-l-emerald-500";
                        } else if (isPartial) {
                          borderClass = "border-l-4 border-l-orange-400";
                          bgClass = "bg-orange-50/10 hover:bg-orange-50/20";
                        } else {
                          borderClass = "border-l-4 border-l-red-500";
                          bgClass = "bg-red-50/10 hover:bg-red-50/20";
                        }
                        if (isExpanded) bgClass = inv.voided ? "bg-red-50/40" : "bg-slate-50/60";

                        return (
                          <Fragment key={inv.id}>
                            <tr className={`transition-colors border-b border-slate-100 ${borderClass} ${bgClass}`}>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                                    className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                                  >
                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronRight size={14} />}
                                  </button>
                                  <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded select-all">
                                    {inv.invoiceNumber}
                                  </span>
                                  {hasPayments && (
                                    <span className="text-[9px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded font-bold">
                                      Repaid
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="font-semibold text-slate-800 hover:text-slate-600 cursor-pointer" onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}>
                                  {inv.customer}
                                </div>
                                {inv.vehicleModel && <div className="text-xs text-slate-400 mt-0.5">{inv.vehicleModel}</div>}
                              </td>
                              <td className="px-5 py-3.5 text-slate-500 hidden md:table-cell">{inv.customerPhone || "—"}</td>
                              <td className="px-5 py-3.5 hidden lg:table-cell">
                                <span className={`text-xs px-2.5 py-1 rounded-md font-semibold ${METHOD_BADGE[inv.paymentMethod] ?? "bg-slate-100 text-slate-600"}`}>
                                  {inv.paymentMethod}
                                </span>
                              </td>
                              <td className="px-5 py-3.5">
                                {inv.voided ? (
                                  <span className="text-xs px-2.5 py-1 rounded-md font-bold border bg-red-150 text-red-750 border-red-200">
                                    Voided
                                  </span>
                                ) : (
                                  <span className={`text-xs px-2.5 py-1 rounded-md font-bold border ${STATUS_BADGE[inv.paymentStatus]}`}>
                                    {inv.paymentStatus === "Debt" ? "Debt / Unpaid" : inv.paymentStatus}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-right font-extrabold text-slate-800">
                                ₹{inv.total.toLocaleString()}
                              </td>
                              <td className="px-5 py-3.5 text-right hidden md:table-cell">
                                {getInvoiceOutstanding(inv) > 0 ? (
                                  <span className="text-red-600 font-bold bg-red-50 border border-red-200 px-2 py-0.5 rounded text-xs">
                                    ₹{getInvoiceOutstanding(inv).toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold text-xs">Paid</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-slate-500 hidden lg:table-cell">{formatInvoiceDate(inv)}</td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center justify-center gap-1.5">
                                  {getInvoiceOutstanding(inv) > 0 && inv.customerId && (
                                    <button onClick={() => openCollect(inv)} className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded-lg font-bold cursor-pointer">
                                      Collect
                                    </button>
                                  )}
                                  <button onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-semibold cursor-pointer">
                                    Details
                                  </button>
                                  <Link href={`/invoices/${inv.id}`} className="bg-slate-900 hover:bg-slate-700 text-white text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-semibold">
                                    <ExternalLink size={11} />
                                  </Link>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded Row */}
                            {isExpanded && (
                              <tr className={`${borderClass} bg-slate-50/30 border-b border-slate-100`}>
                                <td colSpan={9} className="px-6 py-5">
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {/* Col 1: Items */}
                                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                        <FileText size={14} className="text-slate-500" />
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Itemized Breakdown</h4>
                                      </div>
                                      <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                                        {(!inv.items || inv.items.length === 0) ? (
                                          <p className="text-xs text-slate-400 italic">No items on record.</p>
                                        ) : inv.items.map((item, idx) => (
                                          <div key={idx} className="flex justify-between items-start text-xs border-b border-slate-50 pb-1.5 last:border-0 last:pb-0">
                                            <div>
                                              <p className="font-semibold text-slate-800">{item.name}</p>
                                              <p className="text-[10px] text-slate-500">Qty: {item.quantity} × ₹{item.price.toLocaleString()}</p>
                                            </div>
                                            <span className="font-bold text-slate-700">₹{(item.quantity * item.price).toLocaleString()}</span>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="mt-3 pt-2 border-t border-slate-100 text-xs space-y-1">
                                        <div className="flex justify-between text-slate-500"><span>Subtotal:</span><span>₹{(inv.subtotal ?? inv.total).toLocaleString()}</span></div>
                                        {inv.discount > 0 && <div className="flex justify-between text-orange-600 font-medium"><span>Discount:</span><span>−{inv.discount}%</span></div>}
                                        <div className="flex justify-between text-slate-800 font-extrabold text-sm pt-1 border-t border-dashed border-slate-100"><span>Total:</span><span>₹{inv.total.toLocaleString()}</span></div>
                                      </div>
                                    </div>

                                    {/* Col 2: Transaction + Repayment History */}
                                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                        <Info size={14} className="text-slate-500" />
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Transaction Details</h4>
                                      </div>
                                      <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between py-0.5"><span className="text-slate-500">Vehicle:</span><span className="font-semibold text-slate-700">{inv.vehicleModel || "—"}</span></div>
                                        <div className="flex justify-between py-0.5"><span className="text-slate-500">Plate:</span><span className="font-mono font-semibold text-slate-700 bg-slate-50 px-1 rounded border border-slate-100">{inv.vehicleNumber || "—"}</span></div>
                                        <div className="flex justify-between py-0.5"><span className="text-slate-500">Method:</span><span className="font-semibold text-slate-800">{inv.paymentMethod}</span></div>
                                        {inv.billedBy && (
                                          <div className="flex justify-between py-0.5"><span className="text-slate-500">Billed by:</span><span className="font-semibold text-slate-800">{inv.billedBy}</span></div>
                                        )}
                                        <div className="flex justify-between py-0.5"><span className="text-slate-500">Paid at billing:</span><span className="font-bold text-green-700">₹{inv.amountPaid.toLocaleString()}</span></div>
                                        <div className="flex justify-between py-0.5"><span className="text-slate-500">Still due:</span><span className={`font-bold ${getInvoiceOutstanding(inv) > 0 ? "text-red-600" : "text-emerald-700"}`}>₹{getInvoiceOutstanding(inv).toLocaleString()}</span></div>
                                        <div className="flex justify-between py-0.5"><span className="text-slate-500">Date:</span><span className="font-medium text-slate-600">{formatInvoiceDate(inv)}</span></div>
                                      </div>
                                      {payments.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-slate-100">
                                          <div className="flex items-center gap-1.5 mb-2">
                                            <History size={12} className="text-slate-400" />
                                            <h5 className="text-[11px] font-bold text-slate-600 uppercase">Linked Repayments ({payments.length})</h5>
                                          </div>
                                          <div className="space-y-1 max-h-28 overflow-y-auto">
                                            {payments.map((p) => (
                                              <div key={p.id} className="flex justify-between items-center text-[11px] bg-green-50/50 p-1.5 rounded border border-green-100">
                                                <span className="font-mono text-slate-600">{formatRepaymentDate(p.date)} ({p.method})</span>
                                                <span className="font-bold text-green-700">+₹{p.amount.toLocaleString()}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Col 3: Actions */}
                                    <div>
                                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                        <Activity size={14} className="text-slate-500" />
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Collections Actions</h4>
                                      </div>
                                      <div className="space-y-2">
                                        {getInvoiceOutstanding(inv) > 0 && inv.customerId && (
                                          <button onClick={() => openCollect(inv)} className="w-full flex items-center gap-2 justify-center bg-green-600 hover:bg-green-700 text-white text-xs py-2.5 px-3 rounded-lg font-bold transition-colors shadow-sm cursor-pointer">
                                            <Wallet size={13} />
                                            Collect ₹{getInvoiceOutstanding(inv).toLocaleString()} Due
                                          </button>
                                        )}
                                        {getInvoiceOutstanding(inv) === 0 && (
                                          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-xs py-2.5 px-3 rounded-lg font-semibold">
                                            <CheckCircle size={13} />Invoice fully settled
                                          </div>
                                        )}
                                        <button onClick={() => window.print()} className="w-full flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs py-2 px-3 rounded-lg font-semibold cursor-pointer">
                                          <Printer size={13} />Print Invoice Receipt
                                        </button>
                                        {inv.customerPhone && (
                                          <a href={`https://wa.me/91${inv.customerPhone}?text=Hi%20${encodeURIComponent(inv.customer)},%20your%20invoice%20${inv.invoiceNumber}%20total%20is%20%E2%82%B9${inv.total}.${getInvoiceOutstanding(inv) > 0 ? `%20Due:%20%E2%82%B9${getInvoiceOutstanding(inv)}.` : "%20Fully%20Paid."}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="w-full flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs py-2 px-3 rounded-lg font-semibold transition-colors">
                                            <MessageCircle size={13} className="text-green-600" />Share via WhatsApp
                                          </a>
                                        )}
                                        <Link href={`/invoices/${inv.id}`} className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-white text-xs py-2.5 px-3 rounded-lg font-semibold transition-colors shadow-sm">
                                          <ExternalLink size={13} />Open Invoice Detail
                                        </Link>
                                      </div>
                                    </div>
                                    <div className="text-[10px] text-slate-400 pt-3 border-t border-slate-50 italic mt-4">
                                      {getInvoiceOutstanding(inv) > 0 ? `⚠ ₹${getInvoiceOutstanding(inv).toLocaleString()} due — click Collect above.` : "✅ All collections complete for this invoice."}
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

                {/* Mobile Invoice Cards (<768px) */}
                <div className="md:hidden space-y-3 p-1">
                  {filtered.map((inv) => {
                    const isPaid = inv.paymentStatus === "Paid";
                    const isPartial = inv.paymentStatus === "Partial";
                    const due = getInvoiceOutstanding(inv);
                    const payments = getDebtPaymentsByInvoice(inv.id);
                    const hasPayments = payments.length > 0;

                    let borderClass = "border-l-4 border-l-slate-300";
                    if (inv.voided) {
                      borderClass = "border-l-4 border-l-red-500 bg-red-50/20";
                    } else if (isPaid) {
                      borderClass = "border-l-4 border-l-emerald-500";
                    } else if (isPartial) {
                      borderClass = "border-l-4 border-l-orange-400";
                    } else {
                      borderClass = "border-l-4 border-l-red-500";
                    }

                    return (
                      <div
                        key={inv.id}
                        className={`bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-3 ${borderClass}`}
                      >
                        {/* Header: Invoice # + Status + Date */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded select-all">
                                {inv.invoiceNumber}
                              </span>
                              {hasPayments && (
                                <span className="text-[9px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded font-bold">
                                  Repaid
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono mt-1">
                              {formatInvoiceDate(inv)}
                            </p>
                          </div>

                          <div>
                            {inv.voided ? (
                              <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase border bg-red-100 text-red-700 border-red-200 whitespace-nowrap">
                                Voided
                              </span>
                            ) : (
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border whitespace-nowrap ${STATUS_BADGE[inv.paymentStatus]}`}>
                                {inv.paymentStatus === "Debt" ? "Debt / Unpaid" : inv.paymentStatus}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Customer & Vehicle Info */}
                        <div className="border-t border-b border-slate-100 py-2 space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-800 text-sm">{inv.customer}</span>
                            {inv.customerPhone && (
                              <span className="text-slate-500 font-mono text-[11px]">{inv.customerPhone}</span>
                            )}
                          </div>
                          {(inv.vehicleModel || inv.vehicleNumber) && (
                            <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                              <Car size={13} className="text-slate-400 shrink-0" />
                              <span>{inv.vehicleModel || "Vehicle"}</span>
                              {inv.vehicleNumber && <span className="font-mono text-[10px] bg-slate-100 border border-slate-200 px-1 rounded">{inv.vehicleNumber}</span>}
                            </p>
                          )}
                        </div>

                        {/* Financial Breakdown */}
                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 font-semibold uppercase block">Total Billed</span>
                            <span className="font-extrabold text-slate-800 text-sm">₹{inv.total.toLocaleString()}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase block">Outstanding</span>
                            {due > 0 ? (
                              <span className="font-extrabold text-red-600 text-sm">₹{due.toLocaleString()}</span>
                            ) : (
                              <span className="font-extrabold text-emerald-600 text-sm">Paid</span>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons with 44px Touch Targets */}
                        <div className="flex items-center justify-between gap-2 pt-1">
                          {due > 0 && inv.customerId && (
                            <button
                              onClick={() => openCollect(inv)}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                            >
                              <Coins size={14} />
                              Collect
                            </button>
                          )}
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                          >
                            <FileText size={14} />
                            Open Invoice
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {filtered.length > 0 && (
            <p className="text-xs text-slate-400 mt-2 px-1">Showing {filtered.length} of {state.invoices.length} invoices</p>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           TAB: REPAYMENTS LEDGER
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "repayments" && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
            <div className="bg-gradient-to-br from-green-950 to-green-900 text-white rounded-2xl p-5 border border-green-800 relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-green-800 rounded-full opacity-20 blur-xl" />
              <p className="text-[10px] uppercase tracking-wider text-green-300 font-semibold mb-1">Total Recovered</p>
              <p className="text-3xl font-extrabold">₹{repayStats.total.toLocaleString()}</p>
              <p className="text-[10px] text-green-300 mt-1">{repayStats.count} payment{repayStats.count !== 1 ? "s" : ""} recorded</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider font-bold">By Method</p>
              <div className="space-y-2">
                {["Cash", "UPI", "Card", "Credit"].map((m) => (
                  repayStats.byMethod[m] ? (
                    <div key={m} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${METHOD_DOT[m]}`} />
                        <span className="text-slate-600 font-medium">{m}</span>
                      </div>
                      <span className="font-bold text-slate-800">₹{repayStats.byMethod[m].toLocaleString()}</span>
                    </div>
                  ) : null
                ))}
                {Object.keys(repayStats.byMethod).length === 0 && (
                  <p className="text-xs text-slate-400 italic">No payments yet.</p>
                )}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">Still Outstanding</p>
                <p className="text-3xl font-extrabold text-red-600">₹{totalDue.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Remaining across all invoices</p>
              </div>
              <button
                onClick={() => { setActiveTab("invoices"); setFilter("Debt"); }}
                className="mt-3 text-[10px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
              >
                <TrendingUp size={11} />
                View Debt Invoices →
              </button>
            </div>
          </div>

          {/* Search + Method filter */}
          <div className="bg-white rounded-2xl border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="relative w-full sm:w-72">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search customer, invoice, note..."
                  value={repaySearch}
                  onChange={(e) => setRepaySearch(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl pl-8 pr-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-400 transition-all placeholder:text-slate-400"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {["All", "Cash", "UPI", "Card", "Credit"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setRepayMethodFilter(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${repayMethodFilter === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {filteredRepayments.length === 0 ? (
              <div className="p-16 text-center">
                <Coins size={32} className="text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">No repayment records yet.</p>
                <p className="text-slate-300 text-xs mt-1">Use the Collect button on any outstanding invoice to record a payment.</p>
              </div>
            ) : (
              <>
                {/* Desktop/Tablet Repayments Table (>=768px) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide border-b border-slate-200">
                        <th className="px-5 py-3 text-left font-semibold">Receipt #</th>
                        <th className="px-5 py-3 text-left font-semibold">Date</th>
                        <th className="px-5 py-3 text-left font-semibold">Customer</th>
                        <th className="px-5 py-3 text-left font-semibold">Invoice</th>
                        <th className="px-5 py-3 text-left font-semibold">Method</th>
                        <th className="px-5 py-3 text-left font-semibold">Collected By</th>
                        <th className="px-5 py-3 text-right font-semibold">Amount</th>
                        <th className="px-5 py-3 text-left font-semibold hidden md:table-cell">Note</th>
                        <th className="px-5 py-3 text-center font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRepayments.map((p) => (
                        <tr key={p.id} className="hover:bg-green-50/30 transition-colors border-l-4 border-l-green-400">
                          <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-800">
                            {p.receiptNumber ? (
                              <span>{p.receiptNumber}</span>
                            ) : (
                              <span className="italic text-slate-400 font-normal">Legacy</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 font-medium text-xs">{formatRepaymentDate(p.date)}</td>
                          <td className="px-5 py-3.5">
                            <span className="font-semibold text-slate-800 text-sm">{p.customerName}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <Link href={`/invoices/${p.invoiceId}`} className="font-mono text-xs text-amber-700 hover:underline bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              {p.invoiceNumber}
                            </Link>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`flex items-center gap-1.5 text-xs font-semibold w-fit px-2.5 py-1 rounded-lg border ${METHOD_COLORS[p.method as PaymentMethod] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${METHOD_DOT[p.method] ?? "bg-slate-400"}`} />
                              {p.method}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-semibold text-slate-700 text-xs bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                              {p.collectedBy}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className="font-extrabold text-green-700 text-base">+₹{p.amount.toLocaleString()}</span>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-400 italic hidden md:table-cell max-w-[160px] truncate">
                            {p.note || "—"}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setPrintReceiptPayment(p)}
                                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                title="Print Payment Receipt"
                              >
                                <Printer size={14} />
                              </button>
                              <button
                                onClick={() => handleShareReceiptWhatsApp(p)}
                                className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                                title="Share WhatsApp Receipt"
                              >
                                <MessageCircle size={14} />
                              </button>
                              <Link href={`/invoices/${p.invoiceId}`} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition" title="View Invoice">
                                <ExternalLink size={14} />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Running total footer */}
                    <tfoot>
                      <tr className="bg-green-50 border-t-2 border-green-200">
                        <td colSpan={6} className="px-5 py-3 text-xs font-bold text-green-800 uppercase tracking-wider">
                          {filteredRepayments.length} record{filteredRepayments.length !== 1 ? "s" : ""} shown
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="font-extrabold text-green-800 text-base">
                            ₹{filteredRepayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}
                          </span>
                        </td>
                        <td colSpan={2} className="hidden md:table-cell" />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile Repayments Stacked Cards (<768px) */}
                <div className="md:hidden space-y-3 p-1">
                  {filteredRepayments.map((p) => (
                    <div
                      key={p.id}
                      className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-3 border-l-4 border-l-emerald-500"
                    >
                      {/* Header: Receipt # + Amount */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded select-all">
                            {p.receiptNumber || "Legacy"}
                          </span>
                          <p className="text-[10px] text-slate-400 font-mono mt-1">
                            {formatRepaymentDate(p.date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-green-700 text-base block font-mono">
                            +₹{p.amount.toLocaleString()}
                          </span>
                          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border mt-0.5 ${METHOD_COLORS[p.method as PaymentMethod] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}>
                            {p.method}
                          </span>
                        </div>
                      </div>

                      {/* Details: Customer + Invoice Reference */}
                      <div className="border-t border-b border-slate-100 py-2 space-y-1 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800 text-sm">{p.customerName}</span>
                          <Link
                            href={`/invoices/${p.invoiceId}`}
                            className="font-mono text-[11px] text-amber-700 hover:underline bg-amber-50 border border-amber-200 px-2 py-0.5 rounded"
                          >
                            {p.invoiceNumber}
                          </Link>
                        </div>
                        <div className="flex justify-between text-slate-500 text-[11px]">
                          <span>Collected by: <strong className="text-slate-700">{p.collectedBy}</strong></span>
                          {p.note && <span className="italic truncate max-w-[150px]">{p.note}</span>}
                        </div>
                      </div>

                      {/* Touch-Friendly Actions (>=44px touch height) */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => setPrintReceiptPayment(p)}
                          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <Printer size={15} />
                          Print Receipt
                        </button>
                        <button
                          onClick={() => handleShareReceiptWhatsApp(p)}
                          className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <MessageCircle size={15} />
                          WhatsApp
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Mobile Total Summary Card */}
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3.5 text-xs font-bold text-green-900 flex justify-between items-center">
                    <span>{filteredRepayments.length} Repayment{filteredRepayments.length !== 1 ? "s" : ""} Total</span>
                    <span className="text-base font-extrabold font-mono text-green-800">
                      ₹{filteredRepayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── Collect Payment Modal ─────────────────────────────────────────── */}
      {collectInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h2 className="font-bold text-slate-800">Collect Payment</h2>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{collectInvoice.invoiceNumber} · {collectInvoice.customer}</p>
              </div>
              <button onClick={closeCollect} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X size={18} /></button>
            </div>
            {collectSuccess ? (
              <div className="p-10 flex flex-col items-center text-center">
                <CheckCircle size={48} className="text-green-500 mb-3" />
                <p className="font-bold text-slate-800">Payment Recorded!</p>
                <p className="text-xs text-slate-500 mt-1">Closing automatically…</p>
              </div>
            ) : (
              <>
                <div className="p-5 space-y-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-3 text-center text-xs">
                    <div><p className="text-slate-400">Total</p><p className="font-bold text-slate-800 text-sm mt-1">₹{collectInvoice.total.toLocaleString()}</p></div>
                    <div><p className="text-slate-400">Paid</p><p className="font-bold text-green-700 text-sm mt-1">₹{collectInvoice.amountPaid.toLocaleString()}</p></div>
                    <div><p className="text-slate-400">Due</p><p className="font-bold text-red-600 text-sm mt-1">₹{getInvoiceOutstanding(collectInvoice).toLocaleString()}</p></div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Repayment Amount (₹)</label>
                    <input type="number" min="1" max={getInvoiceOutstanding(collectInvoice)} value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-400 transition" autoFocus />
                    {Number(collectAmount) > getInvoiceOutstanding(collectInvoice) && (
                      <p className="text-xs text-red-500 font-bold mt-1.5 flex items-center gap-1.5 bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-lg animate-in slide-in-from-top-1">
                        <AlertCircle size={13} />
                        Amount cannot exceed outstanding due of ₹{getInvoiceOutstanding(collectInvoice).toLocaleString()}.
                      </p>
                    )}
                    {Number(collectAmount) <= 0 && collectAmount !== "" && (
                      <p className="text-xs text-red-500 font-bold mt-1.5 flex items-center gap-1.5 bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-lg animate-in slide-in-from-top-1">
                        <AlertCircle size={13} />
                        Amount must be greater than 0.
                      </p>
                    )}
                    {Number(collectAmount) > 0 && Number(collectAmount) <= getInvoiceOutstanding(collectInvoice) && (
                      <p className={`text-xs mt-1.5 font-semibold ${Number(collectAmount) >= getInvoiceOutstanding(collectInvoice) ? "text-green-600" : "text-orange-600"}`}>
                        {Number(collectAmount) >= getInvoiceOutstanding(collectInvoice) ? "✓ Clears invoice fully → Paid" : `₹${(getInvoiceOutstanding(collectInvoice) - Number(collectAmount)).toLocaleString()} still remaining`}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Payment Method</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["Cash", "UPI", "Card"] as PaymentMethod[]).map((m) => (
                        <button key={m} type="button" onClick={() => setCollectMethod(m)}
                          className={`py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${collectMethod === m ? "bg-slate-900 border-slate-900 text-white" : `${METHOD_COLORS[m]} hover:opacity-80`}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Collected By <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      {(["Owner", "Staff"] as const).map((role) => {
                        const active = collectCollectedBy === role;
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => setCollectCollectedBy(role)}
                            className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${active
                                ? "bg-slate-900 border-slate-900 text-white"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                              }`}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Note (optional)</label>
                    <input type="text" value={collectNote} onChange={(e) => setCollectNote(e.target.value)} placeholder="e.g. Paid cash on 22 June"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-400 transition" />
                  </div>
                </div>
                <div className="flex gap-3 px-5 pb-5">
                  <button onClick={closeCollect} className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 cursor-pointer">Cancel</button>
                  <button onClick={handleCollectSubmit} disabled={!collectAmount || Number(collectAmount) <= 0 || Number(collectAmount) > getInvoiceOutstanding(collectInvoice) || !collectCollectedBy}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer">
                    <Wallet size={15} />Record Payment
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Printable Payment Receipt Modal ───────────────────────── */}
      {printReceiptPayment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 max-h-[90vh] overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto border border-slate-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 print:hidden">
              <h3 className="font-bold text-slate-800 text-sm">Payment Receipt Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 bg-slate-900 text-white hover:bg-slate-800 text-xs px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer"
                >
                  <Printer size={13} />
                  Print Receipt
                </button>
                <button
                  onClick={() => setPrintReceiptPayment(null)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 bg-slate-100/70 overflow-y-auto max-h-[75vh]">
              {(() => {
                const targetInv = getInvoiceById(printReceiptPayment.invoiceId);
                if (!targetInv) return <p className="text-slate-500 text-xs">Invoice not found.</p>;
                return (
                  <PrintableReceipt
                    payment={printReceiptPayment}
                    invoice={targetInv}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STAT CARD
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, iconBg, valueClass = "text-slate-800" }: {
  label: string; value: number; icon: React.ReactNode; iconBg: string; valueClass?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start justify-between hover:shadow-sm transition-shadow">
      <div>
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      </div>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
    </div>
  );
}