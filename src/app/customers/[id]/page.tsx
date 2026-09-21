"use client";

import { use, useMemo, useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import Link from "next/link";
import { formatInvoiceDate, sortInvoicesDescending } from "@/lib/dateUtils";
import { calculateRevenue } from "@/lib/revenueUtils";
import { calculateProfit } from "@/lib/profitUtils";
import {
  ArrowLeft,
  MessageCircle,
  Phone,
  AlertCircle,
  ReceiptText,
  TrendingUp,
  Calendar,
  Wallet,
  CheckCircle,
  X,
  History,
  FileText,
  RotateCcw,
  Pencil,
  Coins,
  Printer,
  Copy,
  PhoneCall,
  Award,
  Sparkles,
  Target,
  Activity,
  HeartPulse,
  User,
  ShieldCheck,
  Car,
  Clock,
  Zap,
  ArrowUpRight,
  ChevronRight,
  BarChart3,
  Wrench,
  Package,
  Tag,
  Layers,
} from "lucide-react";
import type { Invoice, PaymentMethod, PaymentStatus, DebtPayment, Customer, Product } from "@/types";
import PrintableReceipt from "@/components/PrintableReceipt";

// ─────────────────────────────────────────────────────────────────────────────
//  STYLE MAPS & CONSTANTS
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

const METHOD_COLORS: Record<PaymentMethod, string> = {
  Cash: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPI: "bg-blue-50 text-blue-700 border-blue-200",
  Card: "bg-purple-50 text-purple-700 border-purple-200",
};

export type CustomerTierLabel = "New" | "Bronze" | "Silver" | "Gold" | "VIP";

export interface CustomerTierConfig {
  label: CustomerTierLabel;
  color: string;
  badge: string;
  minSpend: number;
}

const TIER_CONFIGS: CustomerTierConfig[] = [
  { label: "New", color: "bg-blue-50 text-blue-700 border-blue-200", badge: "🌱 New", minSpend: 0 },
  { label: "Bronze", color: "bg-orange-100 text-orange-800 border-orange-300", badge: "🥉 Bronze", minSpend: 5000 },
  { label: "Silver", color: "bg-slate-100 text-slate-700 border-slate-300", badge: "🥈 Silver", minSpend: 25000 },
  { label: "Gold", color: "bg-amber-100 text-amber-800 border-amber-300", badge: "⭐ Gold", minSpend: 100000 },
  { label: "VIP", color: "bg-purple-100 text-purple-800 border-purple-300", badge: "👑 VIP", minSpend: 250000 },
];

function getTierConfig(revenue: number): CustomerTierConfig {
  if (revenue >= 250000) return TIER_CONFIGS[4];
  if (revenue >= 100000) return TIER_CONFIGS[3];
  if (revenue >= 25000) return TIER_CONFIGS[2];
  if (revenue >= 5000) return TIER_CONFIGS[1];
  return TIER_CONFIGS[0];
}

// ─────────────────────────────────────────────────────────────────────────────
//  CUSTOMER 360° INTELLIGENCE WORKSPACE
// ─────────────────────────────────────────────────────────────────────────────

export default function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const {
    state,
    getCustomerById,
    getInvoicesByCustomer,
    getCustomerOutstandingInvoices,
    getDebtPaymentsByInvoice,
    recordDebtPayment,
    recordCustomerDebtPaymentFIFO,
    showToast,
    getSalesReturnsByCustomer,
    getInvoiceOutstanding,
    getCustomerOutstandingBalance,
    updateCustomer,
    getCustomerCreditBalance,
    getCustomerCreditTransactions,
    applyStoreCreditToDebt,
  } = useStore();
  const { isOwner, loading, requireAuth } = useRole();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  // ── Tab Navigation State ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<
    "overview" | "financial" | "affinity" | "vehicles" | "timeline" | "insights" | "profitability"
  >("overview");

  // If user is Staff, ensure activeTab is set to an allowed operational tab ("timeline")
  useEffect(() => {
    if (!isOwner && activeTab !== "timeline" && activeTab !== "vehicles") {
      setActiveTab("timeline");
    }
  }, [isOwner, activeTab]);

  const [activeRightTab, setActiveRightTab] = useState<"invoices" | "ledger" | "credit">("invoices");

  // ── Modal States ──────────────────────────────────────────────────────────
  const [collectInvoice, setCollectInvoice] = useState<Invoice | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>("Cash");
  const [collectNote, setCollectNote] = useState("");
  const [collectSuccess, setCollectSuccess] = useState(false);
  const [collectCollectedBy, setCollectCollectedBy] = useState<"Owner" | "Staff" | "">("");

  const [showLumpSumModal, setShowLumpSumModal] = useState(false);
  const [lumpSumAmountInput, setLumpSumAmountInput] = useState("");
  const [lumpSumMethod, setLumpSumMethod] = useState<PaymentMethod>("Cash");
  const [lumpSumNote, setLumpSumNote] = useState("");
  const [lumpSumCollectedBy, setLumpSumCollectedBy] = useState<"Owner" | "Staff" | "">("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState("");

  const [showApplyCreditModal, setShowApplyCreditModal] = useState(false);
  const [applyCreditAmountInput, setApplyCreditAmountInput] = useState("");
  const [applyCreditNotes, setApplyCreditNotes] = useState("");
  const [applyCreditBy, setApplyCreditBy] = useState<"Owner" | "Staff" | "">("");

  const [printReceiptPayment, setPrintReceiptPayment] = useState<any | null>(null);
  const [showPrintReport, setShowPrintReport] = useState(false);

  const customer = getCustomerById(id);

  // ── Top-Level Action Handlers ──────────────────────────────────────────────
  const handleWhatsApp = useCallback(() => {
    if (!customer?.phone) return;
    window.open(`https://wa.me/91${customer.phone.replace(/\D/g, "")}`, "_blank");
  }, [customer?.phone]);

  const handleCopyPhone = useCallback(() => {
    if (!customer?.phone) {
      showToast("No phone number available.", "error");
      return;
    }
    navigator.clipboard.writeText(customer.phone);
    showToast("Phone number copied to clipboard.", "success");
  }, [customer?.phone, showToast]);

  function handleShareReceiptWhatsApp(p: any) {
    const inv = state.invoices.find((i) => i.id === p.invoiceId);
    const phone = customer?.phone || inv?.customerPhone || "";
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
      `Invoice:\n${inv?.invoiceNumber || "Invoice"}\n\n` +
      `Customer:\n${customer?.name || "Customer"}\n\n` +
      `Collected:\n₹${p.amount.toLocaleString()}\n\n` +
      `Remaining Due:\n₹${due.toLocaleString()}\n\n` +
      `Method:\n${p.method}`;

    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function openApplyCreditModal(availCredit: number, currDebt: number) {
    const maxApplicable = Math.min(availCredit, currDebt);
    setApplyCreditAmountInput(String(maxApplicable));
    setApplyCreditNotes("");
    setApplyCreditBy("");
    setShowApplyCreditModal(true);
  }

  function handleApplyCreditSubmit() {
    if (!customer) return;
    if (!applyCreditBy) {
      showToast("Please select who is applying this credit (Owner or Staff).", "error");
      return;
    }
    const amt = Number(applyCreditAmountInput) || 0;
    if (amt <= 0) {
      showToast("Please enter a valid credit amount to apply.", "error");
      return;
    }
    const availCredit = getCustomerCreditBalance(customer.id);
    const currDebt = getCustomerOutstandingBalance(customer.id);
    if (amt > availCredit) {
      showToast(`Amount cannot exceed available store credit of ₹${availCredit.toLocaleString()}.`, "error");
      return;
    }
    if (amt > currDebt) {
      showToast(`Amount cannot exceed outstanding debt of ₹${currDebt.toLocaleString()}.`, "error");
      return;
    }

    applyStoreCreditToDebt(customer.id, amt, applyCreditNotes.trim() || undefined, applyCreditBy);
    showToast(`Successfully applied ₹${amt.toLocaleString()} Store Credit towards outstanding debt.`, "success");
    setShowApplyCreditModal(false);
  }

  function openLumpSumModal(currentDebt: number) {
    setLumpSumAmountInput(String(currentDebt));
    setLumpSumMethod("Cash");
    setLumpSumNote("");
    setLumpSumCollectedBy("");
    setShowLumpSumModal(true);
  }

  function closeLumpSumModal() {
    setShowLumpSumModal(false);
    setLumpSumAmountInput("");
    setLumpSumNote("");
    setLumpSumCollectedBy("");
  }

  function handleLumpSumSubmit() {
    if (!customer) return;
    if (!lumpSumCollectedBy) {
      showToast("Please select who collected this payment (Owner or Staff).", "error");
      return;
    }
    const numAmount = Math.max(0, Number(lumpSumAmountInput) || 0);
    if (numAmount <= 0) return;

    const unpaidInvoices = getCustomerOutstandingInvoices(customer.id)
      .sort((a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime());

    let rem = numAmount;
    let totalAllocated = 0;
    let affectedCount = 0;

    for (const inv of unpaidInvoices) {
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
      customerId: customer.id,
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

  function openEditModal() {
    if (!customer) return;
    setEditName(customer.name);
    setEditPhone(customer.phone || "");
    setEditError("");
    setShowEditModal(true);
  }

  function closeEditModal() {
    setShowEditModal(false);
    setEditName("");
    setEditPhone("");
    setEditError("");
  }

  function handleSaveEdit() {
    if (!customer) return;
    const trimmedName = editName.trim();
    const trimmedPhone = editPhone.trim();
    if (!trimmedName) {
      setEditError("Customer name is required.");
      return;
    }
    try {
      updateCustomer({
        ...customer,
        name: trimmedName,
        phone: trimmedPhone,
      });
      showToast(`Customer profile updated successfully.`, "success");
      closeEditModal();
    } catch {
      setEditError("Failed to update customer.");
    }
  }

  function openCollect(inv: Invoice) {
    const effectiveDue = getInvoiceOutstanding(inv);
    setCollectInvoice(inv);
    setCollectAmount(String(effectiveDue));
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
    if (!collectInvoice || !customer) return;
    const amount = Number(collectAmount) || 0;
    if (!collectCollectedBy) {
      showToast("Please select who collected this payment.", "error");
      return;
    }
    if (amount <= 0) {
      showToast("Enter a valid amount greater than ₹0.", "error");
      return;
    }
    const effectiveDue = getInvoiceOutstanding(collectInvoice);
    if (amount > effectiveDue) {
      showToast(`Amount cannot exceed the effective due of ₹${effectiveDue.toLocaleString()}.`, "error");
      return;
    }
    recordDebtPayment({
      customerId: customer.id,
      invoiceId: collectInvoice.id,
      amount,
      date: new Date().toISOString(),
      method: collectMethod,
      note: collectNote.trim() || undefined,
      collectedBy: collectCollectedBy,
    });
    showToast(`₹${amount.toLocaleString()} collected from ${customer.name}.`, "success");
    setCollectSuccess(true);
    setTimeout(() => closeCollect(), 1400);
  }

  // ── Derived State & Selector Collections ──────────────────────────────────
  const [invoices, derivedDebt] = useMemo(() => {
    const invList = customer
      ? sortInvoicesDescending(getInvoicesByCustomer(customer.id))
      : [];
    const debt = customer ? getCustomerOutstandingBalance(customer.id) : 0;
    return [invList, debt] as const;
  }, [customer, getInvoicesByCustomer, getCustomerOutstandingBalance]);

  const outstandingInvoices = useMemo(() => {
    return customer ? getCustomerOutstandingInvoices(customer.id) : [];
  }, [customer, getCustomerOutstandingInvoices]);

  const customerTotalSpent = useMemo(() => {
    if (!customer) return 0;
    return calculateRevenue(state.invoices, state.salesReturns, undefined, customer.id);
  }, [state.invoices, state.salesReturns, customer]);

  const lifetimeProfit = useMemo(() => {
    if (!customer) return 0;
    return calculateProfit(state.invoices, state.salesReturns, state.products, undefined, customer.id);
  }, [state.invoices, state.salesReturns, state.products, customer]);

  const profitMarginPct = useMemo(() => {
    if (!customerTotalSpent || customerTotalSpent === 0) return 0;
    return Math.round((lifetimeProfit / customerTotalSpent) * 1000) / 10;
  }, [lifetimeProfit, customerTotalSpent]);

  const activeInvoices = useMemo(() => {
    return invoices.filter((inv) => !inv.voided);
  }, [invoices]);

  const avgOrderValue = useMemo(() => {
    if (!activeInvoices.length) return 0;
    return Math.round(customerTotalSpent / activeInvoices.length);
  }, [customerTotalSpent, activeInvoices]);

  const daysSinceLastVisit = useMemo(() => {
    if (!customer?.lastVisit) return null;
    const ms = Date.now() - new Date(customer.lastVisit).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }, [customer?.lastVisit]);

  const customerTier = useMemo(() => {
    return getTierConfig(customerTotalSpent);
  }, [customerTotalSpent]);

  const availableStoreCredit = useMemo(() => {
    if (!customer) return 0;
    return getCustomerCreditBalance(customer.id);
  }, [customer, getCustomerCreditBalance]);

  const creditTransactions = useMemo(() => {
    if (!customer) return [];
    return getCustomerCreditTransactions(customer.id);
  }, [customer, getCustomerCreditTransactions]);

  const customerReturns = useMemo(() => {
    if (!customer) return [];
    return getSalesReturnsByCustomer(customer.id);
  }, [customer, getSalesReturnsByCustomer]);

  const activeCustomerReturns = useMemo(() => {
    return customerReturns.filter((r) => r.status !== "Cancelled");
  }, [customerReturns]);

  const returnCount = activeCustomerReturns.length;
  const returnItemQty = activeCustomerReturns.reduce((s, r) => s + r.items.reduce((ss, i) => ss + i.quantity, 0), 0);
  const refundedTotal = activeCustomerReturns.reduce((s, r) => s + r.totalRefund, 0);

  const totalItems = useMemo(() => {
    return invoices.reduce((sum, inv) => sum + inv.items.reduce((s, i) => s + i.quantity, 0), 0);
  }, [invoices]);

  const returnRatePct = useMemo(() => {
    return totalItems > 0 ? Math.round((returnItemQty / totalItems) * 1000) / 10 : 0;
  }, [totalItems, returnItemQty]);

  // ── Financial Intelligence Aggregates ──────────────────────────────────────
  const largestInvoice = useMemo(() => {
    if (!activeInvoices.length) return null;
    return [...activeInvoices].sort((a, b) => b.total - a.total)[0];
  }, [activeInvoices]);

  const largestPayment = useMemo(() => {
    if (!customer) return null;
    const custDebtPayments = (state.debtPayments || []).filter(
      (p) => p.customerId === customer.id || invoices.some((inv) => inv.id === p.invoiceId)
    );
    if (!custDebtPayments.length) return null;
    return [...custDebtPayments].sort((a, b) => b.amount - a.amount)[0];
  }, [customer, state.debtPayments, invoices]);

  // ── Buying Behaviour & Frequency Metrics ──────────────────────────────────
  const buyingBehaviour = useMemo(() => {
    const purchaseCount = activeInvoices.length;
    const avgBasketSize = purchaseCount > 0 ? (totalItems / purchaseCount).toFixed(1) : "0";

    let avgDaysBetween = 0;
    if (purchaseCount >= 2) {
      const sortedAsc = [...activeInvoices].sort(
        (a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime()
      );
      const firstDate = new Date(sortedAsc[0].createdAt || sortedAsc[0].date).getTime();
      const lastDate = new Date(sortedAsc[sortedAsc.length - 1].createdAt || sortedAsc[sortedAsc.length - 1].date).getTime();
      const totalSpanDays = Math.max(1, Math.floor((lastDate - firstDate) / (1000 * 60 * 60 * 24)));
      avgDaysBetween = Math.round(totalSpanDays / (purchaseCount - 1));
    }

    const repeatPurchaseRate = purchaseCount > 1 ? 100 : purchaseCount === 1 ? 0 : 0;

    const nowMs = Date.now();
    const sixtyDaysAgoMs = nowMs - 60 * 24 * 60 * 60 * 1000;
    const oneTwentyDaysAgoMs = nowMs - 120 * 24 * 60 * 60 * 1000;

    let recentSpend = 0;
    let priorSpend = 0;

    activeInvoices.forEach((inv) => {
      const t = new Date(inv.createdAt || inv.date).getTime();
      if (t >= sixtyDaysAgoMs) {
        recentSpend += inv.total;
      } else if (t >= oneTwentyDaysAgoMs) {
        priorSpend += inv.total;
      }
    });

    let buyingTrend: "Increasing" | "Stable" | "Declining" = "Stable";
    if (recentSpend > priorSpend * 1.15) buyingTrend = "Increasing";
    else if (recentSpend < priorSpend * 0.85) buyingTrend = "Declining";

    return {
      purchaseCount,
      avgBasketSize,
      avgDaysBetween,
      repeatPurchaseRate,
      buyingTrend,
    };
  }, [activeInvoices, totalItems]);

  // ── Product Affinity ──────────────────────────────────────────────────────
  const productAffinity = useMemo(() => {
    const categoryMap: Record<string, { name: string; count: number; revenue: number }> = {};
    const brandMap: Record<string, { name: string; count: number; revenue: number }> = {};
    const productMap: Record<string, { id: string; name: string; count: number; revenue: number }> = {};

    activeInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        const prod = state.products.find((p) => p.id === item.productId);
        const catName = prod?.category || "General Parts";
        const brandName = prod?.brand || "AutoVault Direct";
        const prodName = item.name;
        const lineRev = item.quantity * item.price;

        if (!categoryMap[catName]) categoryMap[catName] = { name: catName, count: 0, revenue: 0 };
        categoryMap[catName].count += item.quantity;
        categoryMap[catName].revenue += lineRev;

        if (!brandMap[brandName]) brandMap[brandName] = { name: brandName, count: 0, revenue: 0 };
        brandMap[brandName].count += item.quantity;
        brandMap[brandName].revenue += lineRev;

        if (!productMap[item.productId]) productMap[item.productId] = { id: item.productId, name: prodName, count: 0, revenue: 0 };
        productMap[item.productId].count += item.quantity;
        productMap[item.productId].revenue += lineRev;
      });
    });

    const topCategories = Object.values(categoryMap).sort((a, b) => b.revenue - a.revenue);
    const topBrands = Object.values(brandMap).sort((a, b) => b.revenue - a.revenue);
    const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);

    const maxCatRev = topCategories[0]?.revenue || 1;
    const maxBrandRev = topBrands[0]?.revenue || 1;
    const maxProdRev = topProducts[0]?.revenue || 1;

    return {
      categories: topCategories.map((c) => ({ ...c, barPct: Math.round((c.revenue / maxCatRev) * 100) })),
      brands: topBrands.map((b) => ({ ...b, barPct: Math.round((b.revenue / maxBrandRev) * 100) })),
      products: topProducts.map((p) => ({ ...p, barPct: Math.round((p.revenue / maxProdRev) * 100) })),
    };
  }, [activeInvoices, state.products]);

  // ── Vehicle Intelligence ──────────────────────────────────────────────────
  const vehicleIntelligence = useMemo(() => {
    const vehicleMap: Record<string, { model: string; number?: string; count: number; spend: number; invoices: Invoice[] }> = {};
    let universalCount = 0;
    let specificCount = 0;
    const vehicleCategoryCounts: Record<string, number> = {};

    activeInvoices.forEach((inv) => {
      if (inv.vehicleModel) {
        const key = `${inv.vehicleModel}_${inv.vehicleNumber || ""}`;
        if (!vehicleMap[key]) {
          vehicleMap[key] = {
            model: inv.vehicleModel,
            number: inv.vehicleNumber,
            count: 0,
            spend: 0,
            invoices: [],
          };
        }
        vehicleMap[key].count += 1;
        vehicleMap[key].spend += inv.total;
        vehicleMap[key].invoices.push(inv);

        const vLower = inv.vehicleModel.toLowerCase();
        let vCat = "Cars";
        if (vLower.includes("bike") || vLower.includes("scooter") || vLower.includes("royal") || vLower.includes("honda activa")) vCat = "Two Wheelers";
        else if (vLower.includes("truck") || vLower.includes("bus") || vLower.includes("bolero") || vLower.includes("tata")) vCat = "Commercial & Heavy";
        else if (vLower.includes("suv") || vLower.includes("creta") || vLower.includes("fortuner") || vLower.includes("thar")) vCat = "SUVs & 4x4";
        vehicleCategoryCounts[vCat] = (vehicleCategoryCounts[vCat] || 0) + 1;
      }

      inv.items.forEach((item) => {
        const p = state.products.find((prod) => prod.id === item.productId);
        if (p?.isUniversalFit || !p?.fitments || p.fitments.length === 0) {
          universalCount += item.quantity;
        } else {
          specificCount += item.quantity;
        }
      });
    });

    const vehiclesList = Object.values(vehicleMap).sort((a, b) => b.spend - a.spend);
    const mostActiveVehicle = vehiclesList[0] || null;
    const totalVehiclesCount = vehiclesList.length;

    const totalFitItems = universalCount + specificCount;
    const universalFitPct = totalFitItems > 0 ? Math.round((universalCount / totalFitItems) * 100) : 100;
    const topVehicleCategory = Object.entries(vehicleCategoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "General Automotive";

    return {
      vehiclesList,
      mostActiveVehicle,
      totalVehiclesCount,
      universalFitPct,
      topVehicleCategory,
    };
  }, [activeInvoices, state.products]);

  // ── Customer Timeline & Chronological Ledger ──────────────────────────────
  const chronologicalLedger = useMemo(() => {
    if (!customer) return [];
    type LedgerEvent = {
      id: string;
      date: string;
      title: string;
      type: "Invoice" | "Payment" | "Return" | "Credit";
      badge: string;
      badgeColor: string;
      details: string;
      reference: string;
      amount?: number;
      debtDelta?: number;
      creditDelta?: number;
      paymentObj?: DebtPayment;
    };

    const list: LedgerEvent[] = [];

    // Invoices
    invoices.forEach((inv) => {
      list.push({
        id: `inv-${inv.id}`,
        date: inv.createdAt || inv.date,
        title: `Invoice ${inv.invoiceNumber}`,
        type: "Invoice",
        badge: inv.voided ? "Voided Invoice" : inv.paymentStatus,
        badgeColor: inv.voided ? "bg-red-100 text-red-700" : STATUS_BADGE[inv.paymentStatus] || "bg-slate-100 text-slate-700",
        details: `Billed: ₹${inv.total.toLocaleString()} · Paid POS: ₹${inv.amountPaid.toLocaleString()} · Method: ${inv.paymentMethod}${inv.vehicleModel ? ` · Vehicle: ${inv.vehicleModel}` : ""}`,
        reference: inv.invoiceNumber,
        amount: inv.total,
        debtDelta: inv.voided ? 0 : inv.dueAmount,
      });
    });

    // Debt repayments
    const custDebtPayments = (state.debtPayments || []).filter(
      (p) => p.customerId === customer.id || invoices.some((inv) => inv.id === p.invoiceId)
    );
    custDebtPayments.forEach((p) => {
      const targetInv = state.invoices.find((i) => i.id === p.invoiceId);
      const receiptNo = p.receiptNumber || "Legacy";
      list.push({
        id: `pmt-${p.id}`,
        date: p.date,
        title: p.voided ? `Payment Voided (${receiptNo} · ${targetInv?.invoiceNumber || "Debt"})` : `Debt Payment (${receiptNo} · ${targetInv?.invoiceNumber || "Debt"})`,
        type: "Payment",
        badge: p.voided ? "Voided Payment" : `Payment (${p.method})`,
        badgeColor: p.voided ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800",
        details: `Receipt #: ${receiptNo} · Amount: ₹${p.amount.toLocaleString()} · Method: ${p.method} · Collected by: ${p.collectedBy}${p.note ? ` (${p.note})` : ""}`,
        reference: targetInv?.invoiceNumber || "Payment",
        amount: p.amount,
        debtDelta: p.voided ? 0 : -p.amount,
        paymentObj: p,
      });
    });

    // Sales Returns
    const custSalesReturns = (state.salesReturns || []).filter(
      (r) => r.customerId === customer.id || invoices.some((inv) => inv.id === r.invoiceId)
    );
    custSalesReturns.forEach((r) => {
      const targetInv = state.invoices.find((i) => i.id === r.invoiceId);
      const itemsStr = r.items.map((it) => `${it.productName} ×${it.quantity}`).join(", ");
      const isCancelled = r.status === "Cancelled";

      list.push({
        id: `sr-${r.id}`,
        date: r.createdAt,
        title: `Sales Return ${r.returnNumber} (${targetInv?.invoiceNumber || "Invoice"})`,
        type: "Return",
        badge: isCancelled ? "Cancelled Return" : `Return (${r.refundMethod})`,
        badgeColor: isCancelled ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-800",
        details: `Items: ${itemsStr} · Cash Refund: ₹${(r.cashRefunded ?? 0).toLocaleString()} · Debt Cancelled: ₹${(r.debtCancelled ?? r.debtAdjusted ?? 0).toLocaleString()}${r.creditCreated ? ` · Credit Created: ₹${r.creditCreated.toLocaleString()}` : ""}`,
        reference: r.returnNumber,
        amount: r.totalRefund,
        debtDelta: isCancelled ? 0 : -(r.debtCancelled ?? r.debtAdjusted ?? 0),
        creditDelta: isCancelled ? 0 : (r.creditCreated ?? 0),
      });
    });

    // Store Credit Txs
    creditTransactions.forEach((tx) => {
      if (tx.salesReturnId) return;
      list.push({
        id: `cct-${tx.id}`,
        date: tx.date,
        title: `Store Credit ${tx.type}`,
        type: "Credit",
        badge: tx.type,
        badgeColor: tx.type === "Issue" ? "bg-emerald-100 text-emerald-800" : tx.type === "Redeem" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800",
        details: `${tx.notes || "Store Credit transaction"}`,
        reference: tx.invoiceId ? (state.invoices.find((i) => i.id === tx.invoiceId)?.invoiceNumber || "Invoice") : "Store Credit",
        amount: tx.amount,
        creditDelta: tx.type === "Issue" ? tx.amount : -tx.amount,
      });
    });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [customer, invoices, state.debtPayments, state.salesReturns, state.invoices, creditTransactions]);

  // ── Credit Intelligence Metrics ──────────────────────────────────────────
  const creditIntelligence = useMemo(() => {
    const unpaidInvoices = [...outstandingInvoices].sort(
      (a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime()
    );
    const oldestDueInvoice = unpaidInvoices[0] || null;

    let totalDelayDays = 0;
    let paymentCount = 0;

    const custDebtPayments = (state.debtPayments || []).filter(
      (p) => p.customerId === customer?.id || invoices.some((inv) => inv.id === p.invoiceId)
    );

    custDebtPayments.forEach((p) => {
      const inv = state.invoices.find((i) => i.id === p.invoiceId);
      if (inv) {
        paymentCount++;
        const invDate = new Date(inv.createdAt || inv.date).getTime();
        const pmtDate = new Date(p.date).getTime();
        const delay = Math.max(0, Math.floor((pmtDate - invDate) / (1000 * 60 * 60 * 24)));
        totalDelayDays += delay;
      }
    });

    const avgPaymentDelayDays = paymentCount > 0 ? Math.round(totalDelayDays / paymentCount) : 0;
    const onTimePaidPct = activeInvoices.length > 0 ? Math.round(((activeInvoices.length - outstandingInvoices.length) / activeInvoices.length) * 100) : 100;

    const totalCreditIssued = creditTransactions.filter((t) => t.type === "Issue").reduce((s, t) => s + t.amount, 0);
    const totalCreditUsed = creditTransactions.filter((t) => t.type === "Redeem").reduce((s, t) => s + t.amount, 0);
    const creditUtilizationPct = totalCreditIssued > 0 ? Math.round((totalCreditUsed / totalCreditIssued) * 100) : 0;

    let debtStatus: "Healthy" | "Warning" | "Critical" = "Healthy";
    if (derivedDebt >= 5000) debtStatus = "Critical";
    else if (derivedDebt > 0) debtStatus = "Warning";

    return {
      oldestDueInvoice,
      avgPaymentDelayDays,
      onTimePaidPct,
      creditUtilizationPct,
      totalCreditIssued,
      totalCreditUsed,
      debtStatus,
    };
  }, [outstandingInvoices, invoices, customer, state.debtPayments, state.invoices, activeInvoices, creditTransactions, derivedDebt]);

  // ── Customer Health Score Breakdown ───────────────────────────────────────
  const customerHealth = useMemo(() => {
    let activityScore = 15;
    if (daysSinceLastVisit === null) activityScore = 0;
    else if (daysSinceLastVisit <= 30) activityScore = 15;
    else if (daysSinceLastVisit <= 60) activityScore = 12;
    else if (daysSinceLastVisit <= 90) activityScore = 9;
    else if (daysSinceLastVisit <= 180) activityScore = 5;
    else activityScore = 0;

    const pCount = activeInvoices.length;
    let frequencyScore = 0;
    if (pCount >= 10) frequencyScore = 25;
    else if (pCount >= 5) frequencyScore = 20;
    else if (pCount >= 3) frequencyScore = 15;
    else if (pCount >= 1) frequencyScore = 10;
    else frequencyScore = 0;

    let paymentScore = 20;
    if (derivedDebt >= 5000) paymentScore = 8;
    else if (derivedDebt > 0) paymentScore = 14;
    else paymentScore = 20;

    let profitScore = 8;
    if (profitMarginPct >= 30) profitScore = 20;
    else if (profitMarginPct >= 20) profitScore = 16;
    else if (profitMarginPct >= 10) profitScore = 12;
    else if (profitMarginPct > 0) profitScore = 8;
    else profitScore = 0;

    let returnsScore = 20;
    if (returnRatePct === 0) returnsScore = 20;
    else if (returnRatePct <= 3) returnsScore = 16;
    else if (returnRatePct <= 7) returnsScore = 12;
    else if (returnRatePct <= 15) returnsScore = 6;
    else returnsScore = 0;

    const totalScore = activityScore + frequencyScore + paymentScore + profitScore + returnsScore;

    let status: "Excellent" | "Healthy" | "Moderate" | "Needs Attention" | "Critical" = "Healthy";
    let statusColor = "bg-blue-100 text-blue-800 border-blue-300";

    if (totalScore >= 85) { status = "Excellent"; statusColor = "bg-emerald-100 text-emerald-800 border-emerald-300"; }
    else if (totalScore >= 70) { status = "Healthy"; statusColor = "bg-blue-100 text-blue-800 border-blue-300"; }
    else if (totalScore >= 55) { status = "Moderate"; statusColor = "bg-amber-100 text-amber-800 border-amber-300"; }
    else if (totalScore >= 40) { status = "Needs Attention"; statusColor = "bg-orange-100 text-orange-800 border-orange-300"; }
    else { status = "Critical"; statusColor = "bg-red-100 text-red-800 border-red-300"; }

    return {
      totalScore,
      status,
      statusColor,
      breakdown: {
        activityScore,
        frequencyScore,
        paymentScore,
        profitScore,
        returnsScore,
      },
    };
  }, [daysSinceLastVisit, activeInvoices.length, derivedDebt, profitMarginPct, returnRatePct]);

  // ── Monthly Revenue & Profit History ─────────────────────────────────────
  const monthlyHistory = useMemo(() => {
    const monthMap: Record<string, { month: string; revenue: number; profit: number; invoices: number }> = {};

    activeInvoices.forEach((inv) => {
      const dateObj = new Date(inv.createdAt || inv.date);
      if (isNaN(dateObj.getTime())) return;
      const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;
      const displayMonth = dateObj.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

      if (!monthMap[key]) monthMap[key] = { month: displayMonth, revenue: 0, profit: 0, invoices: 0 };
      monthMap[key].revenue += inv.total;
      monthMap[key].invoices += 1;
    });

    const sortedMonths = Object.keys(monthMap).sort().map((k) => {
      const data = monthMap[k];
      const monthInvs = activeInvoices.filter((inv) => {
        const d = new Date(inv.createdAt || inv.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === k;
      });
      const prof = calculateProfit(monthInvs, state.salesReturns, state.products, undefined, customer?.id);
      return { ...data, profit: prof };
    });

    const maxRev = Math.max(1, ...sortedMonths.map((m) => m.revenue));
    return sortedMonths.map((m) => ({ ...m, barPct: Math.round((m.revenue / maxRev) * 100) }));
  }, [activeInvoices, state.salesReturns, state.products, customer]);

  // ── Smart Recommendations Engine ─────────────────────────────────────────
  const smartRecommendations = useMemo(() => {
    interface SmartRec {
      id: string;
      type: "Critical" | "Warning" | "Opportunity" | "Info";
      badge: string;
      badgeColor: string;
      title: string;
      description: string;
      actionText?: string;
      onClickAction?: () => void;
    }

    const list: SmartRec[] = [];

    if (derivedDebt > 0) {
      list.push({
        id: "rec-debt",
        type: "Critical",
        badge: "Debt Collection",
        badgeColor: "bg-red-100 text-red-800 border-red-200",
        title: `Collect Outstanding Debt of ₹${derivedDebt.toLocaleString()}`,
        description: `Customer has ${outstandingInvoices.length} unpaid invoice(s). Early recovery advised.`,
        actionText: "Collect Payment",
        onClickAction: () => openLumpSumModal(derivedDebt),
      });
    }

    if (daysSinceLastVisit !== null && daysSinceLastVisit > 90) {
      list.push({
        id: "rec-churn",
        type: "Warning",
        badge: "Retention Alert",
        badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
        title: `Customer Inactive for ${daysSinceLastVisit} Days`,
        description: `Customer is at risk of churning. Send a courtesy follow-up message on WhatsApp.`,
        actionText: "WhatsApp Courtesy Message",
        onClickAction: handleWhatsApp,
      });
    }

    if (availableStoreCredit > 0) {
      list.push({
        id: "rec-credit",
        type: "Opportunity",
        badge: "Store Credit",
        badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
        title: `Customer Holds ₹${availableStoreCredit.toLocaleString()} Unused Store Credit`,
        description: derivedDebt > 0
          ? `Store Credit can be applied directly to offset ₹${derivedDebt.toLocaleString()} of outstanding debt.`
          : `Remind customer on next visit to redeem active store credit balance at checkout.`,
        actionText: derivedDebt > 0 ? "Apply Credit to Debt" : undefined,
        onClickAction: derivedDebt > 0 ? () => openApplyCreditModal(availableStoreCredit, derivedDebt) : undefined,
      });
    }

    if (customerTier.label === "VIP" || customerTier.label === "Gold") {
      list.push({
        id: "rec-vip",
        type: "Opportunity",
        badge: "VIP Service",
        badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
        title: `High LTV ${customerTier.label} Patron (₹${customerTotalSpent.toLocaleString()} Spent)`,
        description: `Ensure priority fulfillment and dedicated customer support on all future purchases.`,
      });
    }

    if (productAffinity.categories[0]) {
      list.push({
        id: "rec-reorder",
        type: "Info",
        badge: "Reorder Prediction",
        badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
        title: `Frequent Purchases in ${productAffinity.categories[0].name}`,
        description: `Customer frequently purchases ${productAffinity.categories[0].name} items (${productAffinity.categories[0].count} units bought).`,
      });
    }

    if (returnRatePct > 5) {
      list.push({
        id: "rec-return",
        type: "Warning",
        badge: "High Return Rate",
        badgeColor: "bg-orange-100 text-orange-800 border-orange-200",
        title: `High Item Return Rate (${returnRatePct}%)`,
        description: `${returnCount} sales returns recorded (${returnItemQty} items). Verify vehicle compatibility prior to issuing new invoices.`,
      });
    }

    return list;
  }, [derivedDebt, outstandingInvoices, daysSinceLastVisit, availableStoreCredit, customerTier, customerTotalSpent, productAffinity, returnRatePct, returnCount, returnItemQty, handleWhatsApp]);

  // ── Predictive Insights Advisor ──────────────────────────────────────────
  const predictiveInsights = useMemo(() => {
    const avgDays = buyingBehaviour.avgDaysBetween || 45;
    const lastVisitMs = customer?.lastVisit ? new Date(customer.lastVisit).getTime() : Date.now();
    const expectedNextVisitMs = lastVisitMs + avgDays * 24 * 60 * 60 * 1000;
    const expectedNextVisitStr = new Date(expectedNextVisitMs).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const likelyCategories = productAffinity.categories.slice(0, 2).map((c) => c.name).join(" & ") || "Automotive Supplies";

    let churnRisk: "Low" | "Medium" | "High" = "Low";
    let confidence: "High" | "Medium" | "Low" = "High";

    if (daysSinceLastVisit !== null) {
      if (daysSinceLastVisit > 180) { churnRisk = "High"; confidence = "High"; }
      else if (daysSinceLastVisit > 90) { churnRisk = "Medium"; confidence = "High"; }
      else { churnRisk = "Low"; confidence = activeInvoices.length >= 3 ? "High" : "Medium"; }
    } else {
      confidence = "Low";
    }

    return {
      expectedNextVisitStr,
      likelyReorderWindow: `${avgDays} days`,
      likelyCategories,
      churnRisk,
      confidence,
    };
  }, [buyingBehaviour, customer, productAffinity, daysSinceLastVisit, activeInvoices]);

  // ── Customer Relationship Profile ────────────────────────────────────────
  const relationshipProfile = useMemo(() => {
    const methodCounts: Record<string, number> = {};
    activeInvoices.forEach((i) => {
      methodCounts[i.paymentMethod] = (methodCounts[i.paymentMethod] || 0) + 1;
    });
    const preferredPaymentMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Cash";

    const customerSince = invoices.length > 0 && invoices[invoices.length - 1]?.date
      ? new Date(invoices[invoices.length - 1].date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
      : "Established Patron";

    return {
      preferredPaymentMethod,
      preferredContactMethod: customer?.phone ? "WhatsApp & Phone" : "In Person",
      customerSince,
    };
  }, [activeInvoices, customer, invoices]);

  // ── Profitability Matrix Breakdown ───────────────────────────────────────
  const profitabilityBreakdown = useMemo(() => {
    const catProfit: Record<string, { name: string; revenue: number; profit: number }> = {};
    const brandProfit: Record<string, { name: string; revenue: number; profit: number }> = {};

    activeInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        const prod = state.products.find((p) => p.id === item.productId);
        const catName = prod?.category || "General Parts";
        const brandName = prod?.brand || "AutoVault Direct";

        const lineRev = item.quantity * item.price;
        const unitCost = item.costPrice ?? prod?.currentCost ?? 0;
        const lineProfit = lineRev - (item.quantity * unitCost);

        if (!catProfit[catName]) catProfit[catName] = { name: catName, revenue: 0, profit: 0 };
        catProfit[catName].revenue += lineRev;
        catProfit[catName].profit += lineProfit;

        if (!brandProfit[brandName]) brandProfit[brandName] = { name: brandName, revenue: 0, profit: 0 };
        brandProfit[brandName].revenue += lineRev;
        brandProfit[brandName].profit += lineProfit;
      });
    });

    const categoryMatrix = Object.values(catProfit).map((c) => ({
      ...c,
      marginPct: c.revenue > 0 ? Math.round((c.profit / c.revenue) * 1000) / 10 : 0,
    })).sort((a, b) => b.profit - a.profit);

    const brandMatrix = Object.values(brandProfit).map((b) => ({
      ...b,
      marginPct: b.revenue > 0 ? Math.round((b.profit / b.revenue) * 1000) / 10 : 0,
    })).sort((a, b) => b.profit - a.profit);

    return { categoryMatrix, brandMatrix };
  }, [activeInvoices, state.products]);

  // ── Early return for non-existent customer ───────────────────────────────
  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle size={40} className="text-slate-300" />
        <p className="text-slate-500 text-sm">Customer not found.</p>
        <Link href="/customers" className="text-sm text-amber-600 hover:underline">
          ← Back to Customers Directory
        </Link>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* ── TOP ACTION & BACK NAVIGATION BAR ────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/customers"
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors font-medium min-h-[44px] shrink-0"
          >
            <ArrowLeft size={16} />
            Back to Customers Directory
          </Link>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {derivedDebt > 0 && (
            <button
              onClick={() => openLumpSumModal(derivedDebt)}
              className="flex-1 sm:flex-none min-h-[44px] flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-colors font-bold shadow-xs cursor-pointer"
            >
              <Wallet size={15} />
              Collect Customer Debt
            </button>
          )}

          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="min-h-[44px] px-3.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Call Customer"
            >
              <PhoneCall size={15} />
              <span>Call</span>
            </a>
          )}

          {customer.phone && (
            <button
              onClick={handleCopyPhone}
              className="min-h-[44px] min-w-[44px] p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center transition-colors cursor-pointer"
              title="Copy Phone Number"
            >
              <Copy size={15} />
            </button>
          )}

          {customer.phone && (
            <button
              onClick={handleWhatsApp}
              className="min-h-[44px] px-3.5 bg-green-500 hover:bg-green-600 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="WhatsApp Customer"
            >
              <MessageCircle size={15} />
              <span>WhatsApp</span>
            </button>
          )}

          <button
            onClick={openEditModal}
            className="min-h-[44px] px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm rounded-xl transition-colors font-semibold cursor-pointer flex items-center justify-center gap-1.5"
            title="Edit Customer Profile"
          >
            <Pencil size={15} />
            <span>Edit</span>
          </button>

          {isOwner && (
            <button
              onClick={() => setShowPrintReport(true)}
              className="min-h-[44px] px-3.5 bg-navy-950 hover:bg-navy-900 text-white text-xs sm:text-sm rounded-xl transition-colors font-bold cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              title="Print 360° Executive Customer Report"
            >
              <Printer size={15} />
              <span>Print 360° Report</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 1. EXECUTIVE HEADER BANNER ─────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-navy-950 via-slate-900 to-navy-900 text-white rounded-2xl p-6 shadow-md border border-navy-800 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-yellow-400 text-navy-950 flex items-center justify-center text-2xl font-black shadow-md shrink-0">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black text-white tracking-tight">{customer.name}</h1>
                {isOwner && (
                  <>
                    <span className={`text-xs font-black px-3 py-1 rounded-full border ${customerTier.color}`}>
                      {customerTier.badge} Customer
                    </span>
                    <span className={`text-xs font-black px-3 py-1 rounded-full border ${customerHealth.statusColor}`}>
                      ♥ Health: {customerHealth.totalScore}/100 ({customerHealth.status})
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-300 flex-wrap pt-1">
                {customer.phone && (
                  <span className="flex items-center gap-1 font-mono">
                    <Phone size={13} className="text-yellow-400" />
                    {customer.phone}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar size={13} className="text-blue-400" />
                  Customer Since: {relationshipProfile.customerSince}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={13} className="text-amber-400" />
                  Last Visit: {customer.lastVisit || "—"} ({daysSinceLastVisit !== null ? `${daysSinceLastVisit}d ago` : "No visits"})
                </span>
              </div>
            </div>
          </div>

          {/* Key Metrics Pill Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {isOwner && (
              <>
                <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-xl text-center">
                  <span className="text-[10px] font-extrabold uppercase text-yellow-400 block">Lifetime Revenue</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">₹{customerTotalSpent.toLocaleString()}</span>
                </div>
                <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-xl text-center">
                  <span className="text-[10px] font-extrabold uppercase text-purple-300 block">Lifetime Profit</span>
                  <span className="text-lg font-black text-purple-300 font-mono">₹{lifetimeProfit.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400 block">{profitMarginPct}% Margin</span>
                </div>
              </>
            )}
            <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-xl text-center">
              <span className="text-[10px] font-extrabold uppercase text-red-400 block">Outstanding Debt</span>
              <span className={`text-lg font-black font-mono ${derivedDebt > 0 ? "text-red-400" : "text-emerald-400"}`}>
                ₹{derivedDebt.toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-xl text-center">
              <span className="text-[10px] font-extrabold uppercase text-emerald-400 block">Store Credit</span>
              <span className="text-lg font-black text-emerald-400 font-mono">₹{availableStoreCredit.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 360° WORKSPACE NAVIGATION TABS ─────────────────────────────────── */}
      <div className="flex border-b border-slate-200 bg-white rounded-2xl p-1 shadow-2xs overflow-x-auto">
        {(isOwner
          ? [
              { id: "overview", label: "Executive Overview", icon: Target },
              { id: "financial", label: "Financial & Credit", icon: Wallet },
              { id: "affinity", label: "Product & Category Affinity", icon: Tag },
              { id: "vehicles", label: "Vehicle Intelligence", icon: Car },
              { id: "timeline", label: "Chronological Ledger", icon: History },
              { id: "insights", label: "Predictive & Recommendations", icon: Sparkles },
              { id: "profitability", label: "Profitability Breakdown", icon: BarChart3 },
            ]
          : [
              { id: "timeline", label: "Invoices & Chronological Ledger", icon: History },
              { id: "vehicles", label: "Vehicle History", icon: Car },
            ]
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shrink-0 cursor-pointer ${
                active
                  ? "bg-navy-950 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Icon size={14} className={active ? "text-yellow-400" : "text-slate-400"} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
           TAB CONTENT SECTIONS (WITH OWNER RESTRICTIONS)
      ─────────────────────────────────────────────────────────────────────── */}

      {/* ── TAB 1: EXECUTIVE OVERVIEW & HEALTH (OWNER ONLY) ────────────────── */}
      {isOwner && activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <HeartPulse size={18} className="text-red-500" />
                    <h2 className="text-base font-bold text-slate-900">Customer Health Score</h2>
                  </div>
                  <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${customerHealth.statusColor}`}>
                    {customerHealth.status}
                  </span>
                </div>

                <div className="flex items-center justify-center my-4">
                  <div className="relative w-32 h-32 rounded-full border-8 border-slate-100 flex items-center justify-center bg-slate-50 shadow-inner">
                    <div className="text-center">
                      <span className="text-3xl font-black text-slate-900 font-mono">{customerHealth.totalScore}</span>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">out of 100</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Activity &amp; Recency:</span>
                    <span className="font-bold text-slate-800 font-mono">{customerHealth.breakdown.activityScore} / 15</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Purchase Frequency:</span>
                    <span className="font-bold text-slate-800 font-mono">{customerHealth.breakdown.frequencyScore} / 25</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Payment &amp; Debt Health:</span>
                    <span className="font-bold text-slate-800 font-mono">{customerHealth.breakdown.paymentScore} / 20</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Profitability Margin:</span>
                    <span className="font-bold text-slate-800 font-mono">{customerHealth.breakdown.profitScore} / 20</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500 font-medium">Return Rate Compliance:</span>
                    <span className="font-bold text-slate-800 font-mono">{customerHealth.breakdown.returnsScore} / 20</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Award size={18} className="text-yellow-600" />
                    <h2 className="text-base font-bold text-slate-900">Customer Journey Tier</h2>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">LTV Spend Progression</span>
                </div>

                <div className="space-y-4 my-2">
                  {TIER_CONFIGS.map((t) => {
                    const isCurrent = customerTier.label === t.label;
                    const isPassed = customerTotalSpent >= t.minSpend;
                    return (
                      <div
                        key={t.label}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                          isCurrent
                            ? `${t.color} font-black shadow-xs`
                            : isPassed
                              ? "bg-slate-50/80 border-slate-200 text-slate-700 opacity-80"
                              : "bg-white border-slate-100 text-slate-400 opacity-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{t.badge.split(" ")[0]}</span>
                          <div>
                            <p className="text-xs font-extrabold">{t.label} Tier</p>
                            <p className="text-[10px] opacity-80 font-mono">Min Spend: ₹{t.minSpend.toLocaleString()}</p>
                          </div>
                        </div>
                        {isCurrent ? (
                          <span className="text-[10px] font-black uppercase tracking-wider bg-navy-950 text-white px-2 py-0.5 rounded-full">
                            Current Level
                          </span>
                        ) : isPassed ? (
                          <CheckCircle size={14} className="text-emerald-600" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Activity size={18} className="text-purple-600" />
                    <h2 className="text-base font-bold text-slate-900">Buying Behaviour &amp; Velocity</h2>
                  </div>
                  <span className={`text-xs font-black px-2 py-0.5 rounded border ${
                    buyingBehaviour.buyingTrend === "Increasing" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    buyingBehaviour.buyingTrend === "Declining" ? "bg-red-50 text-red-700 border-red-200" :
                    "bg-slate-100 text-slate-700 border-slate-200"
                  }`}>
                    {buyingBehaviour.buyingTrend === "Increasing" ? "▲ Increasing Velocity" :
                     buyingBehaviour.buyingTrend === "Declining" ? "▼ Declining Velocity" : "▶ Stable Velocity"}
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-600 font-medium">Total Completed Orders:</span>
                    <span className="font-bold text-slate-900 font-mono">{buyingBehaviour.purchaseCount} invoices</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-600 font-medium">Average Basket Value (AOV):</span>
                    <span className="font-bold text-blue-700 font-mono">₹{avgOrderValue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-600 font-medium">Average Basket Size:</span>
                    <span className="font-bold text-purple-700 font-mono">{buyingBehaviour.avgBasketSize} items / order</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-600 font-medium">Avg Days Between Purchases:</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {buyingBehaviour.avgDaysBetween > 0 ? `${buyingBehaviour.avgDaysBetween} days` : "Single Purchase"}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-600 font-medium">Store-wide Return Rate:</span>
                    <span className={`font-bold font-mono ${returnRatePct > 5 ? "text-orange-600" : "text-emerald-700"}`}>
                      {returnRatePct}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-navy-950" />
                <h2 className="text-base font-bold text-slate-900">Monthly Revenue &amp; Profit History</h2>
              </div>
              <span className="text-xs text-slate-400 font-medium">Chronological monthly spend</span>
            </div>

            {monthlyHistory.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No monthly sales history recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {monthlyHistory.map((m) => (
                  <div key={m.month} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">{m.month}</span>
                      <div className="space-x-3 font-mono">
                        <span className="text-emerald-700 font-bold">Revenue: ₹{m.revenue.toLocaleString()}</span>
                        <span className="text-purple-700 font-bold">Profit: ₹{m.profit.toLocaleString()}</span>
                        <span className="text-slate-400">({m.invoices} orders)</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                        style={{ width: `${m.barPct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: FINANCIAL INTELLIGENCE & CREDIT (OWNER ONLY) ─────────────── */}
      {isOwner && activeTab === "financial" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-1">Lifetime Net Revenue</span>
              <p className="text-2xl font-black text-emerald-600 font-mono">₹{customerTotalSpent.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">Deducts sales returns &amp; exchanges</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-1">Lifetime Gross Profit</span>
              <p className="text-2xl font-black text-purple-700 font-mono">₹{lifetimeProfit.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">{profitMarginPct}% Gross Margin</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-1">Average Order Value</span>
              <p className="text-2xl font-black text-blue-600 font-mono">₹{avgOrderValue.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">Across {activeInvoices.length} completed orders</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-1">Outstanding Ledger Debt</span>
              <p className={`text-2xl font-black font-mono ${derivedDebt > 0 ? "text-red-600" : "text-emerald-600"}`}>
                ₹{derivedDebt.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500 mt-1">Uncollected open dues</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-yellow-600" />
                    <h2 className="text-base font-bold text-slate-900">Credit Intelligence &amp; Risk</h2>
                  </div>
                  <span className={`text-xs font-black px-2.5 py-0.5 rounded border ${
                    creditIntelligence.debtStatus === "Critical" ? "bg-red-100 text-red-800 border-red-300" :
                    creditIntelligence.debtStatus === "Warning" ? "bg-amber-100 text-amber-800 border-amber-300" :
                    "bg-emerald-100 text-emerald-800 border-emerald-300"
                  }`}>
                    {creditIntelligence.debtStatus} Status
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-600 font-medium">Oldest Unpaid Invoice:</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {creditIntelligence.oldestDueInvoice
                        ? `${creditIntelligence.oldestDueInvoice.invoiceNumber} (${formatInvoiceDate(creditIntelligence.oldestDueInvoice)})`
                        : "No unpaid dues"}
                    </span>
                  </div>

                  <div className="flex justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-600 font-medium">Average Repayment Delay:</span>
                    <span className="font-bold text-blue-700 font-mono">{creditIntelligence.avgPaymentDelayDays} days</span>
                  </div>

                  <div className="flex justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-600 font-medium">On-Time Invoice Settlement:</span>
                    <span className="font-bold text-emerald-700 font-mono">{creditIntelligence.onTimePaidPct}% paid on time</span>
                  </div>

                  <div className="flex justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-600 font-medium">Store Credit Utilization Rate:</span>
                    <span className="font-bold text-purple-700 font-mono">{creditIntelligence.creditUtilizationPct}% redeemed</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Coins size={18} className="text-emerald-600" />
                    <h2 className="text-base font-bold text-slate-900">Financial Extremes</h2>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Largest transactions</span>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 block">Largest Single Invoice</span>
                    <div className="flex justify-between items-baseline mt-1">
                      <span className="font-mono font-bold text-slate-800 text-sm">{largestInvoice ? largestInvoice.invoiceNumber : "None"}</span>
                      <span className="font-mono font-black text-emerald-700 text-lg">
                        ₹{largestInvoice ? largestInvoice.total.toLocaleString() : "0"}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-blue-800 block">Largest Debt Repayment</span>
                    <div className="flex justify-between items-baseline mt-1">
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        {largestPayment ? `Receipt #${largestPayment.receiptNumber || "Legacy"}` : "None"}
                      </span>
                      <span className="font-mono font-black text-blue-700 text-lg">
                        ₹{largestPayment ? largestPayment.amount.toLocaleString() : "0"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: PRODUCT & CATEGORY AFFINITY (OWNER ONLY) ───────────────── */}
      {isOwner && activeTab === "affinity" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Tag size={18} className="text-navy-950" />
                  <h2 className="text-base font-bold text-slate-900">Favourite Categories</h2>
                </div>
              </div>

              {productAffinity.categories.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No purchases recorded.</p>
              ) : (
                <div className="space-y-4">
                  {productAffinity.categories.slice(0, 6).map((c) => (
                    <div key={c.name} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-800">{c.name}</span>
                        <span className="font-mono font-bold text-emerald-700">₹{c.revenue.toLocaleString()} ({c.count} units)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-navy-950 h-full rounded-full transition-all duration-300" style={{ width: `${c.barPct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Layers size={18} className="text-purple-600" />
                  <h2 className="text-base font-bold text-slate-900">Favourite Brands</h2>
                </div>
              </div>

              {productAffinity.brands.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No brand affinity recorded.</p>
              ) : (
                <div className="space-y-4">
                  {productAffinity.brands.slice(0, 6).map((b) => (
                    <div key={b.name} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-800">{b.name}</span>
                        <span className="font-mono font-bold text-purple-700">₹{b.revenue.toLocaleString()} ({b.count} units)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-purple-600 h-full rounded-full transition-all duration-300" style={{ width: `${b.barPct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Package size={18} className="text-blue-600" />
                  <h2 className="text-base font-bold text-slate-900">Most Purchased Products</h2>
                </div>
              </div>

              {productAffinity.products.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No products recorded.</p>
              ) : (
                <div className="space-y-4">
                  {productAffinity.products.slice(0, 6).map((p) => (
                    <div key={p.id} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-800 truncate max-w-[150px]">{p.name}</span>
                        <span className="font-mono font-bold text-blue-700">₹{p.revenue.toLocaleString()} ({p.count} qty)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${p.barPct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: VEHICLE INTELLIGENCE & HISTORY (VISIBLE TO ALL) ──────────── */}
      {activeTab === "vehicles" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Car size={18} className="text-blue-600" />
                  <h2 className="text-base font-bold text-slate-900">Vehicles Owned &amp; Serviced</h2>
                </div>
                <span className="text-xs text-slate-400 font-medium">{vehicleIntelligence.totalVehiclesCount} Vehicle(s)</span>
              </div>

              {vehicleIntelligence.vehiclesList.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 rounded-2xl border border-slate-200">
                  <Car size={36} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-700 font-bold text-sm">No vehicles linked to customer</p>
                  <p className="text-slate-400 text-xs mt-1">Vehicle models are automatically recorded during Checkout in POS Billing.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {vehicleIntelligence.vehiclesList.map((v) => (
                    <div key={v.model} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">🚗 {v.model}</p>
                          {v.number && <p className="text-xs text-slate-500 font-mono mt-0.5">Reg #: {v.number}</p>}
                        </div>
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
                          {v.count} Order(s)
                        </span>
                      </div>
                      {isOwner && (
                        <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-xs">
                          <span className="text-slate-500">Vehicle Spend:</span>
                          <span className="font-mono font-bold text-emerald-700">₹{v.spend.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Wrench size={18} className="text-navy-950" />
                  <h2 className="text-base font-bold text-slate-900">Fitment Summary</h2>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Most Active Vehicle:</span>
                  <span className="font-bold text-slate-900">
                    {vehicleIntelligence.mostActiveVehicle ? vehicleIntelligence.mostActiveVehicle.model : "None"}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Top Vehicle Category:</span>
                  <span className="font-bold text-blue-700">{vehicleIntelligence.topVehicleCategory}</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Universal Fit Item Ratio:</span>
                  <span className="font-bold text-emerald-700 font-mono">{vehicleIntelligence.universalFitPct}% Universal</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: CHRONOLOGICAL TIMELINE & LEDGER (VISIBLE TO ALL) ─────────── */}
      {activeTab === "timeline" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <History size={18} className="text-amber-600" />
              <h2 className="text-base font-bold text-slate-900">Chronological Customer Timeline &amp; Ledger</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">{chronologicalLedger.length} Events</span>
          </div>

          {chronologicalLedger.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No historical activity recorded.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {chronologicalLedger.map((ev) => (
                <div key={ev.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-800 font-mono">{ev.title}</span>
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${ev.badgeColor}`}>
                          {ev.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium">{ev.details}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {new Date(ev.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    <div className="text-right shrink-0 font-mono space-y-0.5">
                      {ev.amount != null && (
                        <p className="text-xs font-bold text-slate-800">₹{ev.amount.toLocaleString()}</p>
                      )}
                      {ev.debtDelta !== undefined && ev.debtDelta !== 0 && (
                        <p className={`text-[11px] font-extrabold ${ev.debtDelta > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                          {ev.debtDelta > 0 ? `+₹${ev.debtDelta.toLocaleString()} Debt` : `-₹${Math.abs(ev.debtDelta).toLocaleString()} Debt`}
                        </p>
                      )}
                      {ev.creditDelta !== undefined && ev.creditDelta !== 0 && (
                        <p className={`text-[11px] font-extrabold ${ev.creditDelta > 0 ? "text-purple-700" : "text-blue-700"}`}>
                          {ev.creditDelta > 0 ? `+₹${ev.creditDelta.toLocaleString()} Credit` : `-₹${Math.abs(ev.creditDelta).toLocaleString()} Credit`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 6: PREDICTIVE INSIGHTS & RECOMMENDATIONS (OWNER ONLY) ───────── */}
      {isOwner && activeTab === "insights" && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-navy-950 via-slate-900 to-navy-900 text-white rounded-2xl p-6 shadow-md border border-navy-800">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Smart Actionable Recommendations</h2>
                  <p className="text-xs text-slate-400">Deterministic advisor derived from ERP customer state</p>
                </div>
              </div>
              <span className="text-xs font-mono bg-navy-800 text-yellow-400 px-2.5 py-1 rounded-lg border border-navy-700">
                {smartRecommendations.length} Suggestions
              </span>
            </div>

            {smartRecommendations.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No active follow-up actions required today.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {smartRecommendations.map((rec) => (
                  <div key={rec.id} className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 flex flex-col justify-between space-y-3">
                    <div>
                      <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border inline-block mb-2 ${rec.badgeColor}`}>
                        {rec.badge}
                      </span>
                      <h4 className="font-bold text-sm text-white">{rec.title}</h4>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{rec.description}</p>
                    </div>
                    {rec.actionText && rec.onClickAction && (
                      <button
                        onClick={rec.onClickAction}
                        className="w-full text-center bg-yellow-400 hover:bg-yellow-300 text-navy-950 text-xs font-extrabold py-2 rounded-lg transition-colors cursor-pointer"
                      >
                        {rec.actionText} →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Zap size={18} className="text-amber-500" />
                <h2 className="text-base font-bold text-slate-900">Predictive Behavioral Insights</h2>
              </div>
              <span className="text-xs text-slate-400 font-medium">Confidence: {predictiveInsights.confidence}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Expected Next Visit</span>
                <span className="text-sm font-black text-slate-800 font-mono mt-1 block">{predictiveInsights.expectedNextVisitStr}</span>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Likely Reorder Window</span>
                <span className="text-sm font-black text-blue-700 font-mono mt-1 block">{predictiveInsights.likelyReorderWindow}</span>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Likely Product Categories</span>
                <span className="text-sm font-black text-purple-700 mt-1 block truncate">{predictiveInsights.likelyCategories}</span>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Potential Churn Risk</span>
                <span className={`text-sm font-black mt-1 block ${
                  predictiveInsights.churnRisk === "High" ? "text-red-600" :
                  predictiveInsights.churnRisk === "Medium" ? "text-amber-600" :
                  "text-emerald-600"
                }`}>
                  {predictiveInsights.churnRisk} Risk
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 7: PROFITABILITY BREAKDOWN MATRIX (OWNER ONLY) ─────────────── */}
      {isOwner && activeTab === "profitability" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 size={18} className="text-emerald-600" />
                  <h2 className="text-base font-bold text-slate-900">Profitability by Category</h2>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 uppercase tracking-wide border-b border-slate-200">
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-right">Revenue</th>
                      <th className="px-3 py-2 text-right">Profit</th>
                      <th className="px-3 py-2 text-right">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {profitabilityBreakdown.categoryMatrix.map((c) => (
                      <tr key={c.name}>
                        <td className="px-3 py-2 font-sans font-bold text-slate-800">{c.name}</td>
                        <td className="px-3 py-2 text-right text-slate-700">₹{c.revenue.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-purple-700 font-bold">₹{c.profit.toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right font-bold ${c.marginPct >= 20 ? "text-emerald-700" : "text-amber-700"}`}>
                          {c.marginPct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Layers size={18} className="text-purple-600" />
                  <h2 className="text-base font-bold text-slate-900">Profitability by Brand</h2>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 uppercase tracking-wide border-b border-slate-200">
                      <th className="px-3 py-2 text-left">Brand</th>
                      <th className="px-3 py-2 text-right">Revenue</th>
                      <th className="px-3 py-2 text-right">Profit</th>
                      <th className="px-3 py-2 text-right">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {profitabilityBreakdown.brandMatrix.map((b) => (
                      <tr key={b.name}>
                        <td className="px-3 py-2 font-sans font-bold text-slate-800">{b.name}</td>
                        <td className="px-3 py-2 text-right text-slate-700">₹{b.revenue.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-purple-700 font-bold">₹{b.profit.toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right font-bold ${b.marginPct >= 20 ? "text-emerald-700" : "text-amber-700"}`}>
                          {b.marginPct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
           MODALS (COLLECT, LUMP-SUM DEBT, EDIT PROFILE, APPLY CREDIT, PRINT)
      ─────────────────────────────────────────────────────────────────────── */}

      {/* Single Invoice Collect Modal */}
      {collectInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h2 className="font-bold text-slate-800">Collect Invoice Payment</h2>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{collectInvoice.invoiceNumber}</p>
              </div>
              <button onClick={() => setCollectInvoice(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
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
                    onClick={() => setCollectInvoice(null)}
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
      {showLumpSumModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
                  <Wallet size={16} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 text-base">Collect Customer Debt (FIFO)</h2>
                  <p className="text-xs text-slate-500">{customer.name}</p>
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
                  <p className="text-xl font-bold text-red-700 font-mono mt-0.5">₹{derivedDebt.toLocaleString()}</p>
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
      {showEditModal && (
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

      {/* Apply Store Credit Modal */}
      {showApplyCreditModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-emerald-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
                  <Coins size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Apply Store Credit to Debt</h3>
                  <p className="text-[11px] text-slate-500">Offset customer debt using store credit balance</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowApplyCreditModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between font-semibold text-emerald-900">
                  <span>Available Credit:</span>
                  <span className="font-bold">₹{availableStoreCredit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold text-red-700">
                  <span>Outstanding Debt:</span>
                  <span className="font-bold">₹{derivedDebt.toLocaleString()}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Amount to Apply (₹)</label>
                <input
                  type="number"
                  min="1"
                  max={Math.min(availableStoreCredit, derivedDebt)}
                  value={applyCreditAmountInput}
                  onChange={(e) => setApplyCreditAmountInput(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Applied By <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["Owner", "Staff"] as const).map((who) => (
                    <button
                      key={who}
                      type="button"
                      onClick={() => setApplyCreditBy(who)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        applyCreditBy === who ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 text-slate-700 border-slate-200"
                      }`}
                    >
                      {who}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Notes / Reason</label>
                <input
                  type="text"
                  value={applyCreditNotes}
                  onChange={(e) => setApplyCreditNotes(e.target.value)}
                  placeholder="e.g. Credit applied to debt"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowApplyCreditModal(false)}
                className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyCreditSubmit}
                disabled={!applyCreditAmountInput || Number(applyCreditAmountInput) <= 0 || !applyCreditBy}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Coins size={14} />
                Apply Credit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Receipt Modal */}
      {printReceiptPayment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 print:p-0 print:bg-white print:static">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] print:shadow-none print:border-none print:max-w-full">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 print:hidden">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-slate-700" />
                <h3 className="font-extrabold text-slate-800 text-sm">Payment Receipt</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-navy-950 hover:bg-navy-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer size={13} />
                  Print
                </button>
                <button onClick={() => setPrintReceiptPayment(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 bg-slate-100/70 overflow-y-auto max-h-[75vh]">
              {(() => {
                const targetInv = state.invoices.find((i) => i.id === printReceiptPayment.invoiceId);
                if (!targetInv) return <p className="text-slate-500 text-xs">Invoice not found.</p>;
                return <PrintableReceipt payment={printReceiptPayment} invoice={targetInv} />;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Printable 360° Customer Report Modal (OWNER ONLY) */}
      {isOwner && showPrintReport && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 print:p-0 print:bg-white print:static">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] overflow-y-auto p-8 print:max-w-full print:shadow-none print:border-none print:p-0">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6 print:hidden">
              <div className="flex items-center gap-2">
                <Printer size={20} className="text-navy-950" />
                <h2 className="text-lg font-black text-slate-900">360° Executive Customer Intelligence Report</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-navy-950 hover:bg-navy-900 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Printer size={14} />
                  Print Report
                </button>
                <button onClick={() => setShowPrintReport(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-900">AutoVault ERP — Customer 360° Dossier</h1>
                  <p className="text-sm font-bold text-slate-700 mt-1">{customer.name} (ID: {customer.id})</p>
                  <p className="text-xs text-slate-500">Phone: {customer.phone || "—"}</p>
                </div>
                <div className="text-right font-mono text-xs text-slate-500">
                  <p className="font-bold text-slate-900">Report Date: {new Date().toLocaleDateString("en-IN")}</p>
                  <p>Tier: {customerTier.label}</p>
                  <p>Health Score: {customerHealth.totalScore}/100 ({customerHealth.status})</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 text-center font-mono text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-slate-400 font-bold uppercase block text-[10px]">Net Revenue</span>
                  <span className="text-sm font-extrabold text-emerald-700">₹{customerTotalSpent.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-slate-400 font-bold uppercase block text-[10px]">Net Profit</span>
                  <span className="text-sm font-extrabold text-purple-700">₹{lifetimeProfit.toLocaleString()} ({profitMarginPct}%)</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-slate-400 font-bold uppercase block text-[10px]">Outstanding Debt</span>
                  <span className="text-sm font-extrabold text-red-600">₹{derivedDebt.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-slate-400 font-bold uppercase block text-[10px]">Store Credit</span>
                  <span className="text-sm font-extrabold text-blue-600">₹{availableStoreCredit.toLocaleString()}</span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-2 tracking-wider">Vehicles Owned</h3>
                {vehicleIntelligence.vehiclesList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No vehicles registered.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {vehicleIntelligence.vehiclesList.map((v) => (
                      <div key={v.model} className="p-2 border border-slate-200 rounded-lg flex justify-between">
                        <span>🚗 {v.model} {v.number ? `(${v.number})` : ""}</span>
                        <span className="font-bold font-mono">₹{v.spend.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-2 tracking-wider">Completed Invoices ({invoices.length})</h3>
                <div className="space-y-1 text-xs">
                  {invoices.slice(0, 8).map((inv) => (
                    <div key={inv.id} className="flex justify-between py-1 border-b border-slate-100 font-mono">
                      <span>{inv.invoiceNumber} ({formatInvoiceDate(inv)}) — {inv.paymentStatus}</span>
                      <span className="font-bold">Total: ₹{inv.total.toLocaleString()} | Due: ₹{getInvoiceOutstanding(inv).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-2 tracking-wider">Executive Recommendations</h3>
                <ul className="list-disc pl-5 text-xs text-slate-700 space-y-1">
                  {smartRecommendations.map((r) => (
                    <li key={r.id}><strong className="text-slate-900">{r.title}:</strong> {r.description}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}