import { Invoice, SalesReturn } from "@/types";

/**
 * Calculates canonical revenue according to business rules:
 * Revenue = Completed Sales (active invoices total) - Active Sales Return Refunds
 * 
 * Can be filtered by:
 * - productId (product-specific revenue)
 * - customerId (customer-specific revenue)
 */
export function calculateRevenue(
  invoices: Invoice[],
  salesReturns: SalesReturn[] | undefined,
  productId?: string,
  customerId?: string
): number {
  let completedSales = 0;
  
  // Filter invoices by customer if customerId is provided
  const targetInvoices = customerId
    ? invoices.filter((inv) => inv.customerId === customerId)
    : invoices;

  const activeInvoices = targetInvoices.filter((inv) => !inv.voided);

  if (productId) {
    completedSales = activeInvoices.reduce((sum, inv) => {
      const itemSum = inv.items
        .filter((item) => item.productId === productId)
        .reduce((s, item) => s + item.quantity * item.price, 0);
      return sum + itemSum;
    }, 0);
  } else {
    completedSales = activeInvoices.reduce((sum, inv) => sum + inv.total, 0);
  }

  let activeReturns = 0;
  
  // Filter returns by customer if customerId is provided
  const targetReturns = customerId
    ? (salesReturns || []).filter((r) => r.customerId === customerId)
    : salesReturns;

  const activeSRs = (targetReturns || []).filter((r) => r.status !== "Cancelled");

  if (productId) {
    activeReturns = activeSRs.reduce((sum, r) => {
      const itemRefund = r.items
        .filter((ri) => ri.productId === productId)
        .reduce((s, ri) => s + ri.refundAmount, 0);
      return sum + itemRefund;
    }, 0);
  } else {
    activeReturns = activeSRs.reduce((sum, r) => sum + r.totalRefund, 0);
  }

  let replacementSales = 0;
  activeSRs.forEach((r) => {
    if (r.refundMethod === "Exchange" && r.exchangeItems && r.exchangeItems.length > 0) {
      r.exchangeItems.forEach((exItem) => {
        if (!productId || exItem.productId === productId) {
          replacementSales += exItem.quantity * exItem.sellingPrice;
        }
      });
    }
  });

  return Math.round((completedSales - activeReturns + replacementSales) * 100) / 100;
}
