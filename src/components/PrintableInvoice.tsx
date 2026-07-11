"use client";

import React from "react";
import type { Invoice } from "@/types";
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
//  REUSABLE PRINTABLE INVOICE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface PrintableInvoiceProps {
  invoice: Invoice;
}

export default function PrintableInvoice({ invoice }: PrintableInvoiceProps) {
  const discountAmount = Math.round((invoice.subtotal * invoice.discount) / 100);

  // Generate blank spacer rows to maintain constant height (like a paper invoice block)
  const MIN_ROWS = 8;
  const emptyRowsCount = Math.max(0, MIN_ROWS - invoice.items.length);
  const emptyRows = Array.from({ length: emptyRowsCount });

  return (
    <div
      id="invoice-print"
      className="bg-white text-slate-900 border-4 border-double border-navy-950 p-6 rounded-xl w-full font-sans select-text shadow-sm max-w-[210mm] mx-auto print:border-4 print:p-6 print:m-0 print:rounded-none print:shadow-none print:max-w-full"
    >
      {/* SECTION A: TOP HEADER */}
      <div className="border-b border-slate-200 pb-4 mb-4">
        {/* Memo Info Row */}
        <div className="flex justify-between items-center text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">
          <div className="border border-slate-300 px-2 py-0.5 rounded bg-slate-50 font-bold text-slate-700">
            Cash / Credit Memo
          </div>
          <div>Subject to Ichalkaranji Jurisdictions</div>
          <div className="flex items-center gap-1">
            <span>📞</span> <span>7448138484</span>
          </div>
        </div>

        {/* Brand Header */}
        <div className="flex flex-col items-center justify-center text-center mt-3">
          <div className="flex items-center justify-center gap-3.5 mb-2">
            <img
              src="/7star-logo-invoice.png"
              alt="7 Star Logo"
              className="w-16 h-16 object-contain shrink-0"
            />
            <h1 className="text-3xl font-black tracking-tight text-navy-950 uppercase font-sans">
              7 Star Car Accessories
            </h1>
          </div>
          
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-widest border-y border-dashed border-slate-300 py-1 w-full max-w-xl">
            Sambhaji Chowk Road, Near Veershav Bank, Ichalkaranji
          </div>
        </div>
      </div>

      {/* SECTION B: BILL METADATA & CUSTOMER DETAILS BLOCK */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mb-6 bg-slate-50/70 border border-slate-100 p-4 rounded-xl print:bg-white print:p-0 print:border-none print:mb-4">
        {/* Left Side: Customer Info */}
        <div className="space-y-2">
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
          <div className="flex items-baseline border-b border-slate-200/80 py-0.5 md:border-b-0 print:border-b">
            <span className="text-xs font-bold text-slate-400 w-12 uppercase shrink-0">Vehicle</span>
            <span className="text-sm font-bold text-slate-700 flex-1">
              {invoice.vehicleModel || "—"}
            </span>
          </div>
        </div>

        {/* Right Side: Invoice & Reg Info */}
        <div className="space-y-2">
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
          <div className="flex items-baseline border-b border-slate-200/80 py-0.5 md:border-b-0">
            <span className="text-xs font-bold text-slate-400 w-16 uppercase shrink-0">Reg. No.</span>
            <span className="text-sm font-extrabold text-slate-800 flex-1 font-mono uppercase">
              {invoice.vehicleNumber || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION C: ITEMS TABLE */}
      <div className="border border-slate-300 rounded-lg overflow-hidden mb-4 print:border-slate-400">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-300 text-xs font-bold text-slate-700 uppercase print:bg-slate-50">
              <th className="py-2.5 px-3 text-center border-r border-slate-300 w-[8%] print:border-slate-400">Sr.</th>
              <th className="py-2.5 px-4 border-r border-slate-300 w-[57%] print:border-slate-400">Particulars / Product Name</th>
              <th className="py-2.5 px-3 text-center border-r border-slate-300 w-[10%] print:border-slate-400">Qty</th>
              <th className="py-2.5 px-4 text-right border-r border-slate-300 w-[12%] print:border-slate-400">Rate (₹)</th>
              <th className="py-2.5 px-4 text-right w-[13%]">Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="text-sm text-slate-800 font-medium">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/50 print:border-slate-300">
                <td className="py-2.5 px-3 text-center border-r border-slate-200 font-mono text-xs text-slate-400 print:border-slate-300">{idx + 1}</td>
                <td className="py-2.5 px-4 border-r border-slate-200 font-semibold print:border-slate-300">{item.name}</td>
                <td className="py-2.5 px-3 text-center border-r border-slate-200 font-mono print:border-slate-300">{item.quantity}</td>
                <td className="py-2.5 px-4 text-right border-r border-slate-200 font-mono print:border-slate-300">₹{item.price.toLocaleString()}</td>
                <td className="py-2.5 px-4 text-right font-mono font-bold">₹{(item.price * item.quantity).toLocaleString()}</td>
              </tr>
            ))}
            
            {/* Grid spacer rows to maintain professional standard receipt book layout */}
            {emptyRows.map((_, idx) => (
              <tr key={`empty-${idx}`} className="border-b border-slate-200 last:border-b-0 min-h-[36px] print:border-slate-300">
                <td className="py-3 px-3 border-r border-slate-200 text-center text-xs text-slate-300 print:border-slate-300">{invoice.items.length + idx + 1}</td>
                <td className="py-3 px-4 border-r border-slate-200 print:border-slate-300">&nbsp;</td>
                <td className="py-3 px-3 border-r border-slate-200 print:border-slate-300">&nbsp;</td>
                <td className="py-3 px-4 border-r border-slate-200 print:border-slate-300">&nbsp;</td>
                <td className="py-3 px-4 text-right">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* LOWER WRAPPER: TOTALS BLOCK + PAYMENT DETAILS */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 border-b border-slate-200 pb-5 mb-4">
        {/* SECTION E: PAYMENT / BILL META BLOCK (Left side) */}
        <div className="md:col-span-7 space-y-3">
          <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3.5 space-y-2 text-xs text-slate-600 print:bg-white print:border-none print:p-0">
            <h4 className="font-extrabold text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 border-b border-slate-100 pb-1">Payment &amp; Audit Info</h4>
            <div className="flex gap-4">
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
              <div className="pt-1.5 border-t border-slate-200/50 mt-1">
                <span className="font-extrabold text-slate-400 uppercase text-[9px] block">Remarks:</span>
                <p className="text-slate-700 italic leading-snug mt-0.5">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* SECTION D: TOTALS BLOCK (Right side) */}
        <div className="md:col-span-5 space-y-1.5 text-sm font-medium">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal:</span>
            <span className="font-mono">₹{invoice.subtotal.toLocaleString()}</span>
          </div>
          
          {invoice.discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount ({invoice.discount}%):</span>
              <span className="font-mono">−₹{discountAmount.toLocaleString()}</span>
            </div>
          )}
          
          <div className="flex justify-between font-black text-slate-900 border-t border-slate-200 pt-2 pb-1 text-base">
            <span>Final Total:</span>
            <span className="font-mono text-lg text-navy-950">₹{invoice.total.toLocaleString()}</span>
          </div>

          <div className="flex justify-between text-xs text-blue-600 border-t border-slate-100 pt-2">
            <span>Paid Amount:</span>
            <span className="font-mono font-bold">₹{invoice.amountPaid.toLocaleString()}</span>
          </div>

          <div className="flex justify-between text-xs font-bold border-b border-slate-100 pb-2 text-slate-700">
            <span>Due Amount:</span>
            <span className={`font-mono font-black ${invoice.dueAmount > 0 ? "text-red-600" : "text-slate-800"}`}>
              ₹{invoice.dueAmount.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION F: AMOUNT IN WORDS */}
      <div className="flex items-baseline mb-8 text-xs">
        <span className="font-extrabold text-slate-400 uppercase tracking-wider shrink-0 mr-2">
          Rs. in Words:
        </span>
        <span className="font-extrabold text-navy-900 italic border-b border-dashed border-slate-300 flex-1 pb-0.5">
          {numberToWords(invoice.total)}
        </span>
      </div>

      {/* SECTION G: SIGNATURES & FOOTER */}
      <div className="pt-6">
        <div className="grid grid-cols-3 items-end text-center">
          {/* Receiver Sign */}
          <div className="space-y-4 text-left">
            <div className="border-b border-slate-300 w-32 md:w-40 print:border-slate-400" />
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block pl-2">
              Receiver&apos;s Signature
            </span>
          </div>

          {/* Visit Again */}
          <div className="text-center">
            <span className="font-black italic text-red-600 text-sm tracking-wide">
              Visit Again....!
            </span>
          </div>

          {/* Auth Sign */}
          <div className="space-y-5 text-right flex flex-col items-end">
            <span className="text-xs font-black text-red-600 tracking-wide">
              For 7 Star Car Accessories
            </span>
            <div className="border-b border-slate-300 w-32 md:w-40 mt-6 print:border-slate-400" />
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block pr-2">
              Authorized Signatory
            </span>
          </div>
        </div>

        {/* Small computerized bill notice */}
        <div className="text-center text-[9px] text-slate-400 font-medium tracking-wide mt-10 print:mt-8">
          This is a computerized Cash/Credit Memo. Thank you for shopping with us!
        </div>
      </div>
    </div>
  );
}
