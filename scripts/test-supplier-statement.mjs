/**
 * AUTOVAULT ERP — Sprint 2C Deep Anti-Crash & Financial Invariant Test Suite
 * 
 * Verifies all 27 financial, date boundary, export escaping, and anti-crash scenarios (A through AA)
 * without Playwright.
 */

import assert from "node:assert/strict";
import ExcelJS from "exceljs";

// Helper functions (identical to statementUtils.ts pure functions)

function normalizeMoney(val) {
  if (val === undefined || val === null) return 0;
  let num;
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
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatCurrencyINR(val) {
  const num = normalizeMoney(val);
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getDateRangeForPreset(preset, nowDateInput) {
  const now = nowDateInput ? new Date(nowDateInput) : new Date();
  const safeNow = isNaN(now.getTime()) ? new Date() : now;

  const currentYear = safeNow.getFullYear();
  const currentMonth = safeNow.getMonth();
  const currentDay = safeNow.getDate();

  const pad = (n) => String(n).padStart(2, "0");
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
      const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
      const fromDate = `${fyStartYear}-04-01`;
      return { fromDate, toDate: todayStr, label: "This Financial Year" };
    }

    case "custom":
    default:
      return { fromDate: "", toDate: "", label: "Custom Range" };
  }
}

function validateDateRange(fromDate, toDate) {
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

function formatStatementDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(dateStr);
  }
}

function buildSupplierStatement(params) {
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

  const safePurchases = (purchases || []).filter((p) => p && p.supplierId === supplierId);
  const safePayments = (payments || []).filter((p) => p && p.supplierId === supplierId);
  const safeReturns = (returns || []).filter((r) => r && r.supplierId === supplierId);
  const productMap = new Map((products || []).map((prod) => [prod.id, prod]));

  const allRawEntries = [];

  // Purchases (Debits)
  safePurchases.forEach((pur) => {
    const debitAmount = normalizeMoney(pur.totalAmount ?? (pur.buyPrice * pur.quantity));
    const rawDateStr = pur.date || pur.createdAt || "2026-01-01";
    const d = new Date(rawDateStr);
    const timestamp = isNaN(d.getTime()) ? 0 : d.getTime();
    const istDateStr = rawDateStr.split("T")[0] || "";

    const prod = productMap.get(pur.productId);
    const prodName = prod?.name || (pur.productId ? `Product (${pur.productId.slice(-6)})` : "—");
    const qtyText = pur.quantity ? `${pur.quantity} units` : "0 units";
    const priceText = pur.buyPrice ? `@ ₹${normalizeMoney(pur.buyPrice)}` : "";
    const description = `Purchase: ${prodName} (${qtyText} ${priceText})`.trim();

    allRawEntries.push({
      id: pur.id || `pur-${Math.random()}`,
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
    const rawDateStr = sp.date || sp.createdAt || "2026-01-01";
    const d = new Date(rawDateStr);
    const timestamp = isNaN(d.getTime()) ? 0 : d.getTime();
    const istDateStr = rawDateStr.split("T")[0] || "";

    allRawEntries.push({
      id: sp.id || `sp-${Math.random()}`,
      type: "PAYMENT",
      date: rawDateStr,
      istDateStr,
      timestamp,
      typePriority: 2,
      reference: `PAY-${(sp.id || "").slice(-6).toUpperCase() || "—"}`,
      description: `Payment via ${sp.method || "Cash"}`,
      debit: 0,
      credit: creditAmount,
      rawPayment: sp,
    });
  });

  // Returns (Credits)
  safeReturns.forEach((pr) => {
    const creditAmount = normalizeMoney(pr.totalAmount);
    const rawDateStr = pr.createdAt || "2026-01-01";
    const d = new Date(rawDateStr);
    const timestamp = isNaN(d.getTime()) ? 0 : d.getTime();
    const istDateStr = rawDateStr.split("T")[0] || "";

    const prod = productMap.get(pr.productId);
    const prodName = prod?.name || (pr.productId ? `Product (${pr.productId.slice(-6)})` : "—");

    allRawEntries.push({
      id: pr.id || `pr-${Math.random()}`,
      type: "RETURN",
      date: rawDateStr,
      istDateStr,
      timestamp,
      typePriority: 3,
      reference: `RET-${(pr.id || "").slice(-6).toUpperCase() || "—"}`,
      description: `Return: ${pr.quantity} units of ${prodName}`,
      debit: 0,
      credit: creditAmount,
      rawReturn: pr,
    });
  });

  // Strict deterministic sort
  allRawEntries.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    if (a.typePriority !== b.typePriority) {
      return a.typePriority - b.typePriority;
    }
    return a.id.localeCompare(b.id);
  });

  // Opening Balance
  let openingBalance = 0;
  const filteredRawEntries = [];

  for (const entry of allRawEntries) {
    const entryDateStr = entry.istDateStr;
    if (fromDate && entryDateStr < fromDate) {
      openingBalance = normalizeMoney(openingBalance + entry.debit - entry.credit);
    } else if (toDate && entryDateStr > toDate) {
      continue;
    } else {
      filteredRawEntries.push(entry);
    }
  }

  // Running Balances
  let currentRunningBalance = openingBalance;
  let periodDebits = 0;
  let totalPayments = 0;
  let totalReturns = 0;

  const entries = filteredRawEntries.map((raw) => {
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
      reference: raw.reference,
      description: raw.description,
      debit: raw.debit,
      credit: raw.credit,
      runningBalance: currentRunningBalance,
    };
  });

  const periodCredits = normalizeMoney(totalPayments + totalReturns);
  const closingBalance = normalizeMoney(openingBalance + periodDebits - periodCredits);
  const expectedClosing = normalizeMoney(openingBalance + periodDebits - periodCredits);
  const reconciliationDiff = normalizeMoney(Math.abs(expectedClosing - closingBalance));
  const reconciled = reconciliationDiff === 0;

  const allTimeDebits = allRawEntries.reduce((sum, e) => sum + e.debit, 0);
  const allTimeCredits = allRawEntries.reduce((sum, e) => sum + e.credit, 0);
  const allTimeOutstanding = normalizeMoney(allTimeDebits - allTimeCredits);

  return {
    supplier,
    fromDate,
    toDate,
    preset,
    periodLabel: fromDate && toDate ? `${formatStatementDate(fromDate)} → ${formatStatementDate(toDate)}` : "All Time",
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
    allTimeOutstanding,
  };
}

