"use client";

import { use, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { formatInvoiceDate } from "@/lib/dateUtils";
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
} from "lucide-react";
import type { Invoice, PaymentMethod, PaymentStatus } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
//  STYLE MAPS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PaymentStatus, string> = {
  Paid:    "bg-green-100 text-green-700",
  Partial: "bg-orange-100 text-orange-700",
  Debt:    "bg-red-100 text-red-600",
};

const METHOD_COLORS: Record<PaymentMethod, string> = {
  Cash:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPI:    "bg-blue-50 text-blue-700 border-blue-200",
  Card:   "bg-purple-50 text-purple-700 border-purple-200",
  Credit: "bg-red-50 text-red-600 border-red-200",
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
    getCustomerById,
    getInvoicesByCustomer,
    getCustomerOutstandingInvoices,
    getDebtPaymentsByInvoice,
    recordDebtPayment,
    showToast,
  } = useStore();

  // ── Collect Payment Modal State ────────────────────────────────────────────
  const [collectInvoice, setCollectInvoice] = useState<Invoice | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>("Cash");
  const [collectNote, setCollectNote] = useState("");
  const [collectSuccess, setCollectSuccess] = useState(false);
  const [collectCollectedBy, setCollectCollectedBy] = useState<"Owner" | "Staff" | "">("");

  const customer = getCustomerById(id);

  // Derive real debt from invoice dues (not cached customer.debt)
  // Keep invoices array stable inside useMemo to avoid unstable dependency warning
  const [invoices, derivedDebt] = useMemo(() => {
    const invList = customer
      ? getInvoicesByCustomer(customer.id).sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
      : [];
    const debt = invList.reduce((s, inv) => s + inv.dueAmount, 0);
    return [invList, debt] as const;
  }, [customer, getInvoicesByCustomer]);

  const outstandingInvoices = customer
    ? getCustomerOutstandingInvoices(customer.id)
    : [];

  // WhatsApp handler — before early return
  function handleWhatsApp() {
    if (!customer?.phone) return;
    window.open(`https://wa.me/91${customer.phone}`, "_blank");
  }

  // Collect Payment Handlers
  function openCollect(inv: Invoice) {
    setCollectInvoice(inv);
    setCollectAmount(String(inv.dueAmount));
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
    if (amount > collectInvoice.dueAmount) {
      showToast(`Amount cannot exceed the due amount of ₹${collectInvoice.dueAmount.toLocaleString()}.`, "error");
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/customers"
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to Customers
        </Link>

        {customer.phone && (
          <button
            onClick={handleWhatsApp}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <MessageCircle size={14} />
            WhatsApp
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left column: Profile + Stats + Outstanding ───────────────── */}
        <div className="space-y-4">

          {/* Profile card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="w-14 h-14 rounded-full bg-slate-900 flex items-center justify-center text-white text-xl font-bold mb-4">
              {customer.name.charAt(0).toUpperCase()}
            </div>

            <h1 className="text-xl font-bold text-slate-800">{customer.name}</h1>

            {customer.phone && (
              <div className="flex items-center gap-2 mt-2 text-slate-500 text-sm">
                <Phone size={13} />
                {customer.phone}
              </div>
            )}

            {/* Debt badge — derived from invoice dues */}
            {derivedDebt > 0 ? (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-xs text-red-600 font-medium mb-0.5">
                  Outstanding Debt
                </p>
                <p className="text-2xl font-bold text-red-700">
                  ₹{derivedDebt.toLocaleString()}
                </p>
                <p className="text-[10px] text-red-500 mt-0.5">
                  Across {outstandingInvoices.length} invoice{outstandingInvoices.length !== 1 ? "s" : ""}
                </p>
              </div>
            ) : (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-xs text-green-600 font-medium">
                  ✓ No outstanding debt
                </p>
              </div>
            )}
          </div>

          {/* Stats card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <h2 className="font-semibold text-slate-800 text-sm">Statistics</h2>

            <StatRow
              icon={<TrendingUp size={14} />}
              iconBg="bg-blue-50 text-blue-600"
              label="Total Spent"
              value={`₹${customer.totalSpent.toLocaleString()}`}
              valueClass="text-blue-700 font-bold"
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
          </div>

          {/* Outstanding Invoices collect section */}
          {outstandingInvoices.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={14} className="text-red-500" />
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
                          <p className="text-[10px] font-bold text-slate-700 font-mono truncate">
                            {inv.invoiceNumber}
                          </p>
                          <p className="text-[10px] text-slate-400">{formatInvoiceDate(inv)}</p>
                          <p className="text-xs font-bold text-red-600 mt-0.5">
                            Due: ₹{inv.dueAmount.toLocaleString()}
                          </p>
                          {repaidTotal > 0 && (
                            <p className="text-[10px] text-green-700 mt-0.5 flex items-center gap-1">
                              <History size={9} />
                              ₹{repaidTotal.toLocaleString()} repaid
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => openCollect(inv)}
                          className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          Collect
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick action */}
          <Link
            href="/billing"
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-white py-3 rounded-xl text-sm font-medium transition-colors"
          >
            <ReceiptText size={14} />
            New Invoice for {customer.name.split(" ")[0]}
          </Link>
        </div>

        {/* ── Right column: Invoice History ──────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">
                Invoice History
                <span className="ml-2 text-sm font-normal text-slate-400">
                  ({invoices.length} invoice{invoices.length !== 1 ? "s" : ""})
                </span>
              </h2>
            </div>

            {invoices.length === 0 ? (
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
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[inv.paymentStatus]}`}
                            >
                              {inv.paymentStatus}
                            </span>
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
                          {inv.dueAmount > 0 && (
                            <p className="text-xs text-red-600 font-medium">
                              Due: ₹{inv.dueAmount.toLocaleString()}
                            </p>
                          )}
                          <div className="mt-2 flex flex-col gap-1 items-end">
                            {inv.dueAmount > 0 && (
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
            )}
          </div>
        </div>
      </div>

      {/* ── Collect Payment Modal ─────────────────────────────────────────── */}
      {collectInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
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
                      <p className="font-bold text-red-600 text-sm mt-1">₹{collectInvoice.dueAmount.toLocaleString()}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                    <input
                      type="number"
                      min="1"
                      max={collectInvoice.dueAmount}
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-400 transition"
                      autoFocus
                    />
                    {Number(collectAmount) > 0 && (
                      <p className={`text-xs mt-1.5 font-semibold ${Number(collectAmount) >= collectInvoice.dueAmount ? "text-green-600" : "text-orange-600"}`}>
                        {Number(collectAmount) >= collectInvoice.dueAmount
                          ? "✓ Clears invoice fully → Paid"
                          : `₹${(collectInvoice.dueAmount - Number(collectAmount)).toLocaleString()} still remaining`}
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