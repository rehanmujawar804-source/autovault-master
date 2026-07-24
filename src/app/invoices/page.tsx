"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import type { Invoice, PaymentMethod, PaymentStatus } from "@/types";
import Link from "next/link";
import { formatInvoiceDate, formatRepaymentDate } from "@/lib/dateUtils";
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
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  STYLE MAPS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PaymentStatus, string> = {
  Paid:    "bg-green-100 text-green-700 border-green-200",
  Partial: "bg-orange-100 text-orange-700 border-orange-200",
  Debt:    "bg-red-100 text-red-600 border-red-200",
};

const METHOD_BADGE: Record<string, string> = {
  Cash:   "bg-emerald-50 text-emerald-700",
  UPI:    "bg-blue-50 text-blue-700",
  Card:   "bg-purple-50 text-purple-700",
  Credit: "bg-red-50 text-red-600",
};

const METHOD_COLORS: Record<PaymentMethod, string> = {
  Cash:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPI:    "bg-blue-50 text-blue-700 border-blue-200",
  Card:   "bg-purple-50 text-purple-700 border-purple-200",
  Credit: "bg-red-50 text-red-600 border-red-200",
};

const METHOD_DOT: Record<string, string> = {
  Cash:   "bg-emerald-500",
  UPI:    "bg-blue-500",
  Card:   "bg-purple-500",
  Credit: "bg-red-500",
};