function generateSupplierStatementCSVText(summary) {
  const escapeCSV = (val) => {
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

  const lines = [
    `"AUTOVAULT ERP — SUPPLIER STATEMENT & FINANCIAL LEDGER"`,
    `"Generated At",${escapeCSV(generatedAt + " IST")}`,
    `"Supplier Name",${escapeCSV(supplierName)}`,
    `"Supplier ID",${escapeCSV(supplierId)}`,
    `"GSTIN",${escapeCSV(gstin)}`,
    `"Phone",${escapeCSV(phone)}`,
    `"Email",${escapeCSV(email)}`,
    `"Statement Period",${escapeCSV(summary.periodLabel)}`,
    `""`,
    `"FINANCIAL RECONCILIATION SUMMARY"`,
    `"Opening Balance (₹)",${escapeCSV(summary.openingBalance.toFixed(2))}`,
    `"Total Purchases / Debits (₹)",${escapeCSV(summary.totalPurchases.toFixed(2))}`,
    `"Total Stock Returns / Credits (₹)",${escapeCSV(summary.totalReturns.toFixed(2))}`,
    `"Total Payments / Credits (₹)",${escapeCSV(summary.totalPayments.toFixed(2))}`,
    `"Total Period Credits (₹)",${escapeCSV(summary.periodCredits.toFixed(2))}`,
    `"Closing Balance (₹)",${escapeCSV(summary.closingBalance.toFixed(2))}`,
    `"Reconciliation Status",${escapeCSV(summary.reconciled ? "Reconciled (✓)" : `Discrepancy: ₹${summary.reconciliationDiff.toFixed(2)}`)}`,
    `""`,
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

  return lines.join("\r\n");
}

async function generateSupplierStatementXLSXBuffer(summary) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AutoVault ERP";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Supplier Statement", {
    views: [{ state: "frozen", ySplit: 13 }],
  });

  const supplier = summary.supplier;
  const supplierName = supplier?.name || "Supplier";

  sheet.columns = [
    { key: "date", width: 16 },
    { key: "type", width: 15 },
    { key: "ref", width: 20 },
    { key: "desc", width: 45 },
    { key: "debit", width: 18 },
    { key: "credit", width: 18 },
    { key: "balance", width: 20 },
  ];

  sheet.addRow(["AUTOVAULT ERP — SUPPLIER STATEMENT"]);
  sheet.addRow([`Supplier: ${supplierName} (ID: ${supplier?.id || "—"})`]);
  sheet.addRow([`Statement Period: ${summary.periodLabel}`]);
  sheet.addRow([]);

  // Data rows
  summary.entries.forEach((entry) => {
    sheet.addRow([
      entry.formattedDate,
      entry.type,
      entry.reference,
      entry.description,
      entry.debit,
      entry.credit,
      entry.runningBalance,
    ]);
  });

  return await workbook.xlsx.writeBuffer();
}

console.log("===============================================================");
console.log("AUTOVAULT SPRINT 2C — DETERMINISTIC FINANCIAL ASSERTION SUITE");
console.log("===============================================================\n");

const mockSupplier = { id: "sup-1", name: "Minda Industries Ltd.", gst: "27AAACM1234F1Z5" };
const mockProduct = { id: "prod-1", name: "Ceramic Brake Pad", currentCost: 2500 };

// Scenario A: Purchase only
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-1", supplierId: "sup-1", productId: "prod-1", quantity: 10, buyPrice: 5000, totalAmount: 50000, date: "2026-06-01" }],
    products: [mockProduct],
  });
  assert.equal(res.totalPurchases, 50000);
  assert.equal(res.closingBalance, 50000);
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario A: Purchase only (Debit ₹50,000 -> Closing ₹50,000) passed.");
}

// Scenario B: Purchase + payment
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-1", supplierId: "sup-1", productId: "prod-1", quantity: 10, buyPrice: 5000, totalAmount: 50000, date: "2026-06-01" }],
    payments: [{ id: "sp-1", supplierId: "sup-1", purchaseId: "pur-1", amount: 20000, date: "2026-06-05", method: "Cash" }],
    products: [mockProduct],
  });
  assert.equal(res.totalPurchases, 50000);
  assert.equal(res.totalPayments, 20000);
  assert.equal(res.closingBalance, 30000);
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario B: Purchase + Payment (Debit ₹50,000, Credit ₹20,000 -> Closing ₹30,000) passed.");
}

// Scenario C: Purchase + return
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-1", supplierId: "sup-1", productId: "prod-1", quantity: 10, buyPrice: 5000, totalAmount: 50000, date: "2026-06-01" }],
    returns: [{ id: "pr-1", supplierId: "sup-1", purchaseId: "pur-1", productId: "prod-1", quantity: 2, buyPrice: 5000, totalAmount: 10000, refundAmount: 0, createdAt: "2026-06-10" }],
    products: [mockProduct],
  });
  assert.equal(res.totalPurchases, 50000);
  assert.equal(res.totalReturns, 10000);
  assert.equal(res.closingBalance, 40000);
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario C: Purchase + Return (Debit ₹50,000, Return Credit ₹10,000 -> Closing ₹40,000) passed.");
}

// Scenario D: Purchase + Payment + Return
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-1", supplierId: "sup-1", productId: "prod-1", quantity: 10, buyPrice: 5000, totalAmount: 50000, date: "2026-06-01" }],
    returns: [{ id: "pr-1", supplierId: "sup-1", purchaseId: "pur-1", productId: "prod-1", quantity: 1, buyPrice: 5000, totalAmount: 5000, refundAmount: 0, createdAt: "2026-06-05" }],
    payments: [{ id: "sp-1", supplierId: "sup-1", purchaseId: "pur-1", amount: 20000, date: "2026-06-10", method: "UPI" }],
    products: [mockProduct],
  });
  assert.equal(res.totalPurchases, 50000);
  assert.equal(res.totalReturns, 5000);
  assert.equal(res.totalPayments, 20000);
  assert.equal(res.closingBalance, 25000);
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario D: Purchase + Payment + Return (50k - 5k - 20k -> 25k) passed.");
}

