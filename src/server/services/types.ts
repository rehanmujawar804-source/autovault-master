/**
 * AUTOVAULT — Domain Service Layer Types & DTOs
 * 
 * Defines typed input and output contracts for all Phase 4 domain services.
 */

import { 
  Invoice, 
  InvoiceItem, 
  Purchase, 
  PurchaseReturn, 
  SalesReturn, 
  SalesReturnItem, 
  ExchangeItem, 
  Product, 
  VehicleFitment, 
  Customer, 
  CustomerActivity, 
  Supplier, 
  DebtPayment, 
  SupplierPayment, 
  FinanceAccount, 
  FinanceTransaction 
} from "../../types";

import { 
  NewProductInput, 
  UpdateProductInput, 
  VehicleFitmentInput, 
  NewCustomerInput, 
  UpdateCustomerInput, 
  NewSupplierInput, 
  UpdateSupplierInput,
  PaginationParams,
  ProductFilter,
  InvoiceFilter,
  PurchaseFilter,
  SalesReturnFilter,
  FinanceFilter,
  CustomerFilter,
  SupplierFilter
} from "../repositories/types";

export type {
  PaginationParams,
  ProductFilter,
  InvoiceFilter,
  PurchaseFilter,
  SalesReturnFilter,
  FinanceFilter,
  CustomerFilter,
  SupplierFilter,
  NewProductInput,
  UpdateProductInput,
  VehicleFitmentInput,
  NewCustomerInput,
  UpdateCustomerInput,
  NewSupplierInput,
  UpdateSupplierInput
};

// ── Invoicing DTOs ─────────────────────────────────────────────────────────────

export interface CreateInvoiceItemInput {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface CreateInvoiceInput {
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  vehicleNumber?: string;
  vehicleModel?: string;
  paymentMethod: "Cash" | "UPI" | "Card";
  amountPaid: number;
  discount?: number;
  creditRedeemed?: number;
  notes?: string;
  date: string; // YYYY-MM-DD
  billedBy?: "Owner" | "Staff";
  items: CreateInvoiceItemInput[];
}

export interface VoidInvoiceResult {
  invoice: Invoice;
  restoredStock: Array<{ productId: string; quantity: number }>;
  reversalTransactions: FinanceTransaction[];
}

// ── Purchasing DTOs ────────────────────────────────────────────────────────────

export interface CreatePurchaseInput {
  supplierId: string;
  productId: string;
  quantity: number;
  buyPrice: number;
  purchaseDate: string; // YYYY-MM-DD
  invoiceNumber?: string;
  paymentMethod?: "Cash" | "UPI" | "Card" | "Bank";
  amountPaid?: number;
  purchaseOrderId?: string;
  notes?: string;
}

export interface CreatePurchaseReturnInput {
  purchaseId: string;
  quantity: number;
  refundAmount: number;
  refundMethod: string;
  reason: string;
  returnedBy: "Owner" | "Staff";
}

// ── Sales Return DTOs ──────────────────────────────────────────────────────────

export interface CreateSalesReturnItemInput {
  invoiceItemId?: string;
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
}

export interface CreateExchangeItemInput {
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  costPrice?: number;
}

export interface CreateSalesReturnInput {
  invoiceId: string;
  items: CreateSalesReturnItemInput[];
  refundMethod: "Cash" | "UPI" | "Bank" | "Adjustment" | "Exchange";
  reason: string;
  notes?: string;
  createdBy: string;
  exchangeItems?: CreateExchangeItemInput[];
  differencePaymentMethod?: "Cash" | "UPI" | "Card" | "Adjustment";
}

// ── Payment & FIFO DTOs ────────────────────────────────────────────────────────

export interface RecordCustomerPaymentInput {
  invoiceId: string;
  amount: number;
  method: "Cash" | "UPI" | "Card";
  date: string; // YYYY-MM-DD
  note?: string;
  collectedBy?: "Owner" | "Staff";
}

export interface CustomerPaymentFifoInput {
  customerId: string;
  totalAmount: number;
  method: "Cash" | "UPI" | "Card";
  date: string; // YYYY-MM-DD
  note?: string;
  collectedBy?: "Owner" | "Staff";
}

export interface RecordSupplierPaymentInput {
  purchaseId: string;
  amount: number;
  method: "Cash" | "UPI" | "Card" | "Bank";
  date: string; // YYYY-MM-DD
  note?: string;
  paidBy?: "Owner" | "Staff";
}

export interface SupplierPaymentFifoInput {
  supplierId: string;
  totalAmount: number;
  method: "Cash" | "UPI" | "Card" | "Bank";
  date: string; // YYYY-MM-DD
  note?: string;
  paidBy?: "Owner" | "Staff";
}

export interface ApplyCreditResult {
  allocatedAmount: number;
  updatedInvoicesCount: number;
  remainingCredit: number;
}

// ── Inventory DTOs ─────────────────────────────────────────────────────────────

export interface AdjustStockInput {
  productId: string;
  delta: number;
  note?: string;
  recordExpense?: boolean;
  actorId?: string;
}

// ── Finance DTOs ───────────────────────────────────────────────────────────────

export interface AccountBalanceSummary extends FinanceAccount {
  currentBalance: number;
}

export interface RecordExpenseInput {
  accountId: string;
  amount: number;
  category: string;
  date: string; // YYYY-MM-DD
  method: string;
  notes?: string;
  referenceId?: string;
  referenceType?: "Invoice" | "Purchase" | "PurchaseReturn" | "DebtPayment" | "BusinessExpense" | "System";
}

export interface RecordIncomeInput {
  accountId: string;
  amount: number;
  category: string;
  date: string; // YYYY-MM-DD
  method: string;
  notes?: string;
  referenceId?: string;
  referenceType?: "Invoice" | "Purchase" | "PurchaseReturn" | "DebtPayment" | "BusinessExpense" | "System";
}

// ── Customer & Supplier Report DTOs ───────────────────────────────────────────

export interface CustomerProfileSummary extends Customer {
  debt: number;
  storeCredit: number;
  activities: CustomerActivity[];
}

export interface SupplierStatementEntry {
  id: string;
  date: string;
  type: "Purchase" | "Payment" | "Purchase Return";
  reference: string;
  debit: number;   // Incurred debt (Purchases)
  credit: number;  // Paid/settled debt (Payments, Returns)
  runningBalance: number;
  notes: string;
}

export interface SupplierStatementReport {
  supplierId: string;
  supplierName: string;
  dateFrom?: string;
  dateTo?: string;
  openingBalance: number;
  entries: SupplierStatementEntry[];
  closingBalance: number;
  totalPurchases: number;
  totalPayments: number;
  totalReturns: number;
}
