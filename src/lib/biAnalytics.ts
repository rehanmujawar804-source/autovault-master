// ─────────────────────────────────────────────────────────────────────────────
//  AUTOVAULT ERP — PHASE 2.12D BUSINESS INTELLIGENCE & PREDICTIVE ENGINE
//  Deterministic rules-based advisor engine calculated purely from ERP state.
// ─────────────────────────────────────────────────────────────────────────────

import { AppState, Product, Invoice, SalesReturn, Supplier, Customer, FinanceTransaction } from "@/types";
import { calculateRevenue } from "@/lib/revenueUtils";
import { calculateProfit, calculateCOGS } from "@/lib/profitUtils";
import { todayLocalStr, toLocalDateStr, getISTDateStr } from "@/lib/dateUtils";

export type ConfidenceLevel = "High" | "Medium" | "Low" | "Insufficient data";
export type LowStockPriorityLevel = "Critical" | "High" | "Medium" | "Healthy";

export interface StockRunoutPrediction {
  productId: string;
  productName: string;
  sku: string;
  stock: number;
  avgDailySales: number;
  daysRemaining: number;
  priority: LowStockPriorityLevel;
  confidence: ConfidenceLevel;
  displayMessage: string;
  hasSalesHistory: boolean;
}

export interface TrendAnalysisResult {
  currentValue: number;
  previousValue: number;
  percentageChange: number;
  trend: "Increasing" | "Decreasing" | "Stable";
  displayMessage: string;
  actionableInsight: string;
}

export interface OwnerRecommendedAction {
  id: string;
  type: "Critical" | "Warning" | "Opportunity" | "Info";
  category: "Stock" | "Debt" | "Supplier" | "Sales" | "Expense";
  title: string;
  action: string;
  reason: string;
}

