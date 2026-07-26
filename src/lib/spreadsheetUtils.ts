import ExcelJS from "exceljs";
import type { Product, VehicleFitment, RecentImportReport } from "@/types";
import {
  serializeFitmentsForCSV,
  parseFitmentsFromCSV,
} from "@/lib/fitmentUtils";

export interface CSVImportRowResult {
  rowNumber: number;
  type: "NEW" | "UPDATE" | "ERROR";
  sku: string;
  name: string;
  brand: string;
  category: string;
  stock: number;
  buyPrice: number; // maps to currentCost
  sellPrice: number;
  lowStockThreshold: number;
  status: "Active" | "Inactive" | "Discontinued";
  isUniversalFit: boolean;
  fitments: VehicleFitment[];
  errors: string[];
  existingProduct?: Product;
}

const SKU_REGEX = /^[A-Za-z0-9_-]{3,40}$/;

// ─────────────────────────────────────────────────────────────────────────────
// 1. XLSX EXPORT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export async function generateXLSXWorkbook(products: Product[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AutoVault";
  workbook.created = new Date();

  // ── Sheet 1: Products ──────────────────────────────────────────────────────
  const sheet1 = workbook.addWorksheet("Products", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const columns = [
    { header: "Name", key: "name", width: 30 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Brand", key: "brand", width: 16 },
    { header: "Category", key: "category", width: 16 },
    { header: "Stock", key: "stock", width: 12 },
    { header: "Current Price", key: "buyPrice", width: 16 },
    { header: "Sell Price", key: "sellPrice", width: 16 },
    { header: "Low Stock Threshold", key: "threshold", width: 22 },
    { header: "Status", key: "status", width: 16 },
    { header: "Universal Fit", key: "universal", width: 16 },
    { header: "Compatible Vehicles", key: "fitments", width: 45 },
  ];

  sheet1.columns = columns;

  // Style Header Row
  const headerRow = sheet1.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" }, // Slate 900
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF334155" } },
    };
  });

  // Add Product Data Rows
  products.forEach((p) => {
    const fitmentString = serializeFitmentsForCSV(p.fitments);
    const isUniversalStr = p.isUniversalFit ? "Yes" : "No";

    const row = sheet1.addRow({
      name: p.name,
      sku: p.sku,
      brand: p.brand || "",
      category: p.category || "",
      stock: p.stock ?? 0,
      buyPrice: p.currentCost ?? 0,
      sellPrice: p.sellPrice ?? 0,
      threshold: p.lowStockThreshold ?? 5,
      status: p.status || "Active",
      universal: isUniversalStr,
      fitments: fitmentString,
    });

    row.height = 20;

    // Number formats
    row.getCell("stock").numFmt = "#,##0";
    row.getCell("buyPrice").numFmt = "₹#,##0.00";
    row.getCell("sellPrice").numFmt = "₹#,##0.00";
    row.getCell("threshold").numFmt = "#,##0";
  });

  // Apply Excel Data Validation Dropdowns to Rows 2 to 1000
  for (let r = 2; r <= 1000; r++) {
    // Status dropdown (Col I = 9)
    sheet1.getCell(`I${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Active,Inactive,Discontinued"'],
      showErrorMessage: true,
      errorTitle: "Invalid Status",
      error: "Status must be Active, Inactive, or Discontinued.",
    };

    // Universal Fit dropdown (Col J = 10)
    sheet1.getCell(`J${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Yes,No"'],
      showErrorMessage: true,
      errorTitle: "Invalid Universal Fit",
      error: "Universal Fit must be Yes or No.",
    };

    // Stock non-negative integer (Col E = 5)
    sheet1.getCell(`E${r}`).dataValidation = {
      type: "whole",
      operator: "greaterThanOrEqual",
      formulae: [0],
      showErrorMessage: true,
      errorTitle: "Invalid Stock",
      error: "Stock must be a whole number 0 or greater.",
    };

    // Low Stock Threshold positive integer (Col H = 8)
    sheet1.getCell(`H${r}`).dataValidation = {
      type: "whole",
      operator: "greaterThanOrEqual",
      formulae: [1],
      showErrorMessage: true,
      errorTitle: "Invalid Low Stock Threshold",
      error: "Low Stock Threshold must be 1 or greater.",
    };

    // Current Price decimal (Col F = 6)
    sheet1.getCell(`F${r}`).dataValidation = {
      type: "decimal",
      operator: "greaterThanOrEqual",
      formulae: [0],
      showErrorMessage: true,
      errorTitle: "Invalid Current Price",
      error: "Current Price cannot be negative.",
    };

    // Sell Price decimal (Col G = 7)
    sheet1.getCell(`G${r}`).dataValidation = {
      type: "decimal",
      operator: "greaterThanOrEqual",
      formulae: [0],
      showErrorMessage: true,
      errorTitle: "Invalid Sell Price",
      error: "Sell Price cannot be negative.",
    };
  }

  // ── Sheet 2: Instructions ──────────────────────────────────────────────────
  const sheet2 = workbook.addWorksheet("Instructions");
  sheet2.columns = [{ width: 100 }];

  const instructionsText = [
    ["AUTOVAULT PRODUCT MANAGEMENT INSTRUCTIONS", "TITLE"],
    ["", "EMPTY"],
    ["A. IMPORTANT — HOW THIS EXCEL FILE WORKS", "SECTION"],
    ["1. The 'Products' sheet is designed for managing your product catalog:", "TEXT"],
    ["   • To ADD a new product: Enter a unique SKU that does NOT exist in AutoVault.", "TEXT"],
    ["   • To EDIT an existing product: Keep the EXACT SKU of that product unchanged.", "TEXT"],
    ["2. SKU is the primary matching key. AutoVault matches spreadsheet rows to existing products by SKU (case-insensitive).", "TEXT"],
    ["3. Internal Product IDs (id) and creation timestamps (createdAt) are managed automatically by AutoVault and are omitted from this spreadsheet to protect database integrity.", "TEXT"],
    ["4. Catalog Management vs. Full Backup: This spreadsheet is for product catalog management only. To perform a complete system backup or recovery (including historical invoices, customer balances, and finance ledgers), use the JSON Backup & Restore in Settings.", "TEXT"],
    ["", "EMPTY"],
    ["B. COLUMN-BY-COLUMN RULES", "SECTION"],
    ["• Name (Required): Product title. Must be between 3 and 100 characters.", "TEXT"],
    ["• SKU (Required / Matching Key): Stock keeping unit. Must be 3 to 40 characters.", "TEXT"],
    ["  Allowed characters: Letters (A-Z), Numbers (0-9), Hyphens (-), Underscores (_). NO SPACES ALLOWED.", "TEXT"],
    ["• Brand (Optional): Manufacturer or brand name (e.g. Philips, Bosch, Amaron).", "TEXT"],
    ["• Category (Optional): Product category grouping (e.g. Lights, Oils, Batteries, Brakes).", "TEXT"],
    ["• Stock (Optional): Current units on hand. Must be a whole number 0 or greater.", "TEXT"],
    ["  Editing stock calculates the difference (+/- delta) and logs a 'SPREADSHEET-IMPORT' Stock Movement audit record in AutoVault.", "TEXT"],
    ["• Current Price (Optional): Latest unit buy cost. Must be 0 or greater.", "TEXT"],
    ["  AutoVault automatically updates Current Price whenever you enter a new Supplier Purchase.", "TEXT"],
    ["• Sell Price (Required): Retail selling price per unit. Must be 0 or greater.", "TEXT"],
    ["• Low Stock Threshold (Optional): Alert trigger quantity. Must be a whole number 1 or greater. Defaults to 5 if left blank.", "TEXT"],
    ["• Status (Optional): Must be Active, Inactive, or Discontinued. Defaults to Active if left blank.", "TEXT"],
    ["• Universal Fit (Optional): Enter Yes or No. Defaults to No.", "TEXT"],
    ["  If Yes, the product is treated as compatible with all vehicles in POS billing and technical reference.", "TEXT"],
    ["• Compatible Vehicles (Optional): Specific vehicle fitment list when Universal Fit is No.", "TEXT"],
    ["  Format: Brand | Model | YearFrom | YearTo (multiple fitments separated by semicolons ';')", "TEXT"],
    ["  Example: Land Rover | Range Rover | 2021 | 2021; Maruti Suzuki | Swift Dzire | 2018 | 2022", "TEXT"],
    ["", "EMPTY"],
    ["C. ADDING A NEW PRODUCT", "SECTION"],
    ["1. Enter a unique SKU that does NOT exist in AutoVault.", "TEXT"],
    ["2. Provide Name and Sell Price.", "TEXT"],
    ["3. Fill optional fields as needed. Setting initial stock > 0 automatically logs an 'Opening Stock' record.", "TEXT"],
    ["", "EMPTY"],
    ["D. EDITING AN EXISTING PRODUCT", "SECTION"],
    ["1. Keep the SKU exactly as exported from AutoVault.", "TEXT"],
    ["2. Modify Name, Brand, Category, Stock, Current Price, Sell Price, Low Stock Threshold, Status, Universal Fit, or Compatible Vehicles.", "TEXT"],
    ["3. Historical invoices, purchase orders, customer ledgers, and financial records will remain safely linked to the product.", "TEXT"],
    ["", "EMPTY"],
    ["E. CURRENT PRICE GUIDANCE", "SECTION"],
    ["• Current Price represents the latest unit buy cost from supplier purchases.", "TEXT"],
    ["• When you record a new supplier purchase in AutoVault, Current Price automatically updates to that purchase's buy price.", "TEXT"],
    ["• It is NOT a weighted average and NOT a historical average.", "TEXT"],
    ["• You can edit Current Price in this spreadsheet during initial setup or for cost adjustments. For regular purchases, let Supplier Purchase entry update cost automatically.", "TEXT"],
    ["", "EMPTY"],
    ["F. SKU RULES", "SECTION"],
    ["• Length: 3 to 40 characters.", "TEXT"],
    ["• Allowed: Letters (A-Z, a-z), Numbers (0-9), Hyphen (-), Underscore (_).", "TEXT"],
    ["• Forbidden: Spaces, commas, quotes, special characters (!@#$%^&*()+=[]{}|;:'\",<>?/).", "TEXT"],
    ["• Case-Insensitive: 'OIL-5W30' and 'oil-5w30' match the SAME product.", "TEXT"],
    ["• Duplicates: Repeating the same SKU within the spreadsheet is invalid and will be flagged during import preview.", "TEXT"],
    ["", "EMPTY"],
    ["G. PRODUCT STATUS RULES", "SECTION"],
    ["• Active: Product can be sold in POS billing, ordered from suppliers, and triggers low-stock alerts.", "TEXT"],
    ["• Inactive: Blocked from POS billing and supplier purchase orders. Remains visible in Inventory.", "TEXT"],
    ["• Discontinued: Sellable in POS billing while stock > 0 (clearance), blocked when stock = 0. Blocked from supplier purchase orders.", "TEXT"],
    ["", "EMPTY"],
    ["H. UNIVERSAL FIT & VEHICLE COMPATIBILITY", "SECTION"],
    ["• Universal Fit = Yes: Compatible with all vehicle makes and models. Specific fitments are cleared.", "TEXT"],
    ["• Universal Fit = No: Uses the specific vehicle list in Compatible Vehicles.", "TEXT"],
    ["", "EMPTY"],
    ["I. STOCK EDITING & AUDIT TRAIL", "SECTION"],
    ["• New Products (New SKU): The Stock value sets the product's Initial Stock. If > 0, an 'Opening Stock' record is logged with reference 'SYSTEM-INIT'.", "TEXT"],
    ["• Existing Products (Matching SKU): The Stock value sets the desired Current Stock. AutoVault calculates the difference (e.g. changing 10 to 15 = +5) and logs an 'Import' stock movement with reference 'SPREADSHEET-IMPORT'.", "TEXT"],
    ["• Past stock movements and audit history are permanently preserved.", "TEXT"],
    ["", "EMPTY"],
    ["J. IMPORTANT WARNINGS", "SECTION"],
    ["⚠ Do NOT use spaces in SKUs.", "TEXT"],
    ["⚠ Do NOT enter unsupported status values (only Active, Inactive, Discontinued).", "TEXT"],
    ["⚠ Do NOT enter negative numbers for Stock, Prices, or Threshold.", "TEXT"],
    ["⚠ Do NOT use this spreadsheet for full application recovery.", "TEXT"],
  ];

  instructionsText.forEach(([text, type]) => {
    const row = sheet2.addRow([text]);
    const cell = row.getCell(1);
    if (type === "TITLE") {
      cell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } };
      row.height = 28;
    } else if (type === "SECTION") {
      cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF1E3A8A" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      };
      row.height = 22;
    } else if (type === "TEXT") {
      cell.font = { name: "Arial", size: 10, color: { argb: "FF334155" } };
      row.height = 18;
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CSV EXPORT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export function generateCSVText(products: Product[]): string {
  const headers = [
    "Name",
    "SKU",
    "Brand",
    "Category",
    "Stock",
    "Current Price",
    "Sell Price",
    "Low Stock Threshold",
    "Status",
    "Universal Fit",
    "Compatible Vehicles",
  ];

  const rows = products.map((p) => {
    const fitmentString = serializeFitmentsForCSV(p.fitments);
    const isUniversalStr = p.isUniversalFit ? "Yes" : "No";

    const escape = (val: string | number) => {
      const text = String(val ?? "");
      if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    return [
      escape(p.name),
      escape(p.sku),
      escape(p.brand),
      escape(p.category),
      p.stock ?? 0,
      p.currentCost ?? 0,
      p.sellPrice ?? 0,
      p.lowStockThreshold ?? 5,
      escape(p.status || "Active"),
      escape(isUniversalStr),
      escape(fitmentString),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. UNIFIED SPREADSHEET PARSER (XLSX & CSV)
// ─────────────────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(cell.trim());
      cell = "";
    } else {
      cell += c;
    }
  }
  result.push(cell.trim());
  return result;
}

export async function parseSpreadsheetFile(
  file: File,
  existingProducts: Product[]
): Promise<CSVImportRowResult[]> {
  const fileName = file.name.toLowerCase();
  let rawRows: string[][] = [];

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    let sheet = workbook.getWorksheet("Products");
    if (!sheet) {
      sheet = workbook.worksheets[0];
    }
    if (!sheet) {
      throw new Error("The uploaded Excel workbook contains no worksheets.");
    }

    sheet.eachRow({ includeEmpty: false }, (row) => {
      const rowValues: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        let val = cell.value;
        if (val === null || val === undefined) {
          rowValues.push("");
        } else if (typeof val === "object") {
          if ("result" in val && val.result !== undefined) {
            rowValues.push(String(val.result).trim());
          } else if ("text" in val && val.text !== undefined) {
            rowValues.push(String(val.text).trim());
          } else {
            rowValues.push(String(val).trim());
          }
        } else {
          rowValues.push(String(val).trim());
        }
      });
      if (rowValues.some((v) => v.length > 0)) {
        rawRows.push(rowValues);
      }
    });
  } else {
    // Read text file for CSV
    let text = await file.text();
    if (text.startsWith("\uFEFF")) {
      text = text.substring(1);
    }

    const lines: string[] = [];
    let currentLine = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        currentLine += char;
      } else if (char === "\n" && !inQuotes) {
        lines.push(currentLine.trim());
        currentLine = "";
      } else if (char === "\r") {
        // ignore
      } else {
        currentLine += char;
      }
    }
    if (currentLine) {
      lines.push(currentLine.trim());
    }

    for (const l of lines) {
      if (l) {
        rawRows.push(parseCSVLine(l));
      }
    }
  }

  if (rawRows.length === 0) {
    throw new Error("Uploaded spreadsheet is empty.");
  }

  const firstRowCells = rawRows[0];
  const headers = firstRowCells.map((h) => h.toLowerCase().trim());

  const findHeaderIndex = (aliases: string[]) => {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  let idxName = findHeaderIndex(["name", "product name", "product", "title"]);
  let idxSKU = findHeaderIndex(["sku", "sku code", "code", "item code"]);
  let idxBrand = findHeaderIndex(["brand", "make", "manufacturer"]);
  let idxCategory = findHeaderIndex(["category", "type", "group"]);
  let idxStock = findHeaderIndex(["stock", "qty", "quantity", "units", "count"]);
  let idxBuy = findHeaderIndex(["current price", "buy price", "buy", "cost", "purchase price", "cost price", "buyprice"]);
  let idxSell = findHeaderIndex(["sell price", "sell", "price", "selling price", "rate", "sellprice"]);
  let idxThreshold = findHeaderIndex(["low stock threshold", "threshold", "low stock", "alert qty", "alert"]);
  let idxStatus = findHeaderIndex(["status", "product status", "state"]);
  let idxUniversal = findHeaderIndex(["universal fit", "isuniversalfit", "universal"]);
  let idxFitments = findHeaderIndex(["compatible vehicles", "compatibility", "vehicles", "fitment", "fitments", "cars"]);

  let startRowIdx = 1;
  if (idxName === -1 || idxSKU === -1 || idxSell === -1) {
    const looksLikeData = firstRowCells.length >= 2;
    if (looksLikeData) {
      startRowIdx = 0;
      idxName = 0;
      idxSKU = 1;
      idxBrand = 2;
      idxCategory = 3;
      idxStock = 4;
      idxBuy = 5;
      idxSell = 6;
      idxThreshold = 7;
      idxStatus = 8;
      idxUniversal = 9;
      idxFitments = 10;
    } else {
      throw new Error("Spreadsheet must contain columns matching 'Name', 'SKU', and 'Sell Price', or be structured in standard order.");
    }
  }

  const cleanNumber = (val: string) => {
    if (!val) return 0;
    const clean = val.replace(/[₹$,\s]/g, "");
    return Number(clean) || 0;
  };

  const results: CSVImportRowResult[] = [];
  const seenSKUsInFile = new Set<string>();

  for (let i = startRowIdx; i < rawRows.length; i++) {
    const cells = rawRows[i];
    if (!cells || cells.every((c) => !c)) continue;

    const rowNumber = i + 1;
    const rowErrors: string[] = [];

    const rawName = (cells[idxName] || "").trim();
    const rawSku = (cells[idxSKU] || "").trim().toUpperCase();
    const brand = idxBrand !== -1 ? (cells[idxBrand] || "").trim() : "";
    const category = idxCategory !== -1 ? (cells[idxCategory] || "").trim() : "";
    const stock = idxStock !== -1 ? cleanNumber(cells[idxStock]) : 0;
    const buyPrice = idxBuy !== -1 ? cleanNumber(cells[idxBuy]) : 0;
    const sellPrice = idxSell !== -1 ? cleanNumber(cells[idxSell]) : 0;
    const lowStockThreshold = idxThreshold !== -1 ? (cleanNumber(cells[idxThreshold]) || 5) : 5;

    // Name validation
    if (!rawName) {
      rowErrors.push("Product name is required.");
    } else if (rawName.length < 3) {
      rowErrors.push("Product name must be at least 3 characters.");
    } else if (rawName.length > 100) {
      rowErrors.push("Product name cannot exceed 100 characters.");
    }

    // SKU validation
    if (!rawSku) {
      rowErrors.push("SKU is required.");
    } else if (!SKU_REGEX.test(rawSku)) {
      rowErrors.push(`SKU "${rawSku}" is invalid (must be 3–40 alphanumeric, - or _, no spaces).`);
    }

    // In-file Duplicate SKU check
    const skuKey = rawSku.toLowerCase();
    if (skuKey) {
      if (seenSKUsInFile.has(skuKey)) {
        rowErrors.push(`Duplicate SKU "${rawSku}" appears multiple times in this spreadsheet.`);
      } else {
        seenSKUsInFile.add(skuKey);
      }
    }

    // Number validations
    if (buyPrice < 0) rowErrors.push("Current Price cannot be negative.");
    if (sellPrice < 0) rowErrors.push("Sell Price cannot be negative.");
    if (!Number.isInteger(stock) || stock < 0) rowErrors.push("Stock must be a non-negative whole number.");
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 1) rowErrors.push("Low Stock Threshold must be a positive whole number (>= 1).");

    // Status validation & normalization
    let status: "Active" | "Inactive" | "Discontinued" = "Active";
    const rawStatus = idxStatus !== -1 ? (cells[idxStatus] || "").trim() : "";
    if (rawStatus) {
      const statusLower = rawStatus.toLowerCase();
      if (statusLower === "active") status = "Active";
      else if (statusLower === "inactive") status = "Inactive";
      else if (statusLower === "discontinued") status = "Discontinued";
      else rowErrors.push(`Invalid Status "${rawStatus}" (must be Active, Inactive, or Discontinued).`);
    }

    // Universal Fit validation & normalization
    let isUniversalFit = false;
    const rawUniversal = idxUniversal !== -1 ? (cells[idxUniversal] || "").trim() : "";
    if (rawUniversal) {
      const univLower = rawUniversal.toLowerCase();
      if (["yes", "true", "1", "y"].includes(univLower)) isUniversalFit = true;
      else if (["no", "false", "0", "n"].includes(univLower)) isUniversalFit = false;
      else rowErrors.push(`Invalid Universal Fit value "${rawUniversal}" (must be Yes or No).`);
    }

    // Fitments parsing (Universal Fit products have empty fitments)
    const rawFitments = idxFitments !== -1 ? (cells[idxFitments] || "").trim() : "";
    const fitments = isUniversalFit ? [] : parseFitmentsFromCSV(rawFitments);

    // Find matching existing product by SKU (case-insensitive)
    const existingProd = existingProducts.find(
      (p) => p.sku.trim().toLowerCase() === skuKey
    );

    let rowType: "NEW" | "UPDATE" | "ERROR" = "NEW";
    if (rowErrors.length > 0) {
      rowType = "ERROR";
    } else if (existingProd) {
      rowType = "UPDATE";
    } else {
      rowType = "NEW";
    }

    results.push({
      rowNumber,
      type: rowType,
      sku: rawSku,
      name: rawName,
      brand,
      category,
      stock,
      buyPrice,
      sellPrice,
      lowStockThreshold,
      status,
      isUniversalFit,
      fitments,
      errors: rowErrors,
      existingProduct: existingProd,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. BLANK SAMPLE TEMPLATE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export async function generateBlankXLSXImportTemplate(): Promise<Blob> {
  return generateXLSXWorkbook([]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. IMPORT CHANGE REPORT GENERATOR (XLSX)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateImportChangeReportXLSX(
  report: RecentImportReport
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AutoVault";
  workbook.created = new Date();

  // ── Sheet 1: Import Summary ───────────────────────────────────────────────
  const sheet1 = workbook.addWorksheet("Import Summary");
  sheet1.columns = [{ width: 32 }, { width: 40 }];

  sheet1.addRow(["AUTOVAULT IMPORT CHANGE REPORT", "SUMMARY"]);
  const titleCell = sheet1.getRow(1).getCell(1);
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } };

  sheet1.addRow([]);
  sheet1.addRow(["METRIC", "VALUE"]);
  const headerRow = sheet1.getRow(3);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  });

  const summaryData: Array<[string, string | number]> = [
    ["Import Date / Time", new Date(report.date).toLocaleString()],
    ["Imported Filename", report.fileName],
    ["Total Rows Processed", report.totalRows],
    ["Products Added", report.addedCount],
    ["Products Updated", report.updatedCount],
    ["Products Unchanged", report.unchangedCount],
    ["Errors / Skipped Rows", report.errorCount],
    ["Stock Increased Count", report.stockIncreasedCount],
    ["Stock Decreased Count", report.stockDecreasedCount],
  ];

  summaryData.forEach(([label, value]) => {
    const row = sheet1.addRow([label, value]);
    row.getCell(1).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF334155" } };
    row.getCell(2).font = { name: "Arial", size: 10, color: { argb: "FF0F172A" } };
  });

  // ── Sheet 2: Detailed Changes ─────────────────────────────────────────────
  const sheet2 = workbook.addWorksheet("Detailed Changes", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet2.columns = [
    { header: "SKU", key: "sku", width: 18 },
    { header: "Product Name", key: "productName", width: 32 },
    { header: "Action", key: "action", width: 14 },
    { header: "Field", key: "field", width: 22 },
    { header: "Previous Value", key: "previousValue", width: 25 },
    { header: "New Value", key: "newValue", width: 25 },
    { header: "Change", key: "change", width: 25 },
  ];

  const header2 = sheet2.getRow(1);
  header2.height = 24;
  header2.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  report.changes.forEach((c) => {
    const row = sheet2.addRow({
      sku: c.sku,
      productName: c.productName,
      action: c.action,
      field: c.field,
      previousValue: c.previousValue,
      newValue: c.newValue,
      change: c.change,
    });
    row.height = 20;

    const actionCell = row.getCell("action");
    if (c.action === "ADDED") {
      actionCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF047857" } };
    } else {
      actionCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF1D4ED8" } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

