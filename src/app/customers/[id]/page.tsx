"use client";

import { use, useMemo, useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import Link from "next/link";
import { formatInvoiceDate, sortInvoicesDescending } from "@/lib/dateUtils";
import { calculateRevenue } from "@/lib/revenueUtils";
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
} from "lucide-react";
import type { Invoice, PaymentMethod, PaymentStatus, DebtPayment } from "@/types";
import PrintableReceipt from "@/components/PrintableReceipt";

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

const METHOD_COLORS: Record<PaymentMethod, string> = {
  Cash:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPI:    "bg-blue-50 text-blue-700 border-blue-200",
  Card:   "bg-purple-50 text-purple-700 border-purple-200",
};

// ─────────────────────────────────────────────────────────────────────────────
//  CUSTOMER PROFILE PAGE
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
  const { loading, requireAuth } = useRole();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  // ── Tab State ───────────────────────────────────────────────────────────────
  const [activeRightTab, setActiveRightTab] = useState<"invoices" | "ledger" | "credit">("invoices");

  // ── Collect Payment Modal State ────────────────────────────────────────────
  const [collectInvoice, setCollectInvoice] = useState<Invoice | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>("Cash");
  const [collectNote, setCollectNote] = useState("");
  const [collectSuccess, setCollectSuccess] = useState(false);
  const [collectCollectedBy, setCollectCollectedBy] = useState<"Owner" | "Staff" | "">("");

  // ── Lump-Sum FIFO Collect Modal State ─────────────────────────────────────
  const [showLumpSumModal, setShowLumpSumModal] = useState(false);
  const [lumpSumAmountInput, setLumpSumAmountInput] = useState("");
  const [lumpSumMethod, setLumpSumMethod] = useState<PaymentMethod>("Cash");
  const [lumpSumNote, setLumpSumNote] = useState("");
  const [lumpSumCollectedBy, setLumpSumCollectedBy] = useState<"Owner" | "Staff" | "">("");

  // ── Edit Customer Modal State ────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState("");

  // ── Apply Store Credit to Debt Modal State ──────────────────────────────
  const [showApplyCreditModal, setShowApplyCreditModal] = useState(false);
  const [applyCreditAmountInput, setApplyCreditAmountInput] = useState("");
  const [applyCreditNotes, setApplyCreditNotes] = useState("");

  // ── Print Receipt Modal State ─────────────────────────────────────────────
  const [printReceiptPayment, setPrintReceiptPayment] = useState<any | null>(null);

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
  const [applyCreditBy, setApplyCreditBy] = useState<"Owner" | "Staff" | "">("");

  const customer = getCustomerById(id);

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

    const outstandingInvoices = getCustomerOutstandingInvoices(customer.id)
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

  // Derive real debt from invoice effective outstanding (after returns)
  const [invoices, derivedDebt] = useMemo(() => {
    const invList = customer
      ? sortInvoicesDescending(getInvoicesByCustomer(customer.id))
      : [];
    // Authoritative dynamic customer debt calculation
    const debt = customer ? getCustomerOutstandingBalance(customer.id) : 0;
    return [invList, debt] as const;
  }, [customer, getInvoicesByCustomer, getCustomerOutstandingBalance]);

  const customerTotalSpent = useMemo(() => {
    if (!customer) return 0;
    return calculateRevenue(state.invoices, state.salesReturns, undefined, customer.id);
  }, [state.invoices, state.salesReturns, customer]);

  const availableStoreCredit = useMemo(() => {
    if (!customer) return 0;
    return getCustomerCreditBalance(customer.id);
  }, [customer, getCustomerCreditBalance]);

  const creditTransactions = useMemo(() => {
    if (!customer) return [];
    return getCustomerCreditTransactions(customer.id);
  }, [customer, getCustomerCreditTransactions]);

  // ── Phase 2.8C: Chronological Customer Ledger Timeline ──────────────────
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
        details: `Billed: ₹${inv.total.toLocaleString()} · Paid POS: ₹${inv.amountPaid.toLocaleString()} · Method: ${inv.paymentMethod}`,
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
      if (tx.salesReturnId) return; // Skip returns to avoid duplication
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

  const totalCreditIssued = useMemo(() => {
    return creditTransactions.filter((t) => t.type === "Issue").reduce((s, t) => s + t.amount, 0);
  }, [creditTransactions]);

  const totalCreditUsed = useMemo(() => {
    return creditTransactions.filter((t) => t.type === "Redeem").reduce((s, t) => s + t.amount, 0);
  }, [creditTransactions]);

  const outstandingInvoices = customer
    ? getCustomerOutstandingInvoices(customer.id)
    : [];

  // WhatsApp handler — before early return
  function handleWhatsApp() {
    if (!customer?.phone) return;
    window.open(`https://wa.me/91${customer.phone.replace(/\D/g, "")}`, "_blank");
  }

  function handleCopyPhone() {
    if (!customer?.phone) {
      showToast("No phone number available.", "error");
      return;
    }
    navigator.clipboard.writeText(customer.phone);
    showToast("Phone number copied to clipboard.", "success");
  }

  // Collect Payment Handlers
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
    setTimeout(() => closeCollect(), 1500);
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle size={40} className="text-slate-300" />
        <p className="text-slate-500 text-sm">Customer not found.</p>
        <Link
          href="/customers"
          className="text-sm text-amber-600 hover:underline"
        >
          ← Back to Customers
        </Link>
      </div>
    );
  }

  const totalItems = invoices.reduce(
    (sum, inv) => sum + inv.items.reduce((s, i) => s + i.quantity, 0),
    0
  );

  // Returns KPIs
  const customerReturns = getSalesReturnsByCustomer(customer.id);
  const activeCustomerReturns = customerReturns.filter((r) => r.status !== "Cancelled");
  const returnCount = activeCustomerReturns.length;
  const returnItemQty = activeCustomerReturns.reduce((s, r) => s + r.items.reduce((ss, i) => ss + i.quantity, 0), 0);
  const refundedTotal = activeCustomerReturns.reduce((s, r) => s + r.totalRefund, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <Link
          href="/customers"
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors font-medium min-h-[44px] shrink-0"
        >
          <ArrowLeft size={16} />
          Back to Customers
        </Link>

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
        </div>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">

        {/* ── Left Column: Profile Card & Sidebar (Desktop col-span-1) ───────────────── */}
        <div className="space-y-4 lg:col-span-1 flex flex-col">

          {/* Profile card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-full bg-slate-900 flex items-center justify-center text-white text-xl font-bold">
                {customer.name.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={openEditModal}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 min-h-[36px] rounded-lg transition-colors font-semibold cursor-pointer inline-flex items-center gap-1"
              >
                <Pencil size={12} />
                Edit
              </button>
            </div>

            <h1 className="text-xl font-bold text-slate-800">{customer.name}</h1>

            {customer.phone && (
              <div className="flex items-center justify-between gap-2 mt-3 p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                <a
                  href={`tel:${customer.phone}`}
                  className="flex items-center gap-2 text-slate-700 hover:text-blue-600 text-sm font-mono font-medium truncate"
                  title="Click to call"
                >
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <span className="truncate">{customer.phone}</span>
                </a>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={handleCopyPhone}
                    className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    title="Copy Phone Number"
                  >
                    <Copy size={15} />
                  </button>
                  <a
                    href={`tel:${customer.phone}`}
                    className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center text-blue-600 hover:bg-blue-100 bg-blue-50 rounded-lg transition-colors cursor-pointer"
                    title="Call"
                  >
                    <PhoneCall size={15} />
                  </a>
                  <button
                    onClick={handleWhatsApp}
                    className="min-w-[44px] min-h-[44px] px-2.5 flex items-center justify-center gap-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition-colors cursor-pointer shadow-xs"
                    title="WhatsApp"
                  >
                    <MessageCircle size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* Debt badge — derived from invoice dues */}
            {derivedDebt > 0 ? (
              <div className="mt-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start justify-between">
                <div>
                  <p className="text-xs text-red-600 font-semibold uppercase tracking-wider mb-0.5">
                    Outstanding Debt
                  </p>
                  <p className="text-2xl font-bold text-red-700 font-mono">
                    ₹{derivedDebt.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-red-500 mt-0.5">
                    Across {outstandingInvoices.length} invoice{outstandingInvoices.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => openLumpSumModal(derivedDebt)}
                  className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2 min-h-[44px] rounded-xl font-bold transition-colors cursor-pointer shadow-xs"
                  title="Collect Customer Debt (FIFO Auto-Apply)"
                >
                  <Wallet size={14} />
                  Collect Debt
                </button>
              </div>
            ) : (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-xs text-green-600 font-medium">
                  ✓ No outstanding debt
                </p>
              </div>
            )}

            {/* Available Store Credit Card */}
            {availableStoreCredit > 0 && (
              <div className="mt-2.5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between">
                <div>
                  <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                    <Wallet size={12} className="text-emerald-600" />
                    Available Store Credit
                  </p>
                  <p className="text-2xl font-bold text-emerald-800 font-mono">
                    ₹{availableStoreCredit.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">
                    Auto-redeemable at POS Checkout
                  </p>
                </div>
                {derivedDebt > 0 && (
                  <button
                    onClick={() => openApplyCreditModal(availableStoreCredit, derivedDebt)}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2 min-h-[44px] rounded-xl font-bold transition-colors cursor-pointer shadow-xs shrink-0"
                    title="Apply Store Credit to offset open debt"
                  >
                    <Coins size={14} />
                    Apply to Debt
                  </button>
                )}
              </div>
            )}
          </div>

          {/* On mobile: Secondary sidebar blocks come after main tabs content */}
          <div className="order-2 lg:order-1 space-y-4">
            {/* Outstanding Invoices collect section */}
            {outstandingInvoices.length > 0 && (
              <div className="bg-white rounded-2xl border border-red-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle size={15} className="text-red-500" />
                  <h2 className="font-semibold text-red-800 text-sm">
                    Outstanding Invoices
                  </h2>
                  <span className="ml-auto text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-bold">
                    {outstandingInvoices.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {outstandingInvoices.map((inv) => {
                    const payments = getDebtPaymentsByInvoice(inv.id);
                    const repaidTotal = payments.reduce((s, p) => s + p.amount, 0);
                    return (
                      <div
                        key={inv.id}
                        className="bg-red-50/50 border border-red-100 rounded-xl p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-slate-800 font-mono truncate">
                              {inv.invoiceNumber}
                            </p>
                            <p className="text-[10px] text-slate-400">{formatInvoiceDate(inv)}</p>
                            <p className="text-xs font-bold text-red-600 font-mono mt-0.5">
                              Due: ₹{getInvoiceOutstanding(inv).toLocaleString()}
                            </p>
                            {repaidTotal > 0 && (
                              <p className="text-[10px] text-green-700 font-mono mt-0.5 flex items-center gap-1">
                                <History size={10} />
                                ₹{repaidTotal.toLocaleString()} repaid
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 items-end shrink-0">
                            <button
                              onClick={() => openCollect(inv)}
                              className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-2 min-h-[38px] rounded-lg transition-colors cursor-pointer"
                            >
                              Collect
                            </button>
                            <Link
                              href={`/invoices/${inv.id}`}
                              className="text-[10px] text-amber-600 hover:underline font-medium"
                            >
                              View →
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stats card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h2 className="font-semibold text-slate-800 text-sm">Statistics</h2>

              <StatRow
                icon={<TrendingUp size={14} />}
                iconBg="bg-blue-50 text-blue-600"
                label="Total Spent"
                value={`₹${customerTotalSpent.toLocaleString()}`}
                valueClass="text-blue-700 font-bold font-mono"
              />
              <StatRow
                icon={<ReceiptText size={14} />}
                iconBg="bg-amber-50 text-amber-600"
                label="Invoices"
                value={String(invoices.length)}
              />
              <StatRow
                icon={<Calendar size={14} />}
                iconBg="bg-purple-50 text-purple-600"
                label="Visits"
                value={String(customer.visits)}
              />
              <StatRow
                icon={<Calendar size={14} />}
                iconBg="bg-slate-100 text-slate-600"
                label="Last Visit"
                value={customer.lastVisit || "—"}
              />
              <StatRow
                icon={<ReceiptText size={14} />}
                iconBg="bg-slate-100 text-slate-600"
                label="Items Bought"
                value={String(totalItems)}
              />
              {returnCount > 0 && (
                <>
                  <div className="border-t border-slate-100 my-1" />
                  <StatRow
                    icon={<RotateCcw size={14} />}
                    iconBg="bg-orange-50 text-orange-500"
                    label="Returns"
                    value={`${returnCount} (${returnItemQty} items)`}
                    valueClass="text-orange-600"
                  />
                  <StatRow
                    icon={<RotateCcw size={14} />}
                    iconBg="bg-orange-50 text-orange-500"
                    label="Refunded"
                    value={`₹${refundedTotal.toLocaleString()}`}
                    valueClass="text-orange-600 font-bold font-mono"
                  />
                </>
              )}
            </div>

            {/* Activity Log */}
            {customer.activities && customer.activities.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <h2 className="font-semibold text-slate-800 text-sm">Activity Log</h2>
                <div className="space-y-3 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                  {customer.activities.map((act) => (
                    <div key={act.id} className="relative pl-6 text-xs font-medium">
                      <span className={`absolute left-0.5 top-1.5 w-3 h-3 rounded-full border-2 border-white ${
                        act.type === "Void" ? "bg-red-500" :
                        act.type === "Repayment" ? "bg-green-500" :
                        act.type === "Return" ? "bg-orange-400" :
                        "bg-blue-500"
                      }`} />
                      <p className="font-bold text-slate-850">{act.description}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{act.reference} · {new Date(act.date).toLocaleDateString("en-IN")}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick action */}
            <Link
              href="/billing"
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-white min-h-[44px] py-3 rounded-xl text-sm font-medium transition-colors"
            >
              <ReceiptText size={15} />
              New Invoice for {customer.name.split(" ")[0]}
            </Link>
          </div>
        </div>

        {/* ── Right column: Invoices & Customer Credit Ledger (Mobile order-1, Desktop col-span-2) ───────────────── */}
        <div className="lg:col-span-2 space-y-4 order-1 lg:order-2">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {/* Header Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setActiveRightTab("invoices")}
                className={`flex-1 py-3.5 px-3 text-center font-bold text-xs sm:text-sm border-b-2 transition-all cursor-pointer ${
                  activeRightTab === "invoices"
                    ? "border-navy-950 text-navy-950 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <FileText size={15} />
                  Invoices ({invoices.length})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRightTab("ledger")}
                className={`flex-1 py-3.5 px-3 text-center font-bold text-xs sm:text-sm border-b-2 transition-all cursor-pointer ${
                  activeRightTab === "ledger"
                    ? "border-amber-600 text-amber-950 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <History size={15} className="text-amber-600" />
                  Chronological Ledger ({chronologicalLedger.length})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRightTab("credit")}
                className={`flex-1 py-3.5 px-3 text-center font-bold text-xs sm:text-sm border-b-2 transition-all cursor-pointer ${
                  activeRightTab === "credit"
                    ? "border-emerald-600 text-emerald-950 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Wallet size={15} className="text-emerald-600" />
                  Credit Ledger ({creditTransactions.length})
                </span>
              </button>
            </div>

            {/* TAB 1: Invoices */}
            {activeRightTab === "invoices" && (
              invoices.length === 0 ? (
                <div className="p-12 flex flex-col items-center text-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                    <FileText size={24} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500">No invoices yet</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      This customer hasn&apos;t made any purchases yet.
                    </p>
                  </div>
                  <Link
                    href="/billing"
                    className="mt-1 inline-flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-semibold hover:underline transition-colors"
                  >
                    <ReceiptText size={12} />
                    Create first invoice
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {invoices.map((inv) => {
                    const payments = getDebtPaymentsByInvoice(inv.id);
                    const repaidTotal = payments.reduce((s, p) => s + p.amount, 0);
                    return (
                      <div
                        key={inv.id}
                        className="p-5 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          {/* Invoice meta */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-mono text-xs text-slate-600">
                                {inv.invoiceNumber}
                              </span>
                              {inv.voided ? (
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700">
                                  Voided
                                </span>
                              ) : (
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[inv.paymentStatus]}`}
                                >
                                  {inv.paymentStatus}
                                </span>
                              )}
                              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                {inv.paymentMethod}
                              </span>
                            </div>

                            <p className="text-xs text-slate-400">{formatInvoiceDate(inv)}</p>

                            {/* Items list */}
                            <div className="mt-2 space-y-0.5">
                              {inv.items.map((item, idx) => (
                                <p
                                  key={idx}
                                  className="text-xs text-slate-600"
                                >
                                  • {item.name}{" "}
                                  <span className="text-slate-400">
                                    ×{item.quantity} @ ₹
                                    {item.price.toLocaleString()}
                                  </span>
                                </p>
                              ))}
                            </div>

                            {/* Vehicle */}
                            {inv.vehicleModel && (
                              <p className="text-xs text-slate-400 mt-1">
                                🚗 {inv.vehicleModel}
                                {inv.vehicleNumber
                                  ? ` (${inv.vehicleNumber})`
                                  : ""}
                              </p>
                            )}

                            {/* Notes */}
                            {inv.notes && (
                              <p className="text-xs text-amber-600 mt-1 italic">
                                &ldquo;{inv.notes}&rdquo;
                              </p>
                            )}

                            {/* Repayment summary */}
                            {repaidTotal > 0 && (
                              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-green-700">
                                <History size={10} />
                                <span className="font-semibold">₹{repaidTotal.toLocaleString()} repaid</span>
                                <span className="text-green-500">({payments.length} payment{payments.length !== 1 ? "s" : ""})</span>
                              </div>
                            )}
                          </div>

                          {/* Amount block */}
                          <div className="text-right shrink-0">
                            <p className="font-bold text-slate-800">
                              ₹{inv.total.toLocaleString()}
                            </p>
                            {inv.amountPaid > 0 &&
                              inv.amountPaid < inv.total && (
                                <p className="text-xs text-blue-600">
                                  Paid: ₹{inv.amountPaid.toLocaleString()}
                                </p>
                              )}
                            {getInvoiceOutstanding(inv) > 0 && (
                              <p className="text-xs text-red-600 font-medium">
                                Due: ₹{getInvoiceOutstanding(inv).toLocaleString()}
                              </p>
                            )}
                            <div className="mt-2 flex flex-col gap-1 items-end">
                              {getInvoiceOutstanding(inv) > 0 && !inv.voided && (
                                <button
                                  onClick={() => openCollect(inv)}
                                  className="text-[10px] bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer"
                                >
                                  Collect
                                </button>
                              )}
                              <Link
                                href={`/invoices/${inv.id}`}
                                className="text-xs text-amber-600 hover:underline"
                              >
                                View invoice →
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* TAB 2: Chronological Customer Ledger Timeline (Phase 2.8C) */}
            {activeRightTab === "ledger" && (
              chronologicalLedger.length === 0 ? (
                <div className="p-12 flex flex-col items-center text-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                    <History size={24} className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">No Ledger History</p>
                    <p className="text-xs text-slate-400 mt-0.5 max-w-sm">
                      This customer has no invoices, debt payments, sales returns, or credit activity yet.
                    </p>
                  </div>
                </div>
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
                            <p className="text-xs font-bold text-slate-800">
                              ₹{ev.amount.toLocaleString()}
                            </p>
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
                          {ev.paymentObj && (
                            <div className="mt-1.5 flex items-center justify-end gap-1 font-sans print:hidden">
                              <button
                                onClick={() => setPrintReceiptPayment(ev.paymentObj)}
                                className="p-2 min-w-[44px] min-h-[44px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer flex items-center justify-center"
                                title="Print Payment Receipt"
                              >
                                <Printer size={16} />
                              </button>
                              <button
                                onClick={() => handleShareReceiptWhatsApp(ev.paymentObj)}
                                className="p-2 min-w-[44px] min-h-[44px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition cursor-pointer flex items-center justify-center"
                                title="Share WhatsApp Receipt"
                              >
                                <MessageCircle size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* TAB 3: Customer Credit Ledger & Store Credit Breakdown (Phase 2.8C) */}
            {activeRightTab === "credit" && (
              <>
                <div className="p-4 bg-purple-50/70 border-b border-purple-100 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Issued</span>
                    <span className="text-xs sm:text-sm font-extrabold text-purple-700 font-mono">₹{totalCreditIssued.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Used</span>
                    <span className="text-xs sm:text-sm font-extrabold text-blue-700 font-mono">₹{totalCreditUsed.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Available Balance</span>
                    <span className="text-xs sm:text-sm font-extrabold text-emerald-700 font-mono">₹{availableStoreCredit.toLocaleString()}</span>
                  </div>
                </div>

                {creditTransactions.length === 0 ? (
                  <div className="p-12 flex flex-col items-center text-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                      <Wallet size={24} className="text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">No Store Credit Transactions</p>
                      <p className="text-xs text-slate-400 mt-0.5 max-w-sm">
                        Store Credit is generated when a customer completes a Sales Return with &ldquo;Adjustment&rdquo; refund method on a fully-paid invoice, or when excess return value remains.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                  {creditTransactions.map((tx) => {
                    const isIssue = tx.type === "Issue";
                    const isRedeem = tx.type === "Redeem";
                    const isReversal = tx.type === "Reversal";

                    const salesReturnRecord = tx.salesReturnId
                      ? (state.salesReturns || []).find((sr) => sr.id === tx.salesReturnId)
                      : undefined;

                    const invoiceRecord = tx.invoiceId
                      ? state.invoices.find((i) => i.id === tx.invoiceId)
                      : undefined;

                    return (
                      <div key={tx.id} className="p-5 hover:bg-slate-50/70 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isIssue && (
                                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  + Store Credit Issued
                                </span>
                              )}
                              {isRedeem && (
                                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  − Store Credit Redeemed
                                </span>
                              )}
                              {isReversal && (
                                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  ↺ Credit Reversed
                                </span>
                              )}
                              <span className="text-xs text-slate-400">
                                {new Date(tx.date).toLocaleString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>

                            <p className="text-xs text-slate-700 font-medium pt-1">
                              {tx.notes}
                            </p>

                            <div className="flex items-center gap-3 text-xs text-slate-500 pt-0.5">
                              {salesReturnRecord && (
                                <Link
                                  href="/sales-returns"
                                  className="text-amber-600 hover:underline font-mono"
                                >
                                  Return Ref: {salesReturnRecord.returnNumber}
                                </Link>
                              )}
                              {invoiceRecord && (
                                <Link
                                  href={`/invoices/${invoiceRecord.id}`}
                                  className="text-amber-600 hover:underline font-mono"
                                >
                                  Invoice Ref: {invoiceRecord.invoiceNumber}
                                </Link>
                              )}
                              {tx.createdBy && (
                                <span className="text-slate-400">By: {tx.createdBy}</span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className={`text-base font-extrabold font-mono ${
                              isIssue ? "text-emerald-700" : isRedeem ? "text-blue-700" : "text-amber-700"
                            }`}>
                              {isIssue ? `+₹${tx.amount.toLocaleString()}` : isRedeem ? `−₹${tx.amount.toLocaleString()}` : `₹${tx.amount.toLocaleString()}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>

      {/* ── Collect Payment Modal ─────────────────────────────────────────── */}
      {collectInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h2 className="font-bold text-slate-800">Collect Payment</h2>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {collectInvoice.invoiceNumber} · {customer.name}
                </p>
              </div>
              <button onClick={closeCollect} className="text-slate-400 hover:text-slate-700 cursor-pointer">
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
                      <p className="font-bold text-slate-800 text-sm mt-1">₹{collectInvoice.total.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Paid</p>
                      <p className="font-bold text-green-700 text-sm mt-1">₹{collectInvoice.amountPaid.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Due</p>
                      <p className="font-bold text-red-600 text-sm mt-1">
                        ₹{collectInvoice ? getInvoiceOutstanding(collectInvoice).toLocaleString() : "0"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                    <input
                      type="number"
                      min="1"
                      max={collectInvoice ? getInvoiceOutstanding(collectInvoice) : 0}
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-400 transition"
                      autoFocus
                    />
                    {Number(collectAmount) > 0 && collectInvoice && (
                      <p className={`text-xs mt-1.5 font-semibold ${Number(collectAmount) >= getInvoiceOutstanding(collectInvoice) ? "text-green-600" : "text-orange-600"}`}>
                        {Number(collectAmount) >= getInvoiceOutstanding(collectInvoice)
                          ? "✓ Clears invoice fully → Paid"
                          : `₹${(getInvoiceOutstanding(collectInvoice) - Number(collectAmount)).toLocaleString()} still remaining`}
                      </p>
                    )}
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
                            className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
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
                    <input
                      type="text"
                      value={collectNote}
                      onChange={(e) => setCollectNote(e.target.value)}
                      placeholder="e.g. Paid cash on visit"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-400 transition"
                    />
                  </div>
                </div>

                <div className="flex gap-3 px-5 pb-5">
                  <button
                    onClick={closeCollect}
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
      {showEditModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
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
                Note: Updating name or phone number maintains the customer&apos;s transaction history, debt ledger, and invoice records intact under Customer ID <span className="font-mono font-semibold">{customer.id}</span>.
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
      {showLumpSumModal && customer && (() => {
        const numAmount = Math.max(0, Number(lumpSumAmountInput) || 0);
        const outstandingInvoices = getCustomerOutstandingInvoices(customer.id)
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
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
                    <p className="text-xl font-bold text-red-700 font-mono mt-0.5">₹{derivedDebt.toLocaleString()}</p>
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
      {/* ── Apply Store Credit Modal ───────────────────────────────────────── */}
      {showApplyCreditModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
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
              <button
                type="button"
                onClick={() => setShowApplyCreditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
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
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Amount to Apply (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  max={Math.min(availableStoreCredit, derivedDebt)}
                  value={applyCreditAmountInput}
                  onChange={(e) => setApplyCreditAmountInput(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
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
                        applyCreditBy === who
                          ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {who}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Notes / Reason
                </label>
                <input
                  type="text"
                  value={applyCreditNotes}
                  onChange={(e) => setApplyCreditNotes(e.target.value)}
                  placeholder="e.g. Store credit applied towards overdue invoice debt"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in print:p-0 print:bg-white print:static print:z-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] print:shadow-none print:border-none print:max-w-full print:max-h-none print:rounded-none">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 print:hidden">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-slate-700" />
                <h3 className="font-extrabold text-slate-800 text-sm">
                  Payment Receipt — {printReceiptPayment.receiptNumber || "Legacy"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-navy-950 hover:bg-navy-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer size={13} />
                  Print
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
                const targetInv = state.invoices.find((i) => i.id === printReceiptPayment.invoiceId);
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
//  STAT ROW HELPER
// ─────────────────────────────────────────────────────────────────────────────

function StatRow({
  icon,
  iconBg,
  label,
  value,
  valueClass = "text-slate-800 font-semibold",
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
      >
        {icon}
      </div>
      <div className="flex-1 flex justify-between items-center">
        <span className="text-xs text-slate-500">{label}</span>
        <span className={`text-sm ${valueClass}`}>{value}</span>
      </div>
    </div>
  );
}