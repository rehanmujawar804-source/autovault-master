"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { ArrowLeft, Printer, MessageCircle, AlertCircle, Wallet, CheckCircle, X, Trash2, RotateCcw, PackageX, Package } from "lucide-react";
import type { PaymentMethod, PaymentStatus, SalesReturnItem, ExchangeItem } from "@/types";
import PrintableInvoice from "@/components/PrintableInvoice";
import { formatInvoiceDate, formatRepaymentDate } from "@/lib/dateUtils";
import { useRole } from "@/hooks/useRole";

// ─────────────────────────────────────────────────────────────────────────────
//  STYLE MAPS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PaymentStatus, string> = {
  Paid:    "bg-green-100 text-green-700",
  Partial: "bg-orange-100 text-orange-700",
  Debt:    "bg-red-100 text-red-600",
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
  const { isOwner } = useRole();

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

  // ── Handlers — defined BEFORE any early return ────────────────────────────
  function handlePrint() {
    window.print();
  }

  function handleWhatsApp() {
    if (!invoice?.customerPhone) {
      alert("No customer phone number available.");
      return;
    }
    const lines = invoice.items
      .map(
        (item) =>
          `• ${item.name} ×${item.quantity} = ₹${(
            item.price * item.quantity
          ).toLocaleString()}`
      )
      .join("\n");

    const msg =
      `*${invoice.invoiceNumber}*\n` +
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
      `*Total: ₹${invoice.total.toLocaleString()}*\n` +
      (getInvoiceOutstanding(invoice) > 0
        ? `Due: ₹${getInvoiceOutstanding(invoice).toLocaleString()}\n`
        : "") +
      `Payment: ${invoice.paymentMethod} · ${invoice.paymentStatus}\n` +
      (invoice.notes ? `\nNote: ${invoice.notes}` : "") +
      `\n\nThank you! — 7 Star Car Accessories`;

    window.open(
      `https://wa.me/91${invoice.customerPhone}?text=${encodeURIComponent(msg)}`,
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
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href="/invoices"
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to Invoices
        </Link>

        <div className="flex gap-2">
          {!invoice.voided && isOwner && (
            <button
              onClick={openVoidInvoiceModal}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-lg transition-all font-semibold cursor-pointer hover:shadow active:scale-97"
            >
              <Trash2 size={14} />
              Void Invoice
            </button>
          )}
          {getInvoiceOutstanding(invoice) > 0 && invoice.customerId && !invoice.voided && (
            <button
              onClick={openCollect}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg transition-colors font-semibold cursor-pointer"
            >
              <Wallet size={14} />
              Collect ₹{getInvoiceOutstanding(invoice).toLocaleString()}
            </button>
          )}
          {invoice.customerPhone && (
            <button
              onClick={handleWhatsApp}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              <MessageCircle size={14} />
              WhatsApp
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Printer size={14} />
            Print
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:block">

        {/* ── Main invoice (printable area) ──────────────────────────────── */}
        <div className="lg:col-span-2 print:col-span-3">
          <PrintableInvoice invoice={invoice} />
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

          {/* Repayment history */}
          {repayments.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 text-sm mb-3">Repayment History</h2>
              <div className="space-y-2">
                {repayments.map((p) => (
                  <div
                    key={p.id}
                    className={`flex flex-col text-xs rounded-lg px-3 py-2 border ${
                      p.voided
                        ? "bg-red-50 border-red-200 opacity-70"
                        : "bg-green-50 border-green-100"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={`font-bold ${p.voided ? "text-red-600 line-through" : "text-green-700"}`}>
                          ₹{p.amount.toLocaleString()}
                        </span>
                        <span className="text-slate-600 ml-1">
                          collected on {formatRepaymentDate(p.date)} by{" "}
                          <span className="font-semibold text-slate-800">{p.collectedBy}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          p.voided ? "bg-red-100 text-red-700" : "bg-green-100 text-green-800"
                        }`}>
                          {p.method}
                        </span>
                        {p.voided && (
                          <span className="text-[10px] font-extrabold uppercase tracking-wider bg-red-600 text-white px-1.5 py-0.5 rounded">
                            VOIDED
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Void metadata — always visible, never hidden */}
                    {p.voided && (
                      <div className="mt-1.5 pt-1.5 border-t border-red-200 space-y-0.5">
                        <p className="text-red-700 font-semibold">Reason: {p.voidReason}</p>
                        <p className="text-red-500">Voided by {p.voidedBy} · {p.voidedAt ? new Date(p.voidedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                      </div>
                    )}
                    {p.note && !p.voided && (
                      <p className="text-slate-500 italic mt-1 border-t border-green-100/50 pt-1">{p.note}</p>
                    )}
                    {/* Void Payment button — Owner only, active payments only, non-voided invoice only */}
                    {!p.voided && !invoice.voided && isOwner && (
                      <button
                        onClick={() => openVoidPaymentModal(p.id)}
                        className="mt-2 self-start flex items-center gap-1 text-[10px] font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        <X size={10} />
                        Void Payment
                      </button>
                    )}
                  </div>
                ))}
                <div className="text-xs text-right text-slate-500 font-semibold pt-1 border-t border-slate-100">
                  Total repaid (active): ₹{totalRepaid.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* ── Items Breakdown card ─────────────────────────────────────────── */}
          {!invoice.voided && isOwner && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <Package size={15} className="text-slate-500" />
                  Items
                </h2>
                <button
                  onClick={openReturnModal}
                  className="flex items-center gap-1.5 text-xs font-bold text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <RotateCcw size={12} />
                  Return Items
                </button>
              </div>
              <div className="space-y-2">
                {invoice.items.map((item, idx) => {
                  const itemId = item.id || `item-${idx}`;
                  const returnable = getReturnableQuantity(itemId, invoice.id);
                  const returned = item.quantity - returnable;
                  return (
                    <div key={itemId} className="bg-slate-50 rounded-lg p-3 text-xs">
                      <p className="font-semibold text-slate-800 truncate mb-2">{item.name}</p>
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div>
                          <p className="text-slate-400 uppercase tracking-wider text-[10px]">Sold</p>
                          <p className="font-bold text-slate-700 text-sm">{item.quantity}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 uppercase tracking-wider text-[10px]">Returned</p>
                          <p className={`font-bold text-sm ${returned > 0 ? "text-orange-600" : "text-slate-400"}`}>{returned}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 uppercase tracking-wider text-[10px]">Available</p>
                          <p className={`font-bold text-sm ${returnable > 0 ? "text-green-600" : "text-slate-400"}`}>{returnable}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalRefunded > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-right text-slate-500">
                  Total refunded: <span className="font-bold text-orange-600">₹{totalRefunded.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Sales Returns History card ───────────────────────────────────── */}
          {salesReturns.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
                <RotateCcw size={15} className="text-orange-500" />
                Return History
              </h2>
              <div className="space-y-2">
                {salesReturns.map((ret) => (
                  <div
                    key={ret.id}
                    className={`rounded-lg border px-3 py-2.5 text-xs ${
                      ret.status === "Cancelled"
                        ? "bg-red-50 border-red-200 opacity-60"
                        : "bg-orange-50 border-orange-200"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-slate-800 font-mono">{ret.returnNumber}</span>
                      <span className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        ret.status === "Cancelled" ? "bg-red-100 text-red-700" :
                        ret.status === "Adjusted"  ? "bg-blue-100 text-blue-700" :
                        "bg-green-100 text-green-700"
                      }`}>{ret.status}</span>
                    </div>
                    <p className="text-slate-600">{ret.reason}</p>
                    <div className="flex justify-between mt-1">
                      <span className="text-slate-500">{ret.refundMethod}</span>
                      <span className={`font-bold ${ret.status === "Cancelled" ? "text-slate-400 line-through" : "text-orange-700"}`}>
                        ₹{ret.totalRefund.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-400 mt-1">{new Date(ret.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                    {ret.status !== "Cancelled" && isOwner && (
                      <button
                        onClick={() => { setCancelReturnTarget(ret.id); setCancelReturnReason(""); }}
                        className="mt-2 flex items-center gap-1 text-[10px] font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        <X size={10} /> Cancel Return
                      </button>
                    )}
                    {ret.cancellationReason && (
                      <p className="text-red-600 text-[10px] mt-1 font-medium">Cancelled: {ret.cancellationReason}</p>
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
              "create":        { dot: "bg-blue-500",   label: "🧾" },
              "pay":           { dot: "bg-green-500",  label: "💰" },
              "void-pay":      { dot: "bg-red-400",    label: "✕" },
              "return":        { dot: "bg-orange-400", label: "↩" },
              "cancel-return": { dot: "bg-red-500",    label: "✕" },
              "void-inv":      { dot: "bg-red-700",    label: "🚫" },
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

          {/* Payment summary */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 text-sm mb-4">
              Payment Summary
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
              <div className="border-t pt-3 space-y-2">
                <Row
                  label="Total"
                  value={`₹${invoice.total.toLocaleString()}`}
                  bold
                />
                {invoice.amountPaid > 0 &&
                  invoice.amountPaid < invoice.total && (
                    <Row
                      label="Paid"
                      value={`₹${invoice.amountPaid.toLocaleString()}`}
                    />
                  )}
                {getInvoiceOutstanding(invoice) > 0 && (
                  <Row
                    label="Due"
                    value={`₹${getInvoiceOutstanding(invoice).toLocaleString()}`}
                    valueClass="text-red-600 font-bold"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Customer link */}
          {customer && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 text-sm mb-3">
                Customer
              </h2>
              <p className="text-sm font-medium text-slate-800">
                {customer.name}
              </p>
              <p className="text-xs text-slate-500">{customer.phone}</p>
              {getInvoiceOutstanding(invoice) > 0 && (
                <p className="text-xs text-red-500 mt-1">
                  Outstanding on this invoice: ₹{getInvoiceOutstanding(invoice).toLocaleString()}
                </p>
              )}
              <Link
                href={`/customers/${customer.id}`}
                className="mt-3 block text-center text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg transition-colors"
              >
                View Customer Profile →
              </Link>
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

      {/* ── Void Invoice Modal ────────────────────────────────────────────────── */}
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
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Voiding this invoice will increase product stock levels, deduct customer debt, and create a reversing finance transaction. This action is irreversible.
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Void Reason <span className="text-red-500">*</span></label>
                <textarea
                  value={voidReasonInput}
                  onChange={(e) => setVoidReasonInput(e.target.value)}
                  placeholder="Enter the reason for voiding this invoice..."
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-400 transition min-h-[80px]"
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
                disabled={!voidReasonInput.trim()}
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
                      className={`py-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
                        returnMethod === m
                          ? "bg-orange-500 border-orange-500 text-white"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-orange-50 hover:border-orange-200"
                      }`}
                    >{m}</button>
                  ))}
                </div>
                {returnMethod === "Adjustment" && (
                  <p className="text-[10px] text-blue-600 mt-1.5 font-medium bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
                    Adjustment = internal credit note. No cash leaves the business.
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
                          .filter((p) => p.status !== "Inactive" && p.status !== "Discontinued")
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
                                    className={`py-1.5 rounded-lg border text-[10px] font-bold transition cursor-pointer ${
                                      diffMethod === m
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

              {/* Refund summary */}
              {(() => {
                const returningItemsCount = Object.values(returnQtys).filter(q => q > 0).length;
                const returningQtyTotal = Object.values(returnQtys).reduce((s, q) => s + q, 0);
                const refundTotal = invoice.items.reduce((s, item, idx) => {
                  const itemId = item.id || `item-${idx}`;
                  const qty = returnQtys[itemId] || 0;
                  return s + item.price * qty;
                }, 0);
                if (returningQtyTotal <= 0) return null;
                return (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-center text-xs text-orange-800">
                      <span className="font-semibold">Total Items Returning:</span>
                      <span className="font-bold">{returningItemsCount}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-orange-800">
                      <span className="font-semibold">Total Qty Returning:</span>
                      <span className="font-bold">{returningQtyTotal} units</span>
                    </div>
                    <div className="border-t border-orange-200 pt-2 flex justify-between items-center">
                      <span className="text-xs font-bold text-orange-850">Total Refund:</span>
                      <span className="text-base font-extrabold text-orange-700">₹{Math.round(refundTotal).toLocaleString()}</span>
                    </div>
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