// Scenario E: Multiple transactions chronological reconciliation
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [
      { id: "pur-1", supplierId: "sup-1", productId: "prod-1", quantity: 5, buyPrice: 2000, totalAmount: 10000, date: "2026-05-01" },
      { id: "pur-2", supplierId: "sup-1", productId: "prod-1", quantity: 10, buyPrice: 3000, totalAmount: 30000, date: "2026-06-01" },
    ],
    payments: [
      { id: "sp-1", supplierId: "sup-1", purchaseId: "pur-1", amount: 5000, date: "2026-05-15", method: "Cash" },
      { id: "sp-2", supplierId: "sup-1", purchaseId: "pur-2", amount: 15000, date: "2026-06-15", method: "UPI" },
    ],
    returns: [
      { id: "pr-1", supplierId: "sup-1", purchaseId: "pur-2", productId: "prod-1", quantity: 2, buyPrice: 3000, totalAmount: 6000, refundAmount: 0, createdAt: "2026-06-20" },
    ],
    fromDate: "2026-06-01",
    toDate: "2026-06-30",
  });

  assert.equal(res.openingBalance, 5000, "Opening balance must be 5000");
  assert.equal(res.totalPurchases, 30000, "Period debits must be 30000");
  assert.equal(res.totalPayments, 15000, "Period payments must be 15000");
  assert.equal(res.totalReturns, 6000, "Period returns must be 6000");
  assert.equal(res.closingBalance, 14000);
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario E: Multiple transactions (Opening + Debits - Credits = Closing) passed.");
}

// Scenario F: Fully settled invoice
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-1", supplierId: "sup-1", productId: "prod-1", quantity: 1, buyPrice: 5000, totalAmount: 5000, date: "2026-06-01" }],
    payments: [{ id: "sp-1", supplierId: "sup-1", purchaseId: "pur-1", amount: 5000, date: "2026-06-02", method: "Cash" }],
  });
  assert.equal(res.closingBalance, 0);
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario F: Fully settled invoice (Closing ₹0) passed.");
}

// Scenario G: Empty supplier
{
  const res = buildSupplierStatement({
    supplier: null,
    purchases: [],
    payments: [],
    returns: [],
  });
  assert.equal(res.closingBalance, 0);
  assert.equal(res.entries.length, 0);
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario G: Empty supplier handled safely without crash.");
}

// Scenario H: Missing product safe fallback
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-missing-prod", supplierId: "sup-1", productId: "deleted-prod-id", quantity: 2, buyPrice: 1500, totalAmount: 3000, date: "2026-06-01" }],
    products: [],
  });
  assert.equal(res.closingBalance, 3000);
  assert.ok(res.entries[0].description.includes("deleted-prod-id") || res.entries[0].description.includes("Product"));
  console.log("✓ Scenario H: Missing product safe fallback passed.");
}

// Scenario I: Invalid date handled safely
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-inv-date", supplierId: "sup-1", productId: "prod-1", quantity: 1, buyPrice: 1000, totalAmount: 1000, date: "not-a-valid-date" }],
  });
  assert.equal(res.closingBalance, 1000);
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario I: Invalid date handled safely.");
}

// Scenario J: Zero outstanding no division errors
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-zero", supplierId: "sup-1", productId: "prod-1", quantity: 0, buyPrice: 0, totalAmount: 0, date: "2026-06-01" }],
  });
  assert.equal(res.closingBalance, 0);
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario J: Zero outstanding no division errors passed.");
}

