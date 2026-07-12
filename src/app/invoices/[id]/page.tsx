"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { ArrowLeft, Printer, MessageCircle, AlertCircle, Wallet, CheckCircle, X, Trash2 } from "lucide-react";
import type { PaymentMethod, PaymentStatus } from "@/types";
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
  const { getInvoiceById, getCustomerById, recordDebtPayment, getDebtPaymentsByInvoice, voidInvoice, voidDebtPayment, showToast } = useStore();
  const { isOwner } = useRole();

  // ── Void Invoice Modal State ────────────────────────────────────────────
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReasonInput, setVoidReasonInput] = useState("");

  // ── Void Payment Modal State ─────────────────────────────────────────
  const [voidPaymentTarget, setVoidPaymentTarget] = useState<string | null>(null);
  const [voidPaymentReason, setVoidPaymentReason] = useState("");

  // ── Modal Isolation & Safety (Sprint 4.2 Runtime Bug Fixes) ──────────────
  const closeVoidInvoiceModal = useCallback(() => {
    setVoidModalOpen(false);
    setVoidReasonInput("");
  }, []);

  const closeVoidPaymentModal = useCallback(() => {
    setVoidPaymentTarget(null);
    setVoidPaymentReason("");
  }, []);

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
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeVoidInvoiceModal, closeVoidPaymentModal]);

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
      (invoice.dueAmount > 0
        ? `Due: ₹${invoice.dueAmount.toLocaleString()}\n`
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
    setCollectAmount(String(invoice.dueAmount));
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
    if (amount > invoice.dueAmount) {
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
          {invoice.dueAmount > 0 && invoice.customerId && !invoice.voided && (
            <button
              onClick={openCollect}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg transition-colors font-semibold cursor-pointer"
            >
              <Wallet size={14} />
              Collect ₹{invoice.dueAmount.toLocaleString()}
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
          {invoice.dueAmount > 0 && invoice.customerId && !invoice.voided && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <h2 className="font-bold text-red-800 text-sm mb-1">Outstanding Due</h2>
              <p className="text-2xl font-extrabold text-red-600 mb-3">
                ₹{invoice.dueAmount.toLocaleString()}
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
                {invoice.dueAmount > 0 && (
                  <Row
                    label="Due"
                    value={`₹${invoice.dueAmount.toLocaleString()}`}
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
              {invoice.dueAmount > 0 && (
                <p className="text-xs text-red-500 mt-1">
                  Outstanding on this invoice: ₹{invoice.dueAmount.toLocaleString()}
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
                      <p className="font-bold text-red-600 text-sm mt-1">₹{invoice.dueAmount.toLocaleString()}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                    <input
                      type="number"
                      min="1"
                      max={invoice.dueAmount}
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-400 transition"
                      autoFocus
                    />
                    {Number(collectAmount) > invoice.dueAmount && (
                      <p className="text-xs text-red-500 font-bold mt-1.5 flex items-center gap-1.5 bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-lg animate-in slide-in-from-top-1">
                        <AlertCircle size={13} />
                        Amount cannot exceed outstanding due of ₹{invoice.dueAmount.toLocaleString()}.
                      </p>
                    )}
                    {Number(collectAmount) <= 0 && collectAmount !== "" && (
                      <p className="text-xs text-red-500 font-bold mt-1.5 flex items-center gap-1.5 bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-lg animate-in slide-in-from-top-1">
                        <AlertCircle size={13} />
                        Amount must be greater than 0.
                      </p>
                    )}
                    {Number(collectAmount) > 0 && Number(collectAmount) <= invoice.dueAmount && (
                      <p className={`text-xs mt-1.5 font-semibold ${Number(collectAmount) >= invoice.dueAmount ? "text-green-600" : "text-orange-600"}`}>
                        {Number(collectAmount) >= invoice.dueAmount
                          ? "✓ Clears invoice fully → Paid"
                          : `₹${(invoice.dueAmount - Number(collectAmount)).toLocaleString()} still remaining`}
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
                    disabled={!collectAmount || Number(collectAmount) <= 0 || Number(collectAmount) > invoice.dueAmount || !collectCollectedBy}
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
