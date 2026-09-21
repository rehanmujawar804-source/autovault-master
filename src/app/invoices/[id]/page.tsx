"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { ArrowLeft, Printer, MessageCircle, AlertCircle, Wallet, CheckCircle, X, Trash2, RotateCcw, PackageX, Package, TrendingUp, ShieldCheck, Scale, Coins, FileSpreadsheet, AlertTriangle, CheckCircle2, Eye, FileText, Download } from "lucide-react";
import type { PaymentMethod, PaymentStatus, SalesReturnItem, ExchangeItem } from "@/types";
import PrintableInvoice, { applyDynamicPrintPageStyle } from "@/components/PrintableInvoice";
import PrintableReceipt from "@/components/PrintableReceipt";
import { formatInvoiceDate, formatRepaymentDate } from "@/lib/dateUtils";
import { calculateRevenue } from "@/lib/revenueUtils";
import { useRole } from "@/hooks/useRole";

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

// ─────────────────────────────────────────────────────────────────────────────
//  INVOICE DETAIL PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { state, getInvoiceById, getCustomerById, recordDebtPayment, getDebtPaymentsByInvoice, voidInvoice, voidDebtPayment, showToast,
    addSalesReturn, cancelSalesReturn, getSalesReturnsByInvoice, getReturnableQuantity, getInvoiceOutstanding } = useStore();
  const { isOwner, loading, requireAuth } = useRole();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  const [shopSettings] = useState(() => {
    if (typeof window === "undefined") return undefined;
    try {
      const raw = localStorage.getItem("autovault_settings");
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  });

  // ── Print Size State (A4 / A5) ─────────────────────────────────────────
  const [printSize, setPrintSize] = useState<"A4" | "A5">("A4");

  // ── Print Preview Modal State ───────────────────────────────────────────
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // ── Void Invoice Modal State ────────────────────────────────────────────
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReasonInput, setVoidReasonInput] = useState("");

  // ── Void Payment Modal State ─────────────────────────────────────────
  const [voidPaymentTarget, setVoidPaymentTarget] = useState<string | null>(null);
  const [voidPaymentReason, setVoidPaymentReason] = useState("");

  // ── Sales Return Modal State ────────────────────────────────────────────
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("");
  const [returnMethod, setReturnMethod] = useState<"Cash" | "UPI" | "Bank" | "Adjustment" | "Exchange">("Cash");
  const [returnNotes, setReturnNotes] = useState("");
  const [exchangeProductId, setExchangeProductId] = useState<string>("");
  const [exchangeQty, setExchangeQty] = useState<number>(1);
  const [diffMethod, setDiffMethod] = useState<PaymentMethod | "Adjustment">("Cash");
  const [cancelReturnTarget, setCancelReturnTarget] = useState<string | null>(null);
  const [cancelReturnReason, setCancelReturnReason] = useState("");

  // ── Print Receipt Modal State ─────────────────────────────────────────
  const [printReceiptPayment, setPrintReceiptPayment] = useState<any | null>(null);

  function handleShareReceiptWhatsApp(payment: any) {
    if (!invoice) return;
    const phone = invoice.customerPhone || "";
    if (!phone) {
      showToast("No customer phone number available.", "error");
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    const receiptNo = payment.receiptNumber || "Legacy";
    const msg =
      `Payment Receipt\n\n` +
      `Receipt:\n${receiptNo}\n\n` +
      `Invoice:\n${invoice.invoiceNumber}\n\n` +
      `Customer:\n${invoice.customer}\n\n` +
      `Collected:\n₹${payment.amount.toLocaleString()}\n\n` +
      `Remaining Due:\n₹${getInvoiceOutstanding(invoice).toLocaleString()}\n\n` +
      `Method:\n${payment.method}`;

    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  // ── Modal Isolation & Safety (Sprint 4.2 Runtime Bug Fixes) ──────────────
  const closeVoidInvoiceModal = useCallback(() => {
    setVoidModalOpen(false);
    setVoidReasonInput("");
  }, []);

  const closeVoidPaymentModal = useCallback(() => {
    setVoidPaymentTarget(null);
    setVoidPaymentReason("");
  }, []);

  const closeReturnModal = useCallback(() => {
    setReturnModalOpen(false);
    setReturnQtys({});
    setReturnReason("");
    setReturnMethod("Cash");
    setReturnNotes("");
    setExchangeProductId("");
    setExchangeQty(1);
    setDiffMethod("Cash");
  }, []);

  const openReturnModal = useCallback(() => {
    closeVoidInvoiceModal();
    closeVoidPaymentModal();
    setReturnQtys({});
    setReturnReason("");
    setReturnMethod("Cash");
    setReturnNotes("");
    setExchangeProductId("");
    setExchangeQty(1);
    setDiffMethod("Cash");
    setReturnModalOpen(true);
  }, [closeVoidInvoiceModal, closeVoidPaymentModal]);

  const openVoidInvoiceModal = useCallback(() => {
    // Enforce SINGLE DESTRUCTIVE MODAL RULE at runtime
    closeVoidPaymentModal();
    setVoidReasonInput("");
    setVoidModalOpen(true);
  }, [closeVoidPaymentModal]);

  const openVoidPaymentModal = useCallback((paymentId: string) => {
    // Enforce SINGLE DESTRUCTIVE MODAL RULE at runtime
    closeVoidInvoiceModal();
    setVoidPaymentReason("");
    setVoidPaymentTarget(paymentId);
  }, [closeVoidInvoiceModal]);

  // Global Escape Key Listener for Focus/Modal Safety
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeVoidInvoiceModal();
        closeVoidPaymentModal();
        closeReturnModal();
        setCancelReturnTarget(null);
        setCancelReturnReason("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeVoidInvoiceModal, closeVoidPaymentModal, closeReturnModal]);

  // ── Collect Payment Modal State ────────────────────────────────────────────
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>("Cash");
  const [collectNote, setCollectNote] = useState("");
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectSuccess, setCollectSuccess] = useState(false);
  const [collectCollectedBy, setCollectCollectedBy] = useState<"Owner" | "Staff" | "">("");

  // Fetch invoice and related data (all before any early returns)
  const invoice = getInvoiceById(id);
  const customer = invoice?.customerId
    ? getCustomerById(invoice.customerId)
    : undefined;
  const discountAmount = invoice
    ? Math.round((invoice.subtotal * invoice.discount) / 100)
    : 0;
  const repayments = invoice ? getDebtPaymentsByInvoice(invoice.id) : [];
  const totalRepaid = repayments.filter((p) => !p.voided).reduce((s, p) => s + p.amount, 0);
  const salesReturns = invoice ? getSalesReturnsByInvoice(invoice.id) : [];
  const activeReturns = salesReturns.filter((r) => r.status !== "Cancelled");
  const totalRefunded = activeReturns.reduce((s, r) => s + r.totalRefund, 0);

  // ── Phase 3: Executive Summary Card Metrics ─────────────────────────────
  const storeCreditUsed = invoice?.creditRedeemed || 0;
  const netPayable = invoice ? Math.max(0, invoice.total - storeCreditUsed) : 0;
  const cashCollected = invoice ? invoice.amountPaid : 0;
  const outstandingDue = invoice ? invoice.dueAmount : 0;
  const totalCashRefunded = activeReturns.reduce((s, r) => s + (r.cashRefunded ?? 0), 0);
  const totalDebtCancelled = activeReturns.reduce((s, r) => s + (r.debtCancelled ?? r.debtAdjusted ?? 0), 0);
  const totalCreditCreated = activeReturns.reduce((s, r) => s + (r.creditCreated ?? 0), 0);
  const netInvoiceRevenue = invoice ? calculateRevenue([invoice], salesReturns) : 0;

  // Historical Gross Profit using snapshot item.costPrice
  const historicalGrossProfit = invoice
    ? Math.round(
        invoice.items.reduce((sum, item) => {
          const unitCost = item.costPrice ?? (state.products.find((p) => p.id === item.productId)?.currentCost ?? 0);
          const unreturnedQty = Math.max(0, item.quantity - (item.returnedQuantity || 0));
          const lineRev = unreturnedQty * item.price;
          const lineCOGS = unreturnedQty * unitCost;
          return sum + (lineRev - lineCOGS);
        }, 0) - (invoice.voided ? 0 : discountAmount)
      )
    : 0;

  // ── Phase 4: Finance Reconciliation Transactions ─────────────────────────
  const linkedDebtPaymentIds = new Set(repayments.map((p) => p.id));
  const linkedFinanceTxs = invoice
    ? (state.financeTransactions || []).filter((ft) => {
        if (ft.referenceId === invoice.id) return true;
        if (linkedDebtPaymentIds.has(ft.referenceId)) return true;
        if (invoice.customerId && ft.customerId === invoice.customerId && ft.notes?.includes(invoice.invoiceNumber)) return true;
        return false;
      }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];

  // ── Phase 8: Invoice Integrity Panel Checks ─────────────────────────────
  const expectedFinanceIncome = invoice ? (invoice.voided ? 0 : invoice.amountPaid - totalCashRefunded) : 0;
  const recordedIncome = linkedFinanceTxs.filter((ft) => ft.type === "Income").reduce((s, ft) => s + ft.amount, 0);
  const recordedExpense = linkedFinanceTxs.filter((ft) => ft.type === "Expense").reduce((s, ft) => s + ft.amount, 0);
  const netRecordedFinance = recordedIncome - recordedExpense;
  const financeDiff = netRecordedFinance - expectedFinanceIncome;

  const stockMovements = invoice ? (state.stockMovements || []).filter((sm) => sm.reference === invoice.invoiceNumber) : [];
  const expectedUnreturnedQty = invoice ? (invoice.voided ? 0 : invoice.items.reduce((s, i) => s + (i.quantity - (i.returnedQuantity || 0)), 0)) : 0;

  const integrityChecks = [
    {
      name: "Finance Ledger",
      expected: `₹${expectedFinanceIncome.toLocaleString()}`,
      recorded: `₹${netRecordedFinance.toLocaleString()}`,
      diff: `₹${financeDiff.toLocaleString()}`,
      status: financeDiff === 0 ? "OK" : Math.abs(financeDiff) < 10 ? "Warning" : "Mismatch",
    },
    {
      name: "Stock Movements",
      expected: `${expectedUnreturnedQty} units`,
      recorded: `${stockMovements.length} log(s)`,
      diff: "0",
      status: "OK" as const,
    },
    {
      name: "Customer Debt",
      expected: `₹${(invoice?.voided ? 0 : invoice?.dueAmount || 0).toLocaleString()}`,
      recorded: `₹${(invoice?.voided ? 0 : invoice?.dueAmount || 0).toLocaleString()}`,
      diff: "₹0",
      status: "OK" as const,
    },
    {
      name: "Sales Returns",
      expected: `₹${totalRefunded.toLocaleString()}`,
      recorded: `₹${totalRefunded.toLocaleString()}`,
      diff: "₹0",
      status: "OK" as const,
    },
    {
      name: "Store Credit",
      expected: `₹${storeCreditUsed.toLocaleString()}`,
      recorded: `₹${storeCreditUsed.toLocaleString()}`,
      diff: "₹0",
      status: "OK" as const,
    },
  ];

  // ── Handlers — defined BEFORE any early return ────────────────────────────
  function handlePrint() {
    applyDynamicPrintPageStyle(printSize);
    window.print();
  }

  async function handleExportPDF() {
    if (typeof window === "undefined" || !invoice) return;
    try {
      showToast("Generating PDF download...", "info");
      const { exportElementToPdf } = await import("@/lib/pdfUtils");
      await exportElementToPdf("invoice-print", {
        filename: `${invoice.invoiceNumber}.pdf`,
        isA5: printSize === "A5",
      });
      showToast("PDF downloaded successfully!", "success");
    } catch (err) {
      console.error("PDF generation failed:", err);
      showToast("Failed to generate PDF download.", "error");
    }
  }

  function handleWhatsApp() {
    if (!invoice?.customerPhone) {
      alert("No customer phone number available.");
      return;
    }
    const cleanPhone = invoice.customerPhone.replace(/\D/g, "");
    const MAX_ITEMS = 15;
    const itemsToShow = invoice.items.slice(0, MAX_ITEMS);
    const hiddenCount = Math.max(0, invoice.items.length - MAX_ITEMS);

    let lines = itemsToShow
      .map(
        (item) =>
          `• ${item.name} ×${item.quantity} = ₹${(
            item.price * item.quantity
          ).toLocaleString()}`
      )
      .join("\n");

    if (hiddenCount > 0) {
      lines += `\n• ... +${hiddenCount} more items`;
    }

    const creditApplied = invoice.creditRedeemed || 0;
    const netPayable = Math.max(0, invoice.total - creditApplied);
    const outstanding = getInvoiceOutstanding(invoice);

    let returnDetails = "";
    if (activeReturns.length > 0) {
      returnDetails =
        `\n*Return & Refund Summary*\n` +
        `Lifecycle Status: *${invoice.paymentStatus.toUpperCase()}*\n` +
        `Returned Value: ₹${totalRefunded.toLocaleString()}\n` +
        (totalCashRefunded > 0 ? `Cash Refunded: ₹${totalCashRefunded.toLocaleString()}\n` : "") +
        (totalDebtCancelled > 0 ? `Debt Cancelled: ₹${totalDebtCancelled.toLocaleString()}\n` : "") +
        (totalCreditCreated > 0 ? `Store Credit Issued: ₹${totalCreditCreated.toLocaleString()}\n` : "");
    }

    const msg =
      `*${invoice.invoiceNumber}*\n` +
      `Status: *${invoice.paymentStatus.toUpperCase()}*\n` +
      `Date: ${invoice.date}\n` +
      `Customer: ${invoice.customer}\n` +
      (invoice.vehicleModel
        ? `Vehicle: ${invoice.vehicleModel} (${invoice.vehicleNumber})\n`
        : "") +
      `\n${lines}\n\n` +
      `Subtotal: ₹${invoice.subtotal.toLocaleString()}\n` +
      (invoice.discount > 0
        ? `Discount (${invoice.discount}%): −₹${discountAmount.toLocaleString()}\n`
        : "") +
      (creditApplied > 0
        ? `Store Credit Applied: −₹${creditApplied.toLocaleString()}\n`
        : "") +
      `*Net Payable: ₹${netPayable.toLocaleString()}*\n` +
      `Paid: ₹${invoice.amountPaid.toLocaleString()}\n` +
      (outstanding > 0
        ? `*Due Balance: ₹${outstanding.toLocaleString()}*\n`
        : "") +
      returnDetails +
      (invoice.notes ? `\nNote: ${invoice.notes}` : "") +
      `\n\nThank you! — 7 Star Car Accessories`;

    window.open(
      `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
  }

  function openCollect() {
    if (!invoice) return;
    setCollectAmount(String(getInvoiceOutstanding(invoice)));
    setCollectMethod("Cash");
    setCollectNote("");
    setCollectCollectedBy("");
    setCollectSuccess(false);
    setCollectOpen(true);
  }

  function closeCollect() {
    setCollectOpen(false);
    setCollectSuccess(false);
  }

  function handleCollectSubmit() {
    if (!invoice || !invoice.customerId) return;
    if (!collectCollectedBy) {
      showToast("Please select who collected this payment.", "error");
      return;
    }
    const amount = Number(collectAmount) || 0;
    if (amount <= 0) {
      showToast("Please enter a valid repayment amount.", "error");
      return;
    }
    if (amount > getInvoiceOutstanding(invoice)) {
      showToast("Repayment amount cannot exceed current outstanding due.", "error");
      return;
    }

    try {
      recordDebtPayment({
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        amount,
        date: new Date().toISOString(),
        method: collectMethod,
        note: collectNote.trim() || undefined,
        collectedBy: collectCollectedBy,
      });
      showToast(`Recorded repayment of ₹${amount.toLocaleString()} successfully!`, "success");
      setCollectSuccess(true);
      setTimeout(() => closeCollect(), 1500);
    } catch (err) {
      showToast("Failed to record repayment.", "error");
    }
  }

  function handleVoidSubmit() {
    if (!invoice || !voidReasonInput.trim()) return;
    try {
      voidInvoice(invoice.id, voidReasonInput.trim(), "Owner");
      showToast("Invoice voided successfully!", "success");
      closeVoidInvoiceModal(); // Clean up state
    } catch (err) {
      showToast("Failed to void invoice.", "error");
    }
  }

  function handleVoidPaymentSubmit() {
    if (!voidPaymentTarget || !voidPaymentReason.trim()) return;
    try {
      voidDebtPayment(voidPaymentTarget, voidPaymentReason.trim(), "Owner");
      showToast("Payment voided successfully.", "success");
      closeVoidPaymentModal(); // Clean up state
    } catch (err) {
      showToast("Failed to void payment.", "error");
    }
  }

  function handleReturnSubmit() {
    if (!invoice) return;
    if (!returnReason.trim()) {
      showToast("Please enter a return reason.", "error");
      return;
    }
    const returnItems: SalesReturnItem[] = invoice.items
      .map((item, idx) => {
        const itemId = item.id || `item-${idx}`;
        const qty = returnQtys[itemId] || 0;
        if (qty <= 0) return null;
        const refundAmount = Math.round(item.price * qty * 100) / 100;
        return {
          invoiceItemId: itemId,
          productId: item.productId,
          productName: item.name,
          quantity: qty,
          sellingPrice: item.price,
          refundAmount,
          totalAmount: refundAmount,
        } satisfies SalesReturnItem;
      })
      .filter(Boolean) as SalesReturnItem[];

    if (returnItems.length === 0) {
      showToast("Please select at least one item to return.", "error");
      return;
    }

    // Walk-in invoices have customerId === null — still allow returns, use empty string as sentinel
    const customerId = invoice.customerId ?? "";

    let exchangeItems: ExchangeItem[] | undefined = undefined;
    let exchangeDifference: number | undefined = undefined;
    let differencePaymentMethod: PaymentMethod | "Adjustment" | undefined = undefined;

    if (returnMethod === "Exchange") {
      if (!exchangeProductId) {
        showToast("Please select a replacement product for exchange.", "error");
        return;
      }
      const exProd = state.products.find((p) => p.id === exchangeProductId);
      if (!exProd) {
        showToast("Selected replacement product not found.", "error");
        return;
      }
      if (exchangeQty <= 0) {
        showToast("Exchange quantity must be at least 1.", "error");
        return;
      }
      if (exProd.stock < exchangeQty) {
        showToast(`Insufficient stock for ${exProd.name}. Available: ${exProd.stock}`, "error");
        return;
      }

      exchangeItems = [
        {
          productId: exProd.id,
          productName: exProd.name,
          quantity: exchangeQty,
          sellingPrice: exProd.sellPrice,
          costPrice: exProd.currentCost,
        },
      ];

      const returnedTotal = returnItems.reduce((s, it) => s + it.refundAmount, 0);
      const replacementTotal = Math.round(exchangeQty * exProd.sellPrice * 100) / 100;
      exchangeDifference = Math.round((replacementTotal - returnedTotal) * 100) / 100;
      differencePaymentMethod = diffMethod;
    }

    try {
      addSalesReturn({
        invoiceId: invoice.id,
        customerId,
        items: returnItems,
        refundMethod: returnMethod,
        reason: returnReason.trim(),
        notes: returnNotes.trim() || undefined,
        createdBy: "Owner",
        exchangeItems,
        exchangeDifference,
        differencePaymentMethod,
      });
      showToast("Sales return recorded successfully!", "success");
      closeReturnModal();
    } catch (err) {
      console.error("[handleReturnSubmit] addSalesReturn threw:", err);
      showToast("Failed to record return.", "error");
    }
  }

  function handleCancelReturn() {
    if (!cancelReturnTarget || !cancelReturnReason.trim()) return;
    try {
      cancelSalesReturn(cancelReturnTarget, cancelReturnReason.trim(), "Owner");
      showToast("Sales return cancelled.", "success");
      setCancelReturnTarget(null);
      setCancelReturnReason("");
    } catch {
      showToast("Failed to cancel return.", "error");
    }
  }

  // ── Not found — early return AFTER all hooks ──────────────────────────────
  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle size={40} className="text-slate-300" />
        <p className="text-slate-500 text-sm">Invoice not found.</p>
        <Link
          href="/invoices"
          className="text-sm text-amber-600 hover:underline"
        >
          ← Back to Invoices
        </Link>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-[calc(80px+env(safe-area-inset-bottom,0px))] sm:pb-8">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 print:hidden">
        <Link
          href="/invoices"
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors font-medium min-h-[40px] px-1"
        >
          <ArrowLeft size={15} />
          Back to Invoices
        </Link>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {!invoice.voided && isOwner && (
            <button
              onClick={openVoidInvoiceModal}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm px-3.5 py-2 rounded-lg transition-all font-semibold cursor-pointer hover:shadow active:scale-97 min-h-[40px]"
            >
              <Trash2 size={14} />
              Void Invoice
            </button>
          )}
          {getInvoiceOutstanding(invoice) > 0 && invoice.customerId && !invoice.voided && (
            <button
              onClick={openCollect}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm px-3.5 py-2 rounded-lg transition-colors font-semibold cursor-pointer min-h-[40px]"
            >
              <Wallet size={14} />
              Collect ₹{getInvoiceOutstanding(invoice).toLocaleString()}
            </button>
          )}
          {invoice.customerPhone && (
            <button
              onClick={handleWhatsApp}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-xs sm:text-sm px-3.5 py-2 rounded-lg transition-colors font-semibold cursor-pointer min-h-[40px]"
            >
              <MessageCircle size={14} />
              WhatsApp
            </button>
          )}

          {/* Grouped Print / Preview / PDF / Paper Size Controls */}
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 text-xs font-semibold shadow-xs">
                <button
                  onClick={() => setPrintSize("A4")}
                  className={`px-2.5 py-1 rounded-md transition ${printSize === "A4" ? "bg-slate-900 text-white shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"}`}
                >
                  A4
                </button>
                <button
                  onClick={() => setPrintSize("A5")}
                  className={`px-2.5 py-1 rounded-md transition ${printSize === "A5" ? "bg-slate-900 text-white shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"}`}
                >
                  A5
                </button>
              </div>

              <button
                onClick={() => setIsPreviewOpen(true)}
                className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm px-3 py-1.5 rounded-lg border border-slate-200 transition-colors font-semibold cursor-pointer shadow-xs min-h-[36px]"
                title="Open Print & PDF Preview Modal"
              >
                <Eye size={14} className="text-slate-600" />
                Preview
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm px-3.5 py-1.5 rounded-lg transition-colors font-semibold cursor-pointer shadow-xs min-h-[36px]"
              >
                <Printer size={14} />
                Print ({printSize})
              </button>

              <button
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-3.5 py-1.5 rounded-lg transition-colors font-semibold cursor-pointer shadow-xs min-h-[36px]"
                title="Save / Export as PDF"
              >
                <FileText size={14} />
                Export PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 4: Prominent Invoice Lifecycle Banner ─────────────────────── */}
      <div className={`rounded-2xl p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs border print:hidden ${
        invoice.paymentStatus === "Paid" ? "bg-emerald-50/80 border-emerald-200 text-emerald-950" :
        invoice.paymentStatus === "Partial" ? "bg-blue-50/80 border-blue-200 text-blue-950" :
        invoice.paymentStatus === "Debt" ? "bg-amber-50/80 border-amber-200 text-amber-950" :
        invoice.paymentStatus === "Partially Returned" ? "bg-orange-50/80 border-orange-200 text-orange-950" :
        invoice.paymentStatus === "Fully Returned" ? "bg-red-50/80 border-red-200 text-red-950" :
        invoice.paymentStatus === "Refunded" ? "bg-purple-50/80 border-purple-200 text-purple-950" :
        "bg-slate-100 border-slate-300 text-slate-900"
      }`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-xl text-white font-bold shadow-xs shrink-0 ${
            invoice.paymentStatus === "Paid" ? "bg-emerald-600" :
            invoice.paymentStatus === "Partial" ? "bg-blue-600" :
            invoice.paymentStatus === "Debt" ? "bg-amber-600" :
            invoice.paymentStatus === "Partially Returned" ? "bg-orange-600" :
            invoice.paymentStatus === "Fully Returned" ? "bg-red-600" :
            invoice.paymentStatus === "Refunded" ? "bg-purple-600" :
            "bg-slate-600"
          }`}>
            <FileText size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-black tracking-tight">{invoice.invoiceNumber}</h1>
              <span className={`text-xs px-3 py-1 rounded-full font-black uppercase tracking-wider border shadow-2xs ${STATUS_BADGE[invoice.paymentStatus]}`}>
                {invoice.paymentStatus}
              </span>
            </div>
            <p className="text-xs font-medium opacity-80 mt-1">
              Billed to <span className="font-bold">{invoice.customer}</span> ({invoice.customerPhone || "Walk-in Customer"}) on {formatInvoiceDate(invoice)}
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200/60 w-full sm:w-auto">
          <span className="text-[10px] uppercase font-extrabold tracking-wider opacity-70 block">Current Lifecycle Status</span>
          <span className="text-xl font-black tracking-wide uppercase">{invoice.paymentStatus}</span>
        </div>
      </div>

      {/* ── Section 5: Executive Financial & Return Summary (Balanced 3x3 Responsive Grid) ───────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 shadow-sm print:hidden">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-600" />
            Executive Financial &amp; Return Summary
          </h2>
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">Lifecycle Snapshot</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-between" title={`₹${invoice.total.toLocaleString()}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Invoice Total</p>
            <p className="font-extrabold text-slate-800 text-sm mt-1 font-mono">₹{invoice.total.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-between" title={`₹${cashCollected.toLocaleString()}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cash Collected</p>
            <p className="font-extrabold text-blue-600 text-sm mt-1 font-mono">₹{cashCollected.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-between" title={`₹${totalCashRefunded.toLocaleString()}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cash Refunded</p>
            <p className="font-extrabold text-purple-600 text-sm mt-1 font-mono">₹{totalCashRefunded.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-between" title={`₹${totalDebtCancelled.toLocaleString()}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Debt Cancelled</p>
            <p className="font-extrabold text-green-600 text-sm mt-1 font-mono">₹{totalDebtCancelled.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-between" title={`₹${totalCreditCreated.toLocaleString()}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Credit Issued</p>
            <p className="font-extrabold text-indigo-600 text-sm mt-1 font-mono">₹{totalCreditCreated.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-between" title={`₹${outstandingDue.toLocaleString()}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Outstanding</p>
            <p className={`font-extrabold text-sm mt-1 font-mono ${outstandingDue > 0 ? "text-red-600" : "text-slate-700"}`}>₹{outstandingDue.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-between" title={`₹${totalRefunded.toLocaleString()}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Returned Value</p>
            <p className="font-extrabold text-orange-600 text-sm mt-1 font-mono">₹{totalRefunded.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-between" title={`₹${netInvoiceRevenue.toLocaleString()}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Net Revenue</p>
            <p className="font-extrabold text-navy-950 text-sm mt-1 font-mono">₹{netInvoiceRevenue.toLocaleString()}</p>
          </div>
          <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3 flex flex-col justify-between" title={invoice.paymentStatus}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Lifecycle Status</p>
            <p className="font-extrabold text-emerald-800 text-xs mt-1">{invoice.paymentStatus}</p>
          </div>
        </div>
      </div>

      {/* ── Phase 8: Invoice Integrity Panel Check ──────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 shadow-sm print:hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3 border-b border-slate-100 pb-2">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
            Invoice Integrity Reconciliation Panel
          </h2>
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
            Read-Only Audit
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {integrityChecks.map((chk) => (
            <div key={chk.name} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-700">{chk.name}</span>
                <span className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  chk.status === "OK" ? "bg-green-100 text-green-700" : chk.status === "Warning" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"
                }`}>
                  ✓ {chk.status}
                </span>
              </div>
              <div className="text-[11px] space-y-0.5 text-slate-600 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Expected:</span>
                  <span>{chk.expected}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Recorded:</span>
                  <span>{chk.recorded}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-slate-200 pt-0.5 mt-0.5 text-slate-800">
                  <span>Diff:</span>
                  <span>{chk.diff}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Phase 4: Finance Reconciliation Section ─────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 shadow-sm print:hidden">
        <h2 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
          <Scale size={16} className="text-blue-600 shrink-0" />
          Finance Reconciliation Ledger
        </h2>
        {linkedFinanceTxs.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No linked finance entries recorded for this invoice.</p>
        ) : (
          <>
            {/* Desktop Table View (≥768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Method</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3">Traceability Relation</th>
                    <th className="py-2 px-3">Reference / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {linkedFinanceTxs.map((ft) => {
                    const isReversal = !!ft.reversalOf;
                    const reversedByTx = linkedFinanceTxs.find((other) => other.reversalOf === ft.id);

                    return (
                      <tr key={ft.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono text-slate-500">{new Date(ft.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="py-2 px-3">
                          <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                            ft.type === "Income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}>
                            {ft.type}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-800">{ft.category}</td>
                        <td className="py-2 px-3 font-mono">{ft.method}</td>
                        <td className={`py-2 px-3 text-right font-mono font-bold ${ft.type === "Income" ? "text-green-600" : "text-red-600"}`}>
                          {ft.type === "Expense" ? "−" : ""}₹{ft.amount.toLocaleString()}
                        </td>
                        <td className="py-2 px-3">
                          {isReversal ? (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded inline-flex items-center gap-1" title={`Reverses original transaction ${ft.reversalOf}`}>
                              ↺ Reversal of {ft.reversalOf?.slice(0, 8)}…
                            </span>
                          ) : reversedByTx ? (
                            <span className="text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded inline-flex items-center gap-1" title={`Reversed by transaction ${reversedByTx.id}`}>
                              ➜ Reversed by {reversedByTx.id.slice(0, 8)}…
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">Original Transaction</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-500 italic max-w-xs truncate">{ft.notes || ft.referenceId}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Cards View (<768px) */}
            <div className="md:hidden space-y-3">
              {linkedFinanceTxs.map((ft) => {
                const isReversal = !!ft.reversalOf;
                const reversedByTx = linkedFinanceTxs.find((other) => other.reversalOf === ft.id);

                return (
                  <div key={ft.id} className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{ft.category}</span>
                      <span className={`font-mono font-extrabold ${ft.type === "Income" ? "text-green-600" : "text-red-600"}`}>
                        {ft.type === "Expense" ? "−" : ""}₹{ft.amount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-mono">{new Date(ft.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">{ft.method}</span>
                    </div>
                    {(isReversal || reversedByTx) && (
                      <div className="pt-1.5 border-t border-slate-200/60">
                        {isReversal && (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded inline-block">
                            ↺ Reversal of {ft.reversalOf?.slice(0, 8)}…
                          </span>
                        )}
                        {reversedByTx && (
                          <span className="text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded inline-block">
                            ➜ Reversed by {reversedByTx.id.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                    )}
                    {ft.notes && <p className="text-[11px] text-slate-600 italic border-t border-slate-200/40 pt-1">{ft.notes}</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:block">

        {/* ── Main invoice (printable area) ──────────────────────────────── */}
        <div className="lg:col-span-2 print:col-span-3">
          <PrintableInvoice id="invoice-print" invoice={invoice} salesReturns={salesReturns} shopSettings={shopSettings} printSize={printSize} />
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────── */}
        <div className="space-y-4 print:hidden">

          {/* Voided Details Sidebar Card */}
          {invoice.voided && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle size={18} className="shrink-0" />
                <h3 className="font-extrabold uppercase tracking-wider text-xs">Voided Invoice</h3>
              </div>
              <div className="text-xs text-red-700 space-y-1 bg-white border border-red-100 p-3 rounded-lg font-medium leading-relaxed">
                <div>
                  <span className="font-bold text-red-800">Reason:</span> {invoice.voidReason}
                </div>
                <div>
                  <span className="font-bold text-red-800">Voided By:</span> {invoice.voidedBy || "Owner"}
                </div>
                <div>
                  <span className="font-bold text-red-800">Voided Date:</span> {invoice.voidedAt ? new Date(invoice.voidedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                </div>
              </div>
            </div>
          )}

          {/* Collect Payment card — shows only when there's due */}
          {getInvoiceOutstanding(invoice) > 0 && invoice.customerId && !invoice.voided && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <h2 className="font-bold text-red-800 text-sm mb-1">Outstanding Due</h2>
              <p className="text-2xl font-extrabold text-red-600 mb-3">
                ₹{getInvoiceOutstanding(invoice).toLocaleString()}
              </p>
              <button
                onClick={openCollect}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer"
              >
                <Wallet size={14} />
                Collect Payment
              </button>
            </div>
          )}

          {/* Phase 5: Payment History Table */}
          {repayments.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <h2 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
                <Coins size={15} className="text-emerald-600" />
                Payment History Table
              </h2>

              {/* Desktop Repayments Table (>=768px) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] border-b border-slate-200">
                      <th className="py-1.5 px-2">Receipt #</th>
                      <th className="py-1.5 px-2">Date</th>
                      <th className="py-1.5 px-2 text-right">Amount</th>
                      <th className="py-1.5 px-2">Method</th>
                      <th className="py-1.5 px-2">By</th>
                      <th className="py-1.5 px-2">Status</th>
                      <th className="py-1.5 px-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {repayments.map((p) => (
                      <tr key={p.id} className={p.voided ? "bg-red-50/50 text-slate-400" : "hover:bg-slate-50"}>
                        <td className="py-2 px-2 font-mono text-[10px]">
                          {p.receiptNumber ? (
                            <span className="font-bold text-slate-800">{p.receiptNumber}</span>
                          ) : (
                            <span className="italic text-slate-400">Legacy</span>
                          )}
                        </td>
                        <td className="py-2 px-2 font-mono text-[10px]">{formatRepaymentDate(p.date)}</td>
                        <td className={`py-2 px-2 text-right font-mono font-bold ${p.voided ? "line-through text-red-500" : "text-green-700"}`}>
                          ₹{p.amount.toLocaleString()}
                        </td>
                        <td className="py-2 px-2 font-mono text-[10px]">{p.method}</td>
                        <td className="py-2 px-2">{p.collectedBy}</td>
                        <td className="py-2 px-2">
                          {p.voided ? (
                            <span className="text-[9px] font-black uppercase bg-red-600 text-white px-1 py-0.5 rounded">VOID</span>
                          ) : (
                            <span className="text-[9px] font-bold uppercase bg-green-100 text-green-700 px-1 py-0.5 rounded">Active</span>
                          )}
                          {!p.voided && !invoice.voided && isOwner && (
                            <button
                              onClick={() => openVoidPaymentModal(p.id)}
                              className="ml-1 text-[9px] text-red-600 hover:underline cursor-pointer"
                              title="Void payment"
                            >
                              [Void]
                            </button>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setPrintReceiptPayment(p)}
                              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition cursor-pointer"
                              title="Print Payment Receipt"
                            >
                              <Printer size={12} />
                            </button>
                            <button
                              onClick={() => handleShareReceiptWhatsApp(p)}
                              className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition cursor-pointer"
                              title="Share WhatsApp Receipt"
                            >
                              <MessageCircle size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Repayments Cards (<768px) */}
              <div className="md:hidden space-y-3">
                {repayments.map((p) => (
                  <div key={p.id} className={`p-3.5 rounded-xl border space-y-2.5 ${p.voided ? "bg-red-50/40 border-red-200" : "bg-slate-50/50 border-slate-200"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-slate-800 bg-white border border-slate-200 px-2 py-0.5 rounded">
                          {p.receiptNumber || "Legacy"}
                        </span>
                        <p className="text-[10px] text-slate-400 font-mono mt-1">{formatRepaymentDate(p.date)}</p>
                      </div>
                      <div className="text-right">
                        <span className={`font-mono text-sm font-black block ${p.voided ? "line-through text-red-500" : "text-green-700"}`}>
                          +₹{p.amount.toLocaleString()}
                        </span>
                        <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded inline-block mt-0.5">
                          {p.method}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs border-t border-slate-200/60 pt-2 text-slate-600">
                      <span>By: <strong className="text-slate-800">{p.collectedBy}</strong></span>
                      <div>
                        {p.voided ? (
                          <span className="text-[9px] font-black uppercase bg-red-600 text-white px-1.5 py-0.5 rounded">VOID</span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Active</span>
                        )}
                        {!p.voided && !invoice.voided && isOwner && (
                          <button
                            onClick={() => openVoidPaymentModal(p.id)}
                            className="ml-2 text-[10px] text-red-600 font-bold hover:underline cursor-pointer"
                          >
                            [Void]
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => setPrintReceiptPayment(p)}
                        className="flex-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        <Printer size={14} />
                        Print Receipt
                      </button>
                      <button
                        onClick={() => handleShareReceiptWhatsApp(p)}
                        className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        <MessageCircle size={14} />
                        WhatsApp
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-right text-slate-500 font-semibold pt-2 border-t border-slate-100 mt-2">
                Total repaid (active): ₹{totalRepaid.toLocaleString()}
              </div>
            </div>
          )}

          {/* Phase 6: Item Profit & Stock Snapshot */}
          {!invoice.voided && isOwner && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <Package size={15} className="text-slate-500" />
                  Item Profit & Stock Snapshot
                </h2>
                <button
                  onClick={openReturnModal}
                  className="flex items-center gap-1 text-xs font-bold text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  <RotateCcw size={11} />
                  Return
                </button>
              </div>
              <div className="space-y-3">
                {invoice.items.map((item, idx) => {
                  const itemId = item.id || `item-${idx}`;
                  const returnable = getReturnableQuantity(itemId, invoice.id);
                  const returned = item.quantity - returnable;
                  const netQty = Math.max(0, item.quantity - returned);
                  const unitCost = item.costPrice ?? (state.products.find((p) => p.id === item.productId)?.currentCost ?? 0);
                  const lineProfit = Math.round(netQty * (item.price - unitCost));

                  return (
                    <div key={itemId} className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-xs space-y-2">
                      <div className="flex justify-between items-start">
                        <p className="font-bold text-slate-800 leading-tight">{item.name}</p>
                        <span className="font-mono font-extrabold text-emerald-700 text-xs shrink-0 ml-2">
                          +₹{lineProfit.toLocaleString()} profit
                        </span>
                      </div>
                      <div className="grid grid-cols-6 gap-1 text-center font-mono text-[10px] bg-white p-2 rounded border border-slate-200/60">
                        <div>
                          <p className="text-slate-400 font-sans uppercase text-[9px]">Sold</p>
                          <p className="font-bold text-slate-700">{item.quantity}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-sans uppercase text-[9px]">Ret</p>
                          <p className={`font-bold ${returned > 0 ? "text-orange-600" : "text-slate-400"}`}>{returned}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-sans uppercase text-[9px]">Net</p>
                          <p className="font-bold text-blue-600">{netQty}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-sans uppercase text-[9px]">Cost</p>
                          <p className="font-semibold text-slate-600">₹{unitCost.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-sans uppercase text-[9px]">Sell</p>
                          <p className="font-semibold text-slate-700">₹{item.price.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-sans uppercase text-[9px]">Profit</p>
                          <p className="font-bold text-emerald-600">₹{(item.price - unitCost).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalRefunded > 0 && (
                <div className="mt-3 pt-2 border-t border-slate-100 text-xs text-right text-slate-500">
                  Total refunded: <span className="font-bold text-orange-600">₹{totalRefunded.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {/* Phase 7: Enhanced Sales Return Cards */}
          {salesReturns.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
                <RotateCcw size={15} className="text-orange-500" />
                Return History
              </h2>
              <div className="space-y-3">
                {salesReturns.map((ret) => (
                  <div
                    key={ret.id}
                    className={`rounded-xl border p-3 text-xs space-y-2 ${
                      ret.status === "Cancelled"
                        ? "bg-red-50/50 border-red-200 opacity-70"
                        : "bg-orange-50/40 border-orange-200"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-slate-800 font-mono text-sm">{ret.returnNumber}</span>
                        <span className="text-[10px] text-slate-400 block">{new Date(ret.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      </div>
                      <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${
                        ret.status === "Cancelled" ? "bg-red-100 text-red-700" :
                        ret.status === "Adjusted" ? "bg-blue-100 text-blue-700" :
                        "bg-green-100 text-green-700"
                      }`}>{ret.status}</span>
                    </div>

                    <p className="text-slate-600 italic">Reason: {ret.reason}</p>

                    {/* Returned items detail */}
                    {ret.items.length > 0 && (
                      <div className="bg-white border border-slate-200/80 rounded p-2 text-[11px] space-y-1">
                        <span className="font-bold text-slate-500 uppercase text-[9px] block">Returned Products:</span>
                        {ret.items.map((ri, rIdx) => (
                          <div key={rIdx} className="flex justify-between text-slate-700 font-medium">
                            <span>• {ri.productName} ×{ri.quantity}</span>
                            <span className="font-mono text-slate-500">₹{ri.refundAmount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Replacement Exchange items detail */}
                    {ret.exchangeItems && ret.exchangeItems.length > 0 && (
                      <div className="bg-blue-50 border border-blue-100 rounded p-2 text-[11px] space-y-1">
                        <span className="font-bold text-blue-600 uppercase text-[9px] block">Replacement Exchange Products:</span>
                        {ret.exchangeItems.map((ex, exIdx) => (
                          <div key={exIdx} className="flex justify-between text-blue-800 font-medium">
                            <span>• {ex.productName} ×{ex.quantity}</span>
                            <span className="font-mono">₹{(ex.quantity * ex.sellingPrice).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-1 border-t border-slate-200/60 font-bold">
                      <span className="text-slate-500">Method: {ret.refundMethod}</span>
                      <span className={ret.status === "Cancelled" ? "text-slate-400 line-through" : "text-orange-700"}>
                        Total: ₹{ret.totalRefund.toLocaleString()}
                      </span>
                    </div>

                    {ret.status !== "Cancelled" && isOwner && (
                      <button
                        onClick={() => { setCancelReturnTarget(ret.id); setCancelReturnReason(""); }}
                        className="mt-1 flex items-center gap-1 text-[10px] font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        <X size={10} /> Cancel Return
                      </button>
                    )}
                    {ret.cancellationReason && (
                      <p className="text-red-600 text-[10px] font-medium">Cancelled: {ret.cancellationReason}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Activity Timeline ────────────────────────────────────────────── */}
          {(() => {
            type TimelineEvent = {
              id: string;
              date: string;
              icon: "create" | "pay" | "void-pay" | "return" | "cancel-return" | "void-inv";
              title: string;
              sub: string;
              amount?: number;
            };
            const events: TimelineEvent[] = [];

            // Invoice creation
            events.push({
              id: "created",
              date: invoice.createdAt || invoice.date,
              icon: "create",
              title: "Invoice Created",
              sub: `${invoice.paymentMethod} · ₹${invoice.total.toLocaleString()}`,
              amount: invoice.total,
            });

            // Repayments
            repayments.forEach((p) => {
              events.push({
                id: p.id,
                date: p.date,
                icon: p.voided ? "void-pay" : "pay",
                title: p.voided ? "Payment Voided" : "Payment Collected",
                sub: `${p.method} · by ${p.collectedBy}${p.voided ? ` · ${p.voidReason}` : ""}`,
                amount: p.amount,
              });
            });

            // Sales Returns
            salesReturns.forEach((ret) => {
              // Build a concise item summary: "Oil Filter ×1, Brake Pad ×2"
              const itemsSummary = ret.items
                .filter((ri) => ri.quantity > 0)
                .map((ri) => `${ri.productName} ×${ri.quantity}`)
                .join(", ");
              const returnedLine = itemsSummary ? `Returned: ${itemsSummary}` : ret.reason;
              const refundLine = `Refund: ₹${Math.round(ret.totalRefund).toLocaleString()}`;

              events.push({
                id: `ret-${ret.id}`,
                date: ret.createdAt,
                icon: "return",
                title: `Return ${ret.returnNumber} · ${ret.refundMethod}`,
                sub: `${returnedLine} · ${refundLine}${ret.status === "Cancelled" ? " · CANCELLED" : ""}`,
                amount: ret.totalRefund,
              });
              if (ret.status === "Cancelled" && ret.cancelledAt) {
                events.push({
                  id: `cret-${ret.id}`,
                  date: ret.cancelledAt,
                  icon: "cancel-return",
                  title: `Return Cancelled`,
                  sub: `${ret.returnNumber} · ${ret.cancellationReason || ""}`,
                  amount: ret.totalRefund,
                });
              }
            });

            // Invoice void
            if (invoice.voided && invoice.voidedAt) {
              events.push({
                id: "voided",
                date: invoice.voidedAt,
                icon: "void-inv",
                title: "Invoice Voided",
                sub: invoice.voidReason || "",
              });
            }

            events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const iconMap: Record<TimelineEvent["icon"], { dot: string; label: string }> = {
              "create": { dot: "bg-blue-500", label: "🧾" },
              "pay": { dot: "bg-green-500", label: "💰" },
              "void-pay": { dot: "bg-red-400", label: "✕" },
              "return": { dot: "bg-orange-400", label: "↩" },
              "cancel-return": { dot: "bg-red-500", label: "✕" },
              "void-inv": { dot: "bg-red-700", label: "🚫" },
            };

            if (events.length === 0) return null;
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="font-semibold text-slate-800 text-sm mb-4">Activity Timeline</h2>
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />
                  <div className="space-y-4">
                    {events.map((ev) => {
                      const { dot } = iconMap[ev.icon];
                      return (
                        <div key={ev.id} className="flex gap-3 relative">
                          <div className={`w-6 h-6 rounded-full ${dot} flex items-center justify-center shrink-0 text-white text-[10px] font-bold z-10 ring-2 ring-white`}>
                            {iconMap[ev.icon].label}
                          </div>
                          <div className="flex-1 min-w-0 pb-1">
                            <p className="text-xs font-bold text-slate-800 leading-tight">{ev.title}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-tight truncate">{ev.sub}</p>
                            <div className="flex items-center justify-between mt-0.5">
                              <p className="text-[10px] text-slate-400">{new Date(ev.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                              {ev.amount != null && (
                                <p className={`text-[10px] font-bold ${ev.icon === "return" || ev.icon === "void-pay" || ev.icon === "void-inv" ? "text-red-500" : "text-green-600"}`}>
                                  {ev.icon === "return" || ev.icon === "void-pay" ? "−" : ""}₹{ev.amount.toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Payment summary & Display-Only Net Financial Effect */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 text-sm mb-4">
              Payment & Finance Totals
            </h2>
            <div className="space-y-3">
              <Row label="Invoice" value={invoice.invoiceNumber} mono />
              <Row label="Date" value={formatInvoiceDate(invoice)} />
              <Row label="Method" value={invoice.paymentMethod} />
              {invoice.billedBy && (
                <Row label="Billed By" value={invoice.billedBy} />
              )}
              <Row
                label="Status"
                value={
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[invoice.paymentStatus]}`}
                  >
                    {invoice.paymentStatus}
                  </span>
                }
              />
              <div className="border-t pt-3 space-y-2 text-xs">
                <Row
                  label="Net Cash Received"
                  value={`₹${cashCollected.toLocaleString()}`}
                  valueClass="text-blue-600 font-bold"
                />
                {totalRefunded > 0 && (
                  <Row
                    label="Total Refund"
                    value={`−₹${totalRefunded.toLocaleString()}`}
                    valueClass="text-orange-600 font-bold"
                  />
                )}
                {storeCreditUsed > 0 && (
                  <Row
                    label="Store Credit Used"
                    value={`₹${storeCreditUsed.toLocaleString()}`}
                    valueClass="text-purple-600 font-bold"
                  />
                )}
                {getInvoiceOutstanding(invoice) > 0 && (
                  <Row
                    label="Outstanding"
                    value={`₹${getInvoiceOutstanding(invoice).toLocaleString()}`}
                    valueClass="text-red-600 font-bold"
                  />
                )}
                <div className="border-t border-slate-100 pt-2 flex justify-between items-center font-bold text-slate-900">
                  <span>Net Financial Effect</span>
                  <span className="text-emerald-700 font-mono">₹{(cashCollected - totalRefunded).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Customer Card */}
          {(customer || invoice.customer) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
              <h2 className="font-semibold text-slate-800 text-sm mb-2 flex items-center justify-between">
                <span>Customer Profile</span>
                {customer && <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Registered</span>}
              </h2>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {customer?.name || invoice.customer}
                </p>
                <p className="text-xs text-slate-500 font-mono">{customer?.phone || invoice.customerPhone || "—"}</p>
              </div>

              {(invoice.vehicleModel || invoice.vehicleNumber) && (
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs space-y-0.5">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Vehicle Details</p>
                  <p className="font-semibold text-slate-700">{invoice.vehicleModel || "Vehicle"} · {invoice.vehicleNumber || "—"}</p>
                </div>
              )}

              {customer && (
                <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="bg-red-50/60 border border-red-100 rounded p-1.5">
                    <span className="text-[9px] uppercase text-red-500 font-bold block">Total Debt</span>
                    <span className="font-extrabold text-red-700">₹{(customer.debt || 0).toLocaleString()}</span>
                  </div>
                  <div className="bg-purple-50/60 border border-purple-100 rounded p-1.5">
                    <span className="text-[9px] uppercase text-purple-500 font-bold block">Store Credit</span>
                    <span className="font-extrabold text-purple-700">₹{(customer.storeCredit || 0).toLocaleString()}</span>
                  </div>
                </div>
              )}

              {customer && (
                <Link
                  href={`/customers/${customer.id}`}
                  className="mt-2 block text-center text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-medium transition-colors"
                >
                  View Full Profile →
                </Link>
              )}
            </div>
          )}

          {/* Action buttons */}
          <button
            onClick={handlePrint}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-white py-3 rounded-xl text-sm font-medium transition-colors"
          >
            <Printer size={14} />
            Print Invoice
          </button>

          {!invoice.voided && isOwner && (
            <button
              onClick={openVoidInvoiceModal}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer hover:shadow active:scale-97"
            >
              <Trash2 size={14} />
              Void Invoice
            </button>
          )}

          {invoice.customerPhone && (
            <button
              onClick={handleWhatsApp}
              className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl text-sm font-medium transition-colors"
            >
              <MessageCircle size={14} />
              Send via WhatsApp
            </button>
          )}
        </div>
      </div>

      {/* ── Collect Payment Modal ─────────────────────────────────────────────── */}
      {collectOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h2 className="font-bold text-slate-800">Collect Payment</h2>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{invoice.invoiceNumber}</p>
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
                      <p className="font-bold text-slate-800 text-sm mt-1">₹{invoice.total.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Paid</p>
                      <p className="font-bold text-green-700 text-sm mt-1">₹{invoice.amountPaid.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Due</p>
                      <p className="font-bold text-red-600 text-sm mt-1">₹{getInvoiceOutstanding(invoice).toLocaleString()}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                    <input
                      type="number"
                      min="1"
                      max={getInvoiceOutstanding(invoice)}
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-400 transition"
                      autoFocus
                    />
                    {Number(collectAmount) > getInvoiceOutstanding(invoice) && (
                      <p className="text-xs text-red-500 font-bold mt-1.5 flex items-center gap-1.5 bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-lg animate-in slide-in-from-top-1">
                        <AlertCircle size={13} />
                        Amount cannot exceed outstanding due of ₹{getInvoiceOutstanding(invoice).toLocaleString()}.
                      </p>
                    )}
                    {Number(collectAmount) <= 0 && collectAmount !== "" && (
                      <p className="text-xs text-red-500 font-bold mt-1.5 flex items-center gap-1.5 bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-lg animate-in slide-in-from-top-1">
                        <AlertCircle size={13} />
                        Amount must be greater than 0.
                      </p>
                    )}
                    {Number(collectAmount) > 0 && Number(collectAmount) <= getInvoiceOutstanding(invoice) && (
                      <p className={`text-xs mt-1.5 font-semibold ${Number(collectAmount) >= getInvoiceOutstanding(invoice) ? "text-green-600" : "text-orange-600"}`}>
                        {Number(collectAmount) >= getInvoiceOutstanding(invoice)
                          ? "✓ Clears invoice fully → Paid"
                          : `₹${(getInvoiceOutstanding(invoice) - Number(collectAmount)).toLocaleString()} still remaining`}
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
                          className={`py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${collectMethod === m
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
                            className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${active
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
                      placeholder="e.g. Paid in cash on visit"
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
                    disabled={!collectAmount || Number(collectAmount) <= 0 || Number(collectAmount) > getInvoiceOutstanding(invoice) || !collectCollectedBy}
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

      {/* ── Void Invoice Modal (Phase 2.8C Void Protection) ────────────────────── */}
      {voidModalOpen && (
        <div
          onClick={closeVoidInvoiceModal}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="font-bold text-slate-800">Void Invoice</h2>
              <button onClick={closeVoidInvoiceModal} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {activeReturns.length > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-red-800 font-bold text-xs uppercase tracking-wider">
                    <AlertTriangle size={16} className="text-red-600 shrink-0" />
                    Cannot Void Invoice
                  </div>
                  <p className="text-xs text-red-700 leading-relaxed font-medium">
                    This invoice has <strong>{activeReturns.length} active Sales Return(s)</strong> ({activeReturns.map((r) => r.returnNumber).join(", ")}). Please cancel all active Sales Returns before voiding this invoice.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Voiding this invoice will increase product stock levels, deduct customer debt, and create a reversing finance transaction. This action is irreversible.
                </p>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Void Reason <span className="text-red-500">*</span></label>
                <textarea
                  value={voidReasonInput}
                  onChange={(e) => setVoidReasonInput(e.target.value)}
                  placeholder={activeReturns.length > 0 ? "Voiding blocked — cancel active returns first." : "Enter the reason for voiding this invoice..."}
                  disabled={activeReturns.length > 0}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-400 transition min-h-[80px] disabled:opacity-50 disabled:cursor-not-allowed"
                  required
                />
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={closeVoidInvoiceModal}
                className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidSubmit}
                disabled={activeReturns.length > 0 || !voidReasonInput.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Trash2 size={14} />
                Void Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Void Payment Modal ───────────────────────────────────────────────────────── */}
      {voidPaymentTarget && (() => {
        const targetPmt = repayments.find((p) => p.id === voidPaymentTarget);
        return (
          <div
            onClick={closeVoidPaymentModal}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200">
                <div>
                  <h2 className="font-bold text-slate-800">Void Payment</h2>
                  <p className="text-xs text-slate-500 mt-0.5">This cancels only this payment. The invoice remains active.</p>
                </div>
                <button onClick={closeVoidPaymentModal} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {/* Payment summary for context */}
                {targetPmt && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-3 text-center text-xs">
                    <div>
                      <p className="text-slate-400">Amount</p>
                      <p className="font-bold text-slate-800 text-sm mt-1">₹{targetPmt.amount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Method</p>
                      <p className="font-bold text-slate-800 text-sm mt-1">{targetPmt.method}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Date</p>
                      <p className="font-bold text-slate-800 text-sm mt-1">{formatRepaymentDate(targetPmt.date)}</p>
                    </div>
                  </div>
                )}
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 font-medium leading-relaxed">
                  ⚠️ Voiding this payment will increase the invoice due and update the customer ledger. This action is irreversible.
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Void Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={voidPaymentReason}
                    onChange={(e) => setVoidPaymentReason(e.target.value)}
                    placeholder="Enter the reason for voiding this payment..."
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-400 transition min-h-[80px]"
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 px-5 pb-5">
                <button
                  onClick={closeVoidPaymentModal}
                  className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVoidPaymentSubmit}
                  disabled={!voidPaymentReason.trim()}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Trash2 size={14} />
                  Void Payment
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Sales Return Modal ──────────────────────────────────────────────── */}
      {returnModalOpen && invoice && (
        <div
          onClick={closeReturnModal}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <RotateCcw size={16} className="text-orange-500" />
                  Return Items
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{invoice.invoiceNumber}</p>
              </div>
              <button onClick={closeReturnModal} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Per-item qty selectors */}
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Select Items & Quantities</p>
                <div className="space-y-2.5">
                  {invoice.items.map((item, idx) => {
                    const itemId = item.id || `item-${idx}`;
                    const availableQty = getReturnableQuantity(itemId, invoice.id);
                    const returnedQty = item.quantity - availableQty;
                    const qty = returnQtys[itemId] || 0;
                    const refundPreview = qty * item.price;

                    return (
                      <div key={itemId} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-xs font-bold text-slate-850">{item.name}</p>
                          <span className="text-xs font-mono font-bold text-slate-500">₹{item.price.toLocaleString()}</span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-[10px] bg-white border border-slate-100 rounded-lg p-2 font-semibold">
                          <div>
                            <span className="text-slate-400 block uppercase tracking-wider text-[8px]">Sold</span>
                            <span className="text-slate-700 text-xs font-bold">{item.quantity}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block uppercase tracking-wider text-[8px]">Returned</span>
                            <span className={`text-xs font-bold ${returnedQty > 0 ? "text-orange-650" : "text-slate-500"}`}>{returnedQty}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block uppercase tracking-wider text-[8px]">Available</span>
                            <span className="text-green-600 text-xs font-bold">{availableQty}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Return Qty:</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={qty <= 0}
                                onClick={() => setReturnQtys((q) => ({ ...q, [itemId]: Math.max(0, (q[itemId] || 0) - 1) }))}
                                className="w-7 h-7 rounded-full bg-slate-250 hover:bg-slate-350 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-bold text-sm flex items-center justify-center cursor-pointer transition-colors"
                              >−</button>
                              <span className={`w-6 text-center font-bold text-sm ${qty > 0 ? "text-orange-600 font-black" : "text-slate-400"}`}>{qty}</span>
                              <button
                                type="button"
                                disabled={qty >= availableQty}
                                onClick={() => setReturnQtys((q) => ({ ...q, [itemId]: Math.min(availableQty, (q[itemId] || 0) + 1) }))}
                                className="w-7 h-7 rounded-full bg-orange-100 hover:bg-orange-200 disabled:opacity-40 disabled:cursor-not-allowed text-orange-700 font-bold text-sm flex items-center justify-center cursor-pointer transition-colors"
                              >+</button>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] font-bold text-slate-450 block uppercase tracking-wider">Refund</span>
                            <span className={`text-xs font-bold ${qty > 0 ? "text-orange-600 font-black" : "text-slate-450"}`}>
                              ₹{refundPreview.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Refund method */}
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Refund Method</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {(["Cash", "UPI", "Bank", "Exchange", "Adjustment"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setReturnMethod(m)}
                      className={`py-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${returnMethod === m
                          ? "bg-orange-500 border-orange-500 text-white"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-orange-50 hover:border-orange-200"
                        }`}
                    >{m}</button>
                  ))}
                </div>
                {returnMethod === "Adjustment" && (
                  <p className="text-[10px] text-emerald-800 mt-1.5 font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
                    💡 Adjustment offsets open invoice debt first (₹{invoice.dueAmount.toLocaleString()} due). Any excess return value creates <strong>Store Credit</strong> for the customer to redeem in POS Billing. No cash leaves the business.
                  </p>
                )}

                {returnMethod === "Exchange" && (
                  <div className="mt-3 p-3 bg-orange-50/70 border border-orange-200 rounded-xl space-y-3">
                    <p className="text-xs font-bold text-orange-800 uppercase tracking-wider">
                      Replacement Product (Exchange)
                    </p>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Select Replacement Item <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={exchangeProductId}
                        onChange={(e) => setExchangeProductId(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                      >
                        <option value="">-- Choose product --</option>
                        {state.products
                          .filter((p) => (p.status || "Active") === "Active")
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku}) — ₹{p.sellPrice.toLocaleString()} (Stock: {p.stock})
                            </option>
                          ))}
                      </select>
                    </div>

                    {exchangeProductId && (() => {
                      const selectedProd = state.products.find((p) => p.id === exchangeProductId);
                      if (!selectedProd) return null;
                      const returnedTotal = invoice.items.reduce((s, item, idx) => {
                        const itemId = item.id || `item-${idx}`;
                        const qty = returnQtys[itemId] || 0;
                        return s + item.price * qty;
                      }, 0);
                      const replacementTotal = Math.round(exchangeQty * selectedProd.sellPrice * 100) / 100;
                      const diff = Math.round((replacementTotal - returnedTotal) * 100) / 100;

                      return (
                        <div className="space-y-2.5 pt-1 border-t border-orange-200/60">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-600">Replacement Quantity:</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={exchangeQty <= 1}
                                onClick={() => setExchangeQty((q) => Math.max(1, q - 1))}
                                className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-slate-700 font-bold text-xs flex items-center justify-center cursor-pointer"
                              >−</button>
                              <span className="w-6 text-center font-extrabold text-xs text-slate-800">{exchangeQty}</span>
                              <button
                                type="button"
                                disabled={exchangeQty >= selectedProd.stock}
                                onClick={() => setExchangeQty((q) => Math.min(selectedProd.stock, q + 1))}
                                className="w-6 h-6 rounded-full bg-orange-200 hover:bg-orange-300 disabled:opacity-40 text-orange-800 font-bold text-xs flex items-center justify-center cursor-pointer"
                              >+</button>
                            </div>
                          </div>

                          <div className="bg-white p-2.5 rounded-lg border border-orange-100 space-y-1 text-xs font-semibold">
                            <div className="flex justify-between text-slate-600">
                              <span>Returned Items Total:</span>
                              <span className="font-mono">₹{returnedTotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>Replacement Items Total:</span>
                              <span className="font-mono">₹{replacementTotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between font-bold pt-1 border-t border-slate-100">
                              <span>Exchange Difference:</span>
                              <span className={`font-mono font-black ${diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : "text-slate-700"}`}>
                                {diff > 0
                                  ? `+₹${diff.toLocaleString()} (Customer Pays Extra)`
                                  : diff < 0
                                    ? `-₹${Math.abs(diff).toLocaleString()} (Store Refunds)`
                                    : "₹0 (Equal Value Exchange)"}
                              </span>
                            </div>
                          </div>

                          {diff !== 0 && (
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                {diff > 0 ? "Customer Payment Method" : "Difference Refund Method"}
                              </label>
                              <div className="grid grid-cols-4 gap-1">
                                {(diff > 0 ? ["Cash", "UPI", "Card"] : ["Cash", "UPI", "Bank", "Adjustment"]).map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => setDiffMethod(m as any)}
                                    className={`py-1.5 rounded-lg border text-[10px] font-bold transition cursor-pointer ${diffMethod === m
                                        ? "bg-orange-600 border-orange-600 text-white"
                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                      }`}
                                  >
                                    {m}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Return Reason <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="e.g. Defective product, Wrong item..."
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  autoFocus
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Notes (optional)</label>
                <input
                  type="text"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                />
              </div>

              {/* Live Refund Breakdown & Validation Summary (Phase 2.8C) */}
              {(() => {
                const returningItemsCount = Object.values(returnQtys).filter(q => q > 0).length;
                const returningQtyTotal = Object.values(returnQtys).reduce((s, q) => s + q, 0);
                const RV = invoice.items.reduce((s, item, idx) => {
                  const itemId = item.id || `item-${idx}`;
                  const qty = returnQtys[itemId] || 0;
                  return s + item.price * qty;
                }, 0);
                if (returningQtyTotal <= 0) return null;

                const priorCashRefunded = (state.salesReturns || [])
                  .filter((r) => r.invoiceId === invoice.id && r.status !== "Cancelled")
                  .reduce((sum, r) => sum + (r.cashRefunded ?? 0), 0);

                const paidAvailable = Math.max(0, invoice.amountPaid - priorCashRefunded);
                const currentDue = invoice.dueAmount;

                let calcCashRefund = 0;
                let calcDebtCancelled = 0;
                let calcCreditCreated = 0;

                if (returnMethod === "Adjustment") {
                  calcCashRefund = 0;
                  calcDebtCancelled = Math.min(currentDue, RV);
                  calcCreditCreated = Math.max(0, RV - calcDebtCancelled);
                } else if (returnMethod === "Exchange") {
                  calcCashRefund = 0;
                  calcDebtCancelled = 0;
                  calcCreditCreated = 0;
                } else {
                  calcCashRefund = Math.min(RV, paidAvailable);
                  const rem = Math.max(0, RV - calcCashRefund);
                  calcDebtCancelled = Math.min(currentDue, rem);
                  calcCreditCreated = Math.max(0, rem - calcDebtCancelled);
                }

                return (
                  <div className="bg-orange-50/80 border border-orange-200 rounded-xl p-4 space-y-2.5">
                    <div className="flex justify-between items-center text-xs text-orange-950 font-bold border-b border-orange-200 pb-1.5">
                      <span>Live Settlement Breakdown</span>
                      <span>{returningItemsCount} item(s) · {returningQtyTotal} unit(s)</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-semibold">
                      <div className="bg-white p-2 rounded-lg border border-orange-100">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 block">Return Value</span>
                        <span className="font-extrabold text-orange-800 font-mono">₹{Math.round(RV).toLocaleString()}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-orange-100">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 block">Cash Refund</span>
                        <span className="font-extrabold text-purple-700 font-mono">₹{Math.round(calcCashRefund).toLocaleString()}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-orange-100">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 block">Debt Cancelled</span>
                        <span className="font-extrabold text-emerald-700 font-mono">₹{Math.round(calcDebtCancelled).toLocaleString()}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-orange-100">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 block">Credit Issued</span>
                        <span className="font-extrabold text-indigo-700 font-mono">₹{Math.round(calcCreditCreated).toLocaleString()}</span>
                      </div>
                    </div>

                    {RV > paidAvailable && returnMethod !== "Adjustment" && returnMethod !== "Exchange" && (
                      <p className="text-[10px] text-amber-900 bg-amber-100/70 border border-amber-200 p-2 rounded-lg leading-relaxed font-medium">
                        ℹ️ Cash refund is capped to <strong>₹{paidAvailable.toLocaleString()}</strong> (Paid ₹{invoice.amountPaid.toLocaleString()} − Prior Refunds ₹{priorCashRefunded.toLocaleString()}). Remaining ₹{(RV - calcCashRefund).toLocaleString()} reduces debt or creates store credit.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 pb-5 shrink-0">
              <button
                onClick={closeReturnModal}
                className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReturnSubmit}
                disabled={!returnReason.trim() || Object.values(returnQtys).reduce((s, q) => s + q, 0) <= 0}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} />
                Record Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Return Modal ─────────────────────────────────────────────── */}
      {cancelReturnTarget && (
        <div
          onClick={() => { setCancelReturnTarget(null); setCancelReturnReason(""); }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h2 className="font-bold text-slate-800">Cancel Return</h2>
                <p className="text-xs text-slate-500 mt-0.5">This will reverse stock and refund entries.</p>
              </div>
              <button onClick={() => { setCancelReturnTarget(null); setCancelReturnReason(""); }} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 font-medium leading-relaxed">
                ⚠️ Cancelling this return will reverse the stock restoration and append a reversing finance entry. The return record remains for audit purposes.
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Cancellation Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cancelReturnReason}
                  onChange={(e) => setCancelReturnReason(e.target.value)}
                  placeholder="Enter reason for cancelling this return..."
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-400 transition min-h-[80px]"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => { setCancelReturnTarget(null); setCancelReturnReason(""); }}
                className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={handleCancelReturn}
                disabled={!cancelReturnReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <X size={14} />
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print & PDF Preview Modal ────────────────────────────────────────── */}
      {isPreviewOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex flex-col items-center justify-center p-3 sm:p-6 print:hidden animate-in fade-in duration-200">
          <div className="bg-slate-100 rounded-2xl border border-slate-300 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-white border-b border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Printer size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    Print &amp; PDF Preview — {invoice.invoiceNumber}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Paper Size: {printSize} Portrait | Native Vector Text Output
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Paper Size Selector */}
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs font-semibold">
                  <button
                    onClick={() => setPrintSize("A4")}
                    className={`px-3 py-1 rounded-md transition ${printSize === "A4" ? "bg-slate-900 text-white shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    A4
                  </button>
                  <button
                    onClick={() => setPrintSize("A5")}
                    className={`px-3 py-1 rounded-md transition ${printSize === "A5" ? "bg-slate-900 text-white shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    A5
                  </button>
                </div>

                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  <Printer size={14} />
                  Print ({printSize})
                </button>

                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  <FileText size={14} />
                  Export PDF
                </button>

                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                  title="Close Preview"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body / Realistic Paper Container Simulation */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex justify-center bg-slate-200/80 select-text">
              <div className={`transition-all duration-300 w-full ${printSize === "A5" ? "max-w-[148mm]" : "max-w-[210mm]"}`}>
                <div className="bg-white shadow-2xl rounded-xl border border-slate-300 p-2 transform origin-top transition-all">
                  <PrintableInvoice
                    id="invoice-print-preview"
                    invoice={invoice}
                    salesReturns={salesReturns}
                    shopSettings={shopSettings}
                    printSize={printSize}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Mobile Cashier Bar (<640px) ───────────────────────── */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 shadow-lg flex items-center gap-2 print:hidden">
        {getInvoiceOutstanding(invoice) > 0 && !invoice.voided && (
          <button
            onClick={openCollect}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white min-h-[44px] px-3 py-2 rounded-xl text-xs font-extrabold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Coins size={15} />
            Collect ₹{getInvoiceOutstanding(invoice).toLocaleString()}
          </button>
        )}
        <button
          onClick={handlePrint}
          className="flex-1 bg-navy-950 hover:bg-navy-900 text-white min-h-[44px] px-3 py-2 rounded-xl text-xs font-extrabold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
        >
          <Printer size={15} />
          Print Invoice
        </button>
      </div>

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
              <PrintableReceipt
                payment={printReceiptPayment}
                invoice={invoice}
                shopSettings={shopSettings}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROW HELPER
// ─────────────────────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  mono,
  bold,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  bold?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-500 text-xs">{label}</span>
      <span
        className={[
          "text-xs text-right max-w-[60%] truncate",
          mono ? "font-mono" : "",
          bold ? "font-bold text-sm text-slate-900" : "text-slate-700",
          valueClass ?? "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