// ── 1. Stock Runout Prediction & Low Stock Priority ─────────────────────────
export function calculateStockRunoutPredictions(
  products: Product[],
  invoices: Invoice[],
  salesReturns: SalesReturn[] = []
): StockRunoutPrediction[] {
  const validInvoices = invoices.filter((i) => !i.voided);
  const activeReturns = salesReturns.filter((r) => r.status !== "Cancelled");

  // Determine overall store date range for fallback/historical span
  let earliestTimestamp = Date.now();
  let latestTimestamp = 0;

  validInvoices.forEach((inv) => {
    const time = new Date(inv.date).getTime();
    if (!isNaN(time)) {
      if (time < earliestTimestamp) earliestTimestamp = time;
      if (time > latestTimestamp) latestTimestamp = time;
    }
  });

  const totalStoreDays = Math.max(1, Math.ceil((Date.now() - earliestTimestamp) / (1000 * 60 * 60 * 24)));

  return products
    .filter((p) => p.stock > 0)
    .map((p): StockRunoutPrediction => {
      // Calculate net quantity sold for this product
      let totalQtySold = 0;
      let salesCount = 0;
      let firstSaleTime = Date.now();

      validInvoices.forEach((inv) => {
        inv.items.forEach((item) => {
          if (item.productId === p.id) {
            totalQtySold += item.quantity;
            salesCount += 1;
            const time = new Date(inv.date).getTime();
            if (!isNaN(time) && time < firstSaleTime) {
              firstSaleTime = time;
            }
          }
        });
      });

      activeReturns.forEach((r) => {
        r.items.forEach((ri) => {
          if (ri.productId === p.id) {
            totalQtySold -= ri.quantity;
          }
        });
      });

      if (totalQtySold <= 0 || salesCount === 0) {
        return {
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          stock: p.stock,
          avgDailySales: 0,
          daysRemaining: Infinity,
          priority: "Healthy",
          confidence: "Insufficient data",
          displayMessage: "Insufficient sales history",
          hasSalesHistory: false,
        };
      }

      // Calculate days of active sales history for product
      const productDaysSpan = Math.max(1, Math.ceil((Date.now() - firstSaleTime) / (1000 * 60 * 60 * 24)));
      const daysSpan = Math.min(totalStoreDays, Math.max(productDaysSpan, 7)); // min 7 days span to avoid division spike

      const avgDailySales = Math.round((totalQtySold / daysSpan) * 100) / 100; // e.g. 0.2/day or 3/day
      const daysRemaining = avgDailySales > 0 ? Math.ceil(p.stock / avgDailySales) : Infinity;

      // Priority Level
      let priority: LowStockPriorityLevel = "Healthy";
      if (daysRemaining <= 2) priority = "Critical";
      else if (daysRemaining <= 5) priority = "High";
      else if (daysRemaining <= 30) priority = "Medium";
      else priority = "Healthy";

      // Confidence Level Rules (Requirement 19)
      let confidence: ConfidenceLevel = "Low";
      if (daysSpan >= 90 && salesCount >= 5) {
        confidence = "High";
      } else if (daysSpan >= 30 || salesCount >= 3) {
        confidence = "Medium";
      } else {
        confidence = "Low";
      }

      const displayMessage =
        daysRemaining === Infinity
          ? "Low daily velocity"
          : `Runs out in approximately ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;

      const result: StockRunoutPrediction = {
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        stock: p.stock,
        avgDailySales,
        daysRemaining,
        priority,
        confidence,
        displayMessage,
        hasSalesHistory: true,
      };
      return result;
    })
    .sort((a: StockRunoutPrediction, b: StockRunoutPrediction) => {
      // Sort by priority first (Critical > High > Medium > Healthy), then daysRemaining
      const priorityOrder: Record<LowStockPriorityLevel, number> = {
        Critical: 1,
        High: 2,
        Medium: 3,
        Healthy: 4,
      };
      const pA = priorityOrder[a.priority] ?? 4;
      const pB = priorityOrder[b.priority] ?? 4;
      if (pA !== pB) {
        return pA - pB;
      }
      return a.daysRemaining - b.daysRemaining;
    });
}

// ── 2. Revenue & Profit Trend Analysis ─────────────────────────────────────
export function analyzeRevenueTrends(
  invoices: Invoice[],
  salesReturns: SalesReturn[] = []
): {
  todayVsYesterday: TrendAnalysisResult;
  weekVsLastWeek: TrendAnalysisResult;
  monthVsLastMonth: TrendAnalysisResult;
} {
  const validInvoices = invoices.filter((i) => !i.voided);
  const activeReturns = salesReturns.filter((r) => r.status !== "Cancelled");

  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;

  const todayStr = todayLocalStr();
  const yesterdayStr = toLocalDateStr(new Date(Date.now() - oneDay));

  // Helper to sum revenue for a date predicate
  const getRevenueForPredicate = (filterFn: (dateStr: string, timeMs: number) => boolean) => {
    const invs = validInvoices.filter((i) => {
      const timeMs = new Date(i.date).getTime();
      return filterFn(i.date, timeMs);
    });
    const rets = activeReturns.filter((r) => {
      const dateStr = r.createdAt ? getISTDateStr(r.createdAt) : "";
      const timeMs = new Date(r.createdAt).getTime();
      return filterFn(dateStr, timeMs);
    });
    return calculateRevenue(invs, rets);
  };

  // Today vs Yesterday
  const revToday = getRevenueForPredicate((d) => d === todayStr);
  const revYesterday = getRevenueForPredicate((d) => d === yesterdayStr);
  const todayVsYesterday = buildTrendResult(revToday, revYesterday, "Today vs Yesterday");

  // This week (last 7 days) vs Last week (days 8-14 ago)
  const nowMs = now.getTime();
  const week1Start = nowMs - 7 * oneDay;
  const week2Start = nowMs - 14 * oneDay;

  const revThisWeek = getRevenueForPredicate((_, t) => t >= week1Start && t <= nowMs);
  const revLastWeek = getRevenueForPredicate((_, t) => t >= week2Start && t < week1Start);
  const weekVsLastWeek = buildTrendResult(revThisWeek, revLastWeek, "This Week vs Last Week");

  // This month (last 30 days) vs Last month (days 31-60 ago)
  const month1Start = nowMs - 30 * oneDay;
  const month2Start = nowMs - 60 * oneDay;

  const revThisMonth = getRevenueForPredicate((_, t) => t >= month1Start && t <= nowMs);
  const revLastMonth = getRevenueForPredicate((_, t) => t >= month2Start && t < month1Start);
  const monthVsLastMonth = buildTrendResult(revThisMonth, revLastMonth, "This Month vs Last Month");

  return { todayVsYesterday, weekVsLastWeek, monthVsLastMonth };
}

export function analyzeProfitTrends(
  products: Product[],
  invoices: Invoice[],
  salesReturns: SalesReturn[] = []
): {
  todayVsYesterday: TrendAnalysisResult;
  weekVsLastWeek: TrendAnalysisResult;
  monthVsLastMonth: TrendAnalysisResult;
} {
  const validInvoices = invoices.filter((i) => !i.voided);
  const activeReturns = salesReturns.filter((r) => r.status !== "Cancelled");

  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;

  const todayStr = todayLocalStr();
  const yesterdayStr = toLocalDateStr(new Date(Date.now() - oneDay));

  const getProfitForPredicate = (filterFn: (dateStr: string, timeMs: number) => boolean) => {
    const invs = validInvoices.filter((i) => {
      const timeMs = new Date(i.date).getTime();
      return filterFn(i.date, timeMs);
    });
    const rets = activeReturns.filter((r) => {
      const dateStr = r.createdAt ? getISTDateStr(r.createdAt) : "";
      const timeMs = new Date(r.createdAt).getTime();
      return filterFn(dateStr, timeMs);
    });
    return calculateProfit(invs, rets, products);
  };

  const profToday = getProfitForPredicate((d) => d === todayStr);
  const profYesterday = getProfitForPredicate((d) => d === yesterdayStr);
  const todayVsYesterday = buildTrendResult(profToday, profYesterday, "Profit Today vs Yesterday", true);

  const nowMs = now.getTime();
  const week1Start = nowMs - 7 * oneDay;
  const week2Start = nowMs - 14 * oneDay;

  const profThisWeek = getProfitForPredicate((_, t) => t >= week1Start && t <= nowMs);
  const profLastWeek = getProfitForPredicate((_, t) => t >= week2Start && t < week1Start);
  const weekVsLastWeek = buildTrendResult(profThisWeek, profLastWeek, "Profit This Week vs Last Week", true);

  const month1Start = nowMs - 30 * oneDay;
  const month2Start = nowMs - 60 * oneDay;

  const profThisMonth = getProfitForPredicate((_, t) => t >= month1Start && t <= nowMs);
  const profLastMonth = getProfitForPredicate((_, t) => t >= month2Start && t < month1Start);
  const monthVsLastMonth = buildTrendResult(profThisMonth, profLastMonth, "Profit This Month vs Last Month", true);

  return { todayVsYesterday, weekVsLastWeek, monthVsLastMonth };
}

function buildTrendResult(curr: number, prev: number, label: string, isProfit = false): TrendAnalysisResult {
  if (prev === 0 && curr === 0) {
    return {
      currentValue: curr,
      previousValue: prev,
      percentageChange: 0,
      trend: "Stable",
      displayMessage: isProfit ? "Gross profit stable" : "→ Revenue stable",
      actionableInsight: "No historical activity recorded in comparison window.",
    };
  }

  if (prev === 0 && curr > 0) {
    return {
      currentValue: curr,
      previousValue: prev,
      percentageChange: 100,
      trend: "Increasing",
      displayMessage: isProfit ? "Gross profit increasing" : "↑ Revenue up 100%",
      actionableInsight: "Positive sales trajectory starting from initial zero baseline.",
    };
  }

  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct > 1) {
    return {
      currentValue: curr,
      previousValue: prev,
      percentageChange: pct,
      trend: "Increasing",
      displayMessage: isProfit ? "Gross profit increasing" : `↑ Revenue up ${pct}%`,
      actionableInsight: `Strong positive flow (+${pct}% vs previous period). Maintain active inventory stock.`,
    };
  } else if (pct < -1) {
    const absPct = Math.abs(pct);
    return {
      currentValue: curr,
      previousValue: prev,
      percentageChange: pct,
      trend: "Decreasing",
      displayMessage: isProfit ? "Gross profit decreasing" : `↓ Revenue down ${absPct}%`,
      actionableInsight: `Revenue slowed down by ${absPct}%. Consider promotions or following up on top customer debts.`,
    };
  } else {
    return {
      currentValue: curr,
      previousValue: prev,
      percentageChange: 0,
      trend: "Stable",
      displayMessage: isProfit ? "Gross profit stable" : "→ Revenue stable",
      actionableInsight: "Consistent business performance across comparison periods.",
    };
  }
}

// ── 3. Category Intelligence & Peak Selling Hours & Day of Week ─────────────
export function getCategoryAndSalesTimingInsights(
  products: Product[],
  invoices: Invoice[],
  salesReturns: SalesReturn[] = []
) {
  const validInvoices = invoices.filter((i) => !i.voided);
  const activeReturns = salesReturns.filter((r) => r.status !== "Cancelled");

  // Category Revenue Share
  const catRevMap: Record<string, number> = {};
  let totalStoreRevenue = 0;

  products.forEach((p) => {
    const cat = p.category || "Accessories";
    const pInvs = validInvoices.filter((inv) => inv.items.some((item) => item.productId === p.id));
    const pRets = activeReturns.filter((ret) => ret.items.some((item) => item.productId === p.id));
    const rev = calculateRevenue(pInvs, pRets, p.id);
    catRevMap[cat] = (catRevMap[cat] || 0) + rev;
    totalStoreRevenue += rev;
  });

  const sortedCategories = Object.entries(catRevMap).sort((a, b) => b[1] - a[1]);
  const bestCategory = sortedCategories[0]
    ? {
        category: sortedCategories[0][0],
        revenue: sortedCategories[0][1],
        percentage: totalStoreRevenue > 0 ? Math.round((sortedCategories[0][1] / totalStoreRevenue) * 100) : 0,
      }
    : null;

  const underperformingCategory = sortedCategories.length > 1
    ? {
        category: sortedCategories[sortedCategories.length - 1][0],
        revenue: sortedCategories[sortedCategories.length - 1][1],
        percentage: totalStoreRevenue > 0 ? Math.round((sortedCategories[sortedCategories.length - 1][1] / totalStoreRevenue) * 100) : 0,
      }
    : null;

  // Peak Selling Hours Analysis
  const hourlyCounts: Record<number, { count: number; sales: number }> = {};
  let hasValidTimestamps = false;

  validInvoices.forEach((inv) => {
    if (inv.createdAt || inv.date.includes("T")) {
      const dateObj = new Date(inv.createdAt || inv.date);
      const hour = dateObj.getHours();
      if (!isNaN(hour)) {
        hasValidTimestamps = true;
        const bucket = Math.floor(hour / 2) * 2; // 2-hour window e.g. 18 -> 18 (18:00 - 20:00 = 6 PM - 8 PM)
        if (!hourlyCounts[bucket]) hourlyCounts[bucket] = { count: 0, sales: 0 };
        hourlyCounts[bucket].count += 1;
        hourlyCounts[bucket].sales += inv.total;
      }
    }
  });

  let peakHourWindow: string | null = null;
  if (hasValidTimestamps) {
    const sortedHours = Object.entries(hourlyCounts).sort((a, b) => b[1].sales - a[1].sales);
    if (sortedHours[0]) {
      const startH = Number(sortedHours[0][0]);
      const endH = (startH + 2) % 24;
      const formatH = (h: number) => {
        const ampm = h >= 12 ? "PM" : "AM";
        const formatted = h % 12 === 0 ? 12 : h % 12;
        return `${formatted} ${ampm}`;
      };
      peakHourWindow = `${formatH(startH)}–${formatH(endH)}`;
    }
  }

  // Day of Week Analysis
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayRevenue: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  validInvoices.forEach((inv) => {
    const d = new Date(inv.date);
    const dayIdx = d.getDay();
    if (!isNaN(dayIdx)) {
      dayRevenue[dayIdx] += inv.total;
    }
  });

  const sortedDays = Object.entries(dayRevenue).sort((a, b) => b[1] - a[1]);
  const bestDay = sortedDays[0] ? { day: dayNames[Number(sortedDays[0][0])], revenue: sortedDays[0][1] } : null;
  const worstDay = sortedDays[sortedDays.length - 1] ? { day: dayNames[Number(sortedDays[sortedDays.length - 1][0])], revenue: sortedDays[sortedDays.length - 1][1] } : null;

  return {
    bestCategory,
    underperformingCategory,
    hasValidTimestamps,
    peakHourWindow,
    bestDay,
    worstDay,
  };
}

// ── 6. Business Health Score Calculation (Requirement 17) ───────────────────
/**
 * Business Health Score calculation rules (0 - 100):
 * Purely deterministic, fully documented.
 *
 * 1. Cash Reserves (20 pts):
 *    - >= 25,000 liquid cash: 20 pts
 *    - >= 10,000: 15 pts
 *    - >= 2,000: 10 pts
 *    - < 2,000: 5 pts
 * 2. Customer Debt Control (20 pts):
 *    - Debt == 0: 20 pts
 *    - Debt < 25,000: 15 pts
 *    - Debt < 50,000: 10 pts
 *    - Debt >= 50,000: 5 pts
 * 3. Supplier Liabilities Control (15 pts):
 *    - Payables == 0: 15 pts
 *    - Payables < 50,000: 10 pts
 *    - Payables < 100,000: 5 pts
 *    - Payables >= 100,000: 2 pts
 * 4. Inventory Health (15 pts):
 *    - Low stock items == 0 & Dead stock items == 0: 15 pts
 *    - Deduct 2 pts per critical stock runout item
 *    - Deduct 1 pt per dead stock product (min score 0)
 * 5. Profit Trend (15 pts):
 *    - Increasing or Stable profit: 15 pts
 *    - Profit drop <= 15%: 10 pts
 *    - Profit drop > 15%: 5 pts
 * 6. Revenue Trend (15 pts):
 *    - Increasing or Stable revenue: 15 pts
 *    - Revenue drop <= 15%: 10 pts
 *    - Revenue drop > 15%: 5 pts
 */
export interface BusinessHealthScoreResult {
  score: number;
  status: "Healthy" | "Moderate" | "Needs Attention";
  positiveDrivers: string[];
  negativeDrivers: string[];
  breakdown: {
    cashHealth: { score: number; max: number; label: string };
    customerDebt: { score: number; max: number; label: string };
    supplierPayables: { score: number; max: number; label: string };
    inventoryHealth: { score: number; max: number; label: string };
    profitTrend: { score: number; max: number; label: string };
    revenueTrend: { score: number; max: number; label: string };
  };
}

export function calculateBusinessHealthScore(
  totalLiquidCash: number,
  customerDebt: number,
  supplierPayables: number,
  criticalStockCount: number,
  deadStockCount: number,
  profitTrend: TrendAnalysisResult,
  revenueTrend: TrendAnalysisResult
): BusinessHealthScoreResult {
  const positiveDrivers: string[] = [];
  const negativeDrivers: string[] = [];

  // 1. Cash
  let cashScore = 5;
  let cashLabel = "Low liquid reserves";
  if (totalLiquidCash >= 25000) {
    cashScore = 20;
    cashLabel = "Strong liquid cash position";
    positiveDrivers.push(`Cash reserves healthy (₹${totalLiquidCash.toLocaleString()} available)`);
  } else if (totalLiquidCash >= 10000) {
    cashScore = 15;
    cashLabel = "Adequate cash reserves";
    positiveDrivers.push(`Adequate cash reserves (₹${totalLiquidCash.toLocaleString()})`);
  } else if (totalLiquidCash >= 2000) {
    cashScore = 10;
    cashLabel = "Tight cash cushion";
    negativeDrivers.push(`Tight liquid cash reserves (₹${totalLiquidCash.toLocaleString()})`);
  } else {
    negativeDrivers.push(`Critical liquid cash position (₹${totalLiquidCash.toLocaleString()})`);
  }

  // 2. Customer Debt
  let debtScore = 5;
  let debtLabel = "High customer debt exposure";
  if (customerDebt === 0) {
    debtScore = 20;
    debtLabel = "Zero customer debt";
    positiveDrivers.push("Zero uncollected customer debt");
  } else if (customerDebt < 25000) {
    debtScore = 15;
    debtLabel = "Controlled debt levels";
    positiveDrivers.push(`Controlled customer debt (₹${customerDebt.toLocaleString()})`);
  } else if (customerDebt < 50000) {
    debtScore = 10;
    debtLabel = "Moderate debt backlog";
    negativeDrivers.push(`Moderate debt exposure (₹${customerDebt.toLocaleString()})`);
  } else {
    negativeDrivers.push(`High customer debt backlog (₹${customerDebt.toLocaleString()})`);
  }

  // 3. Supplier Payables
  let payablesScore = 2;
  let payablesLabel = "Significant supplier dues";
  if (supplierPayables === 0) {
    payablesScore = 15;
    payablesLabel = "Zero supplier payables";
    positiveDrivers.push("Zero supplier credit payables");
  } else if (supplierPayables < 50000) {
    payablesScore = 10;
    payablesLabel = "Manageable supplier balance";
    positiveDrivers.push(`Manageable supplier dues (₹${supplierPayables.toLocaleString()})`);
  } else if (supplierPayables < 100000) {
    payablesScore = 5;
    payablesLabel = "High supplier balance";
    negativeDrivers.push(`High supplier payables balance (₹${supplierPayables.toLocaleString()})`);
  } else {
    negativeDrivers.push(`Significant supplier credit liabilities (₹${supplierPayables.toLocaleString()})`);
  }

  // 4. Inventory Health
  let inventoryScore = 15 - criticalStockCount * 2 - deadStockCount * 1;
  inventoryScore = Math.max(0, Math.min(15, inventoryScore));
  const inventoryLabel =
    inventoryScore >= 12
      ? "Optimal stock health"
      : inventoryScore >= 7
      ? "Minor stock runout risk"
      : "High dead stock / runout risk";

  if (criticalStockCount > 0) {
    negativeDrivers.push(`${criticalStockCount} product${criticalStockCount > 1 ? "s" : ""} out of stock or low stock`);
  } else {
    positiveDrivers.push("No critical stock runout alerts");
  }

  if (deadStockCount > 0) {
    negativeDrivers.push(`${deadStockCount} product${deadStockCount > 1 ? "s" : ""} sitting as dead stock`);
  }

  // 5. Profit Trend
  let profitScore = 15;
  let profitLabel = "Profit margin increasing or stable";
  if (profitTrend.trend === "Decreasing") {
    if (Math.abs(profitTrend.percentageChange) <= 15) {
      profitScore = 10;
      profitLabel = "Slight profit dip";
      negativeDrivers.push(`Minor profit drop (${profitTrend.percentageChange}%)`);
    } else {
      profitScore = 5;
      profitLabel = "Profit down > 15%";
      negativeDrivers.push(`Profit drop of ${profitTrend.percentageChange}%`);
    }
  } else {
    positiveDrivers.push(`Profit margin trajectory strong (${profitTrend.percentageChange >= 0 ? "+" : ""}${profitTrend.percentageChange}%)`);
  }

  // 6. Revenue Trend
  let revenueScore = 15;
  let revenueLabel = "Revenue trajectory strong";
  if (revenueTrend.trend === "Decreasing") {
    if (Math.abs(revenueTrend.percentageChange) <= 15) {
      revenueScore = 10;
      revenueLabel = "Minor revenue dip";
      negativeDrivers.push(`Minor revenue dip (${revenueTrend.percentageChange}%)`);
    } else {
      revenueScore = 5;
      revenueLabel = "Revenue down > 15%";
      negativeDrivers.push(`Revenue drop of ${revenueTrend.percentageChange}%`);
    }
  } else {
    positiveDrivers.push(`Revenue trajectory growing (${revenueTrend.percentageChange >= 0 ? "+" : ""}${revenueTrend.percentageChange}%)`);
  }

  const score = cashScore + debtScore + payablesScore + inventoryScore + profitScore + revenueScore;
  let status: "Healthy" | "Moderate" | "Needs Attention" = "Healthy";

  if (score >= 80) status = "Healthy";
  else if (score >= 60) status = "Moderate";
  else status = "Needs Attention";

  return {
    score,
    status,
    positiveDrivers,
    negativeDrivers,
    breakdown: {
      cashHealth: { score: cashScore, max: 20, label: cashLabel },
      customerDebt: { score: debtScore, max: 20, label: debtLabel },
      supplierPayables: { score: payablesScore, max: 15, label: payablesLabel },
      inventoryHealth: { score: inventoryScore, max: 15, label: inventoryLabel },
      profitTrend: { score: profitScore, max: 15, label: profitLabel },
      revenueTrend: { score: revenueScore, max: 15, label: revenueLabel },
    },
  };
}

// ── 7. Recommended Actions Generator (Requirement 18) ──────────────────────
export function generateRecommendedActions(
  predictions: StockRunoutPrediction[],
  customers: Customer[],
  suppliers: Supplier[],
  supplierPayablesMap: Record<string, number>,
  deadStockCount: number
): OwnerRecommendedAction[] {
  const actions: OwnerRecommendedAction[] = [];

  // Stock Actions
  const criticalStock = predictions.filter((p) => p.priority === "Critical" || p.priority === "High");
  if (criticalStock.length > 0) {
    const topCritical = criticalStock[0];
    actions.push({
      id: `action-stock-${topCritical.productId}`,
      type: "Critical",
      category: "Stock",
      title: `Order ${topCritical.productName} Soon`,
      action: `Place a purchase order for ${topCritical.productName}. Stock is ${topCritical.stock} units.`,
      reason: `Runs out in approximately ${topCritical.daysRemaining} days based on daily velocity (${topCritical.avgDailySales}/day).`,
    });
  }

  // Customer Debt Actions
  const topDebtor = [...customers].filter((c) => (c.debt || 0) > 0).sort((a, b) => b.debt - a.debt)[0];
  if (topDebtor) {
    actions.push({
      id: `action-debt-${topDebtor.id}`,
      type: "Warning",
      category: "Debt",
      title: `Collect Payment from ${topDebtor.name}`,
      action: `Send payment reminder or contact ${topDebtor.name} (${topDebtor.phone}).`,
      reason: `Largest debtor with ₹${topDebtor.debt.toLocaleString()} in open unpaid invoice balance.`,
    });
  }

  // Supplier Payment Actions
  const topSupplierWithPayables = [...suppliers]
    .map((s) => ({ supplier: s, due: supplierPayablesMap[s.id] || 0 }))
    .filter((x) => x.due > 0)
    .sort((a, b) => b.due - a.due)[0];

  if (topSupplierWithPayables) {
    actions.push({
      id: `action-supplier-${topSupplierWithPayables.supplier.id}`,
      type: "Warning",
      category: "Supplier",
      title: `Supplier ${topSupplierWithPayables.supplier.name} Payment Due`,
      action: `Schedule credit settlement of ₹${topSupplierWithPayables.due.toLocaleString()} for ${topSupplierWithPayables.supplier.name}.`,
      reason: "Highest outstanding supplier balance. Timely payment protects trade credit terms.",
    });
  }

  // Dead Stock Actions
  if (deadStockCount > 0) {
    actions.push({
      id: "action-dead-stock-discount",
      type: "Opportunity",
      category: "Stock",
      title: "Reduce Slow-Moving & Dead Stock",
      action: `Apply a discount or run a bundle offer on ${deadStockCount} stagnant products.`,
      reason: "No sales recorded in 90+ days. Liquidating idle inventory frees up working capital.",
    });
  }

  return actions;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PHASE 2.12E DETERMINISTIC ANALYTICS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export interface PeriodComparisonResult {
  currentRevenue: number;
  previousRevenue: number;
  revenueGrowthPct: number;
  currentProfit: number;
  previousProfit: number;
  profitGrowthPct: number;
  currentBilledTotal: number;
  previousBilledTotal: number;
  billedGrowthPct: number;
  currentOrders: number;
  previousOrders: number;
  ordersGrowthPct: number;
  currentAOV: number;
  previousAOV: number;
  aovGrowthPct: number;
  comparisonLabel: string;
  previousPeriodInvoices: Invoice[];
}

export function calculatePeriodComparison(
  timeRange: string,
  startDateStr: string,
  endDateStr: string,
  invoices: Invoice[],
  salesReturns: SalesReturn[],
  products: Product[]
): PeriodComparisonResult {
  const validInvoices = invoices.filter((i) => !i.voided);
  const activeReturns = salesReturns.filter((r) => r.status !== "Cancelled");
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const todayStr = now.toISOString().split("T")[0];

  let currStartMs = 0;
  let currEndMs = now.getTime();
  let prevStartMs = 0;
  let prevEndMs = 0;
  let label = "vs Previous Period";

  if (timeRange === "Today") {
    label = "Today vs Yesterday";
    const yestStr = new Date(now.getTime() - oneDay).toISOString().split("T")[0];
    const currInvs = validInvoices.filter((i) => i.date === todayStr);
    const currRets = activeReturns.filter((r) => (r.createdAt ? r.createdAt.split("T")[0] : "") === todayStr);
    const prevInvs = validInvoices.filter((i) => i.date === yestStr);
    const prevRets = activeReturns.filter((r) => (r.createdAt ? r.createdAt.split("T")[0] : "") === yestStr);

    const cRev = calculateRevenue(currInvs, currRets);
    const pRev = calculateRevenue(prevInvs, prevRets);
    const cProf = calculateProfit(currInvs, currRets, products);
    const pProf = calculateProfit(prevInvs, prevRets, products);
    const cBilled = currInvs.reduce((s, i) => s + i.total, 0);
    const pBilled = prevInvs.reduce((s, i) => s + i.total, 0);
    const cOrders = currInvs.length;
    const pOrders = prevInvs.length;
    const cAOV = cOrders > 0 ? Math.round(cBilled / cOrders) : 0;
    const pAOV = pOrders > 0 ? Math.round(pBilled / pOrders) : 0;

    return {
      currentRevenue: cRev,
      previousRevenue: pRev,
      revenueGrowthPct: pRev > 0 ? Math.round(((cRev - pRev) / pRev) * 100) : cRev > 0 ? 100 : 0,
      currentProfit: cProf,
      previousProfit: pProf,
      profitGrowthPct: pProf > 0 ? Math.round(((cProf - pProf) / pProf) * 100) : cProf > 0 ? 100 : 0,
      currentBilledTotal: cBilled,
      previousBilledTotal: pBilled,
      billedGrowthPct: pBilled > 0 ? Math.round(((cBilled - pBilled) / pBilled) * 100) : cBilled > 0 ? 100 : 0,
      currentOrders: cOrders,
      previousOrders: pOrders,
      ordersGrowthPct: pOrders > 0 ? Math.round(((cOrders - pOrders) / pOrders) * 100) : cOrders > 0 ? 100 : 0,
      currentAOV: cAOV,
      previousAOV: pAOV,
      aovGrowthPct: pAOV > 0 ? Math.round(((cAOV - pAOV) / pAOV) * 100) : cAOV > 0 ? 100 : 0,
      comparisonLabel: label,
      previousPeriodInvoices: prevInvs,
    };
  }

  let durationDays = 30;
  if (timeRange === "Week") {
    durationDays = 7;
    label = "This Week vs Last Week";
  } else if (timeRange === "Month") {
    durationDays = 30;
    label = "This Month vs Last Month";
  } else if (timeRange === "Quarter") {
    durationDays = 90;
    label = "90 Days vs Previous 90 Days";
  } else if (timeRange === "Year") {
    durationDays = 365;
    label = "1 Year vs Previous Year";
  } else if (timeRange === "Custom" && startDateStr && endDateStr) {
    const sT = new Date(startDateStr).getTime();
    const eT = new Date(endDateStr).getTime();
    if (!isNaN(sT) && !isNaN(eT) && eT >= sT) {
      durationDays = Math.max(1, Math.ceil((eT - sT) / oneDay));
      currStartMs = sT;
      currEndMs = eT + oneDay;
      prevEndMs = sT;
      prevStartMs = sT - durationDays * oneDay;
      label = `Custom Range vs Prev ${durationDays}D`;
    }
  } else {
    // All-time or fallback
    durationDays = 30;
    label = "Current Period vs Previous Period";
  }

  if (currStartMs === 0) {
    currEndMs = now.getTime();
    currStartMs = currEndMs - durationDays * oneDay;
    prevEndMs = currStartMs;
    prevStartMs = currStartMs - durationDays * oneDay;
  }

  const currInvs = validInvoices.filter((i) => {
    const t = new Date(i.date).getTime();
    return t >= currStartMs && t <= currEndMs;
  });
  const currRets = activeReturns.filter((r) => {
    const t = new Date(r.createdAt).getTime();
    return t >= currStartMs && t <= currEndMs;
  });

  const prevInvs = validInvoices.filter((i) => {
    const t = new Date(i.date).getTime();
    return t >= prevStartMs && t < prevEndMs;
  });
  const prevRets = activeReturns.filter((r) => {
    const t = new Date(r.createdAt).getTime();
    return t >= prevStartMs && t < prevEndMs;
  });

  const cRev = calculateRevenue(currInvs, currRets);
  const pRev = calculateRevenue(prevInvs, prevRets);
  const cProf = calculateProfit(currInvs, currRets, products);
  const pProf = calculateProfit(prevInvs, prevRets, products);
  const cBilled = currInvs.reduce((s, i) => s + i.total, 0);
  const pBilled = prevInvs.reduce((s, i) => s + i.total, 0);
  const cOrders = currInvs.length;
  const pOrders = prevInvs.length;
  const cAOV = cOrders > 0 ? Math.round(cBilled / cOrders) : 0;
  const pAOV = pOrders > 0 ? Math.round(pBilled / pOrders) : 0;

  return {
    currentRevenue: cRev,
    previousRevenue: pRev,
    revenueGrowthPct: pRev > 0 ? Math.round(((cRev - pRev) / pRev) * 100) : cRev > 0 ? 100 : 0,
    currentProfit: cProf,
    previousProfit: pProf,
    profitGrowthPct: pProf > 0 ? Math.round(((cProf - pProf) / pProf) * 100) : cProf > 0 ? 100 : 0,
    currentBilledTotal: cBilled,
    previousBilledTotal: pBilled,
    billedGrowthPct: pBilled > 0 ? Math.round(((cBilled - pBilled) / pBilled) * 100) : cBilled > 0 ? 100 : 0,
    currentOrders: cOrders,
    previousOrders: pOrders,
    ordersGrowthPct: pOrders > 0 ? Math.round(((cOrders - pOrders) / pOrders) * 100) : cOrders > 0 ? 100 : 0,
    currentAOV: cAOV,
    previousAOV: pAOV,
    aovGrowthPct: pAOV > 0 ? Math.round(((cAOV - pAOV) / pAOV) * 100) : cAOV > 0 ? 100 : 0,
    comparisonLabel: label,
    previousPeriodInvoices: prevInvs,
  };
}

export interface InventoryAgeingBuckets {
  bucket0to30: number;
  bucket31to60: number;
  bucket61to90: number;
  bucket90Plus: number;
  totalValuation: number;
}

export interface ProductVelocityInsightsResult {
  fastestGrowingProduct: { product: Product; currQty: number; prevQty: number; growthPct: number } | null;
  fastestDecliningProduct: { product: Product; currQty: number; prevQty: number; dropPct: number } | null;
  neverSoldProducts: Product[];
  deadStockProducts: Product[];
  soldOnceProducts: Product[];
  soldEveryMonthProducts: Product[];
  deadStockValuation: number;
  inventoryAgeing: InventoryAgeingBuckets;
}

export function calculateProductVelocityInsights(
  products: Product[],
  filteredInvoices: Invoice[],
  allInvoices: Invoice[],
  salesReturns: SalesReturn[],
  comparison: PeriodComparisonResult,
  prevPeriodInvoices: Invoice[]
): ProductVelocityInsightsResult {
  const validInvs = allInvoices.filter((i) => !i.voided);
  const activeRets = salesReturns.filter((r) => r.status !== "Cancelled");

  // Lifetime sales per product
  const productLifetimeSalesMap: Record<string, { qty: number; txCount: number; monthsSet: Set<string> }> = {};
  products.forEach((p) => {
    productLifetimeSalesMap[p.id] = { qty: 0, txCount: 0, monthsSet: new Set() };
  });

  const allMonthsSet = new Set<string>();

  validInvs.forEach((inv) => {
    const monthStr = inv.date ? inv.date.substring(0, 7) : "";
    if (monthStr) allMonthsSet.add(monthStr);

    inv.items.forEach((item) => {
      if (productLifetimeSalesMap[item.productId]) {
        productLifetimeSalesMap[item.productId].qty += item.quantity;
        productLifetimeSalesMap[item.productId].txCount += 1;
        if (monthStr) productLifetimeSalesMap[item.productId].monthsSet.add(monthStr);
      }
    });
  });

  activeRets.forEach((r) => {
    r.items.forEach((ri) => {
      if (productLifetimeSalesMap[ri.productId]) {
        productLifetimeSalesMap[ri.productId].qty = Math.max(0, productLifetimeSalesMap[ri.productId].qty - ri.quantity);
      }
    });
  });

  // Current vs Previous Period Sales per product
  const currPeriodQtyMap: Record<string, number> = {};
  const prevPeriodQtyMap: Record<string, number> = {};

  filteredInvoices.filter((i) => !i.voided).forEach((inv) => {
    inv.items.forEach((item) => {
      currPeriodQtyMap[item.productId] = (currPeriodQtyMap[item.productId] || 0) + item.quantity;
    });
  });

  prevPeriodInvoices.filter((i) => !i.voided).forEach((inv) => {
    inv.items.forEach((item) => {
      prevPeriodQtyMap[item.productId] = (prevPeriodQtyMap[item.productId] || 0) + item.quantity;
    });
  });

  let fastestGrowingProduct: ProductVelocityInsightsResult["fastestGrowingProduct"] = null;
  let fastestDecliningProduct: ProductVelocityInsightsResult["fastestDecliningProduct"] = null;

  let maxGrowthPct = -Infinity;
  let maxDropPct = -Infinity;

  products.forEach((p) => {
    const cQ = currPeriodQtyMap[p.id] || 0;
    const pQ = prevPeriodQtyMap[p.id] || 0;

    if (cQ > 0) {
      const growth = pQ > 0 ? Math.round(((cQ - pQ) / pQ) * 100) : cQ * 100;
      if (growth > maxGrowthPct && growth > 0) {
        maxGrowthPct = growth;
        fastestGrowingProduct = { product: p, currQty: cQ, prevQty: pQ, growthPct: growth };
      }
    }

    if (pQ > 0 && cQ < pQ) {
      const drop = Math.round(((pQ - cQ) / pQ) * 100);
      if (drop > maxDropPct && drop > 0) {
        maxDropPct = drop;
        fastestDecliningProduct = { product: p, currQty: cQ, prevQty: pQ, dropPct: drop };
      }
    }
  });

  // Product classification lists
  const neverSoldProducts = products.filter((p) => (productLifetimeSalesMap[p.id]?.txCount || 0) === 0 && p.stock > 0);
  const soldOnceProducts = products.filter((p) => (productLifetimeSalesMap[p.id]?.txCount || 0) === 1);

  const totalStoreMonthsCount = Math.max(1, allMonthsSet.size);
  const soldEveryMonthProducts = products.filter(
    (p) => totalStoreMonthsCount >= 2 && productLifetimeSalesMap[p.id]?.monthsSet.size === totalStoreMonthsCount
  );

  // Dead stock valuation (0 sales in last 90 days or never sold)
  const ninetyDaysAgoMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let deadStockValuation = 0;
  const deadStockProducts: Product[] = [];

  products.forEach((p) => {
    if (p.stock > 0) {
      const txCount = productLifetimeSalesMap[p.id]?.txCount || 0;
      if (txCount === 0) {
        deadStockValuation += p.stock * p.currentCost;
        deadStockProducts.push(p);
      } else {
        const lastSaleInv = validInvs
          .filter((i) => i.items.some((it) => it.productId === p.id))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

        if (lastSaleInv && new Date(lastSaleInv.date).getTime() < ninetyDaysAgoMs) {
          deadStockValuation += p.stock * p.currentCost;
          deadStockProducts.push(p);
        }
      }
    }
  });

  // Inventory Ageing
  const nowMs = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  let b0to30 = 0;
  let b31to60 = 0;
  let b61to90 = 0;
  let b90Plus = 0;

  products.forEach((p) => {
    if (p.stock > 0) {
      const val = p.stock * p.currentCost;
      const createdMs = p.createdAt ? new Date(p.createdAt).getTime() : nowMs;
      const ageDays = Math.max(0, Math.floor((nowMs - createdMs) / oneDay));

      if (ageDays <= 30) b0to30 += val;
      else if (ageDays <= 60) b31to60 += val;
      else if (ageDays <= 90) b61to90 += val;
      else b90Plus += val;
    }
  });

  const totalValuation = b0to30 + b31to60 + b61to90 + b90Plus;

  return {
    fastestGrowingProduct,
    fastestDecliningProduct,
    neverSoldProducts: neverSoldProducts.slice(0, 8),
    deadStockProducts: deadStockProducts,
    soldOnceProducts: soldOnceProducts.slice(0, 8),
    soldEveryMonthProducts: soldEveryMonthProducts.slice(0, 8),
    deadStockValuation,
    inventoryAgeing: {
      bucket0to30: b0to30,
      bucket31to60: b31to60,
      bucket61to90: b61to90,
      bucket90Plus: b90Plus,
      totalValuation,
    },
  };
}

export interface CustomerInsightsExtendedResult {
  mostLoyalCustomer: { customer: Customer; visitCount: number } | null;
  highestLtvCustomer: { customer: Customer; revenue: number } | null;
  highestDebtCustomer: { customer: Customer; debt: number } | null;
  inactiveOver90DaysCount: number;
  newCustomersInPeriodCount: number;
  returningCustomersInPeriodCount: number;
  avgSpendPerCustomer: number;
  repeatPurchasePct: number;
}

export function calculateCustomerInsightsExtended(
  customers: Customer[],
  filteredInvoices: Invoice[],
  allInvoices: Invoice[]
): CustomerInsightsExtendedResult {
  const validInvs = allInvoices.filter((i) => !i.voided);
  const periodInvs = filteredInvoices.filter((i) => !i.voided);

  // Most Loyal & Highest LTV
  const custRevenueMap: Record<string, number> = {};
  const custOrderCountMap: Record<string, number> = {};
  const custFirstInvoiceMsMap: Record<string, number> = {};

  validInvs.forEach((inv) => {
    if (inv.customerId) {
      custRevenueMap[inv.customerId] = (custRevenueMap[inv.customerId] || 0) + inv.total;
      custOrderCountMap[inv.customerId] = (custOrderCountMap[inv.customerId] || 0) + 1;
      const t = new Date(inv.date).getTime();
      if (!custFirstInvoiceMsMap[inv.customerId] || t < custFirstInvoiceMsMap[inv.customerId]) {
        custFirstInvoiceMsMap[inv.customerId] = t;
      }
    }
  });

  let mostLoyalCustomer: CustomerInsightsExtendedResult["mostLoyalCustomer"] = null;
  let highestLtvCustomer: CustomerInsightsExtendedResult["highestLtvCustomer"] = null;
  let highestDebtCustomer: CustomerInsightsExtendedResult["highestDebtCustomer"] = null;

  customers.forEach((c) => {
    const cnt = custOrderCountMap[c.id] || c.visits || 0;
    const rev = custRevenueMap[c.id] || 0;
    const debt = c.debt || 0;

    if (cnt > 0 && (!mostLoyalCustomer || cnt > mostLoyalCustomer.visitCount)) {
      mostLoyalCustomer = { customer: c, visitCount: cnt };
    }
    if (rev > 0 && (!highestLtvCustomer || rev > highestLtvCustomer.revenue)) {
      highestLtvCustomer = { customer: c, revenue: rev };
    }
    if (debt > 0 && (!highestDebtCustomer || debt > highestDebtCustomer.debt)) {
      highestDebtCustomer = { customer: c, debt };
    }
  });

  // Inactive >90 days
  const ninetyDaysAgoMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const inactiveCount = customers.filter((c) => {
    if (!c.lastVisit) return false;
    const t = new Date(c.lastVisit).getTime();
    return !isNaN(t) && t < ninetyDaysAgoMs && (custRevenueMap[c.id] || 0) > 0;
  }).length;

  // Active Customers in Period
  const activeCustIdsInPeriod = new Set(periodInvs.map((i) => i.customerId).filter(Boolean) as string[]);

  let newCustCount = 0;
  let returningCustCount = 0;

  // Period Boundaries
  let periodStartMs = 0;
  if (periodInvs.length > 0) {
    periodStartMs = Math.min(...periodInvs.map((i) => new Date(i.date).getTime()));
  }

  activeCustIdsInPeriod.forEach((cId) => {
    const firstInvoiceMs = custFirstInvoiceMsMap[cId] || 0;
    if (firstInvoiceMs >= periodStartMs) {
      newCustCount += 1;
    } else {
      returningCustCount += 1;
    }
  });

  const periodBilledTotal = periodInvs.reduce((s, i) => s + i.total, 0);
  const avgSpendPerCustomer = activeCustIdsInPeriod.size > 0 ? Math.round(periodBilledTotal / activeCustIdsInPeriod.size) : 0;
  const repeatPurchasePct = activeCustIdsInPeriod.size > 0 ? Math.round((returningCustCount / activeCustIdsInPeriod.size) * 100) : 0;

  return {
    mostLoyalCustomer,
    highestLtvCustomer,
    highestDebtCustomer,
    inactiveOver90DaysCount: inactiveCount,
    newCustomersInPeriodCount: newCustCount,
    returningCustomersInPeriodCount: returningCustCount,
    avgSpendPerCustomer,
    repeatPurchasePct,
  };
}

export interface SupplierInsightsExtendedResult {
  topSupplierBySpend: { supplier: Supplier; totalSpend: number } | null;
  mostOutstandingSupplier: { supplier: Supplier; due: number } | null;
  mostFrequentSupplier: { supplier: Supplier; count: number } | null;
  avgPurchaseValue: number;
  totalPurchasesInPeriod: number;
  totalPaymentsInPeriod: number;
}

export function calculateSupplierInsightsExtended(
  suppliers: Supplier[],
  purchases: AppState["purchases"] = [],
  supplierPayments: AppState["supplierPayments"] = [],
  filteredInvoices: Invoice[]
): SupplierInsightsExtendedResult {
  const supplierSpendMap: Record<string, { total: number; count: number }> = {};

  purchases.forEach((p) => {
    if (!supplierSpendMap[p.supplierId]) {
      supplierSpendMap[p.supplierId] = { total: 0, count: 0 };
    }
    supplierSpendMap[p.supplierId].total += p.totalAmount || (p.buyPrice * p.quantity);
    supplierSpendMap[p.supplierId].count += 1;
  });

  let topSupplierBySpend: SupplierInsightsExtendedResult["topSupplierBySpend"] = null;
  let mostOutstandingSupplier: SupplierInsightsExtendedResult["mostOutstandingSupplier"] = null;
  let mostFrequentSupplier: SupplierInsightsExtendedResult["mostFrequentSupplier"] = null;

  suppliers.forEach((s) => {
    const spend = supplierSpendMap[s.id]?.total || 0;
    const cnt = supplierSpendMap[s.id]?.count || 0;

    // Due calculation
    const due = purchases
      .filter((p) => p.supplierId === s.id)
      .reduce((sum, p) => sum + (p.dueAmount ?? Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0))), 0);

    if (spend > 0 && (!topSupplierBySpend || spend > topSupplierBySpend.totalSpend)) {
      topSupplierBySpend = { supplier: s, totalSpend: spend };
    }
    if (due > 0 && (!mostOutstandingSupplier || due > mostOutstandingSupplier.due)) {
      mostOutstandingSupplier = { supplier: s, due };
    }
    if (cnt > 0 && (!mostFrequentSupplier || cnt > mostFrequentSupplier.count)) {
      mostFrequentSupplier = { supplier: s, count: cnt };
    }
  });

  const totalSpendAll = purchases.reduce((s, p) => s + (p.totalAmount || (p.buyPrice * p.quantity)), 0);
  const avgPurchaseValue = purchases.length > 0 ? Math.round(totalSpendAll / purchases.length) : 0;

  const totalPayments = (supplierPayments || []).reduce((s, p) => s + p.amount, 0);

  return {
    topSupplierBySpend,
    mostOutstandingSupplier,
    mostFrequentSupplier,
    avgPurchaseValue,
    totalPurchasesInPeriod: totalSpendAll,
    totalPaymentsInPeriod: totalPayments,
  };
}

export interface CashFlowBreakdownResult {
  today: { income: number; expense: number; net: number };
  thisWeek: { income: number; expense: number; net: number };
  thisMonth: { income: number; expense: number; net: number };
}

export function calculateCashFlowBreakdown(
  financeTransactions: FinanceTransaction[] = []
): CashFlowBreakdownResult {
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const todayStr = todayLocalStr();
  const weekStartMs = now.getTime() - 7 * oneDay;
  const monthStartMs = now.getTime() - 30 * oneDay;

  const today = { income: 0, expense: 0, net: 0 };
  const thisWeek = { income: 0, expense: 0, net: 0 };
  const thisMonth = { income: 0, expense: 0, net: 0 };

  financeTransactions.forEach((tx) => {
    const txDateStr = tx.date ? getISTDateStr(tx.date) : "";
    const txMs = new Date(tx.date).getTime();

    if (txDateStr === todayStr) {
      if (tx.type === "Income") today.income += tx.amount;
      else if (tx.type === "Expense") today.expense += tx.amount;
    }
    if (txMs >= weekStartMs) {
      if (tx.type === "Income") thisWeek.income += tx.amount;
      else if (tx.type === "Expense") thisWeek.expense += tx.amount;
    }
    if (txMs >= monthStartMs) {
      if (tx.type === "Income") thisMonth.income += tx.amount;
      else if (tx.type === "Expense") thisMonth.expense += tx.amount;
    }
  });

  today.net = today.income - today.expense;
  thisWeek.net = thisWeek.income - thisWeek.expense;
  thisMonth.net = thisMonth.income - thisMonth.expense;

  return { today, thisWeek, thisMonth };
}

export interface SalesReturnsDetailedResult {
  todayCount: number;
  todayRefundValue: number;
  periodCount: number;
  periodRefundValue: number;
  returnRatePct: number;
  mostReturnedProduct: { product: Product; returnedQty: number } | null;
  largestRefundRecord: { returnRecord: SalesReturn; refundAmount: number } | null;
}

export function calculateSalesReturnsDetailed(
  salesReturns: SalesReturn[],
  filteredInvoices: Invoice[],
  filteredSalesReturns: SalesReturn[],
  products: Product[]
): SalesReturnsDetailedResult {
  const activeSRs = (salesReturns || []).filter((r) => r.status !== "Cancelled");
  const periodSRs = filteredSalesReturns.filter((r) => r.status !== "Cancelled");
  const todayStr = todayLocalStr();

  const todaySRs = activeSRs.filter((r) => (r.createdAt ? getISTDateStr(r.createdAt) : "") === todayStr);

  const todayCount = todaySRs.length;
  const todayRefundValue = todaySRs.reduce((s, r) => s + r.totalRefund, 0);

  const periodCount = periodSRs.length;
  const periodRefundValue = periodSRs.reduce((s, r) => s + r.totalRefund, 0);

  // Return Rate % (returned items / sold items in period)
  const soldQtyInPeriod = filteredInvoices
    .filter((i) => !i.voided)
    .reduce((sum, inv) => sum + inv.items.reduce((s, it) => s + it.quantity, 0), 0);

  const returnedQtyInPeriod = periodSRs.reduce((sum, r) => sum + r.items.reduce((s, ri) => s + ri.quantity, 0), 0);

  const returnRatePct = soldQtyInPeriod > 0 ? Math.round((returnedQtyInPeriod / soldQtyInPeriod) * 1000) / 10 : 0;

  // Most returned product in period
  const productReturnedQtyMap: Record<string, number> = {};
  periodSRs.forEach((r) => {
    r.items.forEach((ri) => {
      productReturnedQtyMap[ri.productId] = (productReturnedQtyMap[ri.productId] || 0) + ri.quantity;
    });
  });

  let mostReturnedProduct: SalesReturnsDetailedResult["mostReturnedProduct"] = null;
  let maxRetQty = 0;

  products.forEach((p) => {
    const q = productReturnedQtyMap[p.id] || 0;
    if (q > maxRetQty) {
      maxRetQty = q;
      mostReturnedProduct = { product: p, returnedQty: q };
    }
  });

  // Largest Refund Record
  const sortedByRefund = [...periodSRs].sort((a, b) => b.totalRefund - a.totalRefund);
  const largestRefundRecord = sortedByRefund[0]
    ? { returnRecord: sortedByRefund[0], refundAmount: sortedByRefund[0].totalRefund }
    : null;

  return {
    todayCount,
    todayRefundValue,
    periodCount,
    periodRefundValue,
    returnRatePct,
    mostReturnedProduct,
    largestRefundRecord,
  };
}

export interface ExplainableInsight {
  title: string;
  type: "positive" | "negative" | "neutral";
  reasons: string[];
}

export function generateExplainableSmartInsights(
  comp: PeriodComparisonResult,
  bestCat: { category: string; percentage: number; revenue: number } | null,
  cashFlow: CashFlowBreakdownResult,
  totalDebt: number,
  inventoryValuation: number,
  deadStockVal: number
): ExplainableInsight[] {
  const insights: ExplainableInsight[] = [];

  // 1. Revenue trajectory multi-bullet explanation
  if (comp.revenueGrowthPct > 0) {
    insights.push({
      title: `Revenue grew by ${comp.revenueGrowthPct}% ${comp.comparisonLabel.toLowerCase()} (₹${comp.currentRevenue.toLocaleString()} vs ₹${comp.previousRevenue.toLocaleString()})`,
      type: "positive",
      reasons: [
        `Invoice volume increased by ${comp.ordersGrowthPct}% (${comp.currentOrders} orders vs ${comp.previousOrders} orders)`,
        `Average Order Value (AOV) shifted by ${comp.aovGrowthPct >= 0 ? "+" : ""}${comp.aovGrowthPct}% (₹${comp.currentAOV.toLocaleString()} vs ₹${comp.previousAOV.toLocaleString()})`,
        bestCat ? `Top performing category "${bestCat.category}" generated ₹${bestCat.revenue.toLocaleString()} (${bestCat.percentage}% of sales)` : "Broad product demand across catalog",
      ],
    });
  } else if (comp.revenueGrowthPct < 0) {
    insights.push({
      title: `Revenue shifted by ${comp.revenueGrowthPct}% ${comp.comparisonLabel.toLowerCase()} (₹${comp.currentRevenue.toLocaleString()} vs ₹${comp.previousRevenue.toLocaleString()})`,
      type: "negative",
      reasons: [
        `Invoices created dropped by ${Math.abs(comp.ordersGrowthPct)}% (${comp.currentOrders} orders vs ${comp.previousOrders} orders)`,
        `Average ticket size changed by ${comp.aovGrowthPct >= 0 ? "+" : ""}${comp.aovGrowthPct}% (₹${comp.currentAOV.toLocaleString()} vs ₹${comp.previousAOV.toLocaleString()})`,
        bestCat ? `Category "${bestCat.category}" remained top contributor with ₹${bestCat.revenue.toLocaleString()}` : "Sales slowed across multiple categories",
      ],
    });
  } else {
    insights.push({
      title: `Revenue remained steady at ₹${comp.currentRevenue.toLocaleString()} across comparison periods`,
      type: "neutral",
      reasons: [
        `Processed ${comp.currentOrders} invoices with consistent order volume`,
        `Average Order Value steady at ₹${comp.currentAOV.toLocaleString()}`,
      ],
    });
  }

  // 2. Cash Flow multi-bullet explanation
  if (cashFlow.thisMonth.net >= 0) {
    insights.push({
      title: `Monthly Cash Inflow exceeded expenses by ₹${cashFlow.thisMonth.net.toLocaleString()}`,
      type: "positive",
      reasons: [
        `Total Cash & Digital Income collected: ₹${cashFlow.thisMonth.income.toLocaleString()}`,
        `Total Operating & Supplier Expenses: ₹${cashFlow.thisMonth.expense.toLocaleString()}`,
        `Net Monthly Cash Surplus: +₹${cashFlow.thisMonth.net.toLocaleString()}`,
      ],
    });
  } else {
    insights.push({
      title: `Monthly Net Outflow exceeded collections by ₹${Math.abs(cashFlow.thisMonth.net).toLocaleString()}`,
      type: "negative",
      reasons: [
        `Total Operational & Supplier Outflow: ₹${cashFlow.thisMonth.expense.toLocaleString()}`,
        `Total Customer Receipts & Inflow: ₹${cashFlow.thisMonth.income.toLocaleString()}`,
        `Net Deficit to cover from liquid cash reserves: ₹${Math.abs(cashFlow.thisMonth.net).toLocaleString()}`,
      ],
    });
  }

  // 3. Customer Debt & Receivables explanation
  insights.push({
    title: `Uncollected Customer Debt: ₹${totalDebt.toLocaleString()}`,
    type: totalDebt > 25000 ? "negative" : "neutral",
    reasons: [
      totalDebt === 0
        ? "All processed customer invoices are 100% paid in full"
        : `Outstanding balances pending across uncollected customer accounts`,
      `Follow-up on top debtor accounts to convert open credit into liquid cash`,
    ],
  });

  // 4. Inventory Capital & Dead Stock explanation
  insights.push({
    title: `Active Warehouse Valuation: ₹${inventoryValuation.toLocaleString()} at cost`,
    type: deadStockVal > 0 ? "neutral" : "positive",
    reasons: [
      `Working capital tied in physical stock: ₹${inventoryValuation.toLocaleString()}`,
      deadStockVal > 0
        ? `₹${deadStockVal.toLocaleString()} tied in dead stock with 0 sales in 90+ days`
        : "Optimal inventory turnover with zero dead stock detected",
    ],
  });

  return insights;
}

// ── 8. Financial Waterfall Calculation ──────────────────────────────────────
export interface FinancialWaterfallResult {
  grossBilled: number;
  returnsRefund: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
}

export function calculateFinancialWaterfall(
  invoices: Invoice[],
  salesReturns: SalesReturn[] = [],
  products: Product[] = []
): FinancialWaterfallResult {
  const validInvoices = invoices.filter((i) => !i.voided);
  const activeReturns = salesReturns.filter((r) => r.status !== "Cancelled");

  const grossBilled = validInvoices.reduce((sum, inv) => sum + inv.total, 0);
  const returnsRefund = activeReturns.reduce((sum, r) => sum + r.totalRefund, 0);
  const netRevenue = calculateRevenue(validInvoices, activeReturns);
  const cogs = calculateCOGS(validInvoices, activeReturns, products);
  const grossProfit = Math.round((netRevenue - cogs) * 100) / 100;
  const marginPct = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 1000) / 10 : 0;

  return {
    grossBilled: Math.round(grossBilled * 100) / 100,
    returnsRefund: Math.round(returnsRefund * 100) / 100,
    netRevenue,
    cogs,
    grossProfit,
    marginPct,
  };
}