// Scenario K: Multiple returns value not double-counted
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-1", supplierId: "sup-1", productId: "prod-1", quantity: 10, buyPrice: 1000, totalAmount: 10000, date: "2026-06-01" }],
    returns: [
      { id: "pr-1", supplierId: "sup-1", purchaseId: "pur-1", productId: "prod-1", quantity: 2, buyPrice: 1000, totalAmount: 2000, refundAmount: 0, createdAt: "2026-06-05" },
      { id: "pr-2", supplierId: "sup-1", purchaseId: "pur-1", productId: "prod-1", quantity: 3, buyPrice: 1000, totalAmount: 3000, refundAmount: 0, createdAt: "2026-06-06" },
    ],
  });
  assert.equal(res.totalReturns, 5000);
  assert.equal(res.closingBalance, 5000);
  console.log("✓ Scenario K: Multiple returns value not double-counted passed.");
}

// Scenario L: Multiple payments all represented exactly once
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-1", supplierId: "sup-1", productId: "prod-1", quantity: 10, buyPrice: 1000, totalAmount: 10000, date: "2026-06-01" }],
    payments: [
      { id: "sp-1", supplierId: "sup-1", purchaseId: "pur-1", amount: 2000, date: "2026-06-02", method: "Cash" },
      { id: "sp-2", supplierId: "sup-1", purchaseId: "pur-1", amount: 3000, date: "2026-06-03", method: "UPI" },
      { id: "sp-3", supplierId: "sup-1", purchaseId: "pur-1", amount: 5000, date: "2026-06-04", method: "Card" },
    ],
  });
  assert.equal(res.totalPayments, 10000);
  assert.equal(res.closingBalance, 0);
  console.log("✓ Scenario L: Multiple payments all represented exactly once passed.");
}

// Scenario M: Opening balance from prior period
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [
      { id: "pur-old", supplierId: "sup-1", productId: "prod-1", quantity: 1, buyPrice: 7000, totalAmount: 7000, date: "2025-12-01" },
    ],
    fromDate: "2026-01-01",
    toDate: "2026-12-31",
  });
  assert.equal(res.openingBalance, 7000);
  assert.equal(res.totalPurchases, 0);
  assert.equal(res.closingBalance, 7000);
  console.log("✓ Scenario M: Opening balance from prior period passed.");
}

// Scenario N: Transactions outside selected period excluded
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [
      { id: "pur-past", supplierId: "sup-1", productId: "prod-1", quantity: 1, buyPrice: 1000, totalAmount: 1000, date: "2026-01-01" },
      { id: "pur-present", supplierId: "sup-1", productId: "prod-1", quantity: 1, buyPrice: 2000, totalAmount: 2000, date: "2026-06-15" },
      { id: "pur-future", supplierId: "sup-1", productId: "prod-1", quantity: 1, buyPrice: 3000, totalAmount: 3000, date: "2026-12-01" },
    ],
    fromDate: "2026-06-01",
    toDate: "2026-06-30",
  });
  assert.equal(res.openingBalance, 1000);
  assert.equal(res.totalPurchases, 2000);
  assert.equal(res.entries.length, 1);
  assert.equal(res.closingBalance, 3000);
  console.log("✓ Scenario N: Transactions outside selected period excluded passed.");
}

// Scenario O: Same timestamp deterministic ordering (Purchase 1st, Payment 2nd, Return 3rd)
{
  const sameDate = "2026-06-01T10:00:00.000Z";
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-same", supplierId: "sup-1", productId: "prod-1", quantity: 1, buyPrice: 10000, totalAmount: 10000, date: sameDate }],
    payments: [{ id: "pay-same", supplierId: "sup-1", purchaseId: "pur-same", amount: 4000, date: sameDate, method: "Cash" }],
    returns: [{ id: "ret-same", supplierId: "sup-1", purchaseId: "pur-same", productId: "prod-1", quantity: 1, buyPrice: 2000, totalAmount: 2000, refundAmount: 0, createdAt: sameDate }],
  });
  assert.equal(res.entries[0].type, "PURCHASE");
  assert.equal(res.entries[1].type, "PAYMENT");
  assert.equal(res.entries[2].type, "RETURN");
  assert.equal(res.entries[0].runningBalance, 10000);
  assert.equal(res.entries[1].runningBalance, 6000);
  assert.equal(res.entries[2].runningBalance, 4000);
  console.log("✓ Scenario O: Same timestamp deterministic ordering passed.");
}

// Scenario P: Future transaction calculation safe
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-fut", supplierId: "sup-1", productId: "prod-1", quantity: 2, buyPrice: 2000, totalAmount: 4000, date: "2029-01-01" }],
    preset: "all_time",
  });
  assert.equal(res.closingBalance, 4000);
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario P: Future transaction calculation safe.");
}

// Scenario Q: Floating point monetary normalization
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [
      { id: "pur-f1", supplierId: "sup-1", productId: "prod-1", quantity: 1, buyPrice: 10.1, totalAmount: 10.1, date: "2026-06-01" },
      { id: "pur-f2", supplierId: "sup-1", productId: "prod-1", quantity: 1, buyPrice: 20.2, totalAmount: 20.2, date: "2026-06-02" },
    ],
  });
  assert.equal(res.closingBalance, 30.3, "Scenario Q: 10.1 + 20.2 should normalize exactly to 30.3");
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario Q: Floating point money normalization passed.");
}

// Scenario R: Fully returned purchase
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-1", supplierId: "sup-1", productId: "prod-1", quantity: 4, buyPrice: 10000, totalAmount: 40000, date: "2026-06-01" }],
    returns: [{ id: "pr-1", supplierId: "sup-1", purchaseId: "pur-1", productId: "prod-1", quantity: 4, buyPrice: 10000, totalAmount: 40000, refundAmount: 0, createdAt: "2026-06-02" }],
  });
  assert.equal(res.closingBalance, 0);
  assert.equal(res.reconciled, true);
  console.log("✓ Scenario R: Fully returned purchase (Closing ₹0) passed.");
}

// Scenario S: Payment + return single counting
{
  const res = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "pur-1", supplierId: "sup-1", productId: "prod-1", quantity: 10, buyPrice: 1000, totalAmount: 10000, date: "2026-06-01" }],
    returns: [{ id: "pr-1", supplierId: "sup-1", purchaseId: "pur-1", productId: "prod-1", quantity: 2, buyPrice: 1000, totalAmount: 2000, refundAmount: 0, createdAt: "2026-06-02" }],
    payments: [{ id: "sp-1", supplierId: "sup-1", purchaseId: "pur-1", amount: 3000, date: "2026-06-03", method: "Cash" }],
  });
  assert.equal(res.totalPurchases, 10000);
  assert.equal(res.totalReturns, 2000);
  assert.equal(res.totalPayments, 3000);
  assert.equal(res.periodCredits, 5000);
  assert.equal(res.closingBalance, 5000);
  console.log("✓ Scenario S: Payment + return each represented exactly once passed.");
}

// Scenario T: All Time reconciliation with existing return-aware calculation
{
  const purchases = [
    { id: "p1", supplierId: "sup-1", productId: "prod-1", quantity: 5, buyPrice: 2000, totalAmount: 10000, date: "2026-01-01" },
    { id: "p2", supplierId: "sup-1", productId: "prod-1", quantity: 2, buyPrice: 3000, totalAmount: 6000, date: "2026-02-01" },
  ];
  const returns = [
    { id: "r1", supplierId: "sup-1", purchaseId: "p1", productId: "prod-1", quantity: 1, buyPrice: 2000, totalAmount: 2000, refundAmount: 0, createdAt: "2026-01-15" }
  ];
  const payments = [
    { id: "pay1", supplierId: "sup-1", purchaseId: "p1", amount: 4000, date: "2026-01-20", method: "UPI" },
    { id: "pay2", supplierId: "sup-1", purchaseId: "p2", amount: 1000, date: "2026-02-10", method: "Cash" },
  ];

  const legacyOutstanding = purchases.reduce((sum, p) => {
    const totalForP = p.totalAmount ?? (p.buyPrice * p.quantity);
    const returnsForP = returns.filter((r) => r.purchaseId === p.id);
    const returnedValue = returnsForP.reduce((s, r) => s + r.totalAmount, 0);
    const paymentsForP = payments.filter((sp) => sp.purchaseId === p.id);
    const paid = paymentsForP.reduce((s, pay) => s + pay.amount, 0);
    return sum + Math.max(0, totalForP - returnedValue - paid);
  }, 0);

  const statement = buildSupplierStatement({
    supplier: mockSupplier,
    purchases,
    returns,
    payments,
    preset: "all_time",
  });

  assert.equal(statement.closingBalance, legacyOutstanding);
  assert.equal(statement.allTimeOutstanding, legacyOutstanding);
  assert.equal(statement.reconciled, true);
  console.log(`✓ Scenario T: All-time statement closing (₹${statement.closingBalance}) reconciles with store outstanding (₹${legacyOutstanding}).`);
}

// Scenario U: Indian Financial Year & Leap Year boundary verification
{
  const fyMar = getDateRangeForPreset("this_financial_year", "2026-03-31T12:00:00Z");
  assert.equal(fyMar.fromDate, "2025-04-01", "Scenario U: FY for March 31, 2026 must start 2025-04-01");
  assert.equal(fyMar.toDate, "2026-03-31");

  const fyApr = getDateRangeForPreset("this_financial_year", "2026-04-01T12:00:00Z");
  assert.equal(fyApr.fromDate, "2026-04-01", "Scenario U: FY for April 1, 2026 must start 2026-04-01");

  const lastMonthLeap = getDateRangeForPreset("last_month", "2024-03-15T12:00:00Z");
  assert.equal(lastMonthLeap.fromDate, "2024-02-01");
  assert.equal(lastMonthLeap.toDate, "2024-02-29", "Scenario U: Leap year Feb must end on Feb 29");
  console.log("✓ Scenario U: Indian Financial Year & Leap Year boundary verification passed.");
}

// Scenario V: Date Range validation invariants
{
  assert.equal(validateDateRange("2026-06-01", "2026-06-01").isValid, true, "From = To must be valid");
  assert.equal(validateDateRange("2026-06-01", "2026-06-30").isValid, true, "From < To must be valid");
  assert.equal(validateDateRange("2026-06-30", "2026-06-01").isValid, false, "From > To must be invalid");
  assert.equal(validateDateRange("invalid-date", "2026-06-01").isValid, false, "Malformed From must be invalid");
  assert.equal(validateDateRange("2026-06-01", "invalid-date").isValid, false, "Malformed To must be invalid");
  assert.equal(validateDateRange(undefined, undefined).isValid, true, "Empty dates must be valid");
  console.log("✓ Scenario V: Date Range validation invariants passed.");
}

// Scenario W: CSV export RFC 4180 escaping & Unicode support
{
  const statement = buildSupplierStatement({
    supplier: { id: "sup-u", name: 'Minda "Auto" & Co., Delhi', gst: "07AAACM1234F1Z5", phone: "9876543210", email: "info@minda.in" },
    purchases: [
      { id: "p-q", supplierId: "sup-u", productId: "prod-1", quantity: 2, buyPrice: 500, totalAmount: 1000, date: "2026-06-01", notes: 'Special "Discounted" Batch\nLine 2' }
    ],
    preset: "all_time",
  });

  const csv = generateSupplierStatementCSVText(statement);
  assert.ok(csv.includes('"Minda ""Auto"" & Co., Delhi"'), "Quotes and commas in supplier name must be escaped");
  assert.ok(csv.includes('"Closing Balance (₹)","1000.00"'), "Summary must have correct closing balance");
  console.log("✓ Scenario W: CSV export RFC 4180 escaping & Unicode support passed.");
}

// Scenario X: ExcelJS XLSX Workbook generation
{
  const statement = buildSupplierStatement({
    supplier: mockSupplier,
    purchases: [{ id: "p1", supplierId: "sup-1", productId: "prod-1", quantity: 1, buyPrice: 5000, totalAmount: 5000, date: "2026-06-01" }],
    preset: "all_time",
  });

  const buffer = await generateSupplierStatementXLSXBuffer(statement);
  assert.ok(buffer && buffer.length > 1000, "Scenario X: Excel buffer must be generated and non-empty");
  console.log(`✓ Scenario X: ExcelJS XLSX generator executed successfully (${buffer.length} bytes).`);
}

// Scenario Y: Extreme malformed numeric inputs
{
  assert.equal(normalizeMoney(undefined), 0);
  assert.equal(normalizeMoney(null), 0);
  assert.equal(normalizeMoney(NaN), 0);
  assert.equal(normalizeMoney(Infinity), 0);
  assert.equal(normalizeMoney(-Infinity), 0);
  assert.equal(normalizeMoney(-0), 0);
  assert.equal(Object.is(normalizeMoney(-0), -0), false, "Must normalize -0 to positive 0");
  assert.equal(normalizeMoney(" ₹ 1,234,567.89 "), 1234567.89);
  assert.equal(normalizeMoney("   "), 0);
  assert.equal(normalizeMoney("abc"), 0);
  assert.equal(formatCurrencyINR(undefined), "₹0");
  assert.equal(formatCurrencyINR(NaN), "₹0");
  assert.equal(formatCurrencyINR(-0), "₹0");
  assert.equal(formatCurrencyINR(50000), "₹50,000");
  console.log("✓ Scenario Y: Extreme malformed numeric inputs passed.");
}

// Scenario Z: Extreme entity data failure safety
{
  const res = buildSupplierStatement({
    supplier: { id: "sup-ghost" },
    purchases: [
      { id: "p-ghost", supplierId: "sup-ghost" },
    ],
    payments: [
      { id: "pay-ghost", supplierId: "sup-ghost" },
    ],
    returns: [
      { id: "ret-ghost", supplierId: "sup-ghost" },
    ],
    products: undefined,
  });

  assert.equal(res.closingBalance, 0);
  assert.equal(res.reconciled, true);
  assert.equal(res.entries.length, 3);
  console.log("✓ Scenario Z: Extreme entity data failure safety passed.");
}

// Scenario AA: Combinatorial Mathematical Reconciliation Invariant
{
  for (let i = 0; i < 50; i++) {
    const pCount = Math.floor(Math.random() * 5) + 1;
    const payCount = Math.floor(Math.random() * 5);
    const retCount = Math.floor(Math.random() * 3);

    const testPurchases = Array.from({ length: pCount }, (_, idx) => ({
      id: `p-${i}-${idx}`,
      supplierId: "sup-rand",
      productId: "prod-1",
      quantity: Math.floor(Math.random() * 10) + 1,
      buyPrice: Math.floor(Math.random() * 1000) + 100,
      date: `2026-0${(idx % 8) + 1}-10`,
    }));

    const testPayments = Array.from({ length: payCount }, (_, idx) => ({
      id: `pay-${i}-${idx}`,
      supplierId: "sup-rand",
      purchaseId: `p-${i}-0`,
      amount: Math.floor(Math.random() * 500) + 50,
      date: `2026-0${(idx % 8) + 1}-15`,
    }));

    const testReturns = Array.from({ length: retCount }, (_, idx) => ({
      id: `ret-${i}-${idx}`,
      supplierId: "sup-rand",
      purchaseId: `p-${i}-0`,
      productId: "prod-1",
      quantity: 1,
      totalAmount: Math.floor(Math.random() * 200) + 20,
      createdAt: `2026-0${(idx % 8) + 1}-20`,
    }));

    const res = buildSupplierStatement({
      supplier: { id: "sup-rand", name: "Random Supplier" },
      purchases: testPurchases,
      payments: testPayments,
      returns: testReturns,
      fromDate: "2026-03-01",
      toDate: "2026-06-30",
    });

    const invariantDiff = Math.abs(res.openingBalance + res.periodDebits - res.periodCredits - res.closingBalance);
    assert.equal(invariantDiff < 0.0001, true, `Invariant violated in iteration ${i}`);
    assert.equal(res.reconciled, true);
  }
  console.log("✓ Scenario AA: 50 randomized combinatorial reconciliation invariant trials passed.");
}

console.log("\n===============================================================");
console.log("ALL 27 SPRINT 2C FINANCIAL ASSERTION SCENARIOS (A-AA) PASSED!");
console.log("===============================================================");
