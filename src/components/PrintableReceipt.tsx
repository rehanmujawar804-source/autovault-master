"use client";

import type { DebtPayment, Invoice } from "@/types";
import { formatRepaymentDate } from "@/lib/dateUtils";

export interface ReceiptShopSettings {
  shopName?: string;
  ownerName?: string;
  phone?: string;
  address?: string;
  gstNumber?: string;
  footerMessage?: string;
}

interface PrintableReceiptProps {
  payment: DebtPayment;
  invoice: Invoice;
  shopSettings?: ReceiptShopSettings;
}

export default function PrintableReceipt({
  payment,
  invoice,
  shopSettings,
}: PrintableReceiptProps) {
  const snapshot = invoice.shopSnapshot || shopSettings;

  const shopName = snapshot?.shopName?.trim() || shopSettings?.shopName?.trim() || "7 Star Car Accessories";
  const ownerName = snapshot?.ownerName?.trim() || shopSettings?.ownerName?.trim() || "";
  const phone = snapshot?.phone?.trim() || shopSettings?.phone?.trim() || "7448138484";
  const address = snapshot?.address?.trim() || shopSettings?.address?.trim() || "Sambhaji Chowk Road, Near Veershav Bank, Ichalkaranji";
  const footerMessage = snapshot?.footerMessage?.trim() || "Thank you for your payment!";

  const receiptNo = payment.receiptNumber || "Legacy Payment";

  return (
    <div
      id="receipt-print"
      className="bg-white text-slate-900 border-4 border-double border-navy-950 p-6 rounded-xl w-full font-sans select-text shadow-sm max-w-[148mm] mx-auto print:border-4 print:p-5 print:m-0 print:rounded-none print:shadow-none print:max-w-full"
    >
      {/* Void Header Warning if payment is voided */}
      {payment.voided && (
        <div className="border-4 border-red-500 rounded-xl p-2.5 mb-4 bg-red-50 text-red-700 flex flex-col items-center justify-center text-center">
          <span className="text-sm font-black tracking-widest uppercase">PAYMENT VOIDED</span>
          <p className="text-[10px] mt-0.5 font-semibold">
            Voided at: {payment.voidedAt ? new Date(payment.voidedAt).toLocaleString("en-IN") : "—"} | Reason: {payment.voidReason || "N/A"}
          </p>
        </div>
      )}

      {/* Header Block */}
      <div className="text-center border-b-2 border-slate-900 pb-4 mb-4">
        <h1 className="text-xl font-black tracking-tight text-navy-950 uppercase">{shopName}</h1>
        {address && <p className="text-xs text-slate-600 mt-0.5">{address}</p>}
        {phone && <p className="text-xs text-slate-600 font-mono">Phone: {phone}</p>}
        
        <div className="inline-block bg-slate-900 text-white font-extrabold text-xs px-4 py-1 rounded-full uppercase tracking-wider mt-3">
          Payment Receipt
        </div>
      </div>

      {/* Meta Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs mb-4 bg-slate-50 border border-slate-200 p-3 rounded-lg">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Receipt Number</span>
          <span className="font-mono font-extrabold text-slate-900 text-sm">{receiptNo}</span>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Payment Date</span>
          <span className="font-mono font-semibold text-slate-800">{formatRepaymentDate(payment.date)}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Invoice Reference</span>
          <span className="font-mono font-bold text-amber-800">{invoice.invoiceNumber}</span>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Customer</span>
          <span className="font-bold text-slate-800">{invoice.customer}</span>
        </div>
      </div>

      {/* Payment Details Table */}
      <div className="border border-slate-300 rounded-lg overflow-hidden mb-5 text-xs">
        <div className="bg-slate-100 border-b border-slate-300 px-3 py-2 font-bold text-slate-700 uppercase tracking-wider text-[10px]">
          Payment Breakdown
        </div>
        <div className="divide-y divide-slate-200">
          <div className="flex justify-between px-3 py-2 font-medium">
            <span className="text-slate-600">Payment Method</span>
            <span className="font-bold text-slate-900 font-mono">{payment.method}</span>
          </div>
          <div className="flex justify-between px-3 py-2 font-medium">
            <span className="text-slate-600">Collected By</span>
            <span className="font-semibold text-slate-800">{payment.collectedBy}</span>
          </div>
          {payment.note && (
            <div className="flex justify-between px-3 py-2 font-medium">
              <span className="text-slate-600">Note / Remarks</span>
              <span className="font-medium text-slate-700 italic max-w-[200px] text-right">{payment.note}</span>
            </div>
          )}
          <div className="flex justify-between px-3 py-2.5 bg-green-50/70 border-t border-green-200">
            <span className="font-extrabold text-green-900 text-sm">Amount Received</span>
            <span className="font-mono font-black text-green-700 text-base">
              ₹{payment.amount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between px-3 py-2 bg-slate-50">
            <span className="font-bold text-slate-600">Remaining Invoice Due</span>
            <span className={`font-mono font-extrabold ${invoice.dueAmount > 0 ? "text-red-600" : "text-emerald-700"}`}>
              ₹{invoice.dueAmount.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Signature & Footer */}
      <div className="pt-4 border-t border-slate-200 mt-6">
        <div className="flex justify-between items-end">
          <div className="text-left">
            <div className="border-b border-slate-300 w-28 mb-1" />
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Receiver Sign
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs font-black text-red-600 block">
              For {shopName}
            </span>
            {ownerName && (
              <span className="text-[10px] font-bold text-slate-600 block mt-0.5">
                Prop. {ownerName}
              </span>
            )}
            <div className="border-b border-slate-300 w-28 ml-auto mt-4 mb-1" />
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Authorized Signatory
            </span>
          </div>
        </div>
        <div className="text-center text-[9px] text-slate-400 font-medium tracking-wide mt-4">
          {footerMessage}
        </div>
      </div>
    </div>
  );
}