type FilterStatus = "All" | PaymentStatus;
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

  // ── Derived counts ────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const all = state.invoices;
    return {
      total:   all.length,
      paid:    all.filter((i) => i.paymentStatus === "Paid").length,
      partial: all.filter((i) => i.paymentStatus === "Partial").length,
      debt:    all.filter((i) => i.paymentStatus === "Debt").length,
    };
  }, [state.invoices]);

  // ── Filtered invoices ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...state.invoices].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    if (filter !== "All") {
      list = list.filter((i) => i.paymentStatus === filter);
    }
    if (voidFilter === "Normal") {
      list = list.filter((i) => !i.voided);
    } else if (voidFilter === "Voided") {
      list = list.filter((i) => i.voided);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(q) ||
          i.customer.toLowerCase().includes(q) ||
          i.customerPhone.includes(q)
      );
    }
    return list;
  }, [state.invoices, filter, voidFilter, search]);

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
    <div>
      {/* ── Page header + tab switcher ───────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-navy-950">Invoice History</h1>
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveTab("invoices")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "invoices"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileText size={14} />
            Invoices
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${activeTab === "invoices" ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>
              {counts.total}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("repayments")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "repayments"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Coins size={14} />
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
              <StatCard label="Partial" value={counts.partial} icon={<Clock size={16} />} iconBg="bg-orange-50 text-orange-500" valueClass="text-orange-600" />
              <StatCard label="Debt / Unpaid" value={counts.debt} icon={<AlertCircle size={16} />} iconBg="bg-red-50 text-red-500" valueClass="text-red-600" />
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
                    className="font-semibold text-yellow-400 hover:text-yellow-300 cursor-pointer"
                  >
                    View Repayments →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Search + Filter ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 mb-1">
            <div className="p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-b border-slate-100">
              <div className="relative w-full sm:w-72">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search invoice, customer, phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl pl-8 pr-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all placeholder:text-slate-400"
                />
              </div>
              <div className="flex gap-2 flex-wrap text-sm">
                {(["All", "Paid", "Partial", "Debt"] as FilterStatus[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
                      filter === f ? "bg-navy-950 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {f === "Debt" ? "Debt / Unpaid" : f}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${filter === f ? "bg-slate-700 text-slate-200" : "bg-slate-200 text-slate-600"}`}>
                      {f === "All" ? counts.total : f === "Paid" ? counts.paid : f === "Partial" ? counts.partial : counts.debt}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
              <div className="p-16 text-center bg-white border border-slate-200 rounded-2xl shadow-sm">
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide border-b border-slate-200">
                      <th className="px-5 py-3 text-left font-semibold">Invoice</th>
                      <th className="px-5 py-3 text-left font-semibold">Customer</th>
                      <th className="px-5 py-3 text-left font-semibold hidden md:table-cell">Phone</th>
                      <th className="px-5 py-3 text-left font-semibold hidden lg:table-cell">Method</th>
                      <th className="px-5 py-3 text-left font-semibold">Status</th>
                      <th className="px-5 py-3 text-right font-semibold">Total</th>
                      <th className="px-5 py-3 text-right font-semibold hidden md:table-cell">Due</th>
                      <th className="px-5 py-3 text-left font-semibold hidden lg:table-cell">Date</th>
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
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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
                                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Repayment History</p>
                                        </div>
                                        <div className="space-y-1.5 max-h-28 overflow-y-auto pr-0.5">
                                          {payments.map((p) => (
                                            <div
                                              key={p.id}
                                              className={`flex flex-col rounded-lg px-2.5 py-1 text-[10px] border ${
                                                p.voided
                                                  ? "bg-red-50 border-red-200 opacity-70"
                                                  : "bg-green-50 border-green-100"
                                              }`}
                                            >
                                              <div className="flex justify-between items-center">
                                                <span className={`font-bold ${p.voided ? "text-red-600 line-through" : "text-green-700"}`}>
                                                  ₹{p.amount.toLocaleString()}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                  <span className="text-slate-400 font-mono">{formatRepaymentDate(p.date)}</span>
                                                  {p.voided && (
                                                    <span className="text-[9px] font-extrabold uppercase bg-red-600 text-white px-1 py-0.5 rounded">
                                                      VOIDED
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              <p className="text-[10px] text-slate-500 mt-0.5">
                                                via {p.method} · collected by <span className="font-semibold">{p.collectedBy}</span>
                                              </p>
                                              {p.voided && p.voidReason && (
                                                <p className="text-red-600 italic mt-0.5">Voided: {p.voidReason}</p>
                                              )}
                                              {p.note && !p.voided && <p className="text-slate-400 italic mt-0.5">{p.note}</p>}
                                            </div>
                                          ))}
                                        </div>
                                        <p className="text-[10px] text-right text-green-700 font-bold mt-1.5">
                                          Total repaid (active): ₹{payments.filter((p) => !p.voided).reduce((s, p) => s + p.amount, 0).toLocaleString()}
                                        </p>
                                      </div>
                                    )}
                                    {inv.notes && <div className="mt-3 p-2 bg-slate-50 border border-slate-100 rounded-lg text-[11px] text-slate-600 italic">&ldquo;{inv.notes}&rdquo;</div>}
                                  </div>

                                  {/* Col 3: Actions */}
                                  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
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
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      repayMethodFilter === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide border-b border-slate-200">
                      <th className="px-5 py-3 text-left font-semibold">#</th>
                      <th className="px-5 py-3 text-left font-semibold">Date</th>
                      <th className="px-5 py-3 text-left font-semibold">Customer</th>
                      <th className="px-5 py-3 text-left font-semibold">Invoice</th>
                      <th className="px-5 py-3 text-left font-semibold">Method</th>
                      <th className="px-5 py-3 text-left font-semibold">Collected By</th>
                      <th className="px-5 py-3 text-right font-semibold">Amount</th>
                      <th className="px-5 py-3 text-left font-semibold hidden md:table-cell">Note</th>
                      <th className="px-5 py-3 text-center font-semibold hidden md:table-cell">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRepayments.map((p, idx) => (
                      <tr key={p.id} className="hover:bg-green-50/30 transition-colors border-l-4 border-l-green-400">
                        <td className="px-5 py-3.5 text-xs text-slate-400 font-medium">{filteredRepayments.length - idx}</td>
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
                        <td className="px-5 py-3.5 text-center hidden md:table-cell">
                          <Link href={`/invoices/${p.invoiceId}`} className="text-slate-400 hover:text-slate-700">
                            <ExternalLink size={13} />
                          </Link>
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
                    <div className="grid grid-cols-4 gap-2">
                      {(["Cash", "UPI", "Card", "Credit"] as PaymentMethod[]).map((m) => (
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
                            className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                              active
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