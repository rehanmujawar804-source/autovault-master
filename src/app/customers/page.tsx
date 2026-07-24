"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import type { Invoice, PaymentMethod } from "@/types";
import Link from "next/link";
import { formatInvoiceDate } from "@/lib/dateUtils";
import { calculateRevenue } from "@/lib/revenueUtils";
import {
  Search,
  Users,
  AlertCircle,
  TrendingUp,
  MessageCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Coins,
  History,
  PhoneCall,
  User,
  Plus,
  X,
  CheckCircle,
  ReceiptText,
  Wallet,
  ShoppingCart,
  Pencil,
} from "lucide-react";
import type { Customer } from "@/types";

type DebtFilter = "All" | "High Debt" | "Partial" | "No Debt";

const HIGH_DEBT_THRESHOLD = 5000;

const METHOD_COLORS: Record<PaymentMethod, string> = {
  Cash: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPI: "bg-blue-50 text-blue-700 border-blue-200",
  Card: "bg-purple-50 text-purple-700 border-purple-200",
  Credit: "bg-red-50 text-red-600 border-red-200",
};

// ─────────────────────────────────────────────────────────────────────────────
//  CUSTOMERS PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const {
    state,
    recordDebtPayment,
    recordCustomerDebtPaymentFIFO,
    getCustomerOutstandingInvoices,
    getDebtPaymentsByCustomer,
    getInvoiceOutstanding,
    updateCustomer,
    showToast,
  } = useStore();
  const { loading, requireAuth } = useRole();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DebtFilter>("All");
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState("");

  // ── Lump-Sum FIFO Collect Modal State ─────────────────────────────────────
  const [lumpSumCustomer, setLumpSumCustomer] = useState<Customer | null>(null);
  const [lumpSumAmountInput, setLumpSumAmountInput] = useState("");
  const [lumpSumMethod, setLumpSumMethod] = useState<PaymentMethod>("Cash");
  const [lumpSumNote, setLumpSumNote] = useState("");
  const [lumpSumCollectedBy, setLumpSumCollectedBy] = useState<"Owner" | "Staff" | "">("");
  const [lumpSumDerivedDebt, setLumpSumDerivedDebt] = useState(0);

  function openLumpSumModal(customer: Customer, currentDebt: number) {
    setLumpSumCustomer(customer);
    setLumpSumDerivedDebt(currentDebt);
    setLumpSumAmountInput(String(currentDebt));
    setLumpSumMethod("Cash");
    setLumpSumNote("");
    setLumpSumCollectedBy("");
  }

  function closeLumpSumModal() {
    setLumpSumCustomer(null);
    setLumpSumAmountInput("");
    setLumpSumNote("");
    setLumpSumCollectedBy("");
  }

  function handleLumpSumSubmit() {
    if (!lumpSumCustomer) return;
    if (!lumpSumCollectedBy) {
      alert("Please select who collected this payment (Owner or Staff).");
      return;
    }
    const numAmount = Math.max(0, Number(lumpSumAmountInput) || 0);
    if (numAmount <= 0) return;

    const outstandingInvoices = getCustomerOutstandingInvoices(lumpSumCustomer.id)
      .sort((a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime());

    let rem = numAmount;
    let totalAllocated = 0;
    let affectedCount = 0;

    for (const inv of outstandingInvoices) {
      if (rem <= 0) break;
      const invDue = getInvoiceOutstanding(inv);
      const alloc = Math.min(rem, invDue);
      if (alloc > 0) {
        totalAllocated += alloc;
        affectedCount++;
        rem -= alloc;
      }
    }

    const unallocated = Math.max(0, numAmount - totalAllocated);

    recordCustomerDebtPaymentFIFO({
      customerId: lumpSumCustomer.id,
      totalAmount: numAmount,
      method: lumpSumMethod,
      note: lumpSumNote.trim() || undefined,
      collectedBy: lumpSumCollectedBy || undefined,
    });

    if (unallocated > 0) {
      showToast(
        `₹${numAmount.toLocaleString()} received. ₹${totalAllocated.toLocaleString()} applied across ${affectedCount} invoice(s) (₹${unallocated.toLocaleString()} unallocated excess).`,
        "info"
      );
    } else {
      showToast(
        `₹${totalAllocated.toLocaleString()} collected and applied across ${affectedCount} invoice(s) using FIFO.`,
        "success"
      );
    }

    closeLumpSumModal();
  }

  function openEditModal(c: Customer) {
    setEditingCustomer(c);
    setEditName(c.name);
    setEditPhone(c.phone || "");
    setEditError("");
  }

  function closeEditModal() {
    setEditingCustomer(null);
    setEditName("");
    setEditPhone("");
    setEditError("");
  }

  function handleSaveEdit() {
    if (!editingCustomer) return;
    const trimmedName = editName.trim();
    const trimmedPhone = editPhone.trim();
    if (!trimmedName) {
      setEditError("Customer name is required.");
      return;
    }
    try {
      updateCustomer({
        ...editingCustomer,
        name: trimmedName,
        phone: trimmedPhone,
      });
      showToast(`Customer "${trimmedName}" updated successfully.`, "success");
      closeEditModal();
    } catch {
      setEditError("Failed to update customer.");
    }
  }

  // ── Collect Payment Modal State ───────────────────────────────────────────
  const [collectInvoice, setCollectInvoice] = useState<Invoice | null>(null);
  const [collectCustomerId, setCollectCustomerId] = useState<string>("");
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>("Cash");
  const [collectNote, setCollectNote] = useState("");
  const [collectSuccess, setCollectSuccess] = useState(false);
  const [collectCollectedBy, setCollectCollectedBy] = useState<"Owner" | "Staff" | "">("");

  // ── Derived stats (from invoice dues, not customer.debt cache) ────────────
  const stats = useMemo(() => {
    const customers = state.customers;
    // Derive each customer's real debt from invoices
    const debtByCustomer: Record<string, number> = {};
    for (const inv of state.invoices) {
      const effOutstanding = getInvoiceOutstanding(inv);
      if (inv.customerId && effOutstanding > 0 && !inv.voided) {
        debtByCustomer[inv.customerId] = (debtByCustomer[inv.customerId] ?? 0) + effOutstanding;
      }
    }
    const totalDebt = Object.values(debtByCustomer).reduce((s, d) => s + d, 0);
    const highDebt = customers.filter((c) => (debtByCustomer[c.id] ?? 0) >= HIGH_DEBT_THRESHOLD);
    const partialDebt = customers.filter(
      (c) => (debtByCustomer[c.id] ?? 0) > 0 && (debtByCustomer[c.id] ?? 0) < HIGH_DEBT_THRESHOLD
    );
    const noDebt = customers.filter((c) => (debtByCustomer[c.id] ?? 0) === 0);
    return {
      total: customers.length,
      totalDebt,
      highDebtCount: highDebt.length,
      partialCount: partialDebt.length,
      noDebtCount: noDebt.length,
      debtByCustomer,
    };
  }, [state.customers, state.invoices]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const { debtByCustomer } = stats;
    let list = [...state.customers].sort(
      (a, b) => (debtByCustomer[b.id] ?? 0) - (debtByCustomer[a.id] ?? 0)
    );

    if (filter === "High Debt") {
      list = list.filter((c) => (debtByCustomer[c.id] ?? 0) >= HIGH_DEBT_THRESHOLD);
    } else if (filter === "Partial") {
      list = list.filter(
        (c) => (debtByCustomer[c.id] ?? 0) > 0 && (debtByCustomer[c.id] ?? 0) < HIGH_DEBT_THRESHOLD
      );
    } else if (filter === "No Debt") {
      list = list.filter((c) => (debtByCustomer[c.id] ?? 0) === 0);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
      );
    }
    return list;
  }, [state.customers, stats, filter, search]);

  // ── Collect Payment Handlers ──────────────────────────────────────────────
  function openCollectModal(invoice: Invoice, customerId: string) {
    setCollectInvoice(invoice);
    setCollectCustomerId(customerId);
    setCollectAmount(String(getInvoiceOutstanding(invoice)));
    setCollectMethod("Cash");
    setCollectNote("");
    setCollectCollectedBy("");
    setCollectSuccess(false);
  }

  function closeCollectModal() {
    setCollectInvoice(null);
    setCollectCustomerId("");
    setCollectAmount("");
    setCollectNote("");
    setCollectCollectedBy("");
    setCollectSuccess(false);
  }

  function handleCollectSubmit() {
    if (!collectInvoice || !collectCustomerId) return;
    if (!collectCollectedBy) {
      alert("Please select who collected this payment (Owner or Staff).");
      return;
    }
    const amount = Math.min(
      Math.max(0, Number(collectAmount) || 0),
      getInvoiceOutstanding(collectInvoice)
    );
    if (amount <= 0) return;

    recordDebtPayment({
      customerId: collectCustomerId,
      invoiceId: collectInvoice.id,
      amount,
      date: new Date().toISOString(),
      method: collectMethod,
      note: collectNote.trim() || undefined,
      collectedBy: collectCollectedBy,
    });
    setCollectSuccess(true);
    setTimeout(() => closeCollectModal(), 1400);
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      <h1 className="text-2xl font-black text-navy-950 mb-6">Customers</h1>

      {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between hover:shadow-sm transition-shadow">
          <div>
            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">Total Registry</p>
            <p className="text-3xl font-extrabold text-slate-800">{stats.total}</p>
            <p className="text-xs text-slate-400 mt-0.5">Active Shop Customers</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-navy-50 flex items-center justify-center text-navy-700">
            <Users size={20} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between hover:shadow-sm transition-shadow">
          <div>
            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">High Debt Accounts</p>
            <p className="text-3xl font-extrabold text-red-600">{stats.highDebtCount}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Over ₹{HIGH_DEBT_THRESHOLD.toLocaleString()} Limit
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-500">
            <AlertCircle size={20} />
          </div>
        </div>

        <div className="bg-gradient-to-br from-navy-950 to-navy-900 text-white rounded-2xl p-5 flex items-center justify-between shadow-sm border border-navy-800 relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-navy-800 rounded-full opacity-20 blur-xl" />
          <div>
            <p className="text-[10px] text-navy-300 mb-1 uppercase tracking-wider font-bold">Outstanding Ledger</p>
            <p className="text-3xl font-extrabold text-yellow-400">
              ₹{stats.totalDebt.toLocaleString()}
            </p>
            <p className="text-[11px] text-navy-300 mt-0.5">Total Receivables</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-navy-800/50 flex items-center justify-center text-yellow-400 shrink-0">
            <TrendingUp size={20} />
          </div>
        </div>
      </div>

      {/* ── High Debt Banner ────────────────────────────────────────────────── */}
      {stats.highDebtCount > 0 && (
        <div className="bg-red-50/80 border border-red-200 rounded-xl p-4 mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 shrink-0">
              <AlertCircle size={15} />
            </div>
            <div>
              <p className="font-semibold text-red-800">Critical Dues Alert</p>
              <p className="text-xs text-red-600 mt-0.5">
                {stats.highDebtCount} customer{stats.highDebtCount > 1 ? "s have" : " has"} exceeded
                the ₹{HIGH_DEBT_THRESHOLD.toLocaleString()} outstanding threshold.
              </p>
            </div>
          </div>
          <button
            onClick={() => setFilter("High Debt")}
            className="bg-red-600 hover:bg-red-700 text-white text-xs px-3.5 py-2 rounded-lg font-bold transition-all shadow-sm shrink-0 cursor-pointer"
          >
            Filter High Debt List
          </button>
        </div>
      )}

      {/* ── Table Card ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200">

        {/* Search + filter bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-xl pl-8 pr-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="flex gap-2 flex-wrap text-sm font-medium">
            {(["All", "High Debt", "Partial", "No Debt"] as DebtFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
                  filter === f
                    ? "bg-navy-950 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f}
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                  filter === f ? "bg-slate-700 text-slate-200" : "bg-slate-200 text-slate-600"
                }`}>
                  {f === "All"
                    ? stats.total
                    : f === "High Debt"
                    ? stats.highDebtCount
                    : f === "Partial"
                    ? stats.partialCount
                    : stats.noDebtCount}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          state.customers.length === 0 ? (
            <div className="p-16 text-center bg-white border border-slate-200 rounded-2xl shadow-sm">
              <Users size={40} className="text-slate-350 mx-auto mb-3" />
              <p className="text-slate-450 text-base font-bold">No registered customers</p>
              <p className="text-slate-350 text-xs mt-1 max-w-sm mx-auto">There are no customer profiles yet. Walk-in bills do not automatically register a profile, but credit/debt sales will create accounts.</p>
              <Link
                href="/billing"
                className="mt-4 inline-flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-xs font-black px-5 py-2.5 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer font-sans"
              >
                <ShoppingCart size={13} />
                POS Billing Terminal
              </Link>
            </div>
          ) : (
            <div className="p-16 text-center bg-white border border-slate-200 rounded-2xl shadow-sm">
              <Search size={40} className="text-slate-350 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-bold">No customers match filters</p>
              <p className="text-slate-350 text-xs mt-1 max-w-xs mx-auto">Try clearing search text or resetting the customer filters.</p>
              <button
                onClick={() => {
                  setSearch("");
                  setFilter("All");
                }}
                className="mt-4 text-xs font-bold text-amber-500 hover:text-amber-600 underline cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide border-b border-slate-200">
                  <th className="px-5 py-3 text-left font-semibold w-8" />
                  <th className="px-5 py-3 text-left font-semibold">Name</th>
                  <th className="px-5 py-3 text-left font-semibold">Phone</th>
                  <th className="px-5 py-3 text-right font-semibold">Debt</th>
                  <th className="px-5 py-3 text-right font-semibold hidden md:table-cell">Total Spent</th>
                  <th className="px-5 py-3 text-center font-semibold hidden lg:table-cell">Visits</th>
                  <th className="px-5 py-3 text-left font-semibold hidden lg:table-cell">Last Visit</th>
                  <th className="px-5 py-3 text-center font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => {
                  const derivedDebt = stats.debtByCustomer[customer.id] ?? 0;
                  const isExpanded = expandedCustomerId === customer.id;
                  const isHighDebt = derivedDebt >= HIGH_DEBT_THRESHOLD;
                  const isPartial = derivedDebt > 0 && derivedDebt < HIGH_DEBT_THRESHOLD;
                  const customerTotalSpent = calculateRevenue(state.invoices, state.salesReturns, undefined, customer.id);
                  const isHighValue = customerTotalSpent >= 15000;
                  const isLoyal = customer.visits >= 5;

                  const outstandingInvoices = getCustomerOutstandingInvoices(customer.id);
                  const customerPayments = getDebtPaymentsByCustomer(customer.id);
                  const totalRecovered = customerPayments.reduce((s, p) => s + p.amount, 0);

                  let borderClass = "border-l-4 border-l-transparent";
                  let bgClass = "hover:bg-slate-50/80";
                  if (isHighDebt) {
                    borderClass = "border-l-4 border-l-red-500";
                    bgClass = "bg-red-50/10 hover:bg-red-50/20";
                  } else if (isPartial) {
                    borderClass = "border-l-4 border-l-orange-400";
                    bgClass = "bg-orange-50/5 hover:bg-orange-50/15";
                  } else {
                    borderClass = "border-l-4 border-l-emerald-500";
                  }
                  if (isExpanded) bgClass = "bg-slate-50/60";

                  return (
                    <Fragment key={customer.id}>
                      <tr className={`transition-colors border-b border-slate-100 ${borderClass} ${bgClass}`}>
                        {/* Expand toggle */}
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() =>
                              setExpandedCustomerId(isExpanded ? null : customer.id)
                            }
                            className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </td>

                        {/* Name */}
                        <td className="px-5 py-3.5">
                          <div
                            className="font-semibold text-slate-800 hover:text-slate-600 cursor-pointer"
                            onClick={() => setExpandedCustomerId(isExpanded ? null : customer.id)}
                          >
                            {customer.name}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {isHighDebt && (
                              <span className="text-[9px] uppercase tracking-wider font-extrabold bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded">
                                High Debt
                              </span>
                            )}
                            {isHighValue && (
                              <span className="text-[9px] uppercase tracking-wider font-extrabold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
                                High Value
                              </span>
                            )}
                            {isLoyal && (
                              <span className="text-[9px] uppercase tracking-wider font-extrabold bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">
                                Loyal Patron
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-700 font-medium">{customer.phone || "—"}</span>
                            {customer.phone && (
                              <a
                                href={`https://wa.me/91${customer.phone}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded font-semibold transition-colors"
                              >
                                <MessageCircle size={11} />
                                Chat
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Debt */}
                        <td className="px-5 py-3.5 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${
                              derivedDebt > 0
                                ? "bg-red-50 text-red-600 border-red-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {derivedDebt > 0 ? `₹${derivedDebt.toLocaleString()}` : "Clear"}
                          </span>
                        </td>

                        {/* Total spent */}
                        <td className="px-5 py-3.5 text-right font-semibold text-slate-800 hidden md:table-cell">
                          ₹{customerTotalSpent.toLocaleString()}
                        </td>

                        {/* Visits */}
                        <td className="px-5 py-3.5 text-center text-slate-700 font-medium hidden lg:table-cell">
                          {customer.visits}
                        </td>

                        {/* Last visit */}
                        <td className="px-5 py-3.5 text-slate-500 font-medium hidden lg:table-cell">
                          {customer.lastVisit || "—"}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {derivedDebt > 0 && (
                              <button
                                onClick={() => openLumpSumModal(customer, derivedDebt)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg transition-colors font-bold cursor-pointer inline-flex items-center gap-1 shadow-xs"
                                title="Collect Customer Debt (FIFO Auto-Apply)"
                              >
                                <Wallet size={12} />
                                Collect Debt
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(customer)}
                              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors font-semibold cursor-pointer inline-flex items-center gap-1"
                              title="Edit Customer"
                            >
                              <Pencil size={12} />
                              Edit
                            </button>
                            <button
                              onClick={() => setExpandedCustomerId(isExpanded ? null : customer.id)}
                              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors font-semibold cursor-pointer"
                            >
                              Ledger
                            </button>
                            <Link
                              href={`/customers/${customer.id}`}
                              className="bg-slate-900 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors font-semibold inline-block"
                            >
                              Profile
                            </Link>
                          </div>
                        </td>
                      </tr>

                      {/* ── Expandable Row ─────────────────────────────────── */}
                      {isExpanded && (
                        <tr className={`${borderClass} bg-slate-50/30 border-b border-slate-100`}>
                          <td colSpan={8} className="px-6 py-5">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                              {/* Column 1: Account Overview */}
                              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                  <User size={14} className="text-slate-500" />
                                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Account Overview</h4>
                                </div>
                                <div className="space-y-2 text-xs">
                                  <div className="flex justify-between py-0.5">
                                    <span className="text-slate-500">Customer Class:</span>
                                    <span className="font-semibold text-slate-800">
                                      {isHighValue && isLoyal ? "Premium VIP" : isHighValue ? "Key Account" : isLoyal ? "Regular Patron" : "Standard"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between py-0.5">
                                    <span className="text-slate-500">Lifetime Value:</span>
                                    <span className="font-bold text-slate-800">₹{customerTotalSpent.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between py-0.5">
                                    <span className="text-slate-500">Total Visits:</span>
                                    <span className="font-semibold text-slate-700">{customer.visits}×</span>
                                  </div>
                                  <div className="flex justify-between py-0.5">
                                    <span className="text-slate-500">Avg Spend:</span>
                                    <span className="font-semibold text-emerald-700">
                                      ₹{customer.visits > 0 ? Math.round(customerTotalSpent / customer.visits).toLocaleString() : "0"}/visit
                                    </span>
                                  </div>
                                  <div className="flex justify-between py-0.5 border-t border-slate-50 pt-2">
                                    <span className="text-slate-500">Total Recovered:</span>
                                    <span className="font-bold text-green-700">
                                      ₹{totalRecovered.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between py-0.5">
                                    <span className="text-slate-500">Still Outstanding:</span>
                                    <span className={`font-bold ${derivedDebt > 0 ? "text-red-600" : "text-emerald-700"}`}>
                                      ₹{derivedDebt.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Column 2: Outstanding Invoices */}
                              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                  <ReceiptText size={14} className="text-slate-500" />
                                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Outstanding Invoices</h4>
                                  {outstandingInvoices.length > 0 && (
                                    <span className="ml-auto bg-red-50 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-200">
                                      {outstandingInvoices.length}
                                    </span>
                                  )}
                                </div>
                                {outstandingInvoices.length === 0 ? (
                                  <div className="flex flex-col items-center py-4 text-center">
                                    <CheckCircle size={24} className="text-emerald-400 mb-2" />
                                    <p className="text-xs text-emerald-700 font-semibold">All clear!</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">No outstanding dues.</p>
                                  </div>
                                ) : (
                                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                    {outstandingInvoices.map((inv) => (
                                      <div
                                        key={inv.id}
                                        className="bg-red-50/40 border border-red-100 rounded-lg p-2.5 flex items-center justify-between gap-2"
                                      >
                                        <div className="min-w-0">
                                          <p className="text-[10px] font-bold text-slate-700 font-mono">{inv.invoiceNumber}</p>
                                          <p className="text-[10px] text-slate-400 mt-0.5">{formatInvoiceDate(inv)}</p>
                                          <p className="text-[10px] text-red-600 font-bold mt-0.5">
                                            Due: ₹{getInvoiceOutstanding(inv).toLocaleString()}
                                          </p>
                                        </div>
                                        <button
                                          onClick={() => openCollectModal(inv, customer.id)}
                                          className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                        >
                                          Collect
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Column 3: Communication & Actions */}
                              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
                                <div>
                                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                    <History size={14} className="text-slate-500" />
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Engagement Controls</h4>
                                  </div>
                                  <div className="space-y-2">
                                    {customer.phone ? (
                                      <>
                                        <a
                                          href={`https://wa.me/91${customer.phone}?text=Dear%20${encodeURIComponent(customer.name)},%20this%20is%20a%20reminder%20regarding%20your%20outstanding%20due%20of%20%E2%82%B9${derivedDebt}%20at%20AutoVault.`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="w-full flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs py-2 px-3 rounded-lg font-semibold transition-colors"
                                        >
                                          <MessageCircle size={13} className="text-green-600" />
                                          Send WhatsApp Reminder
                                        </a>
                                        <a
                                          href={`tel:${customer.phone}`}
                                          className="w-full flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs py-2 px-3 rounded-lg font-semibold transition-colors"
                                        >
                                          <PhoneCall size={13} className="text-blue-600" />
                                          Call {customer.phone}
                                        </a>
                                      </>
                                    ) : (
                                      <p className="text-xs text-slate-400 italic">No contact available.</p>
                                    )}
                                    <Link
                                      href={`/customers/${customer.id}`}
                                      className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-white text-xs py-2.5 px-3 rounded-lg font-semibold transition-colors shadow-sm"
                                    >
                                      <Plus size={13} />
                                      View Full Profile
                                    </Link>
                                  </div>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-4 pt-2 border-t border-slate-50 italic">
                                  {derivedDebt > 0
                                    ? `⚠ ₹${derivedDebt.toLocaleString()} due — collect payment above.`
                                    : "✅ Account in healthy standing."}
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
        <p className="text-xs text-slate-400 mt-2 px-1">
          Showing {filtered.length} of {state.customers.length} customers
        </p>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
           COLLECT PAYMENT MODAL
      ─────────────────────────────────────────────────────────────────────── */}
      {collectInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h2 className="font-bold text-slate-800">Collect Payment</h2>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{collectInvoice.invoiceNumber}</p>
              </div>
              <button
                onClick={closeCollectModal}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
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
                  {/* Invoice summary */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-3 text-center text-xs">
                    <div>
                      <p className="text-slate-400 font-medium">Invoice Total</p>
                      <p className="font-bold text-slate-800 text-sm mt-1">₹{collectInvoice.total.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Already Paid</p>
                      <p className="font-bold text-green-700 text-sm mt-1">₹{collectInvoice.amountPaid.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Due Now</p>
                      <p className="font-bold text-red-600 text-sm mt-1">₹{getInvoiceOutstanding(collectInvoice).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Amount input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Repayment Amount (₹)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={getInvoiceOutstanding(collectInvoice)}
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-400 transition"
                      autoFocus
                    />
                    {Number(collectAmount) > 0 && (
                      <p className={`text-xs mt-1.5 font-semibold ${
                        Number(collectAmount) >= getInvoiceOutstanding(collectInvoice)
                          ? "text-green-600"
                          : "text-orange-600"
                      }`}>
                        {Number(collectAmount) >= getInvoiceOutstanding(collectInvoice)
                          ? "✓ Clears invoice fully (Paid)"
                          : `₹${(getInvoiceOutstanding(collectInvoice) - Number(collectAmount)).toLocaleString()} still remaining`}
                      </p>
                    )}
                  </div>

                  {/* Payment method */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Payment Method
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {(["Cash", "UPI", "Card", "Credit"] as PaymentMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setCollectMethod(m)}
                          className={`py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            collectMethod === m
                              ? "bg-slate-900 border-slate-900 text-white"
                              : `${METHOD_COLORS[m]} hover:opacity-80`
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Collected By */}
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

                  {/* Note */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Note (optional)
                    </label>
                    <input
                      type="text"
                      value={collectNote}
                      onChange={(e) => setCollectNote(e.target.value)}
                      placeholder="e.g. Partial payment by cash on shop visit"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-400 transition"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-5 pb-5">
                  <button
                    onClick={closeCollectModal}
                    className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCollectSubmit}
                    disabled={!collectAmount || Number(collectAmount) <= 0 || !collectCollectedBy}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Wallet size={15} />
                    Record Payment
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Customer Modal ──────────────────────────────────────────────── */}
      {editingCustomer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
                  <Pencil size={15} />
                </div>
                <h2 className="font-bold text-slate-800 text-base">Edit Customer Profile</h2>
              </div>
              <button
                onClick={closeEditModal}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {editError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-all font-medium"
                  placeholder="e.g. Rahul Sharma"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-all font-mono"
                  placeholder="e.g. 9876543210"
                />
              </div>
              <div className="text-[11px] text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                Note: Updating name or phone number maintains the customer&apos;s transaction history, debt ledger, and invoice records intact under Customer ID <span className="font-mono font-semibold">{editingCustomer.id}</span>.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 p-4 bg-slate-50 border-t border-slate-200">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lump-Sum FIFO Collect Modal ──────────────────────────────────────── */}
      {lumpSumCustomer && (() => {
        const numAmount = Math.max(0, Number(lumpSumAmountInput) || 0);
        const outstandingInvoices = getCustomerOutstandingInvoices(lumpSumCustomer.id)
          .sort((a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime());

        let rem = numAmount;
        let totalAllocated = 0;
        let affectedCount = 0;

        const previewList = outstandingInvoices.map((inv) => {
          const invDue = getInvoiceOutstanding(inv);
          const alloc = Math.min(rem, invDue);
          if (alloc > 0) {
            totalAllocated += alloc;
            affectedCount++;
            rem = Math.max(0, rem - alloc);
          }
          return { inv, due: invDue, alloc };
        });

        const unallocatedExcess = Math.max(0, numAmount - totalAllocated);

        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
                    <Wallet size={16} />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800 text-base">Collect Customer Debt (FIFO)</h2>
                    <p className="text-xs text-slate-500">{lumpSumCustomer.name}</p>
                  </div>
                </div>
                <button
                  onClick={closeLumpSumModal}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Outstanding Debt Info */}
                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Total Outstanding Debt</p>
                    <p className="text-xl font-bold text-red-700 font-mono mt-0.5">₹{lumpSumDerivedDebt.toLocaleString()}</p>
                  </div>
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-red-200">
                    {outstandingInvoices.length} Unpaid Invoice{outstandingInvoices.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Amount Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Payment Amount Received (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={lumpSumAmountInput}
                    onChange={(e) => setLumpSumAmountInput(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-base font-mono font-bold bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                    placeholder="Enter lump-sum payment amount..."
                  />
                </div>

                {/* Live FIFO Preview breakdown */}
                {numAmount > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex justify-between items-center text-xs border-b border-slate-200 pb-2">
                      <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">FIFO Auto-Allocation Preview</span>
                      <span className="text-emerald-700 font-bold font-mono">₹{totalAllocated.toLocaleString()} Applied</span>
                    </div>
                    {unallocatedExcess > 0 && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2.5 rounded-lg flex items-start gap-2">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <span>
                          ₹{unallocatedExcess.toLocaleString()} payment exceeds total debt. ₹{totalAllocated.toLocaleString()} will settle all outstanding invoices; ₹{unallocatedExcess.toLocaleString()} remains unallocated.
                        </span>
                      </div>
                    )}
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {previewList.map(({ inv, due, alloc }) => (
                        <div
                          key={inv.id}
                          className={`flex justify-between items-center text-xs p-2 rounded-lg border ${
                            alloc > 0
                              ? alloc >= due
                                ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                                : "bg-blue-50/70 border-blue-200 text-blue-900"
                              : "bg-white border-slate-200 text-slate-400 opacity-60"
                          }`}
                        >
                          <div>
                            <span className="font-mono font-bold">{inv.invoiceNumber}</span>
                            <span className="text-[10px] text-slate-500 ml-2">Due: ₹{due.toLocaleString()}</span>
                          </div>
                          <div className="font-mono font-bold">
                            {alloc > 0 ? (
                              <span className={alloc >= due ? "text-emerald-700" : "text-blue-700"}>
                                +₹{alloc.toLocaleString()} {alloc >= due ? "(Settled)" : "(Partial)"}
                              </span>
                            ) : (
                              <span>₹0</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Collected By */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Payment Collected By <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["Owner", "Staff"] as const).map((who) => (
                      <button
                        key={who}
                        type="button"
                        onClick={() => setLumpSumCollectedBy(who)}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          lumpSumCollectedBy === who
                            ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {who}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Method */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Cash", "UPI", "Card"] as PaymentMethod[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setLumpSumMethod(m)}
                        className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          lumpSumMethod === m
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Notes / Payment Reference
                  </label>
                  <input
                    type="text"
                    value={lumpSumNote}
                    onChange={(e) => setLumpSumNote(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                    placeholder="e.g. Bank Ref / Cheque # / Cash payment..."
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-5 py-4 bg-slate-50 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeLumpSumModal}
                  className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLumpSumSubmit}
                  disabled={!numAmount || numAmount <= 0 || !lumpSumCollectedBy}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Wallet size={14} />
                  Record Lump-Sum Payment
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}