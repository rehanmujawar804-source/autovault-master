"use client";

import { useMemo, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toLocalDateStr, todayLocalStr } from "@/lib/dateUtils";
import { calculateRevenue } from "@/lib/revenueUtils";
import { calculateProfit } from "@/lib/profitUtils";
import StatCard from "@/components/StatCard";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import {
  TrendingUp,
  Wallet,
  AlertCircle,
  Package,
  ReceiptText,
  Users,
  ShoppingCart,
  ArrowRight,
  Printer,
  Calendar,
  ChevronDown,
  Coins,
  Smartphone,
  CreditCard,
  CheckCircle,
  X,
  FileSpreadsheet,
  Activity,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  ANALYTICS / BUSINESS INTELLIGENCE PAGE
// ─────────────────────────────────────────────────────────────────────────────

type TimeRange = "Today" | "Week" | "Month" | "Quarter" | "Year" | "All" | "Custom";

/** Extended point type for Quarter/Year grouping modes */
type TrendPoint = {
  label: string;
  dateStr: string;
  sales: number;
  profit: number;
  _startTime?: number;
  _endTime?: number;
  _year?: number;
  _month?: number;
};

export default function AnalyticsPage() {
  const router = useRouter();
  const { isOwner, loading, requireOwner } = useRole();
  const { state, getInventoryValue, getInvoiceOutstanding } = useStore();

  // ── States ────────────────────────────────────────────────────────────────
  const [timeRange, setTimeRange] = useState<TimeRange>("All");
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    const thirtyAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    return toLocalDateStr(thirtyAgo);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return toLocalDateStr(new Date());
  });
  const [showCustomDates, setShowCustomDates] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [inventoryAlertTab, setInventoryAlertTab] = useState<"out" | "low">("out");

  // SVG Area Chart Hover Index State
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // ── Owner-only guard ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading) requireOwner();
  }, [loading, requireOwner]);


  // ── Date Filtering Helper ─────────────────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    const invoices = state.invoices.filter((inv) => !inv.voided);
    const todayStr = todayLocalStr();
    const [tYear, tMonth, tDay] = todayStr.split("-").map(Number);
    const todayTime = Date.UTC(tYear, tMonth - 1, tDay);
    const oneDay = 24 * 60 * 60 * 1000;

    return invoices.filter((inv) => {
      const [year, month, day] = inv.date.split("-").map(Number);
      const invTime = Date.UTC(year, month - 1, day);

      if (timeRange === "Today") {
        return inv.date === todayStr;
      }
      if (timeRange === "Week") {
        return invTime >= todayTime - 6 * oneDay && invTime <= todayTime;
      }
      if (timeRange === "Month") {
        return invTime >= todayTime - 29 * oneDay && invTime <= todayTime;
      }
      if (timeRange === "Quarter") {
        return invTime >= todayTime - 89 * oneDay && invTime <= todayTime;
      }
      if (timeRange === "Year") {
        return invTime >= todayTime - 364 * oneDay && invTime <= todayTime;
      }
      if (timeRange === "Custom") {
        const start = startDate ? (() => {
          const [sY, sM, sD] = startDate.split("-").map(Number);
          return Date.UTC(sY, sM - 1, sD);
        })() : 0;
        const end = endDate ? (() => {
          const [eY, eM, eD] = endDate.split("-").map(Number);
          return Date.UTC(eY, eM - 1, eD);
        })() : Infinity;
        return invTime >= start && invTime <= end;
      }
      return true; // All Time
    });
  }, [state.invoices, timeRange, startDate, endDate]);

  const filteredSalesReturns = useMemo(() => {
    const returns = (state.salesReturns || []).filter((r) => r.status !== "Cancelled");
    const todayStr = todayLocalStr();
    const [tYear, tMonth, tDay] = todayStr.split("-").map(Number);
    const todayTime = Date.UTC(tYear, tMonth - 1, tDay);
    const oneDay = 24 * 60 * 60 * 1000;

    return returns.filter((r) => {
      const rLocalDateStr = toLocalDateStr(r.createdAt);
      if (!rLocalDateStr) return false;
      const [year, month, day] = rLocalDateStr.split("-").map(Number);
      const rTime = Date.UTC(year, month - 1, day);

      if (timeRange === "Today") {
        return rLocalDateStr === todayStr;
      }
      if (timeRange === "Week") {
        return rTime >= todayTime - 6 * oneDay && rTime <= todayTime;
      }
      if (timeRange === "Month") {
        return rTime >= todayTime - 29 * oneDay && rTime <= todayTime;
      }
      if (timeRange === "Quarter") {
        return rTime >= todayTime - 89 * oneDay && rTime <= todayTime;
      }
      if (timeRange === "Year") {
        return rTime >= todayTime - 364 * oneDay && rTime <= todayTime;
      }
      if (timeRange === "Custom") {
        const start = startDate ? (() => {
          const [sY, sM, sD] = startDate.split("-").map(Number);
          return Date.UTC(sY, sM - 1, sD);
        })() : 0;
        const end = endDate ? (() => {
          const [eY, eM, eD] = endDate.split("-").map(Number);
          return Date.UTC(eY, eM - 1, eD);
        })() : Infinity;
        return rTime >= start && rTime <= end;
      }
      return true; // All Time
    });
  }, [state.salesReturns, timeRange, startDate, endDate]);

  // ── Derived Metrics (dynamic based on timeRange) ─────────────────────────
  const data = useMemo(() => {
    const products = state.products;
    const customers = state.customers;

    // Financial KPIs
    const totalBilled = filteredInvoices.reduce((s, i) => s + i.total, 0);
    const totalRevenue = calculateRevenue(filteredInvoices, filteredSalesReturns);
    const totalDebt = filteredInvoices.reduce((s, i) => s + getInvoiceOutstanding(i), 0);

    const totalProfit = calculateProfit(filteredInvoices, filteredSalesReturns, products);

    const avgOrderValue = filteredInvoices.length > 0 ? Math.round(totalBilled / filteredInvoices.length) : 0;

    // Payment method shares
    const paymentMethods = ["Cash", "UPI", "Card", "Credit"] as const;
    const methodData = paymentMethods.map((method) => {
      const methodInvs = filteredInvoices.filter((i) => i.paymentMethod === method);
      return {
        method,
        count: methodInvs.length,
        total: methodInvs.reduce((s, i) => s + i.amountPaid, 0),
      };
    });

    // Invoice Status segments
    const statusData = [
      {
        label: "Paid",
        count: filteredInvoices.filter((i) => i.paymentStatus === "Paid").length,
        amount: filteredInvoices.filter((i) => i.paymentStatus === "Paid").reduce((s, i) => s + i.total, 0),
        color: "bg-green-500",
        textColor: "text-green-700",
        bgColor: "bg-green-50",
        border: "border-green-200",
      },
      {
        label: "Partial",
        count: filteredInvoices.filter((i) => i.paymentStatus === "Partial").length,
        amount: filteredInvoices.filter((i) => i.paymentStatus === "Partial").reduce((s, i) => s + i.total, 0),
        color: "bg-orange-500",
        textColor: "text-orange-700",
        bgColor: "bg-orange-50",
        border: "border-orange-200",
      },
      {
        label: "Debt",
        count: filteredInvoices.filter((i) => i.paymentStatus === "Debt").length,
        amount: filteredInvoices.filter((i) => i.paymentStatus === "Debt").reduce((s, i) => s + i.total, 0),
        color: "bg-red-500",
        textColor: "text-red-700",
        bgColor: "bg-red-50",
        border: "border-red-200",
      },
    ];

    // Top Products sold in range
    const productSalesMap: Record<
      string,
      { name: string; brand: string; qty: number; revenue: number; profit: number }
    > = {};
    filteredInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        if (!productSalesMap[item.productId]) {
          const p = products.find((pr) => pr.id === item.productId);
          productSalesMap[item.productId] = {
            name: item.name,
            brand: p?.brand ?? "Unknown",
            qty: 0,
            revenue: 0,
            profit: 0,
          };
        }
        productSalesMap[item.productId].qty += item.quantity;
      });
    });

    filteredSalesReturns.forEach((r) => {
      r.items.forEach((ri) => {
        if (productSalesMap[ri.productId]) {
          productSalesMap[ri.productId].qty -= ri.quantity;
        }
      });
    });

    Object.keys(productSalesMap).forEach((productId) => {
      const pInvs = filteredInvoices.filter((inv) => inv.items.some((item) => item.productId === productId));
      const pReturns = filteredSalesReturns.filter((r) => r.items.some((item) => item.productId === productId));
      productSalesMap[productId].revenue = calculateRevenue(pInvs, pReturns, productId);
      productSalesMap[productId].profit = calculateProfit(pInvs, pReturns, products, productId);
    });

    const topProducts = Object.entries(productSalesMap)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // Categories performance in range
    const categoryMap: Record<string, { revenue: number; qty: number }> = {};
    filteredInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        const product = products.find((p) => p.id === item.productId);
        const cat = product?.category ?? "Accessories";
        if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, qty: 0 };
        categoryMap[cat].qty += item.quantity;
      });
    });

    filteredSalesReturns.forEach((r) => {
      r.items.forEach((ri) => {
        const product = products.find((p) => p.id === ri.productId);
        const cat = product?.category ?? "Accessories";
        if (categoryMap[cat]) {
          categoryMap[cat].qty -= ri.quantity;
        }
      });
    });

    Object.keys(categoryMap).forEach((cat) => {
      const catProducts = products.filter((p) => p.category === cat);
      const catProductIds = new Set(catProducts.map((p) => p.id));
      
      const catInvs = filteredInvoices.filter((inv) => inv.items.some((item) => catProductIds.has(item.productId)));
      const catReturns = filteredSalesReturns.filter((r) => r.items.some((item) => catProductIds.has(item.productId)));
      
      let catRevenue = 0;
      catProducts.forEach((p) => {
        catRevenue += calculateRevenue(
          catInvs.filter((inv) => inv.items.some((item) => item.productId === p.id)),
          catReturns.filter((r) => r.items.some((item) => item.productId === p.id)),
          p.id
        );
      });
      categoryMap[cat].revenue = catRevenue;
    });

    const categoryData = Object.entries(categoryMap)
      .map(([cat, v]) => ({ cat, ...v }))
      .sort((a, b) => b.revenue - a.revenue);

    // Outstanding debt customers (filtered in range if invoice had due)
    const debtInvs = filteredInvoices.filter((i) => getInvoiceOutstanding(i) > 0);
    const debtorMap: Record<string, { name: string; phone: string; debt: number }> = {};
    debtInvs.forEach((inv) => {
      if (inv.customerId) {
        if (!debtorMap[inv.customerId]) {
          debtorMap[inv.customerId] = { name: inv.customer, phone: inv.customerPhone ?? "", debt: 0 };
        }
        debtorMap[inv.customerId].debt += getInvoiceOutstanding(inv);
      }
    });
    const debtCustomers = Object.entries(debtorMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.debt - a.debt);

    // Top Customers in range by totalSpent (billed)
    const spenderMap: Record<string, { name: string; visits: number; spent: number }> = {};
    filteredInvoices.forEach((inv) => {
      const cId = inv.customerId || `walkin-${inv.customer}`;
      if (!spenderMap[cId]) {
        spenderMap[cId] = { name: inv.customer, visits: 0, spent: 0 };
      }
      spenderMap[cId].visits += 1;
    });

    Object.keys(spenderMap).forEach((cId) => {
      const customerInvs = filteredInvoices.filter((inv) => (inv.customerId || `walkin-${inv.customer}`) === cId);
      const customerReturns = filteredSalesReturns.filter((r) => {
        const rCustId = r.customerId || `walkin-${state.invoices.find((i) => i.id === r.invoiceId)?.customer}`;
        return rCustId === cId;
      });
      spenderMap[cId].spent = calculateRevenue(customerInvs, customerReturns);
    });

    const topCustomers = Object.entries(spenderMap)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5);

    // Low stock / out of stock
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold);
    const outOfStock = products.filter((p) => p.stock === 0);

    // Product margins (static ranking)
    const productMargins = products
      .map((p) => ({
        ...p,
        margin: p.sellPrice > 0 ? Math.round(((p.sellPrice - p.currentCost) / p.sellPrice) * 100) : 0,
      }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5);

    // Returns Analysis
    const activeReturns = (state.salesReturns || []).filter((r) => r.status !== "Cancelled");
    const totalItemsSold = filteredInvoices.reduce((sum, inv) => {
      return sum + inv.items.reduce((s, it) => s + it.quantity, 0);
    }, 0);
    const totalItemsReturned = activeReturns.reduce((sum, r) => {
      return sum + r.items.reduce((s, it) => s + it.quantity, 0);
    }, 0);
    const totalRefundAmount = activeReturns.reduce((sum, r) => sum + r.totalRefund, 0);
    const overallReturnRate = totalItemsSold > 0 ? Math.round((totalItemsReturned / totalItemsSold) * 1000) / 10 : 0;

    const productReturnRates = products
      .map((p) => {
        const soldQty = filteredInvoices.reduce((sum, inv) => {
          const item = inv.items.find((it) => it.productId === p.id);
          return sum + (item?.quantity ?? 0);
        }, 0);
        const returnedQty = activeReturns.reduce((sum, r) => {
          const item = r.items.find((ri) => ri.productId === p.id);
          return sum + (item?.quantity ?? 0);
        }, 0);
        const rate = soldQty > 0 ? Math.round((returnedQty / soldQty) * 1000) / 10 : 0;
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          soldQty,
          returnedQty,
          rate,
        };
      })
      .filter((p) => p.returnedQty > 0)
      .sort((a, b) => b.rate - a.rate || b.returnedQty - a.returnedQty)
      .slice(0, 5);

    const customerReturnRates = customers
      .map((c) => {
        const customerInvoices = filteredInvoices.filter((inv) => inv.customerId === c.id);
        const soldQty = customerInvoices.reduce((sum, inv) => {
          return sum + inv.items.reduce((s, it) => s + it.quantity, 0);
        }, 0);
        const returnedQty = activeReturns
          .filter((r) => r.customerId === c.id)
          .reduce((sum, r) => {
            return sum + r.items.reduce((s, it) => s + it.quantity, 0);
          }, 0);
        const rate = soldQty > 0 ? Math.round((returnedQty / soldQty) * 1000) / 10 : 0;
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          soldQty,
          returnedQty,
          rate,
        };
      })
      .filter((c) => c.returnedQty > 0)
      .sort((a, b) => b.rate - a.rate || b.returnedQty - a.returnedQty)
      .slice(0, 5);

    return {
      totalBilled,
      totalRevenue,
      totalDebt,
      totalProfit,
      avgOrderValue,
      methodData,
      statusData,
      topProducts,
      categoryData,
      topCustomers,
      debtCustomers,
      lowStock,
      outOfStock,
      productMargins,
      totalItemsSold,
      totalItemsReturned,
      totalRefundAmount,
      overallReturnRate,
      productReturnRates,
      customerReturnRates,
    };
  }, [filteredInvoices, filteredSalesReturns, state]);

  // ── Sales Trend Calculations ─────────────────────────────────────────────
  const { salesLinePath, salesAreaPath, profitLinePath, profitAreaPath, trendPoints, maxChartVal } = useMemo(() => {
    const todayStr = todayLocalStr();
    const [tYear, tMonth, tDay] = todayStr.split("-").map(Number);
    const todayUTC = new Date(Date.UTC(tYear, tMonth - 1, tDay));
    const oneDay = 24 * 60 * 60 * 1000;

    const points: TrendPoint[] = [];

    if (timeRange === "Week") {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(todayUTC.getTime() - i * oneDay);
        const dateStr = d.toISOString().split("T")[0];
        const label = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }).format(d);
        points.push({ label, dateStr, sales: 0, profit: 0 });
      }
    } else if (timeRange === "Month") {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(todayUTC.getTime() - i * oneDay);
        const dateStr = d.toISOString().split("T")[0];
        const label = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }).format(d);
        points.push({ label, dateStr, sales: 0, profit: 0 });
      }
    } else if (timeRange === "Quarter") {
      for (let i = 11; i >= 0; i--) {
        const startOfWeek = new Date(todayUTC.getTime() - (i * 7 + 6) * oneDay);
        const endOfWeek = new Date(todayUTC.getTime() - i * 7 * oneDay);
        const label = `${new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric" }).format(startOfWeek)} - ${new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }).format(endOfWeek)}`;
        points.push({
          label,
          dateStr: `W-${i}`,
          sales: 0,
          profit: 0,
          _startTime: startOfWeek.getTime(),
          _endTime: endOfWeek.getTime() + oneDay,
        } as TrendPoint);
      }
    } else if (timeRange === "Year") {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth() - i, 1));
        const label = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "short", year: "2-digit" }).format(d);
        points.push({
          label,
          dateStr: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
          sales: 0,
          profit: 0,
          _year: d.getUTCFullYear(),
          _month: d.getUTCMonth(),
        } as TrendPoint);
      }
    } else if (timeRange === "Custom" && startDate && endDate) {
      const [sY, sM, sD] = startDate.split("-").map(Number);
      const start = new Date(Date.UTC(sY, sM - 1, sD));
      const [eY, eM, eD] = endDate.split("-").map(Number);
      const end = new Date(Date.UTC(eY, eM - 1, eD));
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / oneDay);
      const step = Math.max(1, Math.ceil(diffDays / 20));

      for (let i = 0; i <= diffDays; i += step) {
        const d = new Date(start.getTime() + i * oneDay);
        const dateStr = d.toISOString().split("T")[0];
        const label = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }).format(d);
        points.push({ label, dateStr, sales: 0, profit: 0 });
      }
    } else {
      // Today or All Time default: group by invoice dates
      const dates = Array.from(new Set(filteredInvoices.map((inv) => inv.date))).sort();
      if (dates.length <= 1) {
        const [bY, bM, bD] = (dates[0] || todayStr).split("-").map(Number);
        const baseDate = new Date(Date.UTC(bY, bM - 1, bD));
        for (let i = 4; i >= 0; i--) {
          const d = new Date(baseDate.getTime() - i * oneDay);
          const dateStr = d.toISOString().split("T")[0];
          const label = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }).format(d);
          points.push({ label, dateStr, sales: 0, profit: 0 });
        }
      } else {
        dates.forEach((dStr) => {
          const [dY, dM, dD] = dStr.split("-").map(Number);
          const d = new Date(Date.UTC(dY, dM - 1, dD));
          const label = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }).format(d);
          points.push({ label, dateStr: dStr, sales: 0, profit: 0 });
        });
      }
    }

    // Populate trend values — revenue via canonical calculateRevenue() per bucket
    // filteredInvoices already excludes voided; filteredSalesReturns already excludes cancelled.
    // We slice each collection to the bucket's date window, then delegate to calculateRevenue().
    points.forEach((p) => {
      // ── Slice invoices for this bucket ──────────────────────────────────────
      let bucketInvoices = filteredInvoices.filter((inv) => {
        const [invY, invM, invD] = inv.date.split("-").map(Number);
        const invTime = Date.UTC(invY, invM - 1, invD);
        if (timeRange === "Quarter" && p._startTime !== undefined) {
          return invTime >= p._startTime && invTime < (p._endTime ?? 0);
        } else if (timeRange === "Year" && p._year !== undefined) {
          return invY === p._year && (invM - 1) === p._month;
        } else {
          return inv.date === p.dateStr;
        }
      });

      // ── Slice returns for this bucket ────────────────────────────────────────
      let bucketReturns = filteredSalesReturns.filter((r) => {
        const [rY, rM, rD] = toLocalDateStr(r.createdAt).split("-").map(Number);
        const rTime = Date.UTC(rY, rM - 1, rD);
        const rLocalDateStr = toLocalDateStr(r.createdAt);
        if (timeRange === "Quarter" && p._startTime !== undefined) {
          return rTime >= p._startTime && rTime < (p._endTime ?? 0);
        } else if (timeRange === "Year" && p._year !== undefined) {
          return rY === p._year && (rM - 1) === p._month;
        } else {
          return rLocalDateStr === p.dateStr;
        }
      });

      // ── Canonical revenue: Σ(inv.total) − Σ(active r.totalRefund) ───────────
      p.sales = calculateRevenue(bucketInvoices, bucketReturns);

      // ── Canonical profit: calculateProfit(bucketInvoices, bucketReturns, products) ─────
      p.profit = calculateProfit(bucketInvoices, bucketReturns, state.products);
    });

    const maxSales = Math.max(...points.map((p) => p.sales), 1000);
    const maxProfit = Math.max(...points.map((p) => p.profit), 500);
    const maxChartVal = Math.max(maxSales, maxProfit) * 1.15;

    let sLine = "";
    let sArea = "";
    let pLine = "";
    let pArea = "";

    if (points.length > 0) {
      points.forEach((p, idx) => {
        const x = 40 + (idx / (points.length - 1 || 1)) * 545;
        const ySales = 190 - (p.sales / maxChartVal) * 170;
        const yProfit = 190 - (p.profit / maxChartVal) * 170;

        if (idx === 0) {
          sLine = `M ${x} ${ySales}`;
          sArea = `M ${x} 190 L ${x} ${ySales}`;
          pLine = `M ${x} ${yProfit}`;
          pArea = `M ${x} 190 L ${x} ${yProfit}`;
        } else {
          sLine += ` L ${x} ${ySales}`;
          sArea += ` L ${x} ${ySales}`;
          pLine += ` L ${x} ${yProfit}`;
          pArea += ` L ${x} ${yProfit}`;
        }
      });

      const lastX = 40 + 545;
      sArea += ` L ${lastX} 190 Z`;
      pArea += ` L ${lastX} 190 Z`;
    }

    return {
      salesLinePath: sLine,
      salesAreaPath: sArea,
      profitLinePath: pLine,
      profitAreaPath: pArea,
      trendPoints: points,
      maxChartVal,
    };
  }, [filteredInvoices, filteredSalesReturns, timeRange, startDate, endDate, state.products]);

  // ── Donut Chart Data Calculations ─────────────────────────────────────────
  const { donutSlices, totalMethodAmount } = useMemo(() => {
    const total = data.methodData.reduce((s, m) => s + m.total, 0);
    let cumulative = 0;
    const colors: Record<string, string> = {
      Cash: "#10b981",
      UPI: "#3b82f6",
      Card: "#a855f7",
      Credit: "#ef4444",
    };

    const slices = data.methodData.map((m) => {
      const pct = total > 0 ? m.total / total : 0;
      const strokeLength = pct * 314.16;
      const strokeOffset = -cumulative * 314.16;
      cumulative += pct;
      return {
        ...m,
        pct,
        strokeLength,
        strokeOffset,
        color: colors[m.method] || "#94a3b8",
      };
    });

    return { donutSlices: slices, totalMethodAmount: total };
  }, [data.methodData]);

  // Handle access guard redirect loading
  if (loading || !isOwner) return null;

  const inventoryValue = getInventoryValue();
  const maxCatRevenue = Math.max(...data.categoryData.map((c) => c.revenue), 1);

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER FUNCTION
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-12 print-hidden">
      
      {/* Dynamic Styling block to format printable container on trigger */}
      {showReport && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            aside, .print-hidden, header, nav, button, .aside-class {
              display: none !important;
            }
            main, .main-content-class {
              padding: 0 !important;
              margin: 0 !important;
              max-width: 100% !important;
            }
            body {
              background: white !important;
              color: black !important;
            }
            .report-print-container {
              position: static !important;
              background: white !important;
              padding: 0 !important;
              margin: 0 !important;
              overflow: visible !important;
              z-index: auto !important;
            }
          }
        `}} />
      )}

      {/* ── Dashboard Top Bar & Filters ────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-navy-950 leading-tight">Analytics & Business Intelligence</h1>
          <p className="text-xs text-slate-500 mt-1">Real-time performance audit, profit metrics, and inventory health tracking</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset range selectors */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
            {([
              { id: "Today", label: "Today" },
              { id: "Week", label: "7D" },
              { id: "Month", label: "30D" },
              { id: "Quarter", label: "90D" },
              { id: "Year", label: "1Y" },
              { id: "All", label: "All-Time" },
            ] as const).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setTimeRange(r.id);
                  setShowCustomDates(false);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  timeRange === r.id && !showCustomDates
                    ? "bg-white text-navy-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Custom Date Range Toggle */}
          <button
            type="button"
            onClick={() => {
              setTimeRange("Custom");
              setShowCustomDates(!showCustomDates);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer shadow-sm ${
              timeRange === "Custom"
                ? "bg-navy-950 text-white border-navy-950"
                : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
            }`}
          >
            <Calendar size={13} />
            Custom
          </button>

          {/* Integrated Business Summary Report generator */}
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 px-4.5 py-2 rounded-xl text-xs font-black text-white bg-green-600 hover:bg-green-700 active:bg-green-800 transition shadow cursor-pointer"
          >
            <Printer size={13} />
            Generate Report
          </button>
        </div>
      </div>

      {/* ── Custom Range Input Panel ────────────────────────────────────────── */}
      {timeRange === "Custom" && showCustomDates && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center gap-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start Date:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 font-medium"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">End Date:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 font-medium"
            />
          </div>
          <p className="text-[10px] text-slate-400 font-semibold font-mono">
            Auditing invoices from {startDate || "earliest"} to {endDate || "latest"}
          </p>
        </div>
      )}

      {/* ── KPI Grid Row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Billed Total"
          value={`₹${data.totalBilled.toLocaleString()}`}
          icon={ReceiptText}
          accent="navy"
          subtitle={`${filteredInvoices.length} invoices generated`}
        />
        <StatCard
          title="Revenue (Collected)"
          value={`₹${data.totalRevenue.toLocaleString()}`}
          icon={TrendingUp}
          accent="green"
          valueClassName="text-green-600"
          subtitle="Cash received in bank/till"
        />
        <StatCard
          title="Net Business Profit"
          value={`₹${data.totalProfit.toLocaleString()}`}
          icon={Wallet}
          accent="green"
          valueClassName="text-emerald-600"
          subtitle={
            data.totalBilled > 0
              ? `${Math.round((data.totalProfit / data.totalBilled) * 100)}% profit margin`
              : "0% average margin"
          }
        />
        <StatCard
          title="Pending Dues (Debt)"
          value={`₹${data.totalDebt.toLocaleString()}`}
          icon={AlertCircle}
          accent="red"
          valueClassName="text-red-600"
          subtitle={`${data.debtCustomers.length} debtor profiles`}
        />
        <StatCard
          title="Avg Order Value"
          value={`₹${data.avgOrderValue.toLocaleString()}`}
          icon={ShoppingCart}
          accent="amber"
          subtitle="Revenue per billing order"
        />
        <StatCard
          title="Warehouse Value"
          value={`₹${inventoryValue.toLocaleString()}`}
          icon={Package}
          accent="navy"
          subtitle="Inventory value at buy cost"
        />
        <StatCard
          title="Low Stock Items"
          value={String(data.lowStock.length)}
          icon={AlertCircle}
          accent="red"
          valueClassName={data.lowStock.length > 0 ? "text-orange-500 font-extrabold animate-pulse" : ""}
          subtitle="Products requiring order"
        />
        <StatCard
          title="Total Customers"
          value={String(state.customers.length)}
          icon={Users}
          accent="blue"
          subtitle="Registered customer profiles"
        />
      </div>

      {/* ── Section: Trend Analysis & Categories ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Sales & Profit Area Chart Container */}
        <SectionCard
          title="Sales & Profit Trend"
          subtitle="Daily sales performance compared with absolute profit margins"
          className="lg:col-span-8 flex flex-col justify-between"
        >
          <div className="relative w-full h-[220px] select-none mt-2">
            {filteredInvoices.length > 0 ? (
              <>
                <svg viewBox="0 0 600 220" width="100%" height="100%" className="overflow-visible">
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f5c518" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#f5c518" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                    const yVal = 20 + ratio * 170;
                    return (
                      <line
                        key={i}
                        x1="40"
                        y1={yVal}
                        x2="585"
                        y2={yVal}
                        stroke="#f1f5f9"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                    );
                  })}

                  {/* Base line */}
                  <line x1="40" y1="190" x2="585" y2="190" stroke="#cbd5e1" strokeWidth="1" />
                  <line x1="40" y1="20" x2="40" y2="190" stroke="#cbd5e1" strokeWidth="0.5" />

                  {/* Paths */}
                  {salesAreaPath && <path d={salesAreaPath} fill="url(#salesGrad)" />}
                  {profitAreaPath && <path d={profitAreaPath} fill="url(#profitGrad)" />}
                  {salesLinePath && (
                    <path
                      d={salesLinePath}
                      fill="none"
                      stroke="#f5c518"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {profitLinePath && (
                    <path
                      d={profitLinePath}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Markers */}
                  {trendPoints.map((p, idx) => {
                    const isHovered = hoveredIdx === idx;
                    const x = 40 + (idx / (trendPoints.length - 1 || 1)) * 545;
                    const ySales = 190 - (p.sales / maxChartVal) * 170;
                    const yProfit = 190 - (p.profit / maxChartVal) * 170;

                    return (
                      <g key={idx}>
                        {isHovered && (
                          <line
                            x1={x}
                            y1="20"
                            x2={x}
                            y2="190"
                            stroke="#64748b"
                            strokeWidth="1.2"
                            strokeDasharray="3 3"
                          />
                        )}
                        {p.sales > 0 && (
                          <circle
                            cx={x}
                            cy={ySales}
                            r={isHovered ? 6 : 4}
                            fill="#f5c518"
                            stroke="#0a121f"
                            strokeWidth="2"
                            className="transition-all duration-150"
                          />
                        )}
                        {p.profit > 0 && (
                          <circle
                            cx={x}
                            cy={yProfit}
                            r={isHovered ? 6 : 4}
                            fill="#10b981"
                            stroke="#0a121f"
                            strokeWidth="2"
                            className="transition-all duration-150"
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* Hover Rect Overlay */}
                  {trendPoints.map((p, idx) => {
                    const x = 40 + (idx / (trendPoints.length - 1 || 1)) * 545;
                    const width = 545 / (trendPoints.length || 1);
                    return (
                      <rect
                        key={idx}
                        x={x - width / 2}
                        y="20"
                        width={width}
                        height="170"
                        fill="transparent"
                        className="cursor-crosshair"
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                      />
                    );
                  })}

                  {/* Y Axis Labels */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                    const val = Math.round(maxChartVal * (1 - ratio));
                    const yVal = 20 + ratio * 170;
                    return (
                      <text
                        key={i}
                        x="32"
                        y={yVal + 3}
                        textAnchor="end"
                        className="text-[9px] font-bold text-slate-400 font-mono"
                      >
                        ₹{val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                      </text>
                    );
                  })}

                  {/* X Axis Labels */}
                  {trendPoints.map((p, idx) => {
                    const showLabel =
                      trendPoints.length <= 10 ||
                      idx === 0 ||
                      idx === trendPoints.length - 1 ||
                      idx % Math.ceil(trendPoints.length / 6) === 0;

                    if (!showLabel) return null;
                    const x = 40 + (idx / (trendPoints.length - 1 || 1)) * 545;
                    return (
                      <text
                        key={idx}
                        x={x}
                        y="205"
                        textAnchor="middle"
                        className="text-[9px] font-bold text-slate-400"
                      >
                        {p.label}
                      </text>
                    );
                  })}
                </svg>

                {/* Float Tooltip */}
                {hoveredIdx !== null && trendPoints[hoveredIdx] && (
                  <div
                    className="absolute z-20 bg-slate-900 border border-slate-700 text-white rounded-xl p-3 shadow-xl text-xs w-44 pointer-events-none"
                    style={{
                      left: `${Math.min(Math.max(10, (hoveredIdx / (trendPoints.length - 1 || 1)) * 100 - 20), 72)}%`,
                      top: "10px",
                    }}
                  >
                    <p className="font-bold text-slate-350 border-b border-slate-750 pb-1 mb-1.5">
                      {trendPoints[hoveredIdx].label}
                    </p>
                    <div className="space-y-1 font-mono">
                      <div className="flex justify-between gap-1">
                        <span className="text-slate-400 font-sans">Billed:</span>
                        <span className="font-bold text-blue-400">₹{trendPoints[hoveredIdx].sales.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-1">
                        <span className="text-slate-400 font-sans">Profit:</span>
                        <span className="font-bold text-green-400">₹{trendPoints[hoveredIdx].profit.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-4">
                <Activity className="text-slate-355 w-8 h-8 mb-1.5 animate-pulse" />
                <p className="font-bold text-slate-500 text-xs">No Billing Records Found</p>
                <p className="text-[10px] text-slate-400 mt-0.5 max-w-xs mx-auto">There are no invoices within the selected date boundaries to visualize sales trends.</p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Category Contribution Progress Bars */}
        <SectionCard
          title="Revenue by Category"
          subtitle="Category sales share in selected period"
          className="lg:col-span-4 flex flex-col justify-between"
        >
          {data.categoryData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-250/60 m-2">
              <Package size={24} className="text-slate-350 mb-2" />
              <p className="text-xs font-bold text-slate-500">No Category Data</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Billing logs will map category shares here.</p>
            </div>
          ) : (
            <div className="space-y-4 my-auto">
              {data.categoryData.slice(0, 5).map((c) => {
                const styles: Record<string, string> = {
                  lights: "bg-amber-500",
                  audio: "bg-blue-500",
                  electronics: "bg-purple-500",
                  accessories: "bg-emerald-500",
                  wipers: "bg-sky-500",
                  tools: "bg-rose-500",
                  care: "bg-teal-500",
                };
                const color = styles[c.cat.toLowerCase()] || "bg-slate-500";
                return (
                  <div key={c.cat} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-700">{c.cat}</span>
                      <span className="text-slate-900">
                        ₹{c.revenue.toLocaleString()}{" "}
                        <span className="text-slate-400 font-normal ml-1">· {c.qty} units</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${color}`}
                        style={{ width: `${(c.revenue / maxCatRevenue) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Section: Cash flow, payment mix & statuses ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Payment mix donut chart + status segments */}
        <SectionCard
          title="Payment Channels & Statuses"
          subtitle="Till cash distribution and invoice payment methods breakdown"
          className="lg:col-span-8"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Left Circular Donut */}
            <div className="md:col-span-6 flex items-center justify-center">
              {totalMethodAmount === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">No payment data in this period.</div>
              ) : (
                <div className="relative flex items-center gap-4">
                  <svg viewBox="0 0 160 160" className="w-36 h-36">
                    {donutSlices.map((slice) => {
                      if (slice.pct === 0) return null;
                      return (
                        <circle
                          key={slice.method}
                          cx="80"
                          cy="80"
                          r="50"
                          fill="transparent"
                          stroke={slice.color}
                          strokeWidth="13"
                          strokeDasharray={`${slice.strokeLength} 314.16`}
                          strokeDashoffset={slice.strokeOffset}
                          transform="rotate(-90 80 80)"
                          className="transition-all duration-200 hover:stroke-[15] cursor-pointer"
                        />
                      );
                    })}
                    <circle cx="80" cy="80" r="41.5" fill="white" />
                    <text x="80" y="76" textAnchor="middle" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Collected
                    </text>
                    <text x="80" y="93" textAnchor="middle" className="text-sm font-black text-slate-800">
                      ₹{totalMethodAmount.toLocaleString()}
                    </text>
                  </svg>

                  {/* Circular legends */}
                  <div className="space-y-1 text-xs">
                    {donutSlices.map((slice) => (
                      <div key={slice.method} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                        <span className="font-semibold text-slate-700 w-12">{slice.method}</span>
                        <span className="text-slate-400 font-medium">({Math.round(slice.pct * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Invoice Statuses split bar */}
            <div className="md:col-span-6 space-y-4 border-l border-slate-100 pl-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice Segment Map</h4>
              <div className="h-5.5 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                {data.statusData.map((s) => {
                  const pct = filteredInvoices.length > 0 ? (s.count / filteredInvoices.length) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={s.label}
                      className={`${s.color} h-full transition-all duration-250 relative group cursor-help`}
                      style={{ width: `${pct}%` }}
                      title={`${s.label}: ${s.count} orders (${Math.round(pct)}%)`}
                    />
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {data.statusData.map((s) => (
                  <div key={s.label} className={`border border-slate-100 rounded-xl p-2.5 text-center ${s.bgColor}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${s.textColor}`}>{s.label}</span>
                    <span className="text-sm font-extrabold text-slate-850 block mt-0.5">{s.count}</span>
                    <span className="text-[10px] text-slate-400 block font-mono">₹{s.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Top customers list */}
        <SectionCard
          title="Top Customers by Spend"
          subtitle="Top customer profiles ranked by spend in range"
          action={{ label: "View all", href: "/customers" }}
          className="lg:col-span-4"
        >
          {data.topCustomers.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No customer spend records in this range.</p>
          ) : (
            <div className="divide-y divide-slate-100 -mx-5 -my-2.5">
              {data.topCustomers.map((c, i) => (
                <Link
                  key={c.id}
                  href={`/customers/${c.id.startsWith("walkin") ? "" : c.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-slate-300 w-4">{i + 1}</span>
                    <div className="w-7 h-7 rounded-full bg-navy-50 text-navy-800 text-xs font-bold flex items-center justify-center shrink-0">
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{c.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{c.visits} visit{c.visits !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-slate-800">₹{c.spent.toLocaleString()}</span>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Section: Outstanding Debts & Stock Health ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Outstanding Receivables */}
        <SectionCard
          title="Outstanding Receivables"
          subtitle="Due balances matching invoices generated in period"
          action={{ label: "Filter debtors", href: "/customers?filter=debt" }}
        >
          {data.debtCustomers.length === 0 ? (
            <div className="text-center py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <span className="text-green-600 font-bold text-xs block">✓ Clear Ledger Balance</span>
              <p className="text-[10px] text-slate-400 mt-0.5">All customer accounts are settled in this timeframe.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-150 rounded-xl px-4 py-2.5 flex justify-between items-center text-xs">
                <span className="text-red-700 font-bold">Uncollected Balance:</span>
                <span className="font-black text-red-700">₹{data.totalDebt.toLocaleString()}</span>
              </div>
              <div className="divide-y divide-slate-100 -mx-5">
                {data.debtCustomers.slice(0, 4).map((c) => (
                  <Link
                    key={c.id}
                    href={`/customers/${c.id}`}
                    className="flex items-center justify-between px-5 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6.5 h-6.5 rounded-full bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center shrink-0">
                        {c.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{c.name}</p>
                        <p className="text-[10px] text-slate-400">{c.phone}</p>
                      </div>
                    </div>
                    <span className="font-extrabold text-xs text-red-600">₹{c.debt.toLocaleString()}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Warehouse Health & Stock Alerts */}
        <SectionCard
          title="Warehouse Health alerts"
          subtitle="Out-of-stock items and low-stock threshold warnings"
        >
          <div className="flex p-1 bg-slate-100 rounded-xl text-xs font-bold mb-4">
            <button
              type="button"
              onClick={() => setInventoryAlertTab("out")}
              className={`flex-1 py-1.5 text-center rounded-lg transition-all cursor-pointer ${
                inventoryAlertTab === "out" ? "bg-white text-red-600 shadow-sm" : "text-slate-500"
              }`}
            >
              Out of Stock ({data.outOfStock.length})
            </button>
            <button
              type="button"
              onClick={() => setInventoryAlertTab("low")}
              className={`flex-1 py-1.5 text-center rounded-lg transition-all cursor-pointer ${
                inventoryAlertTab === "low" ? "bg-white text-orange-600 shadow-sm" : "text-slate-500"
              }`}
            >
              Low Stock ({data.lowStock.length})
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto pr-1 scrollbar-thin">
            {inventoryAlertTab === "out" ? (
              data.outOfStock.length === 0 ? (
                <p className="text-xs text-green-600 font-bold text-center py-6">✓ All items in stock.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.outOfStock.map((p) => (
                    <div key={p.id} className="flex justify-between items-center bg-red-50/50 border border-red-100 rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                        <p className="text-[9px] font-mono text-slate-400 mt-0.5">SKU: {p.sku}</p>
                      </div>
                      <span className="text-[10px] font-extrabold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">OUT</span>
                    </div>
                  ))}
                </div>
              )
            ) : data.lowStock.length === 0 ? (
              <p className="text-xs text-green-600 font-bold text-center py-6">✓ No low stock warnings.</p>
            ) : (
              <div className="space-y-1.5">
                {data.lowStock.map((p) => (
                  <div key={p.id} className="flex justify-between items-center bg-orange-50/50 border border-orange-100 rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                      <p className="text-[9px] font-mono text-slate-400 mt-0.5">SKU: {p.sku} · Threshold: {p.lowStockThreshold}</p>
                    </div>
                    <span className="text-[10px] font-extrabold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{p.stock} left</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Section: Sales Returns & Refunds Analysis ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <SectionCard
          title="Sales Returns & Refunds Analysis"
          subtitle="Returns rates, units returned, and refund valuations in selected period"
          className="lg:col-span-12"
        >
          {/* Summary Strip */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-orange-50/50 border border-orange-100/80 rounded-2xl mb-6">
            <div className="text-center md:text-left">
              <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Overall Return Rate</span>
              <span className="text-2xl font-black text-orange-800 block mt-1">{data.overallReturnRate}%</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">By unit volume sold ({data.totalItemsReturned} / {data.totalItemsSold})</span>
            </div>
            <div className="text-center md:text-left border-t md:border-t-0 md:border-l border-orange-100 pt-3 md:pt-0 md:pl-6">
              <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Total Refunds Issued</span>
              <span className="text-2xl font-black text-orange-800 block mt-1">₹{data.totalRefundAmount.toLocaleString()}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Cash, UPI, Bank, and adjustments</span>
            </div>
            <div className="text-center md:text-left border-t md:border-t-0 md:border-l border-orange-100 pt-3 md:pt-0 md:pl-6">
              <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Items Returned</span>
              <span className="text-2xl font-black text-orange-800 block mt-1">{data.totalItemsReturned} units</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Restored to warehouse stock</span>
            </div>
            <div className="text-center md:text-left border-t md:border-t-0 md:border-l border-orange-100 pt-3 md:pt-0 md:pl-6">
              <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Active Return Records</span>
              <span className="text-2xl font-black text-orange-800 block mt-1">
                {(state.salesReturns || []).filter((r) => r.status !== "Cancelled").length} records
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Excludes voided transactions</span>
            </div>
          </div>

          {/* Sub Grid for Product and Customer lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Return Rate by Product */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Package size={15} className="text-orange-500" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Return Rate by Product</h3>
              </div>
              {data.productReturnRates.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No product returns recorded in selected timeframe.</p>
              ) : (
                <div className="space-y-3">
                  {data.productReturnRates.map((p) => (
                    <div key={p.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-slate-800 truncate max-w-[60%]">{p.name}</span>
                        <span className="font-bold text-slate-900 font-mono">
                          {p.rate}% <span className="text-slate-400 font-normal ml-1">({p.returnedQty} / {p.soldQty} units)</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(p.rate, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Return Rate by Customer */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Users size={15} className="text-orange-500" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Return Rate by Customer</h3>
              </div>
              {data.customerReturnRates.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No customer returns recorded in selected timeframe.</p>
              ) : (
                <div className="space-y-3">
                  {data.customerReturnRates.map((c) => (
                    <div key={c.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-slate-800 truncate max-w-[60%]">{c.name}</span>
                        <span className="font-bold text-slate-900 font-mono">
                          {c.rate}% <span className="text-slate-400 font-normal ml-1">({c.returnedQty} / {c.soldQty} units)</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-400 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(c.rate, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Section: Product Margins & Ledger Table ─────────────────────────── */}
      <SectionCard
        title="Accessory Profitability Ledger"
        subtitle="Ranked view of the products driving the highest margins"
      >
        <div className="overflow-x-auto -mx-5 -mb-5 mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-y border-slate-100">
                <th className="px-5 py-3 text-left">#</th>
                <th className="px-5 py-3 text-left">Product</th>
                <th className="px-5 py-3 text-left">Category</th>
                <th className="px-5 py-3 text-right">Cost (Buy)</th>
                <th className="px-5 py-3 text-right">Retail (Sell)</th>
                <th className="px-5 py-3 text-right">Margin</th>
                <th className="px-5 py-3 text-center">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.productMargins.map((p, i) => (
                <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-2.5 text-xs text-slate-450 font-mono">{i + 1}</td>
                  <td className="px-5 py-2.5 font-bold text-slate-800 text-xs">{p.name}</td>
                  <td className="px-5 py-2.5 text-slate-500 text-xs">{p.category}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-slate-500 text-xs">₹{p.currentCost.toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-right font-mono font-bold text-slate-800 text-xs">₹{p.sellPrice.toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-right">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      p.margin >= 30 ? "bg-green-100 text-green-700" : p.margin >= 15 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"
                    }`}>
                      {p.margin}%
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-center font-bold text-xs text-slate-650 font-mono">{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════════════
          INTEGRATED REPORT PRINT PREVIEW SCREEN
      ══════════════════════════════════════════════════════════════════════ */}
      {showReport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto px-4 py-8 print:p-0 print:bg-white print:static report-print-container">
          <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden print:border-none print:shadow-none print:rounded-none">
            
            {/* Print action header (hidden on physical print output) */}
            <div className="flex justify-between items-center px-6 py-4 bg-slate-50 border-b border-slate-150 print-hidden">
              <button
                type="button"
                onClick={() => setShowReport(false)}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 border border-slate-200 bg-white px-3.5 py-2 rounded-xl transition cursor-pointer"
              >
                <ArrowRight size={13} className="rotate-180" />
                Back to Dashboard
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 text-xs font-black text-white bg-green-600 hover:bg-green-700 px-4.5 py-2.5 rounded-xl transition shadow cursor-pointer"
              >
                <Printer size={14} />
                Print Summary Report
              </button>
            </div>

            {/* Document body (Scales to standard A4 printing sizes) */}
            <div className="p-8 sm:p-12 space-y-8 print:p-0">
              
              {/* Report Document Title and Date stamps */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-6">
                <div>
                  <h1 className="text-2xl font-black text-navy-950">7 Star Car Accessories</h1>
                  <p className="text-sm text-slate-500 font-semibold mt-0.5">AutoVault Business Management Summary</p>
                  <p className="text-xs text-slate-450 mt-0.5 font-mono">System ID: autovault-7star-accessories</p>
                </div>
                <div className="text-right">
                  <h2 className="text-sm font-extrabold text-slate-500 uppercase tracking-widest">Business Report</h2>
                  <p className="text-xs font-black text-slate-700 mt-1">
                    Period: {timeRange === "Custom"
                      ? `${new Date(startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} - ${new Date(endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                      : timeRange === "All"
                      ? "All-Time Business Summary"
                      : `${timeRange} Auditing`}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Generated: {new Date().toLocaleString("en-IN")}</p>
                </div>
              </div>

              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-4">
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Billed</span>
                  <span className="text-xl font-extrabold text-slate-900 block mt-1">₹{data.totalBilled.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">{filteredInvoices.length} invoices issued</span>
                </div>
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cash Collected</span>
                  <span className="text-xl font-extrabold text-green-600 block mt-1">₹{data.totalRevenue.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">{Math.round((data.totalRevenue / (data.totalBilled || 1)) * 100)}% payment capture</span>
                </div>
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Net Profit Margin</span>
                  <span className="text-xl font-extrabold text-emerald-600 block mt-1">₹{data.totalProfit.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">{data.totalBilled > 0 ? `${Math.round((data.totalProfit / data.totalBilled) * 100)}% average margin` : "0% net margin"}</span>
                </div>
              </div>

              {/* Debt & Receivables ledger */}
              <div className="grid grid-cols-2 gap-6 pt-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 pb-1.5 border-b">Receivables Statement</h3>
                  {data.debtCustomers.length === 0 ? (
                    <p className="text-xs text-green-600 font-semibold py-2">✓ No pending debts recorded in this timeframe.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-bold text-red-700 bg-red-50 p-2.5 rounded-lg mb-1">
                        <span>Total Uncollected:</span>
                        <span>₹{data.totalDebt.toLocaleString()}</span>
                      </div>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-slate-400 text-left border-b font-medium">
                            <th className="pb-1 font-semibold">Customer</th>
                            <th className="pb-1 font-semibold">Phone</th>
                            <th className="pb-1 text-right font-semibold">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.debtCustomers.slice(0, 6).map((c) => (
                            <tr key={c.id} className="border-b last:border-0">
                              <td className="py-2 font-bold text-slate-800">{c.name}</td>
                              <td className="py-2 text-slate-500">{c.phone}</td>
                              <td className="py-2 text-right font-bold text-red-600">₹{c.debt.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 pb-1.5 border-b">Payment Method mix</h3>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-slate-400 text-left border-b font-medium">
                        <th className="pb-1 font-semibold">Method</th>
                        <th className="pb-1 text-center font-semibold">Transactions</th>
                        <th className="pb-1 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.methodData.map((m) => (
                        <tr key={m.method} className="border-b last:border-0">
                          <td className="py-2 font-bold text-slate-800">{m.method}</td>
                          <td className="py-2 text-center text-slate-500">{m.count}</td>
                          <td className="py-2 text-right font-black text-slate-700">₹{m.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Product and Category Sales leaderboards */}
              <div className="grid grid-cols-2 gap-6 pt-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 pb-1.5 border-b">Product movement leaders</h3>
                  {data.topProducts.length === 0 ? (
                    <p className="text-xs text-slate-450 py-2">No product units sold in this range.</p>
                  ) : (
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-slate-400 text-left border-b font-medium">
                          <th className="pb-1 font-semibold">Product name</th>
                          <th className="pb-1 text-center font-semibold">Qty</th>
                          <th className="pb-1 text-right font-semibold">Net Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topProducts.map((p) => (
                          <tr key={p.id} className="border-b last:border-0 font-medium">
                            <td className="py-2 text-slate-800 truncate max-w-[150px]">{p.name}</td>
                            <td className="py-2 text-center text-slate-500">{p.qty}</td>
                            <td className="py-2 text-right text-emerald-600 font-bold">₹{p.profit.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 pb-1.5 border-b">Category contributions</h3>
                  {data.categoryData.length === 0 ? (
                    <p className="text-xs text-slate-450 py-2">No categories recorded in range.</p>
                  ) : (
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-slate-400 text-left border-b font-medium">
                          <th className="pb-1 font-semibold">Category</th>
                          <th className="pb-1 text-center font-semibold">Units</th>
                          <th className="pb-1 text-right font-semibold">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.categoryData.map((c) => (
                          <tr key={c.cat} className="border-b last:border-0 font-medium">
                            <td className="py-2 text-slate-800">{c.cat}</td>
                            <td className="py-2 text-center text-slate-500">{c.qty}</td>
                            <td className="py-2 text-right text-slate-900 font-bold">₹{c.revenue.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Out of Stock Alert Summary on Print page */}
              {data.outOfStock.length > 0 && (
                <div className="pt-2">
                  <h3 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2.5 pb-1.5 border-b">Critical Warehouse Alert (Out of Stock)</h3>
                  <div className="flex flex-wrap gap-2">
                    {data.outOfStock.slice(0, 8).map((p) => (
                      <span key={p.id} className="text-[10px] font-bold border border-red-200 text-red-700 bg-red-50/50 px-2 py-1 rounded-lg">
                        {p.name} (SKU: {p.sku})
                      </span>
                    ))}
                    {data.outOfStock.length > 8 && (
                      <span className="text-[10px] font-semibold text-slate-400 px-1 py-1">
                        + {data.outOfStock.length - 8} more products out of stock
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Print Footer */}
              <div className="pt-8 border-t border-dashed border-slate-200 text-center text-[10px] text-slate-400 font-medium">
                This document represents an official business summary generated directly from AutoVault POS databases. 
                Printed on {new Date().toLocaleDateString("en-IN")} at {new Date().toLocaleTimeString("en-IN")}.
              </div>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION CARD UTILITY
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  titleClass = "text-slate-800",
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  titleClass?: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition duration-200 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className={`font-extrabold text-slate-900 text-sm md:text-base leading-tight ${titleClass}`}>{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
        {action && (
          <Link
            href={action.href}
            className="text-xs text-amber-500 hover:text-amber-600 font-bold flex items-center gap-1 shrink-0 ml-4 cursor-pointer"
          >
            {action.label} <ArrowRight size={12} />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}