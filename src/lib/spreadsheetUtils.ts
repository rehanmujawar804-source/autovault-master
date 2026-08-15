import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { Product, VehicleFitment, RecentImportReport, FinanceTransaction } from "@/types";
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
  stock: number | "";
  buyPrice: number | ""; // maps to currentCost
  sellPrice: number | "";
  lowStockThreshold: number | "";
  status: "Active" | "Inactive" | "Discontinued" | "";
  isUniversalFit: boolean;
  fitments: VehicleFitment[];
  errors: string[];
  fieldErrors?: {
    name?: string;
    sku?: string;
    brand?: string;
    category?: string;
    status?: string;
    stock?: string;
    buyPrice?: string;
    sellPrice?: string;
    lowStockThreshold?: string;
  };
  nameWarning?: string;
  existingProduct?: Product;
}

const SKU_REGEX = /^[A-Za-z0-9_-]{3,40}$/;

function parseNumberCell(rawVal: string): { isBlank: boolean; num: number; isValid: boolean } {
  if (rawVal === undefined || rawVal === null) return { isBlank: true, num: NaN, isValid: false };
  const clean = rawVal.replace(/[₹$,\s]/g, "");
  if (clean === "") return { isBlank: true, num: NaN, isValid: false };
  const num = Number(clean);
  return { isBlank: false, num, isValid: !isNaN(num) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. XLSX EXPORT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export async function generateXLSXWorkbook(
  products: Product[],
  allCatalogProducts?: Product[]
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AutoVault";
  workbook.created = new Date();

  // ── Sheet 1: Products ──────────────────────────────────────────────────────
  const sheet1 = workbook.addWorksheet("Products", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const columns = [
    { header: "Name *", key: "name", width: 30 },
    { header: "SKU *", key: "sku", width: 18 },
    { header: "Category *", key: "category", width: 16 },
    { header: "Status *", key: "status", width: 16 },
    {header: "Initial Stock *", key: "stock", width: 14},
    {header: "Opening Cost *", key: "buyPrice", width: 16},
    {header: "Sell Price *", key: "sellPrice", width: 16},
    { header: "Low Stock Alert *", key: "threshold", width: 20 },
    { header: "Brand", key: "brand", width: 16 },
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
      category: p.category || "",
      status: p.status || "Active",
      stock: p.stock ?? 0,
      buyPrice: p.currentCost ?? 0,
      sellPrice: p.sellPrice ?? 0,
      threshold: p.lowStockThreshold ?? 5,
      brand: p.brand || "",
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

  // ── Sheet 2: RefData (Hidden) for Brand & Category Dropdowns ──────────────
  const sourceProducts =
    allCatalogProducts && allCatalogProducts.length > 0
      ? [...products, ...allCatalogProducts]
      : products;

  // Collect unique canonical Brands
  const brandSet = new Map<string, string>();
  for (const p of sourceProducts) {
    if (p.brand?.trim()) {
      const bTrim = p.brand.trim();
      const bLower = bTrim.toLowerCase();
      if (!brandSet.has(bLower)) brandSet.set(bLower, bTrim);
    }
  }
  let canonicalBrandsList = Array.from(brandSet.values()).sort();
  if (canonicalBrandsList.length === 0) {
    canonicalBrandsList = ["Philips", "Bosch", "Amaron", "Castrol", "Honda"];
  }

  // Collect unique canonical Categories
  const categorySet = new Map<string, string>();
  for (const p of sourceProducts) {
    if (p.category?.trim()) {
      const cTrim = p.category.trim();
      const cLower = cTrim.toLowerCase();
      if (!categorySet.has(cLower)) categorySet.set(cLower, cTrim);
    }
  }
  let canonicalCategoriesList = Array.from(categorySet.values()).sort();
  if (canonicalCategoriesList.length === 0) {
    canonicalCategoriesList = ["Lights", "Oils & Lubricants", "Batteries", "Brakes", "Interior Accessories"];
  }

  const refSheet = workbook.addWorksheet("RefData", { state: "hidden" });
  refSheet.getCell("A1").value = "Brand";
  refSheet.getCell("B1").value = "Category";

  canonicalBrandsList.forEach((b, idx) => {
    refSheet.getCell(`A${idx + 2}`).value = b;
  });

  canonicalCategoriesList.forEach((c, idx) => {
    refSheet.getCell(`B${idx + 2}`).value = c;
  });

  const brandLastRow = canonicalBrandsList.length + 1;
  const categoryLastRow = canonicalCategoriesList.length + 1;

  // Apply Excel Data Validation Dropdowns using range-level API (dataValidations.add)
  // to produce exactly ONE clean <dataValidation> node per range — no overlapping duplicates.

  // Category dropdown (Col C = 3): exactly one node for C2:C1000
  // showErrorMessage is patched to "0" via JSZip post-processing below so custom values
  // are accepted silently without any dialog box.
  (sheet1 as any).dataValidations.add("C2:C1000", {
    type: "list",
    allowBlank: true,
    formulae: [`RefData!$B$2:$B$${categoryLastRow}`],
    errorStyle: "information",
    showErrorMessage: true,
  });

  // Status dropdown (Col D = 4): exactly one node for D2:D1000 (strict enforced)
  (sheet1 as any).dataValidations.add("D2:D1000", {
    type: "list",
    allowBlank: true,
    formulae: ['"Active,Inactive,Discontinued"'],
    showErrorMessage: true,
    errorTitle: "Invalid Status",
    error: "Status must be Active, Inactive, or Discontinued.",
  });

  // Stock non-negative integer (Col E = 5): exactly one node for E2:E1000
  (sheet1 as any).dataValidations.add("E2:E1000", {
    type: "whole",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: [0],
    showErrorMessage: true,
    errorTitle: "Invalid Stock",
    error: "Stock must be a whole number 0 or greater.",
  });

  // Opening Cost decimal (Col F = 6): exactly one node for F2:F1000
  (sheet1 as any).dataValidations.add("F2:F1000", {
    type: "decimal",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: [0],
    showErrorMessage: true,
    errorTitle: "Invalid Opening Cost",
    error: "Opening Cost cannot be negative.",
  });

  // Sell Price decimal (Col G = 7): exactly one node for G2:G1000
  (sheet1 as any).dataValidations.add("G2:G1000", {
    type: "decimal",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: [0],
    showErrorMessage: true,
    errorTitle: "Invalid Sell Price",
    error: "Sell Price cannot be negative.",
  });

  // Low Stock Alert whole number (Col H = 8): exactly one node for H2:H1000
  (sheet1 as any).dataValidations.add("H2:H1000", {
    type: "whole",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: [0],
    showErrorMessage: true,
    errorTitle: "Invalid Low Stock Alert",
    error: "Low Stock Alert must be 0 or greater.",
  });

  // Brand dropdown (Col I = 9): exactly one node for I2:I1000
  // showErrorMessage is patched to "0" via JSZip post-processing below so custom values
  // are accepted silently without any dialog box.
  (sheet1 as any).dataValidations.add("I2:I1000", {
    type: "list",
    allowBlank: true,
    formulae: [`RefData!$A$2:$A$${brandLastRow}`],
    errorStyle: "information",
    showErrorMessage: true,
  });

  // Universal Fit dropdown (Col J = 10): exactly one node for J2:J1000 (strict enforced)
  (sheet1 as any).dataValidations.add("J2:J1000", {
    type: "list",
    allowBlank: true,
    formulae: ['"Yes,No"'],
    showErrorMessage: true,
    errorTitle: "Invalid Universal Fit",
    error: "Universal Fit must be Yes or No.",
  });

  // ── Sheet 2: Instructions ──────────────────────────────────────────────────
  const sheet2 = workbook.addWorksheet("Instructions");
  sheet2.columns = [{ width: 100 }];

  const instructionsText = [
    ["AUTOVAULT SPREADSHEET IMPORT & EXPORT INSTRUCTIONS", "TITLE"],
    ["", "EMPTY"],
    ["A. REQUIRED vs OPTIONAL FIELDS", "SECTION"],
    ["The following 8 fields are REQUIRED for every imported product row:", "TEXT"],
    ["  1. Name * — Product Name (Required, 3-100 characters. NOT unique. Duplicates show a warning but do NOT block import).", "TEXT"],
    ["  2. SKU * — Stock Keeping Unit (Required, 3-40 chars alphanumeric/-/_). Primary matching key for existing product updates.", "TEXT"],
    ["  3. Category * — Product Category grouping (Required. Cannot be blank. Matches existing categories case-insensitively).", "TEXT"],
    ["  4. Status * — Product lifecycle status (Required. Must be Active, Inactive, or Discontinued).", "TEXT"],
    ["  5. Initial Stock * — Units on hand (Required non-negative whole number. Explicit 0 is valid; blank is invalid).", "TEXT"],
    ["  6. Opening Cost (₹) — Initial cost per unit (Required when Initial Stock > 0; optional when Initial Stock = 0. Legacy spreadsheets using 'Current Cost' remain fully supported).", "TEXT"],
    ["  7. Sell Price (₹) * — Retail price per unit (Required non-negative number. Explicit 0 is valid; blank is invalid).", "TEXT"],
    ["  8. Low Stock Alert (units) * — Alert threshold (Required non-negative integer. Explicit 0 is valid; blank is invalid).", "TEXT"],
    ["", "EMPTY"],
    ["The following fields are OPTIONAL:", "TEXT"],
    ["  • Brand — Manufacturer / brand name (Optional. Case-insensitive canonicalization reuses existing stored spelling).", "TEXT"],
    ["  • Universal Fit — Enter Yes or No (Optional. Defaults to No).", "TEXT"],
    ["  • Compatible Vehicles — Specific vehicle fitments formatted as 'Brand | Model | YearFrom | YearTo' separated by ';'.", "TEXT"],
    ["", "EMPTY"],
    ["B. IMPORT VALIDATION & BLANK vs ZERO RULES", "SECTION"],
    ["• Opening Cost is REQUIRED when Initial Stock is greater than 0. If Initial Stock is 0, Opening Cost is optional.", "TEXT"],
    ["• Blank required fields (Name, SKU, Category, Status, Initial Stock, Sell Price, Low Stock Alert) produce a validation error.", "TEXT"],
    ["• An explicitly entered numeric '0' IS valid for Initial Stock, Opening Cost, Sell Price, and Low Stock Alert.", "TEXT"],
    ["• In Verification Preview, errors can be fixed inline before applying imports to catalog state.", "TEXT"],
    ["", "EMPTY"],
    ["C. BRAND & CATEGORY CANONICALIZATION", "SECTION"],
    ["• Brand and Category matching is case-insensitive (e.g. 'honda' or 'HONDA' resolves to existing canonical 'Honda').", "TEXT"],
    ["• Custom new brands and categories are accepted if no case-insensitive match exists.", "TEXT"],
    ["", "EMPTY"],
    ["D. PRODUCT NAME DUPLICATES", "SECTION"],
    ["• Product Name is NOT unique. Duplicate product names are fully allowed.", "TEXT"],
    ["• Matching existing product names trigger a non-blocking informational warning in Verification Preview.", "TEXT"],
    ["", "EMPTY"],
    ["E. SKU & MATCHING BEHAVIOR", "SECTION"],
    ["• SKU remains the unique business identifier.", "TEXT"],
    ["• Matching an existing SKU updates that product; a new SKU creates a new product.", "TEXT"],
    ["", "EMPTY"],
    ["F. EXPORT WORKFLOW", "SECTION"],
    ["• Normal Export downloads your complete active catalog in XLSX or CSV format.", "TEXT"],
    ["• Exported files preserve all product fields and can be edited and re-imported into AutoVault.", "TEXT"],
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

  const rawBuffer = await workbook.xlsx.writeBuffer();

  // Patch OpenXML for Category and Brand list dataValidations (which reference RefData!)
  // to set showErrorMessage="0" so Microsoft Excel suppresses invalid-value error popups completely
  // while keeping dropdown arrows available!
  try {
    const zip = await JSZip.loadAsync(rawBuffer);
    let sheetXml = await zip.file("xl/worksheets/sheet1.xml")?.async("text");
    if (sheetXml) {
      sheetXml = sheetXml.replace(
        /<dataValidation [^>]*>[\s\S]*?<formula1>RefData![\s\S]*?<\/dataValidation>/g,
        (match) => match.replace(/showErrorMessage="1"/g, 'showErrorMessage="0"')
      );
      zip.file("xl/worksheets/sheet1.xml", sheetXml);
      const patchedBuffer = await zip.generateAsync({ type: "arraybuffer" });
      return new Blob([patchedBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }
  } catch {
    // Fallback if ZIP patching is bypassed
  }

  return new Blob([rawBuffer], {
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
    "Opening Cost",
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

  let idxName = findHeaderIndex(["name *", "product name *", "name", "product name", "product", "title"]);
  let idxSKU = findHeaderIndex(["sku *", "sku code *", "sku", "sku code", "code", "item code"]);
  let idxBrand = findHeaderIndex(["brand", "make", "manufacturer"]);
  let idxCategory = findHeaderIndex(["category *", "category", "type", "group"]);
  let idxStock = findHeaderIndex(["initial stock *", "stock *", "stock", "qty", "quantity", "units", "count"]);
  let idxBuy = findHeaderIndex(["opening cost *", "opening cost", "current cost *", "current price *", "buy price *", "openingcost", "current cost", "current price", "buy price", "buy", "cost", "purchase price", "cost price", "buyprice"]);
  let idxSell = findHeaderIndex(["sell price *", "sell *", "price", "selling price", "rate", "sellprice"]);
  let idxThreshold = findHeaderIndex(["low stock alert *", "low stock threshold *", "threshold", "low stock", "alert qty", "alert"]);
  let idxStatus = findHeaderIndex(["status *", "status", "product status", "state"]);
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

  // Pre-build canonical map for Brand and Category from existing products
  const canonicalBrands = new Map<string, string>();
  const canonicalCategories = new Map<string, string>();
  for (const p of existingProducts || []) {
    if (p.brand?.trim()) {
      const bTrim = p.brand.trim();
      const bLower = bTrim.toLowerCase();
      if (!canonicalBrands.has(bLower)) canonicalBrands.set(bLower, bTrim);
    }
    if (p.category?.trim()) {
      const cTrim = p.category.trim();
      const cLower = cTrim.toLowerCase();
      if (!canonicalCategories.has(cLower)) canonicalCategories.set(cLower, cTrim);
    }
  }

  const results: CSVImportRowResult[] = [];
  const seenSKUsInFile = new Set<string>();

  for (let i = startRowIdx; i < rawRows.length; i++) {
    const cells = rawRows[i];
    if (!cells || cells.every((c) => !c)) continue;

    const rowNumber = i + 1;
    const rowErrors: string[] = [];
    const fieldErrors: CSVImportRowResult["fieldErrors"] = {};

    const rawName = (cells[idxName] || "").trim();
    const rawSku = (cells[idxSKU] || "").trim().toUpperCase();
    const rawBrand = idxBrand !== -1 ? (cells[idxBrand] || "").trim() : "";
    const rawCategory = idxCategory !== -1 ? (cells[idxCategory] || "").trim() : "";
    const rawStockStr = idxStock !== -1 ? (cells[idxStock] || "").trim() : "";
    const rawBuyStr = idxBuy !== -1 ? (cells[idxBuy] || "").trim() : "";
    const rawSellStr = idxSell !== -1 ? (cells[idxSell] || "").trim() : "";
    const rawThresholdStr = idxThreshold !== -1 ? (cells[idxThreshold] || "").trim() : "";
    const rawStatusStr = idxStatus !== -1 ? (cells[idxStatus] || "").trim() : "";
    const rawUniversalStr = idxUniversal !== -1 ? (cells[idxUniversal] || "").trim() : "";
    const rawFitmentsStr = idxFitments !== -1 ? (cells[idxFitments] || "").trim() : "";

    // Brand canonicalization
    let brand = rawBrand;
    if (rawBrand) {
      const canonicalMatch = canonicalBrands.get(rawBrand.toLowerCase());
      if (canonicalMatch) brand = canonicalMatch;
    }

    // Category validation & canonicalization
    let category = rawCategory;
    if (!rawCategory) {
      fieldErrors.category = "Category is required.";
      rowErrors.push("Category is required.");
    } else {
      const canonicalMatch = canonicalCategories.get(rawCategory.toLowerCase());
      if (canonicalMatch) category = canonicalMatch;
    }

    // Name validation
    if (!rawName) {
      fieldErrors.name = "Product name is required.";
      rowErrors.push("Product name is required.");
    } else if (rawName.length < 3) {
      fieldErrors.name = "Product name must be at least 3 characters.";
      rowErrors.push("Product name must be at least 3 characters.");
    } else if (rawName.length > 100) {
      fieldErrors.name = "Product name cannot exceed 100 characters.";
      rowErrors.push("Product name cannot exceed 100 characters.");
    }

    // SKU validation
    if (!rawSku) {
      fieldErrors.sku = "SKU is required.";
      rowErrors.push("SKU is required.");
    } else if (!SKU_REGEX.test(rawSku)) {
      fieldErrors.sku = `SKU "${rawSku}" is invalid (must be 3–40 alphanumeric, - or _, no spaces).`;
      rowErrors.push(`SKU "${rawSku}" is invalid (must be 3–40 alphanumeric, - or _, no spaces).`);
    }

    // In-file Duplicate SKU check
    const skuKey = rawSku.toLowerCase();
    if (skuKey) {
      if (seenSKUsInFile.has(skuKey)) {
        fieldErrors.sku = `Duplicate SKU "${rawSku}" appears multiple times in this spreadsheet.`;
        rowErrors.push(`Duplicate SKU "${rawSku}" appears multiple times in this spreadsheet.`);
      } else {
        seenSKUsInFile.add(skuKey);
      }
    }

    // Stock validation (distinguish blank vs 0)
    const parsedStock = parseNumberCell(rawStockStr);
    let stockVal: number | "" = "";
    if (parsedStock.isBlank) {
      fieldErrors.stock = "Initial Stock is required.";
      rowErrors.push("Initial Stock is required.");
    } else if (!parsedStock.isValid || parsedStock.num < 0 || !Number.isInteger(parsedStock.num)) {
      fieldErrors.stock = "Initial Stock must be a valid non-negative whole number.";
      rowErrors.push("Initial Stock must be a valid non-negative whole number.");
      stockVal = parsedStock.isValid ? parsedStock.num : "";
    } else {
      stockVal = parsedStock.num;
    }

    // Opening Cost validation (distinguish blank vs 0 and check stock > 0)
    const parsedBuy = parseNumberCell(rawBuyStr);
    let buyPriceVal: number | "" = "";
    if (parsedBuy.isBlank) {
      if (typeof stockVal === "number" && stockVal > 0) {
        fieldErrors.buyPrice = "Opening Cost is required when Initial Stock is greater than 0.";
        rowErrors.push("Opening Cost is required when Initial Stock is greater than 0.");
      }
    } else if (!parsedBuy.isValid || parsedBuy.num < 0) {
      fieldErrors.buyPrice = "Opening Cost must be a valid non-negative number.";
      rowErrors.push("Opening Cost must be a valid non-negative number.");
      buyPriceVal = parsedBuy.isValid ? parsedBuy.num : "";
    } else {
      buyPriceVal = parsedBuy.num;
    }

    // Sell Price validation (distinguish blank vs 0)
    const parsedSell = parseNumberCell(rawSellStr);
    let sellPriceVal: number | "" = "";
    if (parsedSell.isBlank) {
      fieldErrors.sellPrice = "Sell Price is required.";
      rowErrors.push("Sell Price is required.");
    } else if (!parsedSell.isValid || parsedSell.num < 0) {
      fieldErrors.sellPrice = "Sell Price must be a valid non-negative number.";
      rowErrors.push("Sell Price must be a valid non-negative number.");
      sellPriceVal = parsedSell.isValid ? parsedSell.num : "";
    } else {
      sellPriceVal = parsedSell.num;
    }

    // Low Stock Alert validation (distinguish blank vs 0)
    const parsedThreshold = parseNumberCell(rawThresholdStr);
    let thresholdVal: number | "" = "";
    if (parsedThreshold.isBlank) {
      fieldErrors.lowStockThreshold = "Low Stock Alert is required.";
      rowErrors.push("Low Stock Alert is required.");
    } else if (!parsedThreshold.isValid || parsedThreshold.num < 0 || !Number.isInteger(parsedThreshold.num)) {
      fieldErrors.lowStockThreshold = "Low Stock Alert must be a valid non-negative integer.";
      rowErrors.push("Low Stock Alert must be a valid non-negative integer.");
      thresholdVal = parsedThreshold.isValid ? parsedThreshold.num : "";
    } else {
      thresholdVal = parsedThreshold.num;
    }

    // Status validation
    let status: "Active" | "Inactive" | "Discontinued" | "" = "Active";
    if (!rawStatusStr) {
      fieldErrors.status = "Status is required.";
      rowErrors.push("Status is required.");
      status = "";
    } else {
      const statusLower = rawStatusStr.toLowerCase();
      if (statusLower === "active") status = "Active";
      else if (statusLower === "inactive") status = "Inactive";
      else if (statusLower === "discontinued") status = "Discontinued";
      else {
        fieldErrors.status = `Invalid Status "${rawStatusStr}" (must be Active, Inactive, or Discontinued).`;
        rowErrors.push(`Invalid Status "${rawStatusStr}" (must be Active, Inactive, or Discontinued).`);
        status = "";
      }
    }

    // Universal Fit validation
    let isUniversalFit = false;
    if (rawUniversalStr) {
      const univLower = rawUniversalStr.toLowerCase();
      if (["yes", "true", "1", "y"].includes(univLower)) isUniversalFit = true;
      else if (["no", "false", "0", "n"].includes(univLower)) isUniversalFit = false;
      else rowErrors.push(`Invalid Universal Fit value "${rawUniversalStr}" (must be Yes or No).`);
    }

    // Fitments parsing
    const fitments = isUniversalFit ? [] : parseFitmentsFromCSV(rawFitmentsStr);

    // Matching existing product by SKU (case-insensitive)
    const existingProd = existingProducts?.find(
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

    // Product Name Duplicate / Similar Warning ONLY for NEW rows (not for UPDATE rows)
    let nameWarning: string | undefined = undefined;
    if (rawName && rowType === "NEW" && !existingProd) {
      const lowerName = rawName.toLowerCase();
      const exactMatch = existingProducts?.find(
        (p) => p.name.trim().toLowerCase() === lowerName
      );
      if (exactMatch) {
        nameWarning = `⚠️ Name already exists: ${exactMatch.name}`;
      } else {
        const similarMatch = existingProducts?.find(
          (p) =>
            p.name.trim().toLowerCase().includes(lowerName) ||
            lowerName.includes(p.name.trim().toLowerCase())
        );
        if (similarMatch) {
          nameWarning = `⚠️ Similar name found: ${similarMatch.name}`;
        }
      }
    }

    results.push({
      rowNumber,
      type: rowType,
      sku: rawSku,
      name: rawName,
      brand,
      category,
      stock: stockVal,
      buyPrice: buyPriceVal,
      sellPrice: sellPriceVal,
      lowStockThreshold: thresholdVal,
      status,
      isUniversalFit,
      fitments,
      errors: rowErrors,
      fieldErrors,
      nameWarning,
      existingProduct: existingProd,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. BLANK SAMPLE TEMPLATE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export async function generateBlankXLSXImportTemplate(
  existingProducts: Product[] = []
): Promise<Blob> {
  return generateXLSXWorkbook([], existingProducts);
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

// ─────────────────────────────────────────────────────────────────────────────
// 6. FINANCE LEDGER SPREADSHEET EXPORTS (XLSX & CSV)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateFinanceXLSXWorkbook(
  transactions: FinanceTransaction[]
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AutoVault ERP";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Finance Ledger", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Date & Time", key: "date", width: 24 },
    { header: "Type", key: "type", width: 14 },
    { header: "Category", key: "category", width: 24 },
    { header: "Description / Notes", key: "notes", width: 35 },
    { header: "Amount (₹)", key: "amount", width: 18 },
    { header: "Payment Method", key: "method", width: 16 },
    { header: "Account ID", key: "accountId", width: 16 },
    { header: "Reference ID", key: "referenceId", width: 24 },
    { header: "Created By", key: "createdBy", width: 14 },
    { header: "Status", key: "status", width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  transactions.forEach((tx) => {
    const isIncome = tx.type === "Income";
    const row = sheet.addRow({
      date: tx.date ? new Date(tx.date).toLocaleString("en-IN") : "—",
      type: tx.type,
      category: tx.category,
      notes: tx.notes || "—",
      amount: isIncome ? tx.amount : -tx.amount,
      method: tx.method,
      accountId: tx.accountId,
      referenceId: tx.referenceId || tx.id,
      createdBy: "Owner",
      status: "Completed",
    });
    row.height = 20;

    const typeCell = row.getCell("type");
    if (isIncome) {
      typeCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF047857" } };
    } else {
      typeCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFDC2626" } };
    }

    const amountCell = row.getCell("amount");
    amountCell.numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function generateFinanceCSVText(transactions: FinanceTransaction[]): string {
  const headers = [
    "Date & Time",
    "Type",
    "Category",
    "Description",
    "Amount (₹)",
    "Payment Method",
    "Account ID",
    "Reference ID",
    "Created By",
    "Status",
  ];

  const escapeCSV = (str: string | number | undefined) => {
    if (str === undefined || str === null) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = transactions.map((tx) => {
    const isIncome = tx.type === "Income";
    const formattedDate = tx.date ? new Date(tx.date).toLocaleString("en-IN") : "";
    const amountVal = isIncome ? tx.amount : -tx.amount;
    return [
      escapeCSV(formattedDate),
      escapeCSV(tx.type),
      escapeCSV(tx.category),
      escapeCSV(tx.notes || ""),
      escapeCSV(amountVal),
      escapeCSV(tx.method),
      escapeCSV(tx.accountId),
      escapeCSV(tx.referenceId || tx.id),
      escapeCSV("Owner"),
      escapeCSV("Completed"),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}
