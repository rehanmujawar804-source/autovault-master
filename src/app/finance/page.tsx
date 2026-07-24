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
  PlusCircle,
  X,
  Plus,
  AlertCircle,
  Check,
} from "lucide-react";

function formatDisplayDate(dateStr?: string) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return (
      d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) +
      " " +
      d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    );
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

const OPERATING_EXPENSE_CATEGORIES: FinanceCategory[] = [
  "Utilities",
  "Rent",
  "Salaries & Wages",
  "Transport & Fuel",
  "Maintenance & Repair",
  "Marketing",
  "Office & Shop Expense",
  "Other Operating Expense",
  "Adjustment",
];

export default function FinancePage() {
  const router = useRouter();
  const { isOwner, loading, requireOwner } = useRole();

  const {
    state,
    recordBusinessExpense,
    recordBusinessMoneyIn,
    setOpeningBalances,
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
    if (!loading) {
      requireOwner();
    }
  }, [loading, requireOwner]);

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

  // ── Record Expense Modal State ─────────────────────────────────────────────
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState<FinanceCategory>("Utilities");
  const [expenseAmountInput, setExpenseAmountInput] = useState("");
  const [expenseMethod, setExpenseMethod] = useState<PaymentMethod>("Cash");
  const [expenseDate, setExpenseDate] = useState(() => todayISOString());
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expenseFormError, setExpenseFormError] = useState("");
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  // ── Record Money In Modal State ────────────────────────────────────────────
  const [isMoneyInModalOpen, setIsMoneyInModalOpen] = useState(false);
  const [moneyInCategory, setMoneyInCategory] = useState<
    "Owner Capital" | "Expense Refund" | "Other Business Receipt"
  >("Owner Capital");
  const [moneyInAmountInput, setMoneyInAmountInput] = useState("");
  const [moneyInMethod, setMoneyInMethod] = useState<PaymentMethod>("Cash");
  const [moneyInDate, setMoneyInDate] = useState(() => todayISOString());
  const [moneyInNotes, setMoneyInNotes] = useState("");
  const [moneyInRefId, setMoneyInRefId] = useState("");
  const [moneyInFormError, setMoneyInFormError] = useState("");
  const [isSubmittingMoneyIn, setIsSubmittingMoneyIn] = useState(false);

  // ── Canonical Opening Balances ─────────────────────────────────────────────
  const openingCash = useMemo(() => {
    const acc = (state.financeAccounts || []).find((a) => a.id === "acc-cash" || a.type === "Cash");
    return acc?.openingBalance ?? 0;
  }, [state.financeAccounts]);

  const openingBank = useMemo(() => {
    const acc = (state.financeAccounts || []).find((a) => a.id === "acc-bank" || a.type === "Bank");
    return acc?.openingBalance ?? 0;
  }, [state.financeAccounts]);

  const openingUPI = useMemo(() => {
    const acc = (state.financeAccounts || []).find((a) => a.id === "acc-upi" || a.type === "UPI");
    return acc?.openingBalance ?? 0;
  }, [state.financeAccounts]);

  const totalOpeningFunds = useMemo(() => {
    return Math.round((openingCash + openingBank + openingUPI + Number.EPSILON) * 100) / 100;
  }, [openingCash, openingBank, openingUPI]);

  const isOpeningConfigured = useMemo(() => {
    return totalOpeningFunds > 0 || (state.financeAccounts || []).some((a) => a.openingBalance > 0);
  }, [totalOpeningFunds, state.financeAccounts]);

  // Opening Setup / Edit Form Modal State
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState("");
  const [openingBankInput, setOpeningBankInput] = useState("");
  const [openingUPIInput, setOpeningUPIInput] = useState("");
  const [openingFormError, setOpeningFormError] = useState("");
  const [isSubmittingOpening, setIsSubmittingOpening] = useState(false);

  // Edit Warning Confirmation Modal State
  const [showOpeningEditWarning, setShowOpeningEditWarning] = useState(false);
  const [pendingOpeningValues, setPendingOpeningValues] = useState<{ cash: number; bank: number; upi: number } | null>(null);

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
  const totalGrossProfit = useMemo(() => calculateProfit(state.invoices, state.salesReturns), [state.invoices, state.salesReturns]);
  const totalCustomerReceivables = useMemo(() => getTotalOutstandingDebt(), [state.invoices, state.salesReturns]);
  const totalSupplierPayables = useMemo(() => getTotalSupplierOutstanding(), [state.purchases, state.purchaseReturns, state.supplierPayments]);

  // Operating Expenses Total & Net Profit (Gross Profit - Operating Expenses)
  const totalOperatingExpenses = useMemo(() => {
    return (state.financeTransactions || [])
      .filter((t) => t.type === "Expense" && OPERATING_EXPENSE_CATEGORIES.includes(t.category))
      .reduce((sum, t) => sum + t.amount, 0);
  }, [state.financeTransactions]);

  const netProfit = totalGrossProfit - totalOperatingExpenses;

  // ── Category Summaries ─────────────────────────────────────────────────────
  const incomeCategories: FinanceCategory[] = [
    "Sale",
    "Customer Payment",
    "Purchase Return",
    "Owner Capital",
    "Expense Refund",
    "Other Business Receipt",
    "Adjustment",
  ];
  const expenseCategories: FinanceCategory[] = [
    "Inventory Purchase",
    "Supplier Payment",
    "Sales Return",
    "Invoice Void",
    "Payment Void",
    ...OPERATING_EXPENSE_CATEGORIES,
  ];

  const incomeByCategoryData = useMemo(() => {
    return incomeCategories
      .map((cat) => ({
        category: cat,
        amount: getIncomeByCategory(cat),
      }))
      .filter((item) => item.amount > 0 || state.financeTransactions?.some((t) => t.category === item.category));
  }, [state.financeTransactions, getIncomeByCategory]);

  const expenseByCategoryData = useMemo(() => {
    const uniqueExpenseCategories = Array.from(new Set(expenseCategories));
    return uniqueExpenseCategories
      .map((cat) => ({
        category: cat,
        amount: getExpenseByCategory(cat),
      }))
      .filter((item) => item.amount > 0 || state.financeTransactions?.some((t) => t.category === item.category));
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

  // ── Handle Expense Form Submission ──────────────────────────────────────────
  function handleRecordExpenseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setExpenseFormError("");

    const parsedAmount = parseFloat(expenseAmountInput);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setExpenseFormError("Please enter a valid expense amount greater than 0.");
      return;
    }

    if (expenseMethod === "Credit") {
      setExpenseFormError("Operating expenses must be paid via Cash, UPI, or Card/Bank.");
      return;
    }

    setIsSubmittingExpense(true);

    try {
      recordBusinessExpense({
        category: expenseCategory,
        amount: parsedAmount,
        paymentMethod: expenseMethod,
        date: expenseDate,
        notes: expenseNotes.trim() || `Operating Expense: ${expenseCategory}`,
      });

      // Reset Form & Close Modal
      setExpenseAmountInput("");
      setExpenseNotes("");
      setExpenseFormError("");
      setIsExpenseModalOpen(false);
    } catch (err: any) {
      setExpenseFormError(err?.message || "Failed to record expense. Please try again.");
    } finally {
      setIsSubmittingExpense(false);
    }
  }

  // ── Handle Money In Form Submission ─────────────────────────────────────────
  function handleRecordMoneyInSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMoneyInFormError("");

    const parsedAmount = parseFloat(moneyInAmountInput);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setMoneyInFormError("Please enter a valid amount greater than 0.");
      return;
    }

    if (moneyInMethod === "Credit") {
      setMoneyInFormError("Money In cannot be recorded with Credit payment method.");
      return;
    }

    if (!["Owner Capital", "Expense Refund", "Other Business Receipt"].includes(moneyInCategory)) {
      setMoneyInFormError("Invalid Money In category.");
      return;
    }

    if (!moneyInDate) {
      setMoneyInFormError("Please select a valid date.");
      return;
    }

    setIsSubmittingMoneyIn(true);

    try {
      recordBusinessMoneyIn({
        category: moneyInCategory,
        amount: parsedAmount,
        paymentMethod: moneyInMethod,
        date: moneyInDate,
        notes: moneyInNotes.trim() || `${moneyInCategory}: Receipt`,
        referenceId: moneyInRefId.trim() || undefined,
      });

      // Reset Form & Close Modal
      setMoneyInAmountInput("");
      setMoneyInNotes("");
      setMoneyInRefId("");
      setMoneyInFormError("");
      setIsMoneyInModalOpen(false);
    } catch (err: any) {
      setMoneyInFormError(err?.message || "Failed to record money in. Please try again.");
    } finally {
      setIsSubmittingMoneyIn(false);
    }
  }

  // ── Handle Opening Position Form Submission ──────────────────────────────────
  function handleOpenOpeningModal() {
    setOpeningCashInput(openingCash > 0 ? String(openingCash) : "");
    setOpeningBankInput(openingBank > 0 ? String(openingBank) : "");
    setOpeningUPIInput(openingUPI > 0 ? String(openingUPI) : "");
    setOpeningFormError("");
    setIsOpeningModalOpen(true);
  }

  function handleOpeningFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOpeningFormError("");

    const parsedCash = openingCashInput.trim() === "" ? 0 : parseFloat(openingCashInput);
    const parsedBank = openingBankInput.trim() === "" ? 0 : parseFloat(openingBankInput);
    const parsedUPI  = openingUPIInput.trim() === "" ? 0 : parseFloat(openingUPIInput);

    if (isNaN(parsedCash) || parsedCash < 0) {
      setOpeningFormError("Opening Cash must be a valid non-negative number.");
      return;
    }
    if (isNaN(parsedBank) || parsedBank < 0) {
      setOpeningFormError("Opening Bank must be a valid non-negative number.");
      return;
    }
    if (isNaN(parsedUPI) || parsedUPI < 0) {
      setOpeningFormError("Opening UPI must be a valid non-negative number.");
      return;
    }

    const payload = { cash: parsedCash, bank: parsedBank, upi: parsedUPI };

    if (isOpeningConfigured) {
      setPendingOpeningValues(payload);
      setShowOpeningEditWarning(true);
    } else {
      executeSaveOpening(payload);
    }
  }

  function executeSaveOpening(values: { cash: number; bank: number; upi: number }) {
    setIsSubmittingOpening(true);
    try {
      setOpeningBalances(values);
      setIsOpeningModalOpen(false);
      setShowOpeningEditWarning(false);
      setPendingOpeningValues(null);
    } catch (err: any) {
      setOpeningFormError(err?.message || "Failed to update opening balances.");
    } finally {
      setIsSubmittingOpening(false);
    }
  }

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
              Track business cash, bank, UPI balances, operating expenses, and cash flow.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Record Money In Button */}
          <button
            type="button"
            onClick={() => {
              setMoneyInCategory("Owner Capital");
              setMoneyInAmountInput("");
              setMoneyInMethod("Cash");
              setMoneyInDate(todayISOString());
              setMoneyInNotes("");
              setMoneyInRefId("");
              setMoneyInFormError("");
              setIsMoneyInModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95"
          >
            <PlusCircle size={16} />
            + Record Money In
          </button>

          {/* Record Expense Button */}
          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95"
          >
            <PlusCircle size={16} />
            + Record Expense
          </button>

          <button
            type="button"
            onClick={() => setShowConceptGuide((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
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
              Owner Financial Overview & Net Position
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Separation of Available Cash Funds, Receivables, Payables, Revenue, Gross Profit, and Operating Expenses.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg">
            Canonical Multi-System State
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
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

          {/* Gross Profit */}
          <Link href="/analytics" className="bg-slate-800/80 border border-indigo-500/30 rounded-xl p-3.5 space-y-1 hover:border-indigo-400 transition-colors block group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">Gross Profit</span>
              <ChevronRight size={12} className="text-slate-500 group-hover:text-indigo-400 transition-colors" />
            </div>
            <p className="text-lg font-black text-white">₹{totalGrossProfit.toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 block">Revenue − COGS</span>
          </Link>

          {/* Total Operating Expenses */}
          <div className="bg-slate-800/80 border border-pink-500/30 rounded-xl p-3.5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-pink-400 block">Op Expenses</span>
            <p className="text-lg font-black text-rose-400">₹{totalOperatingExpenses.toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 block">Utilities, Rent, etc.</span>
          </div>

          {/* Net Profit */}
          <div className="bg-slate-800/80 border border-teal-500/40 rounded-xl p-3.5 space-y-1 bg-gradient-to-b from-slate-800 to-slate-900">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300 block">Net Profit</span>
            <p className={`text-lg font-black ${netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              ₹{netProfit.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400 block">Gross Profit − OpEx</span>
          </div>
        </div>
      </div>

      {/* ── OPENING FINANCIAL POSITION CARD ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200/60">
              <Landmark size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Opening Financial Position</h2>
                {isOpeningConfigured ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Configured
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                    Unconfigured Initial Balances
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Opening balances represent the financial position of the business when AutoVault ERP was initialized. They are starting balances, not sales revenue or business income.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenOpeningModal}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              !isOpeningConfigured
                ? "bg-amber-600 hover:bg-amber-700 text-white shadow-md active:scale-95"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
            }`}
          >
            <Coins size={15} />
            {!isOpeningConfigured ? "Set Up Opening Financial Position" : "Edit Opening Balances"}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Opening Cash</span>
            <p className="text-base font-black text-slate-900 mt-0.5">₹{openingCash.toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 font-mono block">(acc-cash)</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Opening Bank</span>
            <p className="text-base font-black text-slate-900 mt-0.5">₹{openingBank.toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 font-mono block">(acc-bank)</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Opening UPI</span>
            <p className="text-base font-black text-slate-900 mt-0.5">₹{openingUPI.toLocaleString()}</p>
            <span className="text-[10px] text-slate-400 font-mono block">(acc-upi)</span>
          </div>
          <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
            <span className="text-[10px] font-bold uppercase text-amber-800 block">Total Opening Funds</span>
            <p className="text-base font-black text-amber-900 mt-0.5">₹{totalOpeningFunds.toLocaleString()}</p>
            <span className="text-[10px] text-amber-700 block">Cash + Bank + UPI</span>
          </div>
        </div>
      </div>
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
              <span className="font-bold text-amber-950 block mb-0.5">2. Gross Profit vs Net Profit</span>
              <p className="text-[11px] text-amber-800">
                Gross Profit = Revenue − Cost of Goods Sold (COGS). Net Profit = Gross Profit − Operating Expenses (Utilities, Rent, Salaries).
              </p>
            </div>
            <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50">
              <span className="font-bold text-amber-950 block mb-0.5">3. Operating Expenses</span>
              <p className="text-[11px] text-amber-800">
                Recording an operating expense immediately deducts money from Cash/Bank/UPI without affecting inventory stock or sales revenue.
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
              Expense Breakdown by Category (Operating + Inventory)
            </h3>
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
              Total Out
            </span>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {expenseByCategoryData.map((item) => {
              const maxExpense = Math.max(...expenseByCategoryData.map((i) => i.amount), 1);
              const pct = Math.round((item.amount / maxExpense) * 100);
              const isOperating = OPERATING_EXPENSE_CATEGORIES.includes(item.category);
              return (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      {item.category}
                      {isOperating && (
                        <span className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded border border-purple-200">
                          OpEx
                        </span>
                      )}
                    </span>
                    <span className="font-bold text-rose-700">₹{item.amount.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isOperating ? "bg-purple-500" : "bg-rose-500"
                      }`}
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
                  const isOpEx = OPERATING_EXPENSE_CATEGORIES.includes(tx.category);
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                        {formatDisplayDate(tx.date)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isIncome
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : isOpEx
                                ? "bg-purple-50 text-purple-700 border border-purple-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
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

      {/* ── RECORD OPERATING EXPENSE MODAL ─────────────────────────────────────── */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden space-y-0">
            {/* Modal Header */}
            <div className="bg-navy-950 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                  <TrendingDown size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Record Operating Expense</h3>
                  <p className="text-[11px] text-slate-400">Out-of-pocket business cost</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsExpenseModalOpen(false);
                  setExpenseFormError("");
                }}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleRecordExpenseSubmit} className="p-5 space-y-4 text-xs">
              {expenseFormError && (
                <div className="bg-rose-50 text-rose-700 border border-rose-200 p-3 rounded-xl flex items-center gap-2 font-medium">
                  <AlertCircle size={16} className="shrink-0 text-rose-600" />
                  <span>{expenseFormError}</span>
                </div>
              )}

              {/* Expense Category */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Expense Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value as FinanceCategory)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
                  required
                >
                  {OPERATING_EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 5000"
                    value={expenseAmountInput}
                    onChange={(e) => setExpenseAmountInput(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-navy-900"
                    required
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Payment Method <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Cash", "UPI", "Card"] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setExpenseMethod(method)}
                      className={`py-2 px-3 rounded-xl font-bold border text-center transition-all cursor-pointer ${
                        expenseMethod === method
                          ? "bg-navy-950 text-yellow-400 border-navy-950 shadow-xs"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {method === "Card" ? "Bank / Card" : method}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Account: {expenseMethod === "Cash" ? "acc-cash" : expenseMethod === "UPI" ? "acc-upi" : "acc-bank"}
                </p>
              </div>

              {/* Date */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Transaction Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
                  required
                />
              </div>

              {/* Description / Notes */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Shop electricity bill for July 2026"
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900 resize-none text-xs"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExpense}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingExpense ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      Save Expense
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── RECORD MONEY IN MODAL ────────────────────────────────────────────────── */}
      {isMoneyInModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden space-y-0">
            <div className="bg-navy-950 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Record Money In</h3>
                  <p className="text-[11px] text-slate-400">Non-sales business receipt / capital</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMoneyInModalOpen(false);
                  setMoneyInFormError("");
                }}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRecordMoneyInSubmit} className="p-5 space-y-4 text-xs">
              {moneyInFormError && (
                <div className="bg-rose-50 text-rose-700 border border-rose-200 p-3 rounded-xl flex items-center gap-2 font-medium">
                  <AlertCircle size={16} className="shrink-0 text-rose-600" />
                  <span>{moneyInFormError}</span>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Receipt Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={moneyInCategory}
                  onChange={(e) => setMoneyInCategory(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
                  required
                >
                  <option value="Owner Capital">Owner Capital (Owner investment)</option>
                  <option value="Expense Refund">Expense Refund (Refund for previous expense)</option>
                  <option value="Other Business Receipt">Other Business Receipt (Non-sales income)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 50000"
                    value={moneyInAmountInput}
                    onChange={(e) => setMoneyInAmountInput(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-navy-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Payment Method <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Cash", "UPI", "Card"] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setMoneyInMethod(method)}
                      className={`py-2 px-3 rounded-xl font-bold border text-center transition-all cursor-pointer ${
                        moneyInMethod === method
                          ? "bg-navy-950 text-yellow-400 border-navy-950 shadow-xs"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {method === "Card" ? "Bank / Card" : method}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Target Account: {moneyInMethod === "Cash" ? "acc-cash" : moneyInMethod === "UPI" ? "acc-upi" : "acc-bank"} (Credit blocked)
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Transaction Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={moneyInDate}
                  onChange={(e) => setMoneyInDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Reference ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. TXN-99481 or Cheque #1234"
                  value={moneyInRefId}
                  onChange={(e) => setMoneyInRefId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Additional capital invested by owner"
                  value={moneyInNotes}
                  onChange={(e) => setMoneyInNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-900 resize-none text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMoneyInModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMoneyIn}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingMoneyIn ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      Save Money In
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── OPENING FINANCIAL POSITION SETUP / EDIT MODAL ───────────────────────── */}
      {isOpeningModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden space-y-0">
            <div className="bg-navy-950 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Landmark size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    {isOpeningConfigured ? "Edit Opening Financial Position" : "Set Up Opening Financial Position"}
                  </h3>
                  <p className="text-[11px] text-slate-400">Starting balances at initialization</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpeningModalOpen(false);
                  setOpeningFormError("");
                }}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleOpeningFormSubmit} className="p-5 space-y-4 text-xs">
              {openingFormError && (
                <div className="bg-rose-50 text-rose-700 border border-rose-200 p-3 rounded-xl flex items-center gap-2 font-medium">
                  <AlertCircle size={16} className="shrink-0 text-rose-600" />
                  <span>{openingFormError}</span>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-[11px] text-amber-900 leading-relaxed">
                Opening balances represent the business&apos;s financial position before AutoVault ERP began tracking transactions. They do not generate ledger entries or affect Sales Revenue/Profit.
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Opening Cash (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={openingCashInput}
                  onChange={(e) => setOpeningCashInput(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-navy-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Opening Bank (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={openingBankInput}
                  onChange={(e) => setOpeningBankInput(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-navy-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1.5">
                  Opening UPI (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={openingUPIInput}
                  onChange={(e) => setOpeningUPIInput(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-navy-900"
                />
              </div>

              {/* Real-time Preview */}
              <div className="bg-slate-900 text-white p-3.5 rounded-xl flex items-center justify-between">
                <span className="text-xs text-slate-300 font-bold uppercase">Total Opening Funds Preview</span>
                <span className="text-base font-black text-yellow-400">
                  ₹
                  {(
                    (parseFloat(openingCashInput) || 0) +
                    (parseFloat(openingBankInput) || 0) +
                    (parseFloat(openingUPIInput) || 0)
                  ).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOpeningModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOpening}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingOpening ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      Save Opening Balances
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT OPENING BALANCES WARNING CONFIRMATION MODAL ────────────────────── */}
      {showOpeningEditWarning && pendingOpeningValues && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden space-y-0">
            <div className="bg-amber-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertCircle size={22} className="shrink-0" />
                <h3 className="text-base font-black tracking-tight">Confirm Opening Balance Change</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowOpeningEditWarning(false);
                  setPendingOpeningValues(null);
                }}
                className="text-amber-100 hover:text-white transition-colors cursor-pointer p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs leading-relaxed">
              <div className="bg-amber-50 text-amber-900 border border-amber-200 p-4 rounded-xl space-y-2">
                <p className="font-semibold">
                  Opening balances represent the financial position of the business when AutoVault ERP was initialized. Changing these values will affect account balances and historical financial reporting. If you are adding new money to the business, use &apos;Record Money In → Owner Capital&apos; instead.
                </p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">New Opening Cash:</span>
                  <span className="font-bold text-slate-800">₹{pendingOpeningValues.cash.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">New Opening Bank:</span>
                  <span className="font-bold text-slate-800">₹{pendingOpeningValues.bank.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">New Opening UPI:</span>
                  <span className="font-bold text-slate-800">₹{pendingOpeningValues.upi.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-amber-800 font-bold">New Total Opening:</span>
                  <span className="font-extrabold text-amber-900">
                    ₹{(pendingOpeningValues.cash + pendingOpeningValues.bank + pendingOpeningValues.upi).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowOpeningEditWarning(false);
                    setPendingOpeningValues(null);
                  }}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeSaveOpening(pendingOpeningValues)}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer text-center flex items-center justify-center gap-1.5"
                >
                  <Check size={16} />
                  Yes, Change Balances
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
