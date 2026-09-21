"use client";

import type { Invoice, SalesReturn } from "@/types";
import { formatInvoiceDate } from "@/lib/dateUtils";

// ─────────────────────────────────────────────────────────────────────────────
//  INDIAN NUMBER-TO-WORDS HELPER
// ─────────────────────────────────────────────────────────────────────────────
export function numberToWords(amount: number): string {
  const roundedAmount = Math.round(amount);
  if (roundedAmount === 0) return "Rupees Zero Only";

  const units = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];

  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  function convertLessThanThousand(num: number): string {
    let str = "";
    if (num >= 100) {
      str += units[Math.floor(num / 100)] + " Hundred ";
      num %= 100;
    }
    if (num >= 20) {
      str += tens[Math.floor(num / 10)] + " ";
      num %= 10;
    }
    if (num > 0) {
      str += units[num] + " ";
    }
    return str.trim();
  }

  let remainder = roundedAmount;
  let result = "";

  if (remainder >= 10000000) { // Crore
    const crore = Math.floor(remainder / 10000000);
    result += convertLessThanThousand(crore) + " Crore ";
    remainder %= 10000000;
  }

  if (remainder >= 100000) { // Lakh
    const lakh = Math.floor(remainder / 100000);
    result += convertLessThanThousand(lakh) + " Lakh ";
    remainder %= 100000;
  }

  if (remainder >= 1000) { // Thousand
    const thousand = Math.floor(remainder / 1000);
    result += convertLessThanThousand(thousand) + " Thousand ";
    remainder %= 1000;
  }

  if (remainder > 0) {
    result += convertLessThanThousand(remainder);
  }

  return `Rupees ${result.trim()} Only`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  DYNAMIC PRINT PAGE STYLE INJECTOR (REAL A4 / A5)
