// ─────────────────────────────────────────────
//  AutoVault — Shared Type Definitions
// ─────────────────────────────────────────────

// ── Vehicle Fitment ───────────────────────────

export interface VehicleFitment {
  brand: string;
  model: string;
  year: string;
}

// ── Product ──────────────────────────────────

export interface Product {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  stock: number;
  currentCost: number;   // owner-only, replaces buyPrice
  sellPrice: number;
  lowStockThreshold: number;
  status?: "Active" | "Inactive" | "Discontinued";
  fitments?: VehicleFitment[];
  // Optional extended fields
  preferredSupplierId?: string;
  supplier?: string;
  hsn?: string;
  gst?: number;
  location?: string;
  description?: string;
  createdAt?: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
}

// ── Supplier ──────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  whatsApp: string;
  email: string;
  address: string;
  gst?: string;
  notes: string;
  status: "Active" | "Inactive";
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// ── Purchase ──────────────────────────────────

export interface Purchase {
  id: string;
  supplierId: string;
  productId: string;
  quantity: number;
  buyPrice: number; // cost price at time of purchase
  invoiceNumber: string;
  date: string; // ISO date string (YYYY-MM-DD)
  paymentStatus: "Paid" | "Partial" | "Credit";
  notes: string;
  createdAt: string; // ISO timestamp
  totalAmount: number;
  amountPaid: number;
  dueAmount: number;
  returnedQuantity?: number;
  purchaseOrderId?: string; // Links to source PurchaseOrder
  expectedBuyPrice?: number; // Cost variance analysis
}

export type PurchaseOrderStatus =
  | "Draft"
  | "Sent"
  | "Supplier Confirmed"
  | "Partially Delivered"
  | "Completed"
  | "Cancelled";

export interface POActivityLog {
  id: string;
  type:
    | "Created"
    | "Edited"
    | "Sent"
    | "Confirmed"
    | "Delivery"
    | "Completed"
    | "Cancelled";
  date: string; // ISO timestamp
  notes: string;
  user?: string;
}

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  quantity: number;
  expectedBuyPrice: number;
  receivedQuantity: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  createdAt: string;
  updatedAt: string;
  expectedDeliveryDate: string;
  notes: string;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  activityLog: POActivityLog[];
}


export interface PurchaseReturn {
  id: string;
  purchaseId: string;
  supplierId: string;
  productId: string;
  quantity: number;
  buyPrice: number;
  /** Value of goods returned (qty × buyPrice). Reduces supplier liability. */
  totalAmount: number;
  /** Cash actually refunded by supplier. May be less than totalAmount (partial / adjustment). */
  refundAmount: number;
  reason: string;
  createdAt: string;
  returnedBy: "Owner" | "Staff";
  /** Snapshot: original purchase.quantity at the time the return was recorded. */
  originalPurchaseQuantity: number;
  /** Snapshot: original purchase.totalAmount (buyPrice × quantity) at the time the return was recorded. */
  originalPurchaseValue: number;
}


// ── Stock Movement ────────────────────────────

export type StockMovementType =
  | "Opening Stock"
  | "Purchase"
  | "Purchase Return"
  | "Sale"
  | "Adjustment"
  | "Return"
  | "Import";

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  delta: number;
  date: string; // ISO timestamp
  desc: string;
  reference: string;
}

// ── Invoice ───────────────────────────────────

export type PaymentMethod = "Cash" | "UPI" | "Card" | "Credit";
export type PaymentStatus = "Paid" | "Partial" | "Debt";

export interface InvoiceItem {
  productId: string;
  name: string;
  quantity: number;
  price: number; // sell price at time of sale
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string | null; // null = walk-in
  customer: string;
  customerPhone: string;
  vehicleNumber: string;
  vehicleModel: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  dueAmount: number;
  subtotal: number;
  discount: number; // percentage 0-100
  total: number;    // subtotal after discount
  notes: string;
  date: string;     // ISO date string
  createdAt?: string; // Full ISO timestamp
  items: InvoiceItem[];
  billedBy?: "Owner" | "Staff";
  voided?: boolean;
  voidedAt?: string;
  voidReason?: string;
  voidedBy?: string;
}

export interface CustomerActivity {
  id: string;
  type: "Invoice" | "Repayment" | "Void";
  description: string;
  reference: string;
  date: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  debt: number;      // Derived cache — sum of open invoice dues
  totalSpent: number;
  visits: number;
  lastVisit: string; // ISO date string
  invoiceIds: string[];
  activities?: CustomerActivity[];
}

// ── Debt Payment (Repayment Ledger) ──────────

export interface DebtPayment {
  id: string;
  customerId: string;
  invoiceId: string;   // always linked to a specific invoice
  amount: number;
  date: string;        // ISO date string
  method: PaymentMethod;
  note?: string;
  collectedBy: "Owner" | "Staff";
  // Void metadata — appended only; existing records safely default to undefined (falsy)
  voided?: boolean;
  voidedAt?: string;
  voidReason?: string;
  voidedBy?: string;
}

// ── Supplier Payment (Purchase Payment Ledger) ──

export interface SupplierPayment {
  id: string;
  supplierId: string;
  purchaseId: string; // Linked purchase
  amount: number;
  date: string;       // ISO timestamp
  method: PaymentMethod;
  note?: string;
  paidBy: "Owner" | "Staff";
  isUpfront?: boolean;
}

// ── Finance Account (Cash / Bank / UPI ledger) ───

export interface FinanceAccount {
  id: string;
  name: string;
  type: "Cash" | "Bank" | "UPI";
  openingBalance: number;
  createdAt: string; // ISO timestamp
}

// ── Finance Transaction (Ledger Entry) ──────────

export type FinanceCategory =
  | "Inventory Purchase"
  | "Supplier Payment"
  | "Sale"
  | "Customer Payment"
  | "Invoice Void"
  | "Payment Void"
  | "Purchase Return"
  | "Adjustment";

export interface FinanceTransaction {
  id: string;
  accountId: string;          // Links to a FinanceAccount
  type: "Income" | "Expense";
  category: FinanceCategory;
  referenceId: string;        // Purchase ID, Invoice ID, or Payment ID
  supplierId?: string;
  customerId?: string;
  amount: number;
  date: string;               // ISO timestamp
  method: PaymentMethod;
  notes?: string;
}

// ── Cart (used in Billing page) ───────────────

export interface CartItem {
  product: Product;
  quantity: number;
}

// ── Hold Bill (Temporary POS Cart) ────────────

export interface HoldBill {
  id: string;
  holdNumber: string; // Sequential identifier like HB-0001
  createdAt: string;  // ISO timestamp
  updatedAt: string;  // ISO timestamp

  // Cart elements
  items: CartItem[];

  // Customer Mode & Search
  customerMode: "existing" | "new";
  selectedCustomerId: string;
  customerName: string;
  customerPhone: string;
  customerSearchQuery: string;

  // Vehicle Details
  vehicleNumber: string;
  vehicleModel: string;

  // Payment details
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaidInput: string;

  // Discount
  discount: number;
  discountInput: string;

  // Notes & metadata
  notes: string;
  billedBy: "Owner" | "Staff" | "";

  // Visual/Helper amounts
  subtotal: number;
  total: number;
}

// ── Supplier Invoice Draft (UI-only, never stored) ───────────────────────────

/**
 * One product row inside the Supplier Invoice modal.
 * This type is ONLY used for local form state and is never persisted.
 * The underlying Purchase type is not modified.
 */
export interface PurchaseLineItem {
  id: string;         // Ephemeral row key (crypto.randomUUID) for React key prop
  productId: string;
  quantity: string;   // String so <input type="number"> stays controlled
  buyPrice: string;   // String so <input type="number"> stays controlled
  expectedBuyPrice?: string; // Optional track of PO expected cost
}

// ── App Store State ───────────────────────────

export interface AppState {
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  debtPayments: DebtPayment[];
  suppliers: Supplier[];
  purchases: Purchase[];
  stockMovements: StockMovement[];
  supplierPayments: SupplierPayment[];
  financeAccounts: FinanceAccount[];
  financeTransactions: FinanceTransaction[];
  purchaseReturns?: PurchaseReturn[];
  // Temporary Hold Bills
  holdBills: HoldBill[];
  holdBillsCounter: number;
  purchaseOrders?: PurchaseOrder[];
  purchaseOrderCounter?: number;
}


