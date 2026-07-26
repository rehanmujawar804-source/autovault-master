import { Invoice } from "@/types";

/**
 * Formats a full date/time input (Date object, ISO string, or timestamp) to Indian Standard Time (IST).
 * Output format: "27 Jun 2026, 04:18 PM"
 */
export function formatDateTimeIST(dateInput: Date | string | number | undefined): string {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const formattedDate = dateFormatter.format(date);
  const formattedTime = timeFormatter.format(date).toUpperCase();

  return `${formattedDate}, ${formattedTime}`;
}

/**
 * Formats a date-only string (e.g., "2026-06-27") to "27 Jun 2026" without any timezone shift.
 */
export function formatDateOnlyIST(dateStr: string): string {
  if (!dateStr) return "";
  
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) {
      const options = { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" } as const;
      return new Intl.DateTimeFormat("en-IN", options).format(d);
    }
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const options = { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" } as const;
  return new Intl.DateTimeFormat("en-IN", options).format(d);
}

/**
 * Extracts a numeric epoch timestamp (ms) for an invoice used in strict chronological sorting.
 * Prefers `createdAt` ISO timestamp, falls back to `date`, then numeric ID timestamp.
 */
export function getInvoiceSortTime(invoice: Invoice): number {
  if (invoice.createdAt) {
    const t = new Date(invoice.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (invoice.date) {
    const t = new Date(invoice.date).getTime();
    if (!isNaN(t)) return t;
  }
  if (invoice.id && invoice.id.startsWith("inv-")) {
    const timestampStr = invoice.id.replace("inv-", "");
    const timestamp = parseInt(timestampStr, 10);
    if (!isNaN(timestamp) && timestamp > 1000000000000) {
      return timestamp;
    }
  }
  return 0;
}

/**
 * Sorts a copy of an invoice array in strict NEWEST -> OLDEST order.
 * Primary sort: Epoch timestamp descending.
 * Secondary sort: Invoice number/ID descending (deterministic tie-breaker).
 */
export function sortInvoicesDescending<T extends Invoice>(invoices: T[]): T[] {
  return [...invoices].sort((a, b) => {
    const timeA = getInvoiceSortTime(a);
    const timeB = getInvoiceSortTime(b);
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    const refA = a.invoiceNumber || a.id || "";
    const refB = b.invoiceNumber || b.id || "";
    return refB.localeCompare(refA);
  });
}

/**
 * Formats an invoice date + time.
 * - If timestamp contains date and time (e.g. ISO string or createdAt), formats with Date + Time (e.g. `26 Jul 2026, 06:42 PM`).
 * - If historical record contains date only (e.g. `2026-07-26`), formats Date only (e.g. `26 Jul 2026`) without fabricating a time.
 */
export function formatInvoiceDate(invoice: Invoice): string {
  // 1. Check for createdAt timestamp
  if (invoice.createdAt) {
    return formatStockMovementDate(invoice.createdAt);
  }

  // 2. Check for numeric timestamp in ID
  if (invoice.id && invoice.id.startsWith("inv-")) {
    const timestampStr = invoice.id.replace("inv-", "");
    const timestamp = parseInt(timestampStr, 10);
    if (!isNaN(timestamp) && timestamp > 1000000000000) {
      return formatDateTimeIST(new Date(timestamp));
    }
  }

  // 3. Fallback to invoice date
  if (invoice.date) {
    return formatStockMovementDate(invoice.date);
  }

  return "";
}

/**
 * Formats a repayment ledger payment date.
 * - If it's a full ISO timestamp, formats with date and time.
 * - If it's date-only, formats date only.
 */
export function formatRepaymentDate(paymentDate: string): string {
  if (!paymentDate) return "";
  if (paymentDate.includes("T") || paymentDate.length > 10) {
    return formatDateTimeIST(paymentDate);
  }
  return formatDateOnlyIST(paymentDate);
}

/**
 * Returns a Date's local date string in YYYY-MM-DD format in Asia/Kolkata timezone.
 */
export function toLocalDateStr(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const options = { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" } as const;
  const formatter = new Intl.DateTimeFormat("en-CA", options); // en-CA defaults to YYYY-MM-DD
  return formatter.format(d);
}

/**
 * Formats a stock movement timestamp.
 * - If it's a full ISO timestamp (contains 'T' or time info), formats with date and time (e.g. "26 Jul 2026, 06:42 PM").
 * - If it's date-only (e.g. "2026-07-26"), formats date only ("26 Jul 2026") without inventing a fake historical time.
 */
export function formatStockMovementDate(dateStr: string): string {
  if (!dateStr || dateStr === "—") return "—";
  if (dateStr.includes("T") || dateStr.length > 10) {
    return formatDateTimeIST(dateStr);
  }
  return formatDateOnlyIST(dateStr);
}

/**
 * Returns today's local date string in YYYY-MM-DD format in Asia/Kolkata timezone.
 */
export function todayLocalStr(): string {
  return toLocalDateStr(new Date());
}