// ─────────────────────────────────────────────────────────────────────────────
export function applyDynamicPrintPageStyle(size: "A4" | "A5") {
  if (typeof document === "undefined") return;
  let styleEl = document.getElementById("dynamic-print-page-style") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamic-print-page-style";
    document.head.appendChild(styleEl);
  }
  if (size === "A5") {
    styleEl.innerHTML = `@media print { @page { size: A5 portrait !important; margin: 10mm !important; } }`;
  } else {
    styleEl.innerHTML = `@media print { @page { size: A4 portrait !important; margin: 15mm !important; } }`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  REUSABLE PRINTABLE INVOICE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export interface InvoiceShopSettings {
  shopName?: string;
  ownerName?: string;
  phone?: string;
  address?: string;
  gstNumber?: string;
  invoicePrefix?: string;
  currency?: string;
  showLogo?: boolean;
  showGST?: boolean;
  showAddress?: boolean;
  showPhone?: boolean;
  footerMessage?: string;
}

interface PrintableInvoiceProps {
  id?: string;
  invoice: Invoice;
  salesReturns?: SalesReturn[];
  shopSettings?: InvoiceShopSettings;
  printSize?: "A4" | "A5";
}

export default function PrintableInvoice({
  id = "invoice-print",
  invoice,
  salesReturns,
  shopSettings,
  printSize = "A4",
}: PrintableInvoiceProps) {
  // Historical snapshot priority: If the invoice carries a snapshot taken at creation time, use it!
  // Otherwise fall back to live shopSettings or standard defaults.
  const snapshot = invoice.shopSnapshot || shopSettings;

  const shopName = snapshot?.shopName?.trim() || "7 Star Car Accessories";
  const ownerName = snapshot?.ownerName?.trim() || shopSettings?.ownerName?.trim() || "";
  const phone = snapshot?.phone?.trim() || "7448138484";
  const address = snapshot?.address?.trim() || "Sambhaji Chowk Road, Near Veershav Bank, Ichalkaranji";
  const gstNumber = snapshot?.gstNumber?.trim() || "";
  const showLogo = snapshot?.showLogo ?? true;
  const showGST = snapshot?.showGST ?? true;
  const showAddress = snapshot?.showAddress ?? true;
  const showPhone = snapshot?.showPhone ?? true;
  const footerMessage = snapshot?.footerMessage?.trim() || "This is a computerized Cash/Credit Memo. Thank you for shopping with us!";

  const discountAmount = Math.round((invoice.subtotal * invoice.discount) / 100);
  const creditApplied = invoice.creditRedeemed || 0;
  const netPayable = Math.max(0, invoice.total - creditApplied);
  const totalReturnedQty = invoice.items.reduce((s, i) => s + (i.returnedQuantity || 0), 0);

  // Generate blank spacer rows to maintain constant height (optimized for single page)
  const isA5 = printSize === "A5";
  const MIN_ROWS = isA5 ? 0 : 4;
  const emptyRowsCount = Math.max(0, MIN_ROWS - invoice.items.length);
  const emptyRows = Array.from({ length: emptyRowsCount });

  const containerClass = isA5
    ? "bg-white text-slate-900 border-4 border-double border-navy-950 p-2.5 rounded-xl w-full font-sans select-text shadow-sm max-w-[148mm] mx-auto print:border-4 print:p-2.5 print:m-0 print:rounded-none print:shadow-none print:max-w-[148mm] print:text-[10.5px] print:leading-tight"
    : "bg-white text-slate-900 border-4 border-double border-navy-950 p-5 rounded-xl w-full font-sans select-text shadow-sm max-w-[210mm] mx-auto print:border-4 print:p-4 print:m-0 print:rounded-none print:shadow-none print:max-w-full";

  return (
    <div
      id={id}
      className={containerClass}
    >
      {/* Prominent Lifecycle Warning Header */}
      {invoice.voided ? (
        <div className="border-4 border-red-500 rounded-xl p-2 mb-3 bg-red-50 text-red-700 flex flex-col items-center justify-center text-center print:border-red-500 print:bg-red-50 print:text-red-700 break-inside-avoid print:break-inside-avoid">
          <span className="text-sm font-black tracking-widest uppercase">VOIDED INVOICE</span>
          <p className="text-[10px] mt-0.5 font-semibold">
            Reason: {invoice.voidReason} | By: {invoice.voidedBy || "Owner"} | Date: {invoice.voidedAt ? new Date(invoice.voidedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}
          </p>
        </div>
      ) : invoice.paymentStatus === "Fully Returned" ? (
        <div className="border-4 border-red-600 rounded-xl p-2 mb-3 bg-red-50 text-red-800 flex flex-col items-center justify-center text-center print:border-red-600 print:bg-red-50 print:text-red-800 break-inside-avoid print:break-inside-avoid">
          <span className="text-sm font-black tracking-widest uppercase">FULLY RETURNED</span>
        </div>
      ) : invoice.paymentStatus === "Refunded" ? (
        <div className="border-4 border-purple-600 rounded-xl p-2 mb-3 bg-purple-50 text-purple-800 flex flex-col items-center justify-center text-center print:border-purple-600 print:bg-purple-50 print:text-purple-800 break-inside-avoid print:break-inside-avoid">
          <span className="text-sm font-black tracking-widest uppercase">REFUNDED</span>
        </div>
      ) : invoice.paymentStatus === "Partially Returned" ? (
        <div className="border-4 border-orange-500 rounded-xl p-2 mb-3 bg-orange-50 text-orange-800 flex flex-col items-center justify-center text-center print:border-orange-500 print:bg-orange-50 print:text-orange-800 break-inside-avoid print:break-inside-avoid">
          <span className="text-sm font-black tracking-widest uppercase">PARTIALLY RETURNED</span>
        </div>
      ) : null}

      {/* SECTION A: TOP HEADER */}
      <div className={`border-b border-slate-200 ${isA5 ? "pb-1.5 mb-1.5" : "pb-3 mb-3"}`}>
        {/* Memo Info Row */}
        <div className="flex justify-between items-center text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">
          <div className="border border-slate-300 px-2 py-0.5 rounded bg-slate-50 font-bold text-slate-700">
            {invoice.paymentStatus === "Fully Returned" ? "Return Receipt / Credit Note" :
             invoice.paymentStatus === "Refunded" ? "Refund Receipt / Credit Note" :
             invoice.paymentStatus === "Partially Returned" ? "Partial Return Memo" :
             invoice.paymentStatus === "Voided" ? "Voided Memo" :
             "Cash / Credit Memo"}
          </div>
          <div className="flex items-center gap-3">
            {showGST && gstNumber && (
              <span className="font-mono text-slate-700 font-bold">GSTIN: {gstNumber}</span>
            )}
            <span>Subject to Jurisdiction</span>
          </div>
          {showPhone && (
            <div className="flex items-center gap-1 font-mono font-bold text-slate-700">
              <span>📞</span> <span>{phone}</span>
            </div>
          )}
        </div>

        {/* Brand Header */}
        <div className="flex flex-col items-center justify-center text-center mt-1">
          <div className="flex items-center justify-center gap-2 mb-1">
            {showLogo && (
              <img
                src="/7star-logo-invoice.png"
                alt={shopName}
                className={isA5 ? "w-10 h-10 object-contain shrink-0" : "w-14 h-14 object-contain shrink-0"}
              />
            )}
            <h1 className={`${isA5 ? "text-xl" : "text-2xl"} font-black tracking-tight text-navy-950 uppercase font-sans`}>
              {shopName}
            </h1>
          </div>

          {showAddress && (
            <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest border-y border-dashed border-slate-300 py-0.5 w-full max-w-xl">
              {address}
            </div>
          )}
        </div>
      </div>

      {/* SECTION B: BILL METADATA & CUSTOMER DETAILS BLOCK (Forced 2-column in print) */}
      <div className={`grid grid-cols-2 print:grid-cols-2 gap-x-4 gap-y-1 ${isA5 ? "mb-2 p-2 text-xs" : "mb-3 p-3 text-xs"} bg-slate-50/70 border border-slate-100 rounded-xl print:bg-white print:p-0 print:border-none print:mb-2`}>
        {/* Left Side: Customer Info */}
        <div className="space-y-1">
          <div className="flex items-baseline border-b border-slate-200/80 py-0.5">
            <span className="text-xs font-bold text-slate-400 w-12 uppercase shrink-0">M/s.</span>
            <span className="text-sm font-extrabold text-slate-800 flex-1 truncate">
              {invoice.customer}
            </span>
          </div>
          <div className="flex items-baseline border-b border-slate-200/80 py-0.5">
            <span className="text-xs font-bold text-slate-400 w-12 uppercase shrink-0">Mobile</span>
            <span className="text-sm font-semibold text-slate-800 flex-1 font-mono">
              {invoice.customerPhone || "—"}
            </span>
          </div>
          <div className="flex items-baseline border-b border-slate-200/80 py-0.5 print:border-b-0">
            <span className="text-xs font-bold text-slate-400 w-12 uppercase shrink-0">Vehicle</span>
            <span className="text-sm font-bold text-slate-700 flex-1 truncate">
              {invoice.vehicleModel || "—"}
            </span>
          </div>
        </div>

        {/* Right Side: Invoice & Reg Info */}
        <div className="space-y-1">
          <div className="flex items-baseline border-b border-slate-200/80 py-0.5">
            <span className="text-xs font-bold text-slate-400 w-16 uppercase shrink-0">Bill No.</span>
            <span className="text-sm font-black text-red-600 flex-1 font-mono tracking-wide">
              {invoice.invoiceNumber}
            </span>
          </div>
          <div className="flex items-baseline border-b border-slate-200/80 py-0.5">
            <span className="text-xs font-bold text-slate-400 w-16 uppercase shrink-0">Date &amp; Time</span>
            <span className="text-sm font-medium text-slate-800 flex-1 font-mono">
              {formatInvoiceDate(invoice)}
            </span>
          </div>
          <div className="flex items-baseline border-b border-slate-200/80 py-0.5 print:border-b-0">
            <span className="text-xs font-bold text-slate-400 w-16 uppercase shrink-0">Reg. No.</span>
            <span className="text-sm font-extrabold text-slate-800 flex-1 font-mono uppercase truncate">
              {invoice.vehicleNumber || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION C: ITEMS TABLE */}
      <div className={`border border-slate-300 rounded-lg overflow-hidden ${isA5 ? "mb-2" : "mb-3"} print:border-slate-400`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-300 text-xs font-bold text-slate-700 uppercase print:bg-slate-50">
              <th className={`text-center border-r border-slate-300 w-[8%] print:border-slate-400 ${isA5 ? "py-1 px-2 text-[10px]" : "py-2 px-3"}`}>Sr.</th>
              <th className={`border-r border-slate-300 w-[57%] print:border-slate-400 ${isA5 ? "py-1 px-2.5 text-[10px]" : "py-2 px-4"}`}>Particulars / Product Name</th>
              <th className={`text-center border-r border-slate-300 w-[10%] print:border-slate-400 ${isA5 ? "py-1 px-2 text-[10px]" : "py-2 px-3"}`}>Qty</th>
              <th className={`text-right border-r border-slate-300 w-[12%] print:border-slate-400 ${isA5 ? "py-1 px-2.5 text-[10px]" : "py-2 px-4"}`}>Rate (₹)</th>
              <th className={`text-right w-[13%] ${isA5 ? "py-1 px-2.5 text-[10px]" : "py-2 px-4"}`}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody className={`text-slate-800 font-medium ${isA5 ? "text-xs" : "text-sm"}`}>
            {invoice.items.map((item, idx) => (
              <tr key={idx} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/50 print:border-slate-300">
                <td className={`text-center border-r border-slate-200 font-mono text-xs text-slate-400 print:border-slate-300 ${isA5 ? "py-1 px-2" : "py-2 px-3"}`}>{idx + 1}</td>
                <td className={`border-r border-slate-200 font-semibold print:border-slate-300 ${isA5 ? "py-1 px-2.5" : "py-2 px-4"}`}>{item.name}</td>
                <td className={`text-center border-r border-slate-200 font-mono print:border-slate-300 ${isA5 ? "py-1 px-2" : "py-2 px-3"}`}>{item.quantity}</td>
                <td className={`text-right border-r border-slate-200 font-mono print:border-slate-300 ${isA5 ? "py-1 px-2.5" : "py-2 px-4"}`}>₹{item.price.toLocaleString()}</td>
                <td className={`text-right font-mono font-bold ${isA5 ? "py-1 px-2.5" : "py-2 px-4"}`}>₹{(item.price * item.quantity).toLocaleString()}</td>
              </tr>
            ))}

            {/* Grid spacer rows to maintain professional standard receipt book layout */}
            {emptyRows.map((_, idx) => (
              <tr key={`empty-${idx}`} className="border-b border-slate-200 last:border-b-0 min-h-[24px] print:border-slate-300">
                <td className="py-1 px-2 border-r border-slate-200 text-center text-xs text-slate-300 print:border-slate-300">{invoice.items.length + idx + 1}</td>
                <td className="py-1 px-2.5 border-r border-slate-200 print:border-slate-300">&nbsp;</td>
                <td className="py-1 px-2 border-r border-slate-200 print:border-slate-300">&nbsp;</td>
                <td className="py-1 px-2.5 border-r border-slate-200 print:border-slate-300">&nbsp;</td>
                <td className="py-1 px-2.5 text-right">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* LOWER WRAPPER: TOTALS BLOCK + PAYMENT DETAILS (Forced 12-col layout in print) */}
      <div className={`grid grid-cols-12 print:grid-cols-12 gap-3 border-b border-slate-200 ${isA5 ? "pb-1.5 mb-1.5" : "pb-3 mb-3"}`}>
        {/* SECTION E: PAYMENT / BILL META BLOCK (Left side) */}
        <div className="col-span-7 print:col-span-7 space-y-1.5">
          <div className={`bg-slate-50/70 border border-slate-100 rounded-xl space-y-1 text-xs text-slate-600 print:bg-white print:border-none print:p-0 ${isA5 ? "p-2" : "p-3"}`}>
            <h4 className="font-extrabold text-[10px] uppercase tracking-wider text-slate-400 mb-0.5 border-b border-slate-100 pb-0.5">Payment &amp; Audit Info</h4>
            <div className="flex gap-3 flex-wrap">
              <div>
                <span className="font-semibold text-slate-400">Payment:</span>{" "}
                <span className="font-bold text-slate-700">{invoice.paymentMethod}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-400">Status:</span>{" "}
                <span className={`font-extrabold ${invoice.paymentStatus === "Paid" ? "text-green-600" : "text-red-500"}`}>{invoice.paymentStatus}</span>
              </div>
              {invoice.billedBy && (
                <div>
                  <span className="font-semibold text-slate-400">Billed By:</span>{" "}
                  <span className="font-bold text-slate-700">{invoice.billedBy}</span>
                </div>
              )}
            </div>
            {invoice.notes && (
              <div className="pt-1 border-t border-slate-200/50 mt-1">
                <span className="font-extrabold text-slate-400 uppercase text-[9px] block">Remarks:</span>
                <p className="text-slate-700 italic leading-snug mt-0.5">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* SECTION D: TOTALS BLOCK (Right side) */}
        <div className="col-span-5 print:col-span-5 space-y-1 text-sm font-medium">
          <div className="flex justify-between text-slate-500 text-xs">
            <span>Subtotal:</span>
            <span className="font-mono">₹{invoice.subtotal.toLocaleString()}</span>
          </div>

          {invoice.discount > 0 && (
            <div className="flex justify-between text-green-600 text-xs">
              <span>Discount ({invoice.discount}%):</span>
              <span className="font-mono">−₹{discountAmount.toLocaleString()}</span>
            </div>
          )}

          {creditApplied > 0 && (
            <div className="flex justify-between text-purple-600 text-xs font-semibold">
              <span>Store Credit Applied:</span>
              <span className="font-mono">−₹{creditApplied.toLocaleString()}</span>
            </div>
          )}

          <div className="flex justify-between font-black text-slate-900 border-t border-slate-200 pt-1 pb-0.5 text-base">
            <span>Net Payable:</span>
            <span className="font-mono text-base text-navy-950">₹{netPayable.toLocaleString()}</span>
          </div>

          <div className="flex justify-between text-xs text-blue-600 border-t border-slate-100 pt-0.5">
            <span>Initial / Cash Paid:</span>
            <span className="font-mono font-bold">₹{invoice.amountPaid.toLocaleString()}</span>
          </div>

          <div className="flex justify-between text-xs font-bold border-b border-slate-100 pb-0.5 text-slate-700">
            <span>Outstanding Balance:</span>
            <span className={`font-mono font-black ${invoice.dueAmount > 0 ? "text-red-600" : "text-slate-800"}`}>
              ₹{invoice.dueAmount.toLocaleString()}
            </span>
          </div>

          {totalReturnedQty > 0 && (
            <div className="flex justify-between text-[11px] text-orange-600 pt-0.5">
              <span>Items Returned:</span>
              <span className="font-mono font-bold">{totalReturnedQty} unit(s)</span>
            </div>
          )}
        </div>
      </div>

      {/* SECTION E.1: RETURN SUMMARY (Appended when active sales returns exist) */}
      {(() => {
        const activeSRs = (salesReturns || []).filter(
          (r) => r.invoiceId === invoice.id && r.status !== "Cancelled"
        );
        if (activeSRs.length === 0 && totalReturnedQty <= 0) return null;

        const returnedValueTotal = activeSRs.reduce((s, r) => s + r.totalRefund, 0);
        const cashRefundedTotal = activeSRs.reduce((s, r) => s + (r.cashRefunded ?? 0), 0);
        const debtCancelledTotal = activeSRs.reduce(
          (s, r) => s + (r.debtCancelled ?? r.debtAdjusted ?? 0),
          0
        );
        const returnNumbers = activeSRs.map((r) => r.returnNumber).join(", ");

        return (
          <div className={`border-2 border-orange-400 bg-orange-50/50 rounded-lg text-xs ${isA5 ? "p-2 mb-2" : "p-3 mb-3"}`}>
            <div className="flex justify-between items-center border-b border-orange-200 pb-0.5 mb-1.5">
              <span className="font-extrabold uppercase tracking-wider text-orange-900 text-[10px]">
                RETURN SUMMARY &amp; RECONCILIATION
              </span>
              <span className="font-mono text-[10px] font-bold text-orange-700">
                {returnNumbers || "Sales Return"}
              </span>
            </div>

            <div className="grid grid-cols-4 print:grid-cols-4 gap-2 text-slate-800 font-medium">
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Returned Value</span>
                <span className="font-mono font-extrabold text-orange-800">₹{returnedValueTotal.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Cash Refunded</span>
                <span className="font-mono font-extrabold text-blue-800">₹{cashRefundedTotal.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Debt Cancelled</span>
                <span className="font-mono font-extrabold text-green-800">₹{debtCancelledTotal.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Current Invoice Status</span>
                <span className="font-extrabold text-slate-900">{invoice.paymentStatus}</span>
              </div>
            </div>

            <div className="mt-1.5 pt-0.5 border-t border-orange-200 flex justify-between items-center text-[10px]">
              <span className="font-bold text-slate-600">Remaining Invoice Due:</span>
              <span className={`font-mono font-black ${invoice.dueAmount > 0 ? "text-red-600" : "text-emerald-700"}`}>
                ₹{invoice.dueAmount.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })()}

      {/* SECTION F: AMOUNT IN WORDS */}
      <div className={`flex items-baseline ${isA5 ? "mb-2 text-[11px]" : "mb-3 text-xs"}`}>
        <span className="font-extrabold text-slate-400 uppercase tracking-wider shrink-0 mr-2">
          Rs. in Words:
        </span>
        <span className="font-extrabold text-navy-900 italic border-b border-dashed border-slate-300 flex-1 pb-0.5">
          {numberToWords(netPayable)}
        </span>
      </div>

      {/* SECTION G: SIGNATURES & FOOTER */}
      <div className={isA5 ? "pt-1.5" : "pt-3"}>
        <div className="grid grid-cols-3 items-end text-center">
          {/* Receiver Sign */}
          <div className={`${isA5 ? "space-y-1.5" : "space-y-3"} text-left`}>
            <div className={`border-b border-slate-300 ${isA5 ? "w-24 print:w-24" : "w-32 md:w-40"} print:border-slate-400`} />
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block pl-1">
              Receiver&apos;s Signature
            </span>
          </div>

          {/* Visit Again */}
          <div className="text-center">
            <span className="font-black italic text-red-600 text-xs tracking-wide">
              Visit Again....!
            </span>
          </div>

          {/* Auth Sign */}
          <div className={`${isA5 ? "space-y-1.5" : "space-y-3"} text-right flex flex-col items-end`}>
            <span className="text-xs font-black text-red-600 tracking-wide">
              For {shopName}
            </span>
            {ownerName && (
              <span className="text-[10px] font-bold text-slate-600 block mt-0.5">
                Prop. {ownerName}
              </span>
            )}
            <div className={`border-b border-slate-300 ${isA5 ? "w-24 print:w-24" : "w-32 md:w-40"} ${isA5 ? "mt-1.5" : "mt-3"} print:border-slate-400`} />
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block pr-1">
              Authorized Signatory
            </span>
          </div>
        </div>

        {/* Small computerized bill notice */}
        <div className={`text-center text-slate-400 font-medium tracking-wide ${isA5 ? "mt-2 print:mt-1.5 text-[8.5px]" : "mt-4 print:mt-3 text-[9px]"}`}>
          {footerMessage}
        </div>
      </div>
    </div>
  );
}
