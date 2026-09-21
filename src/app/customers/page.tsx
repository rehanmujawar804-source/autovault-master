"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import type { Invoice, PaymentMethod, Customer } from "@/types";
import Link from "next/link";
import { formatInvoiceDate } from "@/lib/dateUtils";
import { calculateRevenue } from "@/lib/revenueUtils";
import { calculateProfit } from "@/lib/profitUtils";
import {
  Search,
  Users,
  AlertCircle,
  TrendingUp,
  MessageCircle,
  ChevronDown,
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
  Copy,
  Phone,
  Award,
  Sparkles,
  Clock,
  ArrowUpRight,
  Target,
  Percent,
  Activity,
  HeartPulse,
  DollarSign,
  UserCheck,
  UserX,
  UserPlus,
  Repeat,
  Zap,
} from "lucide-react";

type DebtFilter = "All" | "High Debt" | "Partial" | "No Debt";

const HIGH_DEBT_THRESHOLD = 5000;

const METHOD_COLORS: Record<PaymentMethod, string> = {
  Cash: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPI: "bg-blue-50 text-blue-700 border-blue-200",
  Card: "bg-purple-50 text-purple-700 border-purple-200",
};

// ─────────────────────────────────────────────────────────────────────────────
//  REUSABLE CUSTOMER SEGMENTATION HELPER
// ─────────────────────────────────────────────────────────────────────────────
type CustomerSegmentLabel = "VIP" | "Gold" | "Silver" | "Bronze" | "New";

interface CustomerSegmentRule {
  label: CustomerSegmentLabel;
  badge: string;
  color: string;
  minRevenue: number;
  description: string;
}

const CUSTOMER_SEGMENTS: CustomerSegmentRule[] = [
  {
    label: "VIP",
    badge: "👑 VIP",
    color: "bg-purple-100 text-purple-800 border-purple-300",
    minRevenue: 250000,
    description: "Revenue ≥ ₹250,000",
  },
  {
    label: "Gold",
    badge: "⭐ Gold",
    color: "bg-amber-100 text-amber-800 border-amber-300",
    minRevenue: 100000,
    description: "Revenue ≥ ₹100,000",
  },
  {
    label: "Silver",
    badge: "🥈 Silver",
    color: "bg-slate-100 text-slate-700 border-slate-300",
    minRevenue: 25000,
    description: "Revenue ≥ ₹25,000",
  },
  {
    label: "Bronze",
    badge: "🥉 Bronze",
    color: "bg-orange-100 text-orange-800 border-orange-300",
    minRevenue: 5000,
    description: "Revenue ≥ ₹5,000",
  },
  {
    label: "New",
    badge: "🌱 New",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    minRevenue: 0,
    description: "Revenue < ₹5,000",
  },
];

function getCustomerSegment(revenue: number): CustomerSegmentRule {
  if (revenue >= 250000) return CUSTOMER_SEGMENTS[0];
  if (revenue >= 100000) return CUSTOMER_SEGMENTS[1];
  if (revenue >= 25000) return CUSTOMER_SEGMENTS[2];
  if (revenue >= 5000) return CUSTOMER_SEGMENTS[3];
  return CUSTOMER_SEGMENTS[4];
}

// ─────────────────────────────────────────────────────────────────────────────
//  CUSTOMERS PAGE — EXECUTIVE CUSTOMER INTELLIGENCE DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const {
    state,
    recordDebtPayment,
    recordCustomerDebtPaymentFIFO,
    getCustomerOutstandingInvoices,
    getDebtPaymentsByCustomer,
    getInvoiceOutstanding,
    getCustomerOutstandingBalance,
    updateCustomer,
    showToast,
    getCustomerCreditBalance,
    getTotalCustomerCreditLiability,
  } = useStore();
  const { isOwner, loading, requireAuth } = useRole();

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
      showToast("Please select who collected this payment (Owner or Staff).", "error");
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

  // ── Single-pass Derived Stats & Intelligence Calculations ─────────────────
  const dashboardData = useMemo(() => {
    const customers = state.customers;
    const validInvoices = state.invoices.filter((i) => !i.voided);
    const activeReturns = (state.salesReturns || []).filter((r) => r.status !== "Cancelled");

    const nowMs = Date.now();
    const ninetyDaysAgo = nowMs - 90 * 24 * 60 * 60 * 1000;
    const oneHundredEightyDaysAgo = nowMs - 180 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = nowMs - 30 * 24 * 60 * 60 * 1000;

    // Debt map
    const debtByCustomer: Record<string, number> = {};
    customers.forEach((c) => {
      const bal = getCustomerOutstandingBalance(c.id);
      if (bal > 0) debtByCustomer[c.id] = bal;
    });

    const totalDebt = Object.values(debtByCustomer).reduce((s, d) => s + d, 0);
    const totalCreditLiability = getTotalCustomerCreditLiability();

    // Customer Invoices Map
    const customerInvoicesMap = new Map<string, Invoice[]>();
    validInvoices.forEach((inv) => {
      if (inv.customerId) {
        const arr = customerInvoicesMap.get(inv.customerId) || [];
        arr.push(inv);
        customerInvoicesMap.set(inv.customerId, arr);
      }
    });

    // Detailed Per-Customer Aggregates
    interface CustomerMeta {
      customer: Customer;
      revenue: number;
      profit: number;
      debt: number;
      credit: number;
      invoices: Invoice[];
      invoiceCount: number;
      lastVisitMs: number;
      aov: number;
      segment: CustomerSegmentRule;
      isActive: boolean;
      isAtRisk: boolean;
      isChurned: boolean;
      isNew: boolean;
      isRepeat: boolean;
    }

    const customerMetaList: CustomerMeta[] = [];
    let activeCustomerCount = 0;
    let atRiskCustomerCount = 0;
    let churnedCustomerCount = 0;
    let newCustomerCount = 0;
    let repeatCustomerCount = 0;
    let debtCustomerCount = 0;
    let creditCustomerCount = 0;

    const segmentCounts: Record<CustomerSegmentLabel, number> = {
      VIP: 0,
      Gold: 0,
      Silver: 0,
      Bronze: 0,
      New: 0,
    };

    customers.forEach((c) => {
      const rev = calculateRevenue(state.invoices, state.salesReturns, undefined, c.id);
      const prof = calculateProfit(state.invoices, state.salesReturns, state.products, undefined, c.id);
      const debt = debtByCustomer[c.id] ?? 0;
      const credit = getCustomerCreditBalance(c.id);
      const invs = customerInvoicesMap.get(c.id) || [];
      const invoiceCount = invs.length;

      let lastVisitMs = c.lastVisit ? new Date(c.lastVisit).getTime() : 0;
      invs.forEach((i) => {
        const t = new Date(i.createdAt || i.date).getTime();
        if (!isNaN(t) && t > lastVisitMs) lastVisitMs = t;
      });

      const isActive = lastVisitMs > 0 && lastVisitMs >= ninetyDaysAgo;
      const isAtRisk = lastVisitMs > 0 && lastVisitMs < ninetyDaysAgo && lastVisitMs >= oneHundredEightyDaysAgo;
      const isChurned = lastVisitMs === 0 || lastVisitMs < oneHundredEightyDaysAgo;

      const isNew = invs.some((i) => new Date(i.createdAt || i.date).getTime() >= thirtyDaysAgo) || invoiceCount <= 1;
      const isRepeat = invoiceCount >= 2 || c.visits >= 2;

      if (isActive) activeCustomerCount++;
      if (isAtRisk) atRiskCustomerCount++;
      if (isChurned) churnedCustomerCount++;
      if (isNew) newCustomerCount++;
      if (isRepeat) repeatCustomerCount++;
      if (debt > 0) debtCustomerCount++;
      if (credit > 0) creditCustomerCount++;

      const segment = getCustomerSegment(rev);
      segmentCounts[segment.label]++;

      const aov = invoiceCount > 0 ? Math.round(rev / invoiceCount) : 0;

      customerMetaList.push({
        customer: c,
        revenue: rev,
        profit: prof,
        debt,
        credit,
        invoices: invs,
        invoiceCount,
        lastVisitMs,
        aov,
        segment,
        isActive,
        isAtRisk,
        isChurned,
        isNew,
        isRepeat,
      });
    });

    const highestRevenueMeta = [...customerMetaList].sort((a, b) => b.revenue - a.revenue)[0];
    const highestProfitMeta = [...customerMetaList].sort((a, b) => b.profit - a.profit)[0];
    const largestDebtorMeta = [...customerMetaList].sort((a, b) => b.debt - a.debt)[0];
    const highestAovMeta = [...customerMetaList].filter((m) => m.invoiceCount > 0).sort((a, b) => b.aov - a.aov)[0];
    const highestRepeatMeta = [...customerMetaList].sort((a, b) => b.invoiceCount - a.invoiceCount)[0];

    const totalStoreRevenue = calculateRevenue(state.invoices, state.salesReturns);
    const totalValidInvoices = validInvoices.length;
    const avgBasketValue = totalValidInvoices > 0 ? Math.round(totalStoreRevenue / totalValidInvoices) : 0;

    const totalItemsSold = validInvoices.reduce(
      (sum, inv) => sum + inv.items.reduce((s, i) => s + i.quantity, 0),
      0
    );

    const totalItemsReturned = activeReturns.reduce(
      (sum, ret) => sum + ret.items.reduce((s, i) => s + i.quantity, 0),
      0
    );

    const avgItemsPerInvoice = totalValidInvoices > 0 ? (totalItemsSold / totalValidInvoices).toFixed(1) : "0";
    const returnRatePct = totalItemsSold > 0 ? Math.round((totalItemsReturned / totalItemsSold) * 1000) / 10 : 0;

    const purchasingCustomersCount = customerMetaList.filter((m) => m.invoiceCount > 0).length;
    const repeatPurchasingRatePct =
      purchasingCustomersCount > 0 ? Math.round((repeatCustomerCount / purchasingCustomersCount) * 100) : 0;

    const totalVisits = customers.reduce((s, c) => s + c.visits, 0);
    const avgVisitFrequency = customers.length > 0 ? (totalVisits / customers.length).toFixed(1) : "0";

    let debt0to30 = 0;
    let debt31to60 = 0;
    let debt61to90 = 0;
    let debt90Plus = 0;

    validInvoices.forEach((inv) => {
      const due = getInvoiceOutstanding(inv);
      if (due > 0) {
        const invTime = new Date(inv.createdAt || inv.date).getTime();
        const ageDays = Math.floor((nowMs - invTime) / (1000 * 60 * 60 * 24));
        if (ageDays <= 30) debt0to30 += due;
        else if (ageDays <= 60) debt31to60 += due;
        else if (ageDays <= 90) debt61to90 += due;
        else debt90Plus += due;
      }
    });

    interface Recommendation {
      id: string;
      title: string;
      description: string;
      badge: string;
      badgeColor: string;
      customerId?: string;
      actionText: string;
      actionHref?: string;
    }

    const recommendations: Recommendation[] = [];

    if (largestDebtorMeta && largestDebtorMeta.debt > 0) {
      recommendations.push({
        id: `rec-debt-${largestDebtorMeta.customer.id}`,
        title: `Recover ₹${largestDebtorMeta.debt.toLocaleString()} from ${largestDebtorMeta.customer.name}`,
        description: `Largest debtor in system with ${largestDebtorMeta.invoices.filter((i) => getInvoiceOutstanding(i) > 0).length} unpaid invoice(s). Direct follow-up advised.`,
        badge: "Debt Recovery",
        badgeColor: "bg-red-100 text-red-800 border-red-200",
        customerId: largestDebtorMeta.customer.id,
        actionText: "Collect Payment",
      });
    }

    const atRiskVip = customerMetaList
      .filter((m) => (m.segment.label === "VIP" || m.segment.label === "Gold") && (m.isAtRisk || m.isChurned))
      .sort((a, b) => b.revenue - a.revenue)[0];

    if (atRiskVip) {
      const inactiveDays = atRiskVip.lastVisitMs > 0 ? Math.floor((nowMs - atRiskVip.lastVisitMs) / (1000 * 60 * 60 * 24)) : 180;
      recommendations.push({
        id: `rec-atrisk-${atRiskVip.customer.id}`,
        title: `${atRiskVip.customer.name} (${atRiskVip.segment.label}) Inactive for ${inactiveDays} Days`,
        description: `High lifetime value customer (₹${atRiskVip.revenue.toLocaleString()} spent) is at risk of churning. Send a courtesy check-in or special offer.`,
        badge: "Retention Alert",
        badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
        customerId: atRiskVip.customer.id,
        actionText: "View Profile",
        actionHref: `/customers/${atRiskVip.customer.id}`,
      });
    }

    const creditCustomer = customerMetaList.filter((m) => m.credit > 0).sort((a, b) => b.credit - a.credit)[0];
    if (creditCustomer) {
      recommendations.push({
        id: `rec-credit-${creditCustomer.customer.id}`,
        title: `${creditCustomer.customer.name} has ₹${creditCustomer.credit.toLocaleString()} Unused Store Credit`,
        description: "Customer holds active unredeemed credit. Remind them on their next visit or purchase.",
        badge: "Store Credit",
        badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
        customerId: creditCustomer.customer.id,
        actionText: "View Profile",
        actionHref: `/customers/${creditCustomer.customer.id}`,
      });
    }

    if (highestProfitMeta && highestProfitMeta.profit > 0) {
      recommendations.push({
        id: `rec-profit-${highestProfitMeta.customer.id}`,
        title: `${highestProfitMeta.customer.name} Generates Highest Gross Profit (₹${highestProfitMeta.profit.toLocaleString()})`,
        description: `Top profitable patron generating ${highestProfitMeta.revenue > 0 ? Math.round((highestProfitMeta.profit / highestProfitMeta.revenue) * 100) : 0}% margin across ${highestProfitMeta.invoiceCount} orders.`,
        badge: "Top Profit Leader",
        badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
        customerId: highestProfitMeta.customer.id,
        actionText: "Open Profile",
        actionHref: `/customers/${highestProfitMeta.customer.id}`,
      });
    }

    return {
      totalCustomers: customers.length,
      activeCustomerCount,
      atRiskCustomerCount,
      churnedCustomerCount,
      newCustomerCount,
      repeatCustomerCount,
      debtCustomerCount,
      creditCustomerCount,
      totalDebt,
      totalCreditLiability,
      highDebtCount: customerMetaList.filter((m) => m.debt >= HIGH_DEBT_THRESHOLD).length,
      partialCount: customerMetaList.filter((m) => m.debt > 0 && m.debt < HIGH_DEBT_THRESHOLD).length,
      noDebtCount: customerMetaList.filter((m) => m.debt === 0).length,
      debtByCustomer,
      customerMetaMap: new Map(customerMetaList.map((m) => [m.customer.id, m])),
      highestRevenueMeta,
      highestProfitMeta,
      largestDebtorMeta,
      highestAovMeta,
      highestRepeatMeta,
      avgBasketValue,
      avgItemsPerInvoice,
      returnRatePct,
      repeatPurchasingRatePct,
      avgVisitFrequency,
      segmentCounts,
      debtAgeing: {
        d0to30: debt0to30,
        d31to60: debt31to60,
        d61to90: debt61to90,
        d90Plus: debt90Plus,
      },
      recommendations,
    };
  }, [state.customers, state.invoices, state.salesReturns, state.products, state.customerCreditTransactions, getCustomerOutstandingBalance, getTotalCustomerCreditLiability, getCustomerCreditBalance]);

  // ── Filtered Customers List for Directory Table ───────────────────────────
  const filtered = useMemo(() => {
    const { debtByCustomer } = dashboardData;
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
  }, [state.customers, dashboardData, filter, search]);

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
      showToast("Please select who collected this payment (Owner or Staff).", "error");
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

  function handleCopyPhone(phone: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!phone) {
      showToast("No phone number available.", "error");
      return;
    }
    navigator.clipboard.writeText(phone);
    showToast("Phone number copied to clipboard.", "success");
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* ── Dashboard Title Header ──────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-navy-950 text-yellow-400 flex items-center justify-center font-black shadow-sm">
              <Users size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-navy-950 tracking-tight">Customer Intelligence Dashboard</h1>
              <p className="text-xs text-slate-500 font-medium">Customer directory, credit ledger &amp; operational accounts</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/billing"
            className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-xs font-black px-4 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer font-sans"
          >
            <ShoppingCart size={15} />
            POS Billing Terminal
          </Link>
        </div>
      </div>

      {/* ── OWNER-ONLY EXECUTIVE INTELLIGENCE SECTIONS ────────────────────── */}
      {isOwner && (
        <>
          {/* ── 1. HERO KPI CARDS ──────────────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Activity size={14} className="text-navy-950" />
              Executive Overview
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between shadow-xs hover:shadow-md transition-shadow">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Total Customers</p>
                  <p className="text-3xl font-extrabold text-slate-900">{dashboardData.totalCustomers}</p>
                  <p className="text-xs text-slate-400 mt-1">Registered in ERP system</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-navy-50 flex items-center justify-center text-navy-800 shrink-0">
                  <Users size={22} />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between shadow-xs hover:shadow-md transition-shadow">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Active Customers</p>
                  <p className="text-3xl font-extrabold text-emerald-600">{dashboardData.activeCustomerCount}</p>
                  <p className="text-xs text-slate-400 mt-1">Shopped within last 90 days</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                  <UserCheck size={22} />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between shadow-xs hover:shadow-md transition-shadow">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Repeat Customers</p>
                  <p className="text-3xl font-extrabold text-purple-700">{dashboardData.repeatCustomerCount}</p>
                  <p className="text-xs text-slate-400 mt-1">2+ purchases or visits</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-700 shrink-0">
                  <Repeat size={22} />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between shadow-xs hover:shadow-md transition-shadow">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">New Customers</p>
                  <p className="text-3xl font-extrabold text-blue-600">{dashboardData.newCustomerCount}</p>
                  <p className="text-xs text-slate-400 mt-1">Acquired in last 30 days</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                  <UserPlus size={22} />
                </div>
              </div>
            </div>
          </section>

          {/* ── 2. CUSTOMER HEALTH ────────────────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <HeartPulse size={18} className="text-red-500" />
                <h2 className="text-base font-bold text-slate-900">Customer Health Breakdown</h2>
              </div>
              <span className="text-xs text-slate-400 font-medium">Derived from visit timestamps &amp; outstanding balances</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 text-center">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block mb-1">Active</span>
                <span className="text-2xl font-black text-emerald-700">{dashboardData.activeCustomerCount}</span>
                <span className="text-[11px] text-emerald-600 block mt-1">≤ 90 days ago</span>
              </div>

              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 text-center">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block mb-1">At Risk</span>
                <span className="text-2xl font-black text-amber-700">{dashboardData.atRiskCustomerCount}</span>
                <span className="text-[11px] text-amber-600 block mt-1">91–180 days inactive</span>
              </div>

              <div className="bg-red-50/70 border border-red-200/80 rounded-xl p-4 text-center">
                <span className="text-xs font-bold text-red-800 uppercase tracking-wider block mb-1">Churned</span>
                <span className="text-2xl font-black text-red-700">{dashboardData.churnedCustomerCount}</span>
                <span className="text-[11px] text-red-600 block mt-1">&gt; 180 days inactive</span>
              </div>

              <div className="bg-orange-50/70 border border-orange-200/80 rounded-xl p-4 text-center">
                <span className="text-xs font-bold text-orange-800 uppercase tracking-wider block mb-1">With Debt</span>
                <span className="text-2xl font-black text-orange-700">{dashboardData.debtCustomerCount}</span>
                <span className="text-[11px] text-orange-600 block mt-1">Open dues balance</span>
              </div>

              <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-4 text-center">
                <span className="text-xs font-bold text-purple-800 uppercase tracking-wider block mb-1">Store Credit</span>
                <span className="text-2xl font-black text-purple-700">{dashboardData.creditCustomerCount}</span>
                <span className="text-[11px] text-purple-600 block mt-1">Hold store credit</span>
              </div>
            </div>
          </section>

          {/* ── 3. CUSTOMER VALUE (HALL OF FAME) ──────────────────────────────── */}
          <section className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm border border-slate-800">
            <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-yellow-400" />
                <h2 className="text-base font-bold text-white">Customer Hall of Fame</h2>
              </div>
              <span className="text-xs text-slate-400 font-medium">Top value leaders across revenue, profit &amp; dues</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-yellow-400 block mb-1">Highest Revenue</span>
                  <p className="font-extrabold text-sm text-white truncate">
                    {dashboardData.highestRevenueMeta ? dashboardData.highestRevenueMeta.customer.name : "None"}
                  </p>
                  <p className="text-xl font-black text-emerald-400 font-mono mt-1">
                    ₹{dashboardData.highestRevenueMeta ? dashboardData.highestRevenueMeta.revenue.toLocaleString() : "0"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Lifetime Net Revenue</p>
                </div>
                {dashboardData.highestRevenueMeta && (
                  <Link
                    href={`/customers/${dashboardData.highestRevenueMeta.customer.id}`}
                    className="w-full text-center bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 rounded-lg transition-colors inline-block"
                  >
                    Open Profile →
                  </Link>
                )}
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-purple-400 block mb-1">Highest Profit</span>
                  <p className="font-extrabold text-sm text-white truncate">
                    {dashboardData.highestProfitMeta ? dashboardData.highestProfitMeta.customer.name : "None"}
                  </p>
                  <p className="text-xl font-black text-purple-300 font-mono mt-1">
                    ₹{dashboardData.highestProfitMeta ? dashboardData.highestProfitMeta.profit.toLocaleString() : "0"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Lifetime Net Margin</p>
                </div>
                {dashboardData.highestProfitMeta && (
                  <Link
                    href={`/customers/${dashboardData.highestProfitMeta.customer.id}`}
                    className="w-full text-center bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 rounded-lg transition-colors inline-block"
                  >
                    Open Profile →
                  </Link>
                )}
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-red-400 block mb-1">Largest Debtor</span>
                  <p className="font-extrabold text-sm text-white truncate">
                    {dashboardData.largestDebtorMeta && dashboardData.largestDebtorMeta.debt > 0
                      ? dashboardData.largestDebtorMeta.customer.name
                      : "No Debts"}
                  </p>
                  <p className="text-xl font-black text-red-400 font-mono mt-1">
                    ₹{dashboardData.largestDebtorMeta ? dashboardData.largestDebtorMeta.debt.toLocaleString() : "0"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Uncollected Open Dues</p>
                </div>
                {dashboardData.largestDebtorMeta && dashboardData.largestDebtorMeta.debt > 0 && (
                  <Link
                    href={`/customers/${dashboardData.largestDebtorMeta.customer.id}`}
                    className="w-full text-center bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold py-2 rounded-lg transition-colors inline-block"
                  >
                    Open Profile →
                  </Link>
                )}
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-blue-400 block mb-1">Highest AOV</span>
                  <p className="font-extrabold text-sm text-white truncate">
                    {dashboardData.highestAovMeta ? dashboardData.highestAovMeta.customer.name : "None"}
                  </p>
                  <p className="text-xl font-black text-blue-300 font-mono mt-1">
                    ₹{dashboardData.highestAovMeta ? dashboardData.highestAovMeta.aov.toLocaleString() : "0"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Average Basket Value</p>
                </div>
                {dashboardData.highestAovMeta && (
                  <Link
                    href={`/customers/${dashboardData.highestAovMeta.customer.id}`}
                    className="w-full text-center bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 rounded-lg transition-colors inline-block"
                  >
                    Open Profile →
                  </Link>
                )}
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-amber-400 block mb-1">Highest Repeat</span>
                  <p className="font-extrabold text-sm text-white truncate">
                    {dashboardData.highestRepeatMeta ? dashboardData.highestRepeatMeta.customer.name : "None"}
                  </p>
                  <p className="text-xl font-black text-amber-300 font-mono mt-1">
                    {dashboardData.highestRepeatMeta ? `${dashboardData.highestRepeatMeta.invoiceCount} Orders` : "0"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Total Invoices Billed</p>
                </div>
                {dashboardData.highestRepeatMeta && (
                  <Link
                    href={`/customers/${dashboardData.highestRepeatMeta.customer.id}`}
                    className="w-full text-center bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 rounded-lg transition-colors inline-block"
                  >
                    Open Profile →
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* ── 4. CUSTOMER BEHAVIOUR & 5. CREDIT INTELLIGENCE (2-COLUMN GRID) ──── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Target size={18} className="text-navy-950" />
                    <h2 className="text-base font-bold text-slate-900">Customer Behaviour Metrics</h2>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Calculated dynamically</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-600">Average Basket Value (AOV)</span>
                    <span className="font-bold text-slate-900 font-mono text-sm">₹{dashboardData.avgBasketValue.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-600">Repeat Purchase Rate</span>
                    <span className="font-bold text-purple-700 font-mono text-sm">{dashboardData.repeatPurchasingRatePct}%</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-600">Average Items Per Invoice</span>
                    <span className="font-bold text-blue-700 font-mono text-sm">{dashboardData.avgItemsPerInvoice} units</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-600">Average Visit Frequency</span>
                    <span className="font-bold text-slate-800 font-mono text-sm">{dashboardData.avgVisitFrequency} visits / customer</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-600">Store-wide Return Rate</span>
                    <span className={`font-bold font-mono text-sm ${dashboardData.returnRatePct > 5 ? "text-orange-600" : "text-emerald-700"}`}>
                      {dashboardData.returnRatePct}%
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Wallet size={18} className="text-yellow-600" />
                    <h2 className="text-base font-bold text-slate-900">Credit Intelligence &amp; Debt Ageing</h2>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Real-time ledger dues</span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <span className="text-[10px] font-extrabold uppercase text-red-600 block">Total Outstanding Debt</span>
                    <span className="text-xl font-black text-red-700 font-mono">₹{dashboardData.totalDebt.toLocaleString()}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-[10px] font-extrabold uppercase text-slate-600 block">Debtors Count</span>
                    <span className="text-xl font-black text-slate-900 font-mono">{dashboardData.debtCustomerCount} accounts</span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <span className="font-bold text-slate-700 block uppercase tracking-wider text-[11px] mb-1">Debt Ageing Schedule</span>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100">
                    <span className="font-medium text-emerald-800">0–30 Days (Current)</span>
                    <span className="font-bold text-emerald-700 font-mono">₹{dashboardData.debtAgeing.d0to30.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50/60 border border-blue-100">
                    <span className="font-medium text-blue-800">31–60 Days (Mild Overdue)</span>
                    <span className="font-bold text-blue-700 font-mono">₹{dashboardData.debtAgeing.d31to60.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50/60 border border-amber-100">
                    <span className="font-medium text-amber-800">61–90 Days (Moderate Risk)</span>
                    <span className="font-bold text-amber-700 font-mono">₹{dashboardData.debtAgeing.d61to90.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-red-50/80 border border-red-200">
                    <span className="font-bold text-red-800">90+ Days (Critical Aging)</span>
                    <span className="font-black text-red-700 font-mono">₹{dashboardData.debtAgeing.d90Plus.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ── 6. CUSTOMER SEGMENTS ───────────────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-purple-600" />
                <h2 className="text-base font-bold text-slate-900">Automatic Customer Classification</h2>
              </div>
              <span className="text-xs text-slate-400 font-medium">Deterministic revenue tiering</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {CUSTOMER_SEGMENTS.map((seg) => {
                const count = dashboardData.segmentCounts[seg.label];
                return (
                  <div key={seg.label} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-black px-2.5 py-0.5 rounded-md border ${seg.color}`}>
                        {seg.badge}
                      </span>
                      <span className="text-xs font-bold text-slate-400 font-mono">{count}</span>
                    </div>
                    <p className="text-xl font-extrabold text-slate-900 mt-1">{count} <span className="text-xs font-normal text-slate-500">customers</span></p>
                    <p className="text-[11px] text-slate-400 mt-1">{seg.description}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 7. SMART RECOMMENDATIONS ──────────────────────────────────────── */}
          <section className="bg-gradient-to-r from-navy-950 via-slate-900 to-navy-900 text-white rounded-2xl p-6 shadow-md border border-navy-800">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Smart Actionable Recommendations</h2>
                  <p className="text-xs text-slate-400">Deterministic advisor derived from ERP customer &amp; invoice state</p>
                </div>
              </div>
              <span className="text-xs font-mono bg-navy-800 text-yellow-400 px-2.5 py-1 rounded-lg border border-navy-700">
                {dashboardData.recommendations.length} Suggestions
              </span>
            </div>

            {dashboardData.recommendations.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No active customer follow-up actions required today.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboardData.recommendations.map((rec) => (
                  <div key={rec.id} className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-slate-600 transition-colors">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${rec.badgeColor}`}>
                          {rec.badge}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-white">{rec.title}</h4>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{rec.description}</p>
                    </div>
                    {rec.customerId && (
                      rec.actionHref ? (
                        <Link
                          href={rec.actionHref}
                          className="w-full text-center bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-xs font-extrabold py-2 rounded-lg transition-colors inline-block cursor-pointer shadow-xs"
                        >
                          {rec.actionText} →
                        </Link>
                      ) : (
                        <button
                          onClick={() => {
                            const c = state.customers.find((cust) => cust.id === rec.customerId);
                            if (c) {
                              const d = dashboardData.debtByCustomer[c.id] ?? 0;
                              openLumpSumModal(c, d);
                            }
                          }}
                          className="w-full text-center bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-extrabold py-2 rounded-lg transition-colors inline-block cursor-pointer shadow-xs"
                        >
                          {rec.actionText} →
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ── HIGH DEBT BANNER (Visible to all) ──────────────────────────────── */}
      {dashboardData.highDebtCount > 0 && (
        <div className="bg-red-50/90 border border-red-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 shrink-0">
              <AlertCircle size={16} />
            </div>
            <div>
              <p className="font-bold text-red-900">Critical Dues Alert</p>
              <p className="text-xs text-red-700 mt-0.5">
                {dashboardData.highDebtCount} customer{dashboardData.highDebtCount > 1 ? "s have" : " has"} exceeded
                the ₹{HIGH_DEBT_THRESHOLD.toLocaleString()} outstanding threshold.
              </p>
            </div>
          </div>
          <button
            onClick={() => setFilter("High Debt")}
            className="bg-red-600 hover:bg-red-700 text-white text-xs px-4 py-2 rounded-xl font-bold transition-all shadow-sm shrink-0 cursor-pointer"
          >
            Filter High Debt List
          </button>
        </div>
      )}

      {/* ── 8. CUSTOMER DIRECTORY & LEDGER TABLE (VISIBLE TO ALL ROLES) ─────── */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Customer Registry Directory</h3>
            <p className="text-xs text-slate-400">Search &amp; manage individual customer accounts</p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-slate-200 rounded-xl pl-8 pr-3.5 py-2 text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="flex gap-1.5 flex-wrap text-xs font-medium">
              {(["All", "High Debt", "Partial", "No Debt"] as DebtFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${filter === f
                      ? "bg-navy-950 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                >
                  {f}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${filter === f ? "bg-slate-700 text-slate-200" : "bg-slate-200 text-slate-600"
                    }`}>
                    {f === "All"
                      ? dashboardData.totalCustomers
                      : f === "High Debt"
                        ? dashboardData.highDebtCount
                        : f === "Partial"
                          ? dashboardData.partialCount
                          : dashboardData.noDebtCount}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Directory Table */}
        {filtered.length === 0 ? (
          state.customers.length === 0 ? (
            <div className="p-16 text-center bg-white border border-slate-200 rounded-2xl shadow-xs">
              <p className="text-slate-500 font-bold text-sm">No customers registered yet</p>
              <p className="text-slate-400 text-xs mt-1">Add customers during checkout in POS Billing.</p>
              <Link
                href="/billing"
                className="mt-4 inline-flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-xs font-black px-5 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                <ShoppingCart size={14} />
                POS Terminal
              </Link>
            </div>
          ) : (
            <div className="p-16 text-center bg-white border border-slate-200 rounded-2xl shadow-xs">
              <Search size={36} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 text-sm font-bold">No customers match filters</p>
              <p className="text-slate-400 text-xs mt-1">Try clearing search text or resetting customer filters.</p>
              <button
                onClick={() => {
                  setSearch("");
                  setFilter("All");
                }}
                className="mt-4 text-xs font-bold text-amber-600 hover:text-amber-700 underline cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold w-8" />
                    <th className="px-5 py-3 text-left font-semibold">Customer</th>
                    <th className="px-5 py-3 text-left font-semibold">Phone</th>
                    <th className="px-5 py-3 text-right font-semibold">Debt</th>
                    <th className="px-5 py-3 text-right font-semibold">Store Credit</th>
                    {isOwner && <th className="px-5 py-3 text-right font-semibold hidden md:table-cell">Total Spent</th>}
                    <th className="px-5 py-3 text-center font-semibold hidden lg:table-cell">Visits</th>
                    <th className="px-5 py-3 text-left font-semibold hidden lg:table-cell">Last Visit</th>
                    <th className="px-5 py-3 text-center font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((customer) => {
                    const derivedDebt = dashboardData.debtByCustomer[customer.id] ?? 0;
                    const isExpanded = expandedCustomerId === customer.id;
                    const isHighDebt = derivedDebt >= HIGH_DEBT_THRESHOLD;
                    const isPartial = derivedDebt > 0 && derivedDebt < HIGH_DEBT_THRESHOLD;

                    const meta = dashboardData.customerMetaMap.get(customer.id);
                    const customerTotalSpent = meta ? meta.revenue : 0;
                    const segment = meta ? meta.segment : getCustomerSegment(customerTotalSpent);

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
                          <td className="px-4 py-3.5">
                            <button
                              onClick={() => setExpandedCustomerId(isExpanded ? null : customer.id)}
                              className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </td>

                          <td className="px-5 py-3.5">
                            <Link
                              href={`/customers/${customer.id}`}
                              className="font-semibold text-slate-900 hover:text-blue-600 transition-colors block"
                            >
                              {customer.name}
                            </Link>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {isOwner && (
                                <span className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${segment.color}`}>
                                  {segment.badge}
                                </span>
                              )}
                              {isOwner && meta?.isAtRisk && (
                                <span className="text-[9px] uppercase tracking-wider font-extrabold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded">
                                  ⚠ At Risk
                                </span>
                              )}
                              {isHighDebt && (
                                <span className="text-[9px] uppercase tracking-wider font-extrabold bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded">
                                  High Debt
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              {customer.phone ? (
                                <a
                                  href={`tel:${customer.phone}`}
                                  className="text-slate-700 hover:text-blue-600 font-medium hover:underline flex items-center gap-1 font-mono text-xs"
                                  title="Click to call"
                                >
                                  <Phone size={12} className="text-slate-400" />
                                  {customer.phone}
                                </a>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                              {customer.phone && (
                                <>
                                  <button
                                    onClick={(e) => handleCopyPhone(customer.phone, e)}
                                    className="p-1 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                    title="Copy Phone Number"
                                  >
                                    <Copy size={13} />
                                  </button>
                                  <a
                                    href={`https://wa.me/91${customer.phone.replace(/\D/g, "")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded font-semibold transition-colors"
                                  >
                                    <MessageCircle size={11} />
                                    Chat
                                  </a>
                                </>
                              )}
                            </div>
                          </td>

                          <td className="px-5 py-3.5 text-right font-mono">
                            <span
                              className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${derivedDebt > 0
                                  ? "bg-red-50 text-red-600 border-red-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}
                            >
                              {derivedDebt > 0 ? `₹${derivedDebt.toLocaleString()}` : "Clear"}
                            </span>
                          </td>

                          <td className="px-5 py-3.5 text-right font-mono text-xs">
                            {(() => {
                              const cred = getCustomerCreditBalance(customer.id);
                              return cred > 0 ? (
                                <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                                  <Coins size={10} className="text-emerald-600" />
                                  ₹{cred.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium">₹0</span>
                              );
                            })()}
                          </td>

                          {isOwner && (
                            <td className="px-5 py-3.5 text-right font-semibold text-slate-800 font-mono hidden md:table-cell">
                              ₹{customerTotalSpent.toLocaleString()}
                            </td>
                          )}

                          <td className="px-5 py-3.5 text-center text-slate-700 font-medium hidden lg:table-cell">
                            {customer.visits}
                          </td>

                          <td className="px-5 py-3.5 text-slate-500 font-medium hidden lg:table-cell">
                            {customer.lastVisit || "—"}
                          </td>

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
                              <Link
                                href={`/customers/${customer.id}`}
                                className="bg-slate-900 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors font-semibold inline-block"
                              >
                                Profile
                              </Link>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className={`${borderClass} bg-slate-50/40 border-b border-slate-200`}>
                            <td colSpan={9} className="px-6 py-5">
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                    <User size={14} className="text-slate-500" />
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Account Overview</h4>
                                  </div>
                                  <div className="space-y-2 text-xs">
                                    {isOwner && (
                                      <>
                                        <div className="flex justify-between py-0.5">
                                          <span className="text-slate-500">Tier Segment:</span>
                                          <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] border ${segment.color}`}>
                                            {segment.badge}
                                          </span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                          <span className="text-slate-500">Lifetime Revenue:</span>
                                          <span className="font-bold text-slate-800 font-mono">₹{customerTotalSpent.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                          <span className="text-slate-500">Lifetime Profit:</span>
                                          <span className="font-bold text-purple-700 font-mono">₹{(meta?.profit || 0).toLocaleString()}</span>
                                        </div>
                                      </>
                                    )}
                                    <div className="flex justify-between py-0.5 border-t border-slate-50 pt-2">
                                      <span className="text-slate-500">Total Recovered:</span>
                                      <span className="font-bold text-green-700 font-mono">₹{totalRecovered.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between py-0.5">
                                      <span className="text-slate-500">Outstanding Debt:</span>
                                      <span className={`font-bold font-mono ${derivedDebt > 0 ? "text-red-600" : "text-emerald-700"}`}>
                                        ₹{derivedDebt.toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                    <ReceiptText size={14} className="text-slate-500" />
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Unpaid Invoices</h4>
                                    {outstandingInvoices.length > 0 && (
                                      <span className="ml-auto bg-red-50 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-200">
                                        {outstandingInvoices.length}
                                      </span>
                                    )}
                                  </div>
                                  {outstandingInvoices.length === 0 ? (
                                    <div className="flex flex-col items-center py-4 text-center">
                                      <CheckCircle size={24} className="text-emerald-500 mb-2" />
                                      <p className="text-xs text-emerald-700 font-semibold">All clear!</p>
                                      <p className="text-[10px] text-slate-400 mt-0.5">No outstanding invoice dues.</p>
                                    </div>
                                  ) : (
                                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                      {outstandingInvoices.map((inv) => (
                                        <div
                                          key={inv.id}
                                          className="bg-red-50/40 border border-red-100 rounded-lg p-2.5 flex items-center justify-between gap-2"
                                        >
                                          <div className="min-w-0">
                                            <p className="text-[10px] font-bold text-slate-800 font-mono">{inv.invoiceNumber}</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">{formatInvoiceDate(inv)}</p>
                                            <p className="text-[10px] text-red-600 font-bold font-mono mt-0.5">
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

                                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
                                  <div>
                                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                      <History size={14} className="text-slate-500" />
                                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Engagement Actions</h4>
                                    </div>
                                    <div className="space-y-2">
                                      {customer.phone ? (
                                        <>
                                          <a
                                            href={`https://wa.me/91${customer.phone.replace(/\D/g, "")}?text=Dear%20${encodeURIComponent(customer.name)},%20this%20is%20a%20reminder%20regarding%20your%20outstanding%20due%20of%20%E2%82%B9${derivedDebt}%20at%20AutoVault.`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs py-2 px-3 rounded-lg font-semibold transition-colors"
                                          >
                                            <MessageCircle size={13} className="text-green-600" />
                                            WhatsApp Follow-up
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
                                        <p className="text-xs text-slate-400 italic">No contact details recorded.</p>
                                      )}
                                      <Link
                                        href={`/customers/${customer.id}`}
                                        className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs py-2.5 px-3 rounded-lg font-semibold transition-colors shadow-xs"
                                      >
                                        <Plus size={13} />
                                        Open Profile
                                      </Link>
                                    </div>
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

            {/* Mobile Touch Cards (<768px) */}
            <div className="md:hidden divide-y divide-slate-100">
              {filtered.map((customer) => {
                const derivedDebt = dashboardData.debtByCustomer[customer.id] ?? 0;
                const isExpanded = expandedCustomerId === customer.id;
                const isHighDebt = derivedDebt >= HIGH_DEBT_THRESHOLD;
                const isPartial = derivedDebt > 0 && derivedDebt < HIGH_DEBT_THRESHOLD;

                const meta = dashboardData.customerMetaMap.get(customer.id);
                const customerTotalSpent = meta ? meta.revenue : 0;
                const segment = meta ? meta.segment : getCustomerSegment(customerTotalSpent);
                const cred = getCustomerCreditBalance(customer.id);
                const cleanPhone = customer.phone ? customer.phone.replace(/\D/g, "") : "";

                return (
                  <div key={customer.id} className="p-4 space-y-3 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/customers/${customer.id}`} className="font-bold text-slate-900 text-base hover:text-blue-600 transition-colors truncate block">
                          {customer.name}
                        </Link>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {isOwner && (
                            <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-md border ${segment.color}`}>
                              {segment.badge}
                            </span>
                          )}
                          {isHighDebt && (
                            <span className="text-[10px] uppercase tracking-wider font-extrabold bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-md">
                              High Debt
                            </span>
                          )}
                          {isPartial && (
                            <span className="text-[10px] uppercase tracking-wider font-extrabold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">
                              Partial Debt
                            </span>
                          )}
                          {!isHighDebt && !isPartial && (
                            <span className="text-[10px] uppercase tracking-wider font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">
                              Clear
                            </span>
                          )}
                          {cred > 0 && (
                            <span className="text-[10px] uppercase tracking-wider font-extrabold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Coins size={10} /> ₹{cred.toLocaleString()} Credit
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setExpandedCustomerId(isExpanded ? null : customer.id)}
                        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
                        title="Toggle Overview"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      {customer.phone ? (
                        <a
                          href={`tel:${customer.phone}`}
                          className="font-medium text-slate-800 hover:text-blue-600 flex items-center gap-1.5 font-mono"
                        >
                          <Phone size={13} className="text-slate-500" />
                          <span>{customer.phone}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400 italic">No phone recorded</span>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => handleCopyPhone(customer.phone, e)}
                            className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                            title="Copy Phone Number"
                          >
                            <Copy size={15} />
                          </button>
                          <a
                            href={`https://wa.me/91${cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-w-[44px] min-h-[44px] px-3 flex items-center justify-center gap-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition-colors cursor-pointer shadow-xs"
                            title="WhatsApp"
                          >
                            <MessageCircle size={14} />
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-red-50/60 border border-red-100 p-2.5 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-red-600 block">Outstanding Debt</span>
                        <span className={`font-mono font-bold text-sm ${derivedDebt > 0 ? "text-red-700" : "text-emerald-700"}`}>
                          {derivedDebt > 0 ? `₹${derivedDebt.toLocaleString()}` : "₹0 (Clear)"}
                        </span>
                      </div>
                      <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-emerald-700 block">Store Credit</span>
                        <span className="font-mono font-bold text-sm text-emerald-800">
                          ₹{cred.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {isOwner && (
                      <div className="flex items-center justify-between text-xs text-slate-500 px-1 pt-1">
                        <div>
                          <span>Total Spent: </span>
                          <span className="font-bold text-slate-800 font-mono">₹{customerTotalSpent.toLocaleString()}</span>
                        </div>
                        <div>
                          <span>Last Visit: </span>
                          <span className="font-medium text-slate-700">{customer.lastVisit || "—"}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="flex-1 min-h-[44px] bg-navy-950 hover:bg-navy-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        Open Profile
                      </Link>
                      {derivedDebt > 0 && (
                        <button
                          onClick={() => openLumpSumModal(customer, derivedDebt)}
                          className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                        >
                          <Wallet size={14} />
                          Collect Debt
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── MODALS (SINGLE COLLECT & LUMP-SUM FIFO COLLECT & EDIT PROFILE) ───── */}

      {/* Single Invoice Collect Modal */}
      {collectInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h2 className="font-bold text-slate-800">Collect Invoice Payment</h2>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{collectInvoice.invoiceNumber}</p>
              </div>
              <button onClick={closeCollectModal} className="text-slate-400 hover:text-slate-700 cursor-pointer">
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
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-3 text-center text-xs">
                    <div>
                      <p className="text-slate-400">Total</p>
                      <p className="font-bold text-slate-800 text-sm mt-1 font-mono">₹{collectInvoice.total.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Paid</p>
                      <p className="font-bold text-green-700 text-sm mt-1 font-mono">₹{collectInvoice.amountPaid.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Due</p>
                      <p className="font-bold text-red-600 text-sm mt-1 font-mono">₹{getInvoiceOutstanding(collectInvoice).toLocaleString()}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                    <input
                      type="number"
                      min="1"
                      max={getInvoiceOutstanding(collectInvoice)}
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none font-mono font-bold"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Method</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["Cash", "UPI", "Card"] as PaymentMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setCollectMethod(m)}
                          className={`py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            collectMethod === m ? "bg-slate-900 border-slate-900 text-white" : `${METHOD_COLORS[m]} hover:opacity-80`
                          }`}
                        >
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
                      {(["Owner", "Staff"] as const).map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setCollectCollectedBy(role)}
                          className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            collectCollectedBy === role ? "bg-slate-900 border-slate-900 text-white" : "bg-slate-50 border-slate-200 text-slate-600"
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Note (optional)</label>
                    <input
                      type="text"
                      value={collectNote}
                      onChange={(e) => setCollectNote(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none"
                      placeholder="e.g. Cash payment on visit"
                    />
                  </div>
                </div>

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

      {/* Lump-Sum FIFO Collect Modal */}
      {lumpSumCustomer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
              <button onClick={closeLumpSumModal} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex justify-between items-center">
                <div>
                  <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Total Outstanding Debt</p>
                  <p className="text-xl font-bold text-red-700 font-mono mt-0.5">₹{lumpSumDerivedDebt.toLocaleString()}</p>
                </div>
              </div>

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
                        lumpSumCollectedBy === who ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 text-slate-700 border-slate-200"
                      }`}
                    >
                      {who}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Cash", "UPI", "Card"] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setLumpSumMethod(m)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        lumpSumMethod === m ? "bg-emerald-600 text-white border-emerald-600" : "bg-slate-50 text-slate-700 border-slate-200"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Notes / Payment Reference</label>
                <input
                  type="text"
                  value={lumpSumNote}
                  onChange={(e) => setLumpSumNote(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none"
                  placeholder="e.g. Cheque / Cash payment..."
                />
              </div>
            </div>

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
                disabled={!lumpSumAmountInput || Number(lumpSumAmountInput) <= 0 || !lumpSumCollectedBy}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Wallet size={14} />
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Profile Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
                  <Pencil size={15} />
                </div>
                <h2 className="font-bold text-slate-800 text-base">Edit Customer Profile</h2>
              </div>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg">
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
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none"
                  placeholder="e.g. Rahul Sharma"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Phone Number</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none font-mono"
                  placeholder="e.g. 9876543210"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 p-4 bg-slate-50 border-t border-slate-200">
              <button onClick={closeEditModal} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSaveEdit} className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl cursor-pointer">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}