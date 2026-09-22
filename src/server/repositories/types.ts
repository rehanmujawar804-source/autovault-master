import { 
  Product, VehicleFitment, Customer, CustomerActivity, Supplier, 
  Invoice, InvoiceItem, Purchase, PurchaseReturn, PurchaseOrder, 
  PurchaseOrderItem, POActivityLog, SalesReturn, SalesReturnItem, 
  ExchangeItem, StockMovement, FinanceTransaction, DebtPayment, 
  SupplierPayment, CustomerCreditTransaction, RecentImportReport 
} from "../../types";

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

// ── Product Types ────────────────────────────

export type NewProductInput = Omit<Product, "id" | "createdAt" | "updatedAt">;
export type UpdateProductInput = Partial<Omit<Product, "id" | "createdAt" | "updatedAt">>;

export interface ProductFilter {
  search?: string;
  category?: string;
  brand?: string;
  status?: string;
  inStockOnly?: boolean;
}

export type VehicleFitmentInput = Omit<VehicleFitment, "id">;

// ── Customer Types ───────────────────────────

export type NewCustomerInput = Omit<Customer, "id" | "createdAt" | "updatedAt" | "debt" | "storeCredit" | "visits" | "lastVisit" | "invoiceIds" | "activities" | "totalSpent">;
export type UpdateCustomerInput = Partial<NewCustomerInput>;

export interface CustomerFilter {
  search?: string;
}

export type NewCustomerActivityInput = Omit<CustomerActivity, "id" | "createdAt" | "date">;

// ── Supplier Types ───────────────────────────

export type NewSupplierInput = Omit<Supplier, "id" | "createdAt" | "updatedAt">;
export type UpdateSupplierInput = Partial<NewSupplierInput>;

export interface SupplierFilter {
  search?: string;
  status?: "Active" | "Inactive";
}

// ── Invoice Types ────────────────────────────

export type NewInvoiceInput = Omit<Invoice, "id" | "createdAt" | "items" | "voided" | "voidedAt" | "voidReason" | "voidedBy">;
export type NewInvoiceItemInput = Omit<InvoiceItem, "id" | "returnedQuantity"> & { invoiceId: string };

export interface InvoicePaymentUpdate {
  amountPaid: number;
  dueAmount: number;
  paymentStatus: string;
}

export interface VoidInvoiceInput {
  voidReason: string;
  voidedBy: string;
}

export interface InvoiceFilter {
  search?: string;
  customerId?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ── Purchase Types ───────────────────────────

export type NewPurchaseInput = Omit<Purchase, "id" | "createdAt" | "returnedQuantity">;

export interface PurchasePaymentUpdate {
  amountPaid: number;
  dueAmount: number;
  paymentStatus: string;
}

export type NewPurchaseReturnInput = Omit<PurchaseReturn, "id" | "createdAt">;

export interface PurchaseFilter {
  supplierId?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ── Purchase Order Types ─────────────────────

export type NewPOInput = Omit<PurchaseOrder, "id" | "createdAt" | "updatedAt" | "items" | "activityLog">;
export type NewPOItemInput = Omit<PurchaseOrderItem, "id" | "receivedQuantity"> & { purchaseOrderId: string };
export type NewPOActivityInput = Omit<POActivityLog, "id" | "date"> & { purchaseOrderId: string };

export interface POFilter {
  supplierId?: string;
  status?: string;
}

// ── Sales Return Types ───────────────────────

export type NewSalesReturnInput = Omit<SalesReturn, "id" | "createdAt" | "items" | "exchangeItems" | "customerId"> & {
  customerId?: string | null;
};
export type NewSalesReturnItemInput = Omit<SalesReturnItem, "id" | "invoiceItemId"> & { 
  salesReturnId: string;
  invoiceItemId?: string | null;
};
export type NewExchangeItemInput = Omit<ExchangeItem, "id"> & { salesReturnId: string };

export interface SalesReturnFilter {
  search?: string;
  customerId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ── Stock Movement Types ─────────────────────

export type NewStockMovementInput = Omit<StockMovement, "id" | "date">;

export interface StockMovementFilter {
  productId?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ── Finance Types ────────────────────────────

export type NewFinanceTxInput = Omit<FinanceTransaction, "id" | "date"> & {
  date: string; // Keep date required for input
  referenceType?: string;
};

export interface FinanceFilter {
  accountId?: string;
  type?: "Income" | "Expense";
  category?: string;
  referenceId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ── Payment Types ────────────────────────────

export type NewDebtPaymentInput = Omit<DebtPayment, "id" | "receiptNumber" | "voided" | "voidedAt" | "voidReason" | "voidedBy" | "createdAt"> & {
  receiptNumber?: string;
};
export type NewSupplierPaymentInput = Omit<SupplierPayment, "id" | "createdAt" | "date"> & {
  date?: string;
};
export type NewCreditTxInput = Omit<CustomerCreditTransaction, "id" | "createdAt" | "date"> & {
  date: string;
};

// ── Shop Settings Types ──────────────────────

export interface ShopSettings {
  id: string;
  shopName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  gstNumber: string;
  invoicePrefix: string;
  currency: string;
  showLogo: boolean;
  showGST: boolean;
  showAddress: boolean;
  showPhone: boolean;
  footerMessage: string;
  theme: "light" | "dark" | "system";
  updatedAt: string;
}

// ── Auth Types ───────────────────────────────

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  salt: string | null;
  legacyHash: boolean;
  role: "owner" | "staff";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  id: string;
  userId: string;
  tokenHash: string;
  role: "owner" | "staff";
  expiresAt: string;
  createdAt: string;
}

export type NewUserInput = Omit<User, "id" | "createdAt" | "updatedAt" | "isActive">;
export type NewSessionInput = Omit<UserSession, "id" | "createdAt">;

// ── Migration Storage Types ──────────────────

export interface FileAttachment {
  id: string;
  bucketName: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  entityType: "product" | "supplier" | "invoice" | "backup";
  entityId: string;
  uploadedBy: string | null;
  createdAt: string;
}

export type NewImportReportInput = Omit<RecentImportReport, "id" | "date">;
export type NewAttachmentInput = Omit<FileAttachment, "id" | "createdAt">;











