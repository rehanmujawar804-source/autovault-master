"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import { calculateRevenue } from "@/lib/revenueUtils";
import { calculateProfit } from "@/lib/profitUtils";
import type { FinanceCategory, PaymentMethod, FinanceTransaction } from "@/types";
import {
  Wallet,
  Coins,
  Landmark,
  Smartphone,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Filter,
  Search,
  RefreshCw,
  Info,
  ShieldAlert,
  Users,
  Truck,
  FileText,
  Package,
  CheckCircle2,
  DollarSign,
  Layers,
  Receipt,
  Tag,
  Clock,
  ChevronRight,
  HelpCircle,
  BarChart3,
} from "lucide-react";

function formatDisplayDate(dateStr?: string) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) + " " + d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

function todayISOString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstDayOfMonthISOString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function currentYearMonthString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export default function FinancePage() {
  const router = useRouter();
  const { isOwner, loading } = useRole();

  const {
    state,
    getTotalCashAvailable,
    getCashBalance,
    getBankBalance,
    getUPIBalance,
    getTodayIncome,
    getTodayExpense,
    getMonthlyIncome,
    getMonthlyExpense,
    getCashFlow,
    getExpenseByCategory,
    getIncomeByCategory,
    getTotalSupplierOutstanding,
    getTotalOutstandingDebt,
  } = useStore();

  // Role Guard
  useEffect(() => {
    if (!loading && !isOwner) {
      router.push("/dashboard");
    }
  }, [loading, isOwner, router]);

  // Date Range State for Cash Flow Summary & Filtered Ledger
  const [fromDate, setFromDate] = useState(() => firstDayOfMonthISOString());
  const [toDate, setToDate] = useState(() => todayISOString());

  // Ledger Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | "Income" | "Expense">("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [methodFilter, setMethodFilter] = useState<string>("All");
  const [accountFilter, setAccountFilter] = useState<string>("All");

  // Informational Guide Toggle
  const [showConceptGuide, setShowConceptGuide] = useState(true);

  // ── Canonical Account Balances ──────────────────────────────────────────────
  const totalAvailable = useMemo(() => getTotalCashAvailable(), [state.financeTransactions, state.financeAccounts]);
  const cashBalance = useMemo(() => getCashBalance(), [state.financeTransactions, state.financeAccounts]);
  const bankBalance = useMemo(() => getBankBalance(), [state.financeTransactions, state.financeAccounts]);
  const upiBalance = useMemo(() => getUPIBalance(), [state.financeTransactions, state.financeAccounts]);

  // ── Daily & Monthly Cash Flows ─────────────────────────────────────────────
  const currentMonthStr = useMemo(() => currentYearMonthString(), []);
  const todayIncome = useMemo(() => getTodayIncome(), [state.financeTransactions]);
  const todayExpense = useMemo(() => getTodayExpense(), [state.financeTransactions]);
  const todayNetCashFlow = todayIncome - todayExpense;

  const monthlyIncome = useMemo(() => getMonthlyIncome(currentMonthStr), [state.financeTransactions, currentMonthStr]);
  const monthlyExpense = useMemo(() => getMonthlyExpense(currentMonthStr), [state.financeTransactions, currentMonthStr]);
  const monthlyNetCashFlow = monthlyIncome - monthlyExpense;

  // ── Date Range Cash Flow ───────────────────────────────────────────────────
  const rangeNetCashFlow = useMemo(() => {
    return getCashFlow(fromDate, toDate);
  }, [fromDate, toDate, getCashFlow, state.financeTransactions]);

  // ── Business Metrics (Contextual Comparison) ────────────────────────────────
  const totalRevenue = useMemo(() => calculateRevenue(state.invoices, state.salesReturns), [state.invoices, state.salesReturns]);
  const totalProfit = useMemo(() => calculateProfit(state.invoices, state.salesReturns), [state.invoices, state.salesReturns]);
  const totalCustomerReceivables = useMemo(() => getTotalOutstandingDebt(), [state.invoices, state.salesReturns]);
  const totalSupplierPayables = useMemo(() => getTotalSupplierOutstanding(), [state.purchases, state.purchaseReturns, state.supplierPayments]);

  // ── Category Summaries ─────────────────────────────────────────────────────
  const incomeCategories: FinanceCategory[] = ["Sale", "Customer Payment", "Purchase Return", "Adjustment"];
  const expenseCategories: FinanceCategory[] = ["Inventory Purchase", "Supplier Payment", "Sales Return", "Invoice Void", "Payment Void", "Adjustment"];

  const incomeByCategoryData = useMemo(() => {
    return incomeCategories.map((cat) => ({
      category: cat,
      amount: getIncomeByCategory(cat),
    })).filter((item) => item.amount > 0 || state.financeTransactions?.some((t) => t.category === item.category));
  }, [state.financeTransactions, getIncomeByCategory]);

  const expenseByCategoryData = useMemo(() => {
    return expenseCategories.map((cat) => ({
      category: cat,
      amount: getExpenseByCategory(cat),
    })).filter((item) => item.amount > 0 || state.financeTransactions?.some((t) => t.category === item.category));
  }, [state.financeTransactions, getExpenseByCategory]);

  // ── All Dynamic Categories for Filter Dropdown ──────────────────────────────
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    (state.financeTransactions || []).forEach((t) => set.add(t.category));
    return ["All", ...Array.from(set).sort()];
  }, [state.financeTransactions]);

  // ── Chronological Filtered Finance Ledger ──────────────────────────────────
  const filteredLedger = useMemo(() => {
    let txs = [...(state.financeTransactions || [])];

    // Sort Newest First
    txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Type Filter
    if (typeFilter !== "All") {
      txs = txs.filter((t) => t.type === typeFilter);
    }

    // Category Filter
    if (categoryFilter !== "All") {
      txs = txs.filter((t) => t.category === categoryFilter);
    }

    // Method Filter
    if (methodFilter !== "All") {
      txs = txs.filter((t) => t.method === methodFilter);
    }

    // Account Filter
    if (accountFilter !== "All") {
      txs = txs.filter((t) => t.accountId === accountFilter);
    }

    // Date Range Filter (inclusive)
    if (fromDate) {
      txs = txs.filter((t) => t.date >= fromDate);
    }
    if (toDate) {
      txs = txs.filter((t) => t.date <= toDate + "T23:59:59.999Z");
    }

    // Search Query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      txs = txs.filter(
        (t) =>
          (t.notes || "").toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.referenceId.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.method.toLowerCase().includes(q)
      );
    }

    return txs;
  }, [
    state.financeTransactions,
    typeFilter,
    categoryFilter,
    methodFilter,
    accountFilter,
    fromDate,
    toDate,
    searchQuery,
  ]);

  // ── Filtered Summary Totals ────────────────────────────────────────────────
  const filteredSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredLedger.forEach((t) => {
      if (t.type === "Income") income += t.amount;
      else if (t.type === "Expense") expense += t.amount;
    });
    return {
      income,
      expense,
      net: income - expense,
      count: filteredLedger.length,
    };
  }, [filteredLedger]);

  if (loading || !isOwner) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Loading Finance Module...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-navy-950 text-yellow-400 flex items-center justify-center shrink-0 shadow-md ring-1 ring-black/5">
            <Wallet size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Finance Control Center</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Owner Access Only
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Track business cash, bank, UPI balances, income, expenses, and net cash flow.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowConceptGuide((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <HelpCircle size={14} className="text-slate-500" />
            {showConceptGuide ? "Hide Guide" : "Accounting Guide"}
          </button>
        </div>
      </div>

      {/* ── OWNER FINANCIAL POSITION CONTROL CENTER ────────────────────────────── */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-yellow-400 flex items-center gap-2">
              <ShieldAlert size={16} />
              Owner Financial Overview
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Separation of Available Cash Funds, Receivables, Payables, Revenue, and Profit.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg">
            Canonical Multi-System State
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Available Funds */}
          <div className="bg-slate-800/80 border border-emerald-500/30 rounded-xl p-3.5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">Available Funds</span>
            <p className="text-lg font-black text-white">₹{totalAvailable.toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 block">Cash + Bank + UPI</span>
          </div>

          {/* Receivables */}
          <Link href="/customers" className="bg-slate-800/80 border border-amber-500/30 rounded-xl p-3.5 space-y-1 hover:border-amber-400 transition-colors block group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">Receivables</span>
              <ChevronRight size={12} className="text-slate-500 group-hover:text-amber-400 transition-colors" />
            </div>
            <p className="text-lg font-black text-white">₹{totalCustomerReceivables.toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 block">Customer Debt</span>
          </Link>

          {/* Payables */}
          <Link href="/suppliers" className="bg-slate-800/80 border border-rose-500/30 rounded-xl p-3.5 space-y-1 hover:border-rose-400 transition-colors block group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">Payables</span>
              <ChevronRight size={12} className="text-slate-500 group-hover:text-rose-400 transition-colors" />
            </div>
            <p className="text-lg font-black text-white">₹{totalSupplierPayables.toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 block">Supplier Dues</span>
          </Link>

          {/* Revenue */}
          <Link href="/analytics" className="bg-slate-800/80 border border-blue-500/30 rounded-xl p-3.5 space-y-1 hover:border-blue-400 transition-colors block group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 block">Revenue</span>
              <ChevronRight size={12} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
            </div>
            <p className="text-lg font-black text-white">₹{totalRevenue.toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 block">Sales Value</span>
          </Link>

          {/* Profit */}
          <Link href="/analytics" className="bg-slate-800/80 border border-indigo-500/30 rounded-xl p-3.5 space-y-1 hover:border-indigo-400 transition-colors block group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">Gross Profit</span>
              <ChevronRight size={12} className="text-slate-500 group-hover:text-indigo-400 transition-colors" />
            </div>
            <p className="text-lg font-black text-white">₹{totalProfit.toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 block">Revenue − COGS</span>
          </Link>

          {/* Monthly Net Cash Flow */}
          <div className="bg-slate-800/80 border border-teal-500/30 rounded-xl p-3.5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block">Monthly Net Cash</span>
            <p className={`text-lg font-black ${monthlyNetCashFlow >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              ₹{monthlyNetCashFlow.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400 block">This Month's In − Out</span>
          </div>
        </div>
      </div>

      {/* ── CONCEPT SEPARATION GUIDE BANNER (TOGGLEABLE) ───────────────────────── */}
      {showConceptGuide && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 space-y-3 relative text-amber-900 text-xs">
          <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
            <span className="font-extrabold flex items-center gap-1.5 text-amber-950 uppercase tracking-wider text-[11px]">
              <Info size={15} className="text-amber-600" />
              AutoVault ERP Financial Separation Principle
            </span>
            <button
              type="button"
              onClick={() => setShowConceptGuide(false)}
              className="text-amber-700 hover:text-amber-950 text-[11px] font-bold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 leading-relaxed">
            <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50">
              <span className="font-bold text-amber-950 block mb-0.5">1. Available Funds ≠ Revenue</span>
              <p className="text-[11px] text-amber-800">
                Available Funds represent actual money in Cash, Bank, and UPI accounts. Revenue is the total accrual value of completed sales.
              </p>
            </div>
            <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50">
              <span className="font-bold text-amber-950 block mb-0.5">2. Profit ≠ Cash Flow</span>
              <p className="text-[11px] text-amber-800">
                Gross Profit measures sales revenue minus item cost (COGS). Net Cash Flow measures actual physical money received minus money paid out.
              </p>
            </div>
            <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50">
              <span className="font-bold text-amber-950 block mb-0.5">3. Debt & Payables ≠ Cash</span>
              <p className="text-[11px] text-amber-800">
                Customer Receivables and Supplier Payables are unpaid balance obligations. They do not enter the Finance Ledger until real money moves.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── ACCOUNT BALANCE KPI STRIP ────────────────────────────────────────── */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
          Available Financial Account Balances (Canonical Backend Selectors)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Available Funds */}
          <div className="bg-gradient-to-br from-navy-950 to-slate-900 text-white rounded-2xl p-5 border border-navy-800 shadow-md space-y-3 relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-yellow-400/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Total Available Funds</span>
              <div className="w-8 h-8 rounded-xl bg-yellow-400/10 text-yellow-400 flex items-center justify-center">
                <Coins size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black text-white">₹{totalAvailable.toLocaleString()}</p>
              <p className="text-[11px] text-slate-400 mt-1">Cash + Bank + UPI Account Balances</p>
            </div>
          </div>

          {/* Cash Account */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3 hover:border-emerald-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Cash Account</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Coins size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">₹{cashBalance.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 mt-1">Physical cash in register (acc-cash)</p>
            </div>
          </div>

          {/* Bank Account */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3 hover:border-blue-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Bank Account</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Landmark size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">₹{bankBalance.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 mt-1">Card & bank transfers (acc-bank)</p>
            </div>
          </div>

          {/* UPI Account */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3 hover:border-violet-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">UPI Account</span>
              <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                <Smartphone size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">₹{upiBalance.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 mt-1">Digital UPI collections (acc-upi)</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── DAILY & MONTHLY CASH FLOW CARDS ──────────────────────────────────── */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
          Daily & Monthly Real Monetary Flow (Income vs Expenses)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Today's Money In & Out */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Today's Activity</span>
              <span className="text-[11px] text-slate-400">{todayISOString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                <span className="text-[10px] font-bold uppercase text-emerald-700 block">Money In</span>
                <p className="text-lg font-black text-emerald-700 mt-0.5">₹{todayIncome.toLocaleString()}</p>
              </div>
              <div className="bg-rose-50/60 p-3 rounded-xl border border-rose-100">
                <span className="text-[10px] font-bold uppercase text-rose-700 block">Money Out</span>
                <p className="text-lg font-black text-rose-700 mt-0.5">₹{todayExpense.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500 font-medium">Today's Net Cash Flow</span>
              <span className={`text-sm font-black ${todayNetCashFlow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {todayNetCashFlow >= 0 ? "+" : ""}₹{todayNetCashFlow.toLocaleString()}
              </span>
            </div>
          </div>

          {/* This Month's Money In & Out */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">This Month's Activity</span>
              <span className="text-[11px] text-slate-400">{currentMonthStr}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                <span className="text-[10px] font-bold uppercase text-emerald-700 block">Money In</span>
                <p className="text-lg font-black text-emerald-700 mt-0.5">₹{monthlyIncome.toLocaleString()}</p>
              </div>
              <div className="bg-rose-50/60 p-3 rounded-xl border border-rose-100">
                <span className="text-[10px] font-bold uppercase text-rose-700 block">Money Out</span>
                <p className="text-lg font-black text-rose-700 mt-0.5">₹{monthlyExpense.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500 font-medium">Monthly Net Cash Flow</span>
              <span className={`text-sm font-black ${monthlyNetCashFlow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {monthlyNetCashFlow >= 0 ? "+" : ""}₹{monthlyNetCashFlow.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Date-Range Cash Flow Summary Selector Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-500" />
                Custom Date Range Net Flow
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">From</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">To</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy-900"
                />
              </div>
            </div>
            <div className="bg-slate-900 text-white p-3 rounded-xl flex items-center justify-between">
              <span className="text-xs text-slate-300 font-medium">Net Cash Flow (Range)</span>
              <span className={`text-base font-black ${rangeNetCashFlow >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {rangeNetCashFlow >= 0 ? "+" : ""}₹{rangeNetCashFlow.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── CATEGORY BREAKDOWN SUMMARIES (INCOME & EXPENSE) ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income by Category */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-600" />
              Income Breakdown by Category (Canonical Selector)
            </h3>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              Total In
            </span>
          </div>

          <div className="space-y-3">
            {incomeByCategoryData.map((item) => {
              const maxIncome = Math.max(...incomeByCategoryData.map((i) => i.amount), 1);
              const pct = Math.round((item.amount / maxIncome) * 100);
              return (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{item.category}</span>
                    <span className="font-bold text-emerald-700">₹{item.amount.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Expense by Category */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-rose-800 flex items-center gap-2">
              <TrendingDown size={16} className="text-rose-600" />
              Expense Breakdown by Category (Canonical Selector)
            </h3>
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
              Total Out
            </span>
          </div>

          <div className="space-y-3">
            {expenseByCategoryData.map((item) => {
              const maxExpense = Math.max(...expenseByCategoryData.map((i) => i.amount), 1);
              const pct = Math.round((item.amount / maxExpense) * 100);
              return (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{item.category}</span>
                    <span className="font-bold text-rose-700">₹{item.amount.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── CHRONOLOGICAL FINANCE TRANSACTION LEDGER ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Receipt size={18} className="text-navy-900" />
              Finance Transaction Ledger
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chronological log of real monetary events (`state.financeTransactions`).
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full md:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search category, notes, ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-900"
            />
          </div>
        </div>

        {/* Filter Controls Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs">
          {/* Type Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-medium text-slate-800 focus:outline-none"
            >
              <option value="All">All Types</option>
              <option value="Income">Income (+)</option>
              <option value="Expense">Expense (-)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-medium text-slate-800 focus:outline-none"
            >
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Method</label>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-medium text-slate-800 focus:outline-none"
            >
              <option value="All">All Methods</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
              <option value="Credit">Credit</option>
            </select>
          </div>

          {/* Account Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Account</label>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-medium text-slate-800 focus:outline-none"
            >
              <option value="All">All Accounts</option>
              <option value="acc-cash">Cash (acc-cash)</option>
              <option value="acc-bank">Bank (acc-bank)</option>
              <option value="acc-upi">UPI (acc-upi)</option>
            </select>
          </div>

          {/* Reset Filters */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setTypeFilter("All");
                setCategoryFilter("All");
                setMethodFilter("All");
                setAccountFilter("All");
                setSearchQuery("");
                setFromDate(firstDayOfMonthISOString());
                setToDate(todayISOString());
              }}
              className="w-full py-1.5 px-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} />
              Reset Filters
            </button>
          </div>
        </div>

        {/* Filtered Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-navy-950 text-white p-3.5 rounded-xl border border-navy-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-yellow-400 uppercase tracking-wider text-[11px]">Filtered Finance Activity:</span>
            <span className="text-slate-300 font-mono">({filteredSummary.count} transactions)</span>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <span className="text-slate-400 text-[10px] uppercase block">Income</span>
              <span className="font-extrabold text-emerald-400">₹{filteredSummary.income.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase block">Expenses</span>
              <span className="font-extrabold text-rose-400">₹{filteredSummary.expense.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase block">Net Cash</span>
              <span className={`font-extrabold ${filteredSummary.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {filteredSummary.net >= 0 ? "+" : ""}₹{filteredSummary.net.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase font-bold text-[10px] tracking-wider sticky top-0">
              <tr>
                <th className="p-3">Date & Time</th>
                <th className="p-3">Type / Category</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3">Method / Account</th>
                <th className="p-3">Reference / Entity</th>
                <th className="p-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 italic bg-slate-50/50">
                    No finance transactions match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((tx) => {
                  const isIncome = tx.type === "Income";
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                        {formatDisplayDate(tx.date)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isIncome ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                          >
                            {isIncome ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {tx.type}
                          </span>
                          <span className="font-semibold text-slate-800">{tx.category}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-extrabold whitespace-nowrap">
                        <span className={isIncome ? "text-emerald-600" : "text-rose-600"}>
                          {isIncome ? "+" : "-"}₹{tx.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-medium rounded text-[11px]">
                            {tx.method}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">({tx.accountId})</span>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-slate-600">
                        {tx.referenceId || "—"}
                      </td>
                      <td className="p-3 text-slate-600 max-w-xs truncate" title={tx.notes}>
                        {tx.notes || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
