import type { Invoice, SalesReturn, Product } from "@/types";
import { calculateRevenue } from "./revenueUtils";

/**
 * Calculates historical Cost of Goods Sold (COGS) for active sales.
 *
 * Business Rules:
 * 1. Excludes voided invoices (!inv.voided)
 * 2. Excludes cancelled sales returns (r.status !== "Cancelled")
 * 3. Uses historical costPrice snapshot on InvoiceItem if available,
 *    falling back to product.currentCost if missing.
 * 4. Subtracts active returned quantities from sold quantities so COGS reflects
 *    net unreturned units actually sold.
 * 5. Adds replacement items COGS for active exchanges.
 * 6. Supports optional product-level filtering (productId) and customer-level filtering (customerId).
 */
export function calculateCOGS(
  invoices: Invoice[],
  salesReturns?: SalesReturn[],
  products?: Product[],
  productId?: string,
  customerId?: string
): number {
  let activeInvoices = (invoices || []).filter((inv) => !inv.voided);
  if (customerId) {
    activeInvoices = activeInvoices.filter((inv) => inv.customerId === customerId);
  }

  let activeSRs = (salesReturns || []).filter((r) => r.status !== "Cancelled");
  if (customerId) {
    activeSRs = activeSRs.filter((r) => r.customerId === customerId);
  }

  let totalCOGS = 0;

  activeInvoices.forEach((inv) => {
    inv.items.forEach((item) => {
      if (productId && item.productId !== productId) return;

      const unitCost =
        item.costPrice ??
        (products ? products.find((p) => p.id === item.productId)?.currentCost : undefined) ??
        0;

      // Calculate active returned quantity for this line item
      const returnedQty = activeSRs
        .filter((r) => r.invoiceId === inv.id)
        .reduce((sum, r) => {
          const matchingReturnItems = r.items.filter(
            (ri) =>
              ri.invoiceItemId === item.id ||
              (!ri.invoiceItemId && ri.productId === item.productId)
          );
          return sum + matchingReturnItems.reduce((s, ri) => s + ri.quantity, 0);
        }, 0);

      const netSoldQty = Math.max(0, item.quantity - returnedQty);
      totalCOGS += netSoldQty * unitCost;
    });
  });

  // Add replacement items COGS from active exchanges
  activeSRs.forEach((r) => {
    if (r.refundMethod === "Exchange" && r.exchangeItems && r.exchangeItems.length > 0) {
      r.exchangeItems.forEach((exItem) => {
        if (!productId || exItem.productId === productId) {
          totalCOGS += exItem.quantity * exItem.costPrice;
        }
      });
    }
  });

  return Math.round(totalCOGS * 100) / 100;
}

/**
 * Calculates historical Net Profit (Revenue - COGS) for active sales.
 *
 * Single canonical source of truth for historical profit calculations
 * across Dashboard, Analytics, Inventory, and Customer pages.
 */
export function calculateProfit(
  invoices: Invoice[],
  salesReturns?: SalesReturn[],
  products?: Product[],
  productId?: string,
  customerId?: string
): number {
  const revenue = calculateRevenue(invoices, salesReturns, productId, customerId);
  const cogs = calculateCOGS(invoices, salesReturns, products, productId, customerId);
  return Math.round((revenue - cogs) * 100) / 100;
}
