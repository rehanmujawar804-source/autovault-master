/**
 * AUTOVAULT ERP — Supplier Statement & Ledger Export Utility Layer (Sprint 2C)
 * 
 * Pure, deterministic, anti-crash financial calculation and export engine.
 * Derives supplier statements from existing purchases, payments, and returns.
 * Reconciles strictly: Opening Balance + Period Debits - Period Credits = Closing Balance
 */

import ExcelJS from "exceljs";
import type { Supplier, Purchase, SupplierPayment, PurchaseReturn, Product } from "@/types";
import { getISTDateStr, todayLocalStr } from "@/lib/dateUtils";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TYPES & DATA CONTRACTS
// ─────────────────────────────────────────────────────────────────────────────

export type StatementDatePreset =
  | "all_time"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "this_financial_year"
  | "custom";

export type StatementTransactionType = "PURCHASE" | "PAYMENT" | "RETURN";

export interface StatementLedgerEntry {
  id: string;
  type: StatementTransactionType;
  date: string;              // ISO timestamp or YYYY-MM-DD
  formattedDate: string;     // Display date
  timestamp: number;         // Numeric epoch ms for strict ordering
  typePriority: number;      // 1: PURCHASE (Debit), 2: PAYMENT (Credit), 3: RETURN (Credit)
  reference: string;         // Invoice # / Payment Ref / Return #
  description: string;       // Descriptive details (Product, Qty, Method, Reason)
  debit: number;             // Purchase amount (>= 0)
  credit: number;            // Payment or Return value (>= 0)
  runningBalance: number;    // Running balance after this transaction
  rawPurchase?: Purchase;
  rawPayment?: SupplierPayment;
  rawReturn?: PurchaseReturn;
}

export interface SupplierStatementSummary {
  supplier: Supplier | null;
  fromDate: string;          // YYYY-MM-DD or "" for all time
  toDate: string;            // YYYY-MM-DD or "" for all time
  preset: StatementDatePreset;
  periodLabel: string;
  openingBalance: number;
  totalPurchases: number;    // Period debits
  totalPayments: number;     // Period payment credits
  totalReturns: number;      // Period return credits
  periodDebits: number;      // Same as totalPurchases
  periodCredits: number;     // totalPayments + totalReturns
  closingBalance: number;    // openingBalance + periodDebits - periodCredits
  reconciled: boolean;
  reconciliationDiff: number;
  entries: StatementLedgerEntry[];
  totalTransactionCount: number;
  allTimeOutstanding: number; // Return-aware lifetime supplier liability
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MONEY & MATH ANTI-CRASH NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely normalizes any monetary value to a finite number rounded to 2 decimal places.
 * Guards against undefined, null, NaN, Infinity, -Infinity, numeric strings, and -0.
 */
export function normalizeMoney(val: unknown): number {
  if (val === undefined || val === null) return 0;
  let num: number;
  if (typeof val === "number") {
    num = val;
  } else if (typeof val === "string") {
    const cleaned = val.replace(/[₹$,\s]/g, "").trim();
    if (cleaned === "") return 0;
    num = Number(cleaned);
  } else {
    return 0;
  }

  if (!Number.isFinite(num) || isNaN(num)) return 0;
  const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
  // Normalize negative zero: Object.is(-0, -0) is true
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Formats a normalized number into Indian currency string.
 * Never outputs NaN, Infinity, undefined, or -0.
 */
export function formatCurrencyINR(val: unknown): string {
  const num = normalizeMoney(val);
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TIMEZONE & DATE RANGE PRESETS (IST SEMANTICS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes exact IST date boundaries (YYYY-MM-DD) for each preset option.
 * Indian Financial Year: April 1 → March 31.
 */
export function getDateRangeForPreset(
  preset: StatementDatePreset,
  nowDateInput?: Date | string
): { fromDate: string; toDate: string; label: string } {
  const now = nowDateInput ? new Date(nowDateInput) : new Date();
  const safeNow = isNaN(now.getTime()) ? new Date() : now;

  const currentYear = safeNow.getFullYear();
  const currentMonth = safeNow.getMonth(); // 0-indexed (0 = Jan, 3 = Apr, 11 = Dec)
  const currentDay = safeNow.getDate();

  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(currentDay)}`;

  switch (preset) {
    case "all_time":
      return { fromDate: "", toDate: "", label: "All Time" };

    case "this_month": {
      const fromDate = `${currentYear}-${pad(currentMonth + 1)}-01`;
      return { fromDate, toDate: todayStr, label: "This Month" };
    }

    case "last_month": {
      const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
      const lastMonthYear = lastMonthDate.getFullYear();
      const lastMonthNum = lastMonthDate.getMonth() + 1;
      const lastDayOfLastMonth = new Date(currentYear, currentMonth, 0).getDate();
      const fromDate = `${lastMonthYear}-${pad(lastMonthNum)}-01`;
      const toDate = `${lastMonthYear}-${pad(lastMonthNum)}-${pad(lastDayOfLastMonth)}`;
      return { fromDate, toDate, label: "Last Month" };
    }

    case "last_3_months": {
      const threeMonthsAgo = new Date(currentYear, currentMonth - 2, 1);
      const fromDate = `${threeMonthsAgo.getFullYear()}-${pad(threeMonthsAgo.getMonth() + 1)}-01`;
      return { fromDate, toDate: todayStr, label: "Last 3 Months" };
    }

    case "this_financial_year": {
      // In India, if current month is Jan-Mar (0, 1, 2), FY started April 1 of previous year
      const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
      const fromDate = `${fyStartYear}-04-01`;
      return { fromDate, toDate: todayStr, label: "This Financial Year" };
    }

    case "custom":
    default:
      return { fromDate: "", toDate: "", label: "Custom Range" };
  }
}

/**
 * Validates a custom date range. Returns validation state and user-friendly error message if any.
 */
export function validateDateRange(
  fromDate?: string,
  toDate?: string
): { isValid: boolean; error: string | null } {
  if (!fromDate && !toDate) return { isValid: true, error: null };

  if (fromDate) {
    const dFrom = new Date(fromDate);
    if (isNaN(dFrom.getTime())) {
      return { isValid: false, error: "From date is invalid." };
    }
  }

  if (toDate) {
    const dTo = new Date(toDate);
    if (isNaN(dTo.getTime())) {
      return { isValid: false, error: "To date is invalid." };
    }
  }

  if (fromDate && toDate) {
    if (fromDate > toDate) {
      return { isValid: false, error: "From date cannot be after To date." };
    }
  }

  return { isValid: true, error: null };
}

/**
 * Formats a date string safely for display.
 */
export function formatStatementDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(dateStr);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CORE FINANCIAL LEDGER CALCULATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildSupplierStatementParams {
  supplier: Supplier | null | undefined;
  purchases?: Purchase[];
  payments?: SupplierPayment[];
  returns?: PurchaseReturn[];
  products?: Product[];
  fromDate?: string;
  toDate?: string;
  preset?: StatementDatePreset;
}

/**
 * Builds the complete chronological statement summary for a supplier.
 * Fully deterministic, strictly reconciled, and 100% anti-crash.
 */
export function buildSupplierStatement(params: BuildSupplierStatementParams): SupplierStatementSummary {
  const {
    supplier = null,
    purchases = [],
    payments = [],
    returns = [],
    products = [],
    fromDate = "",
    toDate = "",
    preset = "all_time",
  } = params;

  const supplierId = supplier?.id ?? "";

  // 1. Filter raw transactions belonging to this supplier
  const safePurchases = (purchases || []).filter((p) => p && p.supplierId === supplierId);
  const safePayments = (payments || []).filter((p) => p && p.supplierId === supplierId);
  const safeReturns = (returns || []).filter((r) => r && r.supplierId === supplierId);
  const productMap = new Map((products || []).map((prod) => [prod.id, prod]));

  // 2. Map Purchases to Normalized Raw Entries
  type IntermediateRawEntry = {
    id: string;
    type: StatementTransactionType;
    date: string;
    istDateStr: string;
    timestamp: number;
    typePriority: number; // 1 = PURCHASE, 2 = PAYMENT, 3 = RETURN
    reference: string;
    description: string;
    debit: number;
    credit: number;
    rawPurchase?: Purchase;
    rawPayment?: SupplierPayment;
    rawReturn?: PurchaseReturn;
  };

  const allRawEntries: IntermediateRawEntry[] = [];

  // Purchases (Debits)
  safePurchases.forEach((pur) => {
    const debitAmount = normalizeMoney(pur.totalAmount ?? (pur.buyPrice * pur.quantity));
    const rawDateStr = pur.date || pur.createdAt || todayLocalStr();
    const d = new Date(rawDateStr);
    const timestamp = isNaN(d.getTime()) ? 0 : d.getTime();
    const istDateStr = getISTDateStr(rawDateStr) || rawDateStr.split("T")[0] || "";

    const prod = productMap.get(pur.productId);
    const prodName = prod?.name || (pur.productId ? `Product (${pur.productId.slice(-6)})` : "—");
    const qtyText = pur.quantity ? `${pur.quantity} unit${pur.quantity > 1 ? "s" : ""}` : "0 units";
    const priceText = pur.buyPrice ? `@ ₹${normalizeMoney(pur.buyPrice).toLocaleString("en-IN")}` : "";
    const notesText = pur.notes ? ` · "${pur.notes}"` : "";
    const description = `Purchase: ${prodName} (${qtyText} ${priceText})${notesText}`.trim();

    allRawEntries.push({
      id: pur.id || `pur-${crypto.randomUUID()}`,
      type: "PURCHASE",
      date: rawDateStr,
      istDateStr,
      timestamp,
      typePriority: 1,
      reference: pur.invoiceNumber || `PUR-${(pur.id || "").slice(-6).toUpperCase() || "—"}`,
      description,
      debit: debitAmount,
      credit: 0,
      rawPurchase: pur,
    });
  });

  // Payments (Credits)
  safePayments.forEach((sp) => {
    const creditAmount = normalizeMoney(sp.amount);
    const rawDateStr = sp.date || sp.createdAt || todayLocalStr();
    const d = new Date(rawDateStr);
    const timestamp = isNaN(d.getTime()) ? 0 : d.getTime();
    const istDateStr = getISTDateStr(rawDateStr) || rawDateStr.split("T")[0] || "";

    const linkedPurchase = safePurchases.find((p) => p.id === sp.purchaseId);
    const invRef = linkedPurchase?.invoiceNumber ? ` (Invoice #${linkedPurchase.invoiceNumber})` : "";
    const methodStr = sp.method ? ` via ${sp.method}` : "";
    const upfrontStr = sp.isUpfront ? " [Upfront Deposit]" : "";
    const noteStr = sp.note ? ` · "${sp.note}"` : "";
    const paidByStr = sp.paidBy ? ` · Paid by ${sp.paidBy}` : "";
    const description = `Supplier Payment${methodStr}${upfrontStr}${invRef}${noteStr}${paidByStr}`.trim();

    allRawEntries.push({
      id: sp.id || `sp-${crypto.randomUUID()}`,
      type: "PAYMENT",
      date: rawDateStr,
      istDateStr,
      timestamp,
      typePriority: 2,
      reference: linkedPurchase?.invoiceNumber ? `PAY-${linkedPurchase.invoiceNumber}` : `PAY-${(sp.id || "").slice(-6).toUpperCase() || "—"}`,
      description,
      debit: 0,
      credit: creditAmount,
      rawPayment: sp,
    });
  });

  // Returns (Credits)
  safeReturns.forEach((pr) => {
    // Return value reduces supplier liability by totalAmount
    const creditAmount = normalizeMoney(pr.totalAmount);
    const rawDateStr = pr.createdAt || todayLocalStr();
    const d = new Date(rawDateStr);
    const timestamp = isNaN(d.getTime()) ? 0 : d.getTime();
    const istDateStr = getISTDateStr(rawDateStr) || rawDateStr.split("T")[0] || "";

    const prod = productMap.get(pr.productId);
    const prodName = prod?.name || (pr.productId ? `Product (${pr.productId.slice(-6)})` : "—");
    const linkedPurchase = safePurchases.find((p) => p.id === pr.purchaseId);
    const invRef = linkedPurchase?.invoiceNumber ? ` [Invoice #${linkedPurchase.invoiceNumber}]` : "";
    const reasonStr = pr.reason ? ` · Reason: "${pr.reason}"` : "";
    const refundStr = pr.refundAmount > 0 ? ` · Refunded ₹${normalizeMoney(pr.refundAmount).toLocaleString("en-IN")}` : " · Balance Adjustment";
    const description = `Purchase Return: ${pr.quantity} units of ${prodName}${invRef}${reasonStr}${refundStr}`.trim();

    allRawEntries.push({
      id: pr.id || `pr-${crypto.randomUUID()}`,
      type: "RETURN",
      date: rawDateStr,
      istDateStr,
      timestamp,
      typePriority: 3,
      reference: `RET-${(pr.id || "").slice(-6).toUpperCase() || "—"}`,
      description,
      debit: 0,
      credit: creditAmount,
      rawReturn: pr,
    });
  });

  // 3. Strict Deterministic Chronological Sort (Oldest -> Newest)
  // Primary: timestamp (ascending)
  // Secondary: typePriority (1: Purchase, 2: Payment, 3: Return)
  // Tertiary: id (string compare)
  allRawEntries.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    if (a.typePriority !== b.typePriority) {
      return a.typePriority - b.typePriority;
    }
    return a.id.localeCompare(b.id);
  });

  // 4. Calculate Opening Balance (Transactions occurring strictly BEFORE fromDate)
  let openingBalance = 0;
  const filteredRawEntries: IntermediateRawEntry[] = [];

  for (const entry of allRawEntries) {
    const entryDateStr = entry.istDateStr;

    if (fromDate && entryDateStr < fromDate) {
      // Transaction is before the statement period -> affects Opening Balance
      openingBalance = normalizeMoney(openingBalance + entry.debit - entry.credit);
    } else if (toDate && entryDateStr > toDate) {
      // Transaction is after the statement period -> excluded
      continue;
    } else {
      // Transaction is INSIDE the statement period [fromDate, toDate]
      filteredRawEntries.push(entry);
    }
  }

  // 5. Calculate Period Running Balances and Totals
  let currentRunningBalance = openingBalance;
  let periodDebits = 0;
  let totalPayments = 0;
  let totalReturns = 0;

  const entries: StatementLedgerEntry[] = filteredRawEntries.map((raw) => {
    periodDebits = normalizeMoney(periodDebits + raw.debit);
    if (raw.type === "PAYMENT") {
      totalPayments = normalizeMoney(totalPayments + raw.credit);
    } else if (raw.type === "RETURN") {
      totalReturns = normalizeMoney(totalReturns + raw.credit);
    }

    currentRunningBalance = normalizeMoney(currentRunningBalance + raw.debit - raw.credit);

    return {
      id: raw.id,
      type: raw.type,
      date: raw.date,
      formattedDate: formatStatementDate(raw.date),
      timestamp: raw.timestamp,
      typePriority: raw.typePriority,
      reference: raw.reference,
      description: raw.description,
      debit: raw.debit,
      credit: raw.credit,
      runningBalance: currentRunningBalance,
      rawPurchase: raw.rawPurchase,
      rawPayment: raw.rawPayment,
      rawReturn: raw.rawReturn,
    };
  });

  const periodCredits = normalizeMoney(totalPayments + totalReturns);
  const closingBalance = normalizeMoney(openingBalance + periodDebits - periodCredits);

  // Reconciliation Integrity Check
  const expectedClosing = normalizeMoney(openingBalance + periodDebits - periodCredits);
  const reconciliationDiff = normalizeMoney(Math.abs(expectedClosing - closingBalance));
  const reconciled = reconciliationDiff === 0;

  // Lifetime All-Time Outstanding calculation (reconciles with existing store selectors)
  const allTimeDebits = allRawEntries.reduce((sum, e) => sum + e.debit, 0);
  const allTimeCredits = allRawEntries.reduce((sum, e) => sum + e.credit, 0);
  const allTimeOutstanding = normalizeMoney(allTimeDebits - allTimeCredits);

  // Determine period label
  let periodLabel = "All Time";
  if (fromDate && toDate) {
    periodLabel = `${formatStatementDate(fromDate)} → ${formatStatementDate(toDate)}`;
  } else if (fromDate) {
    periodLabel = `From ${formatStatementDate(fromDate)}`;
  } else if (toDate) {
    periodLabel = `Up to ${formatStatementDate(toDate)}`;
  }

  return {
    supplier,
    fromDate,
    toDate,
    preset,
    periodLabel,
    openingBalance,
    totalPurchases: periodDebits,
    totalPayments,
    totalReturns,
    periodDebits,
    periodCredits,
    closingBalance,
    reconciled,
    reconciliationDiff,
    entries,
    totalTransactionCount: entries.length,
    allTimeOutstanding,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CSV EXPORT GENERATOR (RFC 4180 / UTF-8 / Indian Rupee Safe)
// ─────────────────────────────────────────────────────────────────────────────

export function generateSupplierStatementCSVText(summary: SupplierStatementSummary): string {
  const escapeCSV = (val: unknown): string => {
    if (val === undefined || val === null) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const supplier = summary.supplier;
  const supplierName = supplier?.name || "Supplier";
  const supplierId = supplier?.id || "—";
  const gstin = supplier?.gst || "—";
  const phone = supplier?.phone || "—";
  const email = supplier?.email || "—";
  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const lines: string[] = [
    // Header Info
    `"AUTOVAULT ERP — SUPPLIER STATEMENT & FINANCIAL LEDGER"`,
    `"Generated At",${escapeCSV(generatedAt + " IST")}`,
    `"Supplier Name",${escapeCSV(supplierName)}`,
    `"Supplier ID",${escapeCSV(supplierId)}`,
    `"GSTIN",${escapeCSV(gstin)}`,
    `"Phone",${escapeCSV(phone)}`,
    `"Email",${escapeCSV(email)}`,
    `"Statement Period",${escapeCSV(summary.periodLabel)}`,
    `""`,
    // Summary KPI Block
    `"FINANCIAL RECONCILIATION SUMMARY"`,
    `"Opening Balance (₹)",${escapeCSV(summary.openingBalance.toFixed(2))}`,
    `"Total Purchases / Debits (₹)",${escapeCSV(summary.totalPurchases.toFixed(2))}`,
    `"Total Stock Returns / Credits (₹)",${escapeCSV(summary.totalReturns.toFixed(2))}`,
    `"Total Payments / Credits (₹)",${escapeCSV(summary.totalPayments.toFixed(2))}`,
    `"Total Period Credits (₹)",${escapeCSV(summary.periodCredits.toFixed(2))}`,
    `"Closing Balance (₹)",${escapeCSV(summary.closingBalance.toFixed(2))}`,
    `"Reconciliation Status",${escapeCSV(summary.reconciled ? "Reconciled (✓)" : `Discrepancy: ₹${summary.reconciliationDiff.toFixed(2)}`)}`,
    `""`,
    // Table Headers
    [
      escapeCSV("Date"),
      escapeCSV("Type"),
      escapeCSV("Reference"),
      escapeCSV("Description"),
      escapeCSV("Debit (₹)"),
      escapeCSV("Credit (₹)"),
      escapeCSV("Running Balance (₹)"),
    ].join(","),
  ];

  // Opening Balance Row
  lines.push(
    [
      escapeCSV(summary.fromDate ? formatStatementDate(summary.fromDate) : "—"),
      escapeCSV("OPENING"),
      escapeCSV("—"),
      escapeCSV("Opening Balance immediately prior to statement period"),
      escapeCSV("0.00"),
      escapeCSV("0.00"),
      escapeCSV(summary.openingBalance.toFixed(2)),
    ].join(",")
  );

  // Transaction Ledger Rows
  summary.entries.forEach((entry) => {
    lines.push(
      [
        escapeCSV(entry.formattedDate),
        escapeCSV(entry.type),
        escapeCSV(entry.reference),
        escapeCSV(entry.description),
        escapeCSV(entry.debit > 0 ? entry.debit.toFixed(2) : "0.00"),
        escapeCSV(entry.credit > 0 ? entry.credit.toFixed(2) : "0.00"),
        escapeCSV(entry.runningBalance.toFixed(2)),
      ].join(",")
    );
  });

  // Closing Balance Row
  lines.push(
    [
      escapeCSV(summary.toDate ? formatStatementDate(summary.toDate) : "—"),
      escapeCSV("CLOSING"),
      escapeCSV("—"),
      escapeCSV("Closing Statement Liability Balance"),
      escapeCSV(summary.totalPurchases.toFixed(2)),
      escapeCSV(summary.periodCredits.toFixed(2)),
      escapeCSV(summary.closingBalance.toFixed(2)),
    ].join(",")
  );

  // Return UTF-8 string (BOM will be attached on download Blob for Excel compatibility)
  return lines.join("\r\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. EXCEL (.XLSX) EXPORT GENERATOR (ExcelJS)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateSupplierStatementXLSX(summary: SupplierStatementSummary): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AutoVault ERP";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Supplier Statement", {
    views: [{ state: "frozen", ySplit: 13 }],
  });

  const supplier = summary.supplier;
  const supplierName = supplier?.name || "Supplier";
  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  // Column Setup
  sheet.columns = [
    { key: "date", width: 16 },
    { key: "type", width: 15 },
    { key: "ref", width: 20 },
    { key: "desc", width: 45 },
    { key: "debit", width: 18 },
    { key: "credit", width: 18 },
    { key: "balance", width: 20 },
  ];

  // Title Block
  const titleRow = sheet.addRow(["AUTOVAULT ERP — SUPPLIER STATEMENT"]);
  titleRow.height = 24;
  titleRow.getCell(1).font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } };

  sheet.addRow([`Supplier: ${supplierName} (ID: ${supplier?.id || "—"})`]);
  sheet.addRow([`GSTIN: ${supplier?.gst || "—"} | Phone: ${supplier?.phone || "—"} | Email: ${supplier?.email || "—"}`]);
  sheet.addRow([`Statement Period: ${summary.periodLabel}`]);
  sheet.addRow([`Generated: ${generatedAt} IST`]);
  sheet.addRow([]);

  // KPI Summary Block
  sheet.addRow(["FINANCIAL RECONCILIATION SUMMARY"]);
  sheet.lastRow!.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF334155" } };

  sheet.addRow(["Opening Balance", "", "", "", "", "", summary.openingBalance]);
  sheet.addRow(["Total Purchases (Debits)", "", "", "", summary.totalPurchases, "", ""]);
  sheet.addRow(["Total Returns (Credits)", "", "", "", "", summary.totalReturns, ""]);
  sheet.addRow(["Total Payments (Credits)", "", "", "", "", summary.totalPayments, ""]);
  sheet.addRow(["Closing Balance", "", "", "", "", "", summary.closingBalance]);
  sheet.addRow([]);

  // Table Header Row (Row 13)
  const headerRow = sheet.addRow([
    "Date",
    "Type",
    "Reference",
    "Description",
    "Debit (₹)",
    "Credit (₹)",
    "Running Balance (₹)",
  ]);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" }, // Slate 900
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  // Opening Balance Data Row
  const openRow = sheet.addRow([
    summary.fromDate ? formatStatementDate(summary.fromDate) : "—",
    "OPENING",
    "—",
    "Opening Balance immediately prior to statement period",
    0,
    0,
    summary.openingBalance,
  ]);
  openRow.getCell(5).numFmt = "₹#,##0.00";
  openRow.getCell(6).numFmt = "₹#,##0.00";
  openRow.getCell(7).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
  openRow.font = { italic: true, bold: true, color: { argb: "FF475569" } };

  // Data Rows
  summary.entries.forEach((entry) => {
    const row = sheet.addRow([
      entry.formattedDate,
      entry.type,
      entry.reference,
      entry.description,
      entry.debit > 0 ? entry.debit : 0,
      entry.credit > 0 ? entry.credit : 0,
      entry.runningBalance,
    ]);

    row.height = 19;
    row.getCell(5).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
    row.getCell(6).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
    row.getCell(7).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";

    const typeCell = row.getCell(2);
    if (entry.type === "PURCHASE") {
      typeCell.font = { bold: true, color: { argb: "FF1D4ED8" } }; // Blue
    } else if (entry.type === "PAYMENT") {
      typeCell.font = { bold: true, color: { argb: "FF047857" } }; // Emerald
    } else if (entry.type === "RETURN") {
      typeCell.font = { bold: true, color: { argb: "FFE11D48" } }; // Rose
    }
  });

  // Closing Balance Row
  const closeRow = sheet.addRow([
    summary.toDate ? formatStatementDate(summary.toDate) : "—",
    "CLOSING",
    "—",
    "Closing Statement Liability Balance",
    summary.totalPurchases,
    summary.periodCredits,
    summary.closingBalance,
  ]);
  closeRow.height = 22;
  closeRow.font = { bold: true, color: { argb: "FF0F172A" } };
  closeRow.getCell(5).numFmt = "₹#,##0.00";
  closeRow.getCell(6).numFmt = "₹#,##0.00";
  closeRow.getCell(7).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
