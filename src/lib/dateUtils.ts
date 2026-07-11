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
 * Formats an invoice date.
 * - Uses `createdAt` ISO string if available.
 * - Falls back to timestamp in `id` if numeric (historical invoices).
 * - Falls back to `date` YYYY-MM-DD.
 */
export function formatInvoiceDate(invoice: Invoice): string {
  // 1. Check for createdAt timestamp
  if (invoice.createdAt) {
    return formatDateTimeIST(invoice.createdAt);
  }

  // 2. Check for numeric timestamp in ID
  if (invoice.id && invoice.id.startsWith("inv-")) {
    const timestampStr = invoice.id.replace("inv-", "");
    const timestamp = parseInt(timestampStr, 10);
    // UUIDs won't be > 1e12 and are not valid numbers representing dates in this range
    if (!isNaN(timestamp) && timestamp > 1000000000000) {
      return formatDateTimeIST(new Date(timestamp));
    }
  }

  // 3. Fallback to invoice date
  if (invoice.date) {
    return formatDateOnlyIST(invoice.date);
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
 * Returns today's local date string in YYYY-MM-DD format in Asia/Kolkata timezone.
 */
export function todayLocalStr(): string {
  return toLocalDateStr(new Date());
}
