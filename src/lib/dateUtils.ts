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

/**
 * Extracts a numeric epoch timestamp (ms) for a purchase, purchase order, or purchase return
 * used in strict chronological sorting.
 * Prefers `createdAt` ISO timestamp, falls back to `date`, then numeric ID timestamp.
 */
export function getPurchaseSortTime(purchase: { createdAt?: string; date?: string; id?: string }): number {
  if (purchase.createdAt) {
    const t = new Date(purchase.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (purchase.date) {
    const t = new Date(purchase.date).getTime();
    if (!isNaN(t)) return t;
  }
  if (purchase.id && (purchase.id.startsWith("pur-") || purchase.id.startsWith("po-") || purchase.id.startsWith("pr-"))) {
    const timestampStr = purchase.id.replace(/^(pur-|po-|pr-)/, "");
    const timestamp = parseInt(timestampStr, 10);
    if (!isNaN(timestamp) && timestamp > 1000000000000) {
      return timestamp;
    }
  }
  return 0;
}

/**
 * Sorts a copy of a purchase (or PO/PR) array in strict NEWEST -> OLDEST order.
 * Primary sort: Epoch timestamp descending.
 * Secondary sort: Invoice number / PO number / Return number / ID descending (deterministic tie-breaker).
 */
export function sortPurchasesDescending<T extends { createdAt?: string; date?: string; id?: string; invoiceNumber?: string; poNumber?: string; returnNumber?: string }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const timeA = getPurchaseSortTime(a);
    const timeB = getPurchaseSortTime(b);
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    const refA = a.invoiceNumber || a.poNumber || a.returnNumber || a.id || "";
    const refB = b.invoiceNumber || b.poNumber || b.returnNumber || b.id || "";
    return refB.localeCompare(refA);
  });
}

/**
 * Formats a purchase, purchase order, or purchase return date + time.
 * - If timestamp contains date and time (e.g. ISO string or createdAt), formats with Date + Time (e.g. `26 Jul 2026, 06:42 PM`).
 * - If historical record contains date only (e.g. `2026-07-26`), formats Date only (e.g. `26 Jul 2026`) without fabricating a time.
 */
export function formatPurchaseDate(purchase: { createdAt?: string; date?: string; id?: string }): string {
  if (purchase.createdAt) {
    return formatStockMovementDate(purchase.createdAt);
  }
  if (purchase.date) {
    return formatStockMovementDate(purchase.date);
  }
  if (purchase.id && (purchase.id.startsWith("pur-") || purchase.id.startsWith("po-") || purchase.id.startsWith("pr-"))) {
    const timestampStr = purchase.id.replace(/^(pur-|po-|pr-)/, "");
    const timestamp = parseInt(timestampStr, 10);
    if (!isNaN(timestamp) && timestamp > 1000000000000) {
      return formatDateTimeIST(new Date(timestamp));
    }
  }
  return "";
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CENTRALIZED IST DATE/TIME ENGINE (Asia/Kolkata)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Returns an input date/timestamp as a YYYY-MM-DD string in Asia/Kolkata timezone.
 * Handles Date objects, ISO strings, epoch numbers, and date-only YYYY-MM-DD strings.
 * Guarantees operating system / browser timezone independence.
 */
export function getISTDateStr(dateInput?: Date | string | number): string {
  if (!dateInput) return todayLocalStr();
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnlyMatch) {
      return trimmed;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

/**
 * Returns an input date/timestamp as a YYYY-MM string in Asia/Kolkata timezone.
 */
export function getISTMonthStr(dateInput?: Date | string | number): string {
  const istDateStr = getISTDateStr(dateInput);
  return istDateStr.length >= 7 ? istDateStr.substring(0, 7) : istDateStr;
}

/**
 * Evaluates whether a date/timestamp falls within [startDateStr, endDateStr] in IST.
 * startDateStr and endDateStr should be YYYY-MM-DD formatted strings.
 */
export function isDateInISTRange(
  dateInput: Date | string | number,
  startDateStr?: string,
  endDateStr?: string
): boolean {
  const istDate = getISTDateStr(dateInput);
  if (!istDate) return false;
  if (startDateStr && istDate < startDateStr) return false;
  if (endDateStr && istDate > endDateStr) return false;
  return true;
}

/**
 * Safely parses any date/timestamp into IST calendar components ({ year, month, day, dateStr }).
 * Prevents NaN errors when parsing ISO string representations.
 */
export function parseDateToIST(
  dateInput?: Date | string | number
): { year: number; month: number; day: number; dateStr: string } | null {
  const dateStr = getISTDateStr(dateInput);
  if (!dateStr) return null;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day, dateStr };
}


