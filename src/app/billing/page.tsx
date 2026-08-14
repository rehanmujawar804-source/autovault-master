"use client";

import { useState, useMemo, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRole } from "@/hooks/useRole";
import type { Product, Invoice, CartItem, PaymentMethod, PaymentStatus, HoldBill } from "@/types";
import PrintableInvoice, { applyDynamicPrintPageStyle } from "@/components/PrintableInvoice";
import { toLocalDateStr, formatInvoiceDate } from "@/lib/dateUtils";
import { isFitmentMatch } from "@/lib/fitmentUtils";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  X,
  CheckCircle,
  Printer,
  MessageCircle,
  ReceiptText,
  ArrowLeft,
  Coins,
  Smartphone,
  CreditCard,
  AlertCircle,
  AlertTriangle,
  Package,
  Tag,
  User,
  Car,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  BILLING / POS PAGE  —  Desktop-First Workstation Layout
// ─────────────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { state, addInvoice, getNextInvoiceNumber, showToast, dispatch, createHoldBill, updateHoldBill, deleteHoldBill, getCustomerOutstandingBalance, getCustomerCreditBalance } = useStore();
  const { loading, requireAuth } = useRole();

  useEffect(() => {
    if (!loading) requireAuth();
  }, [loading, requireAuth]);

  const [shopSettings] = useState(() => {
    if (typeof window === "undefined") return undefined;
    try {
      const raw = localStorage.getItem("autovault_settings");
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  });

  // ── Search & Filter State ─────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [negativeStockConfirmItems, setNegativeStockConfirmItems] = useState<Array<{ name: string; currentStock: number; sellQty: number; resultStock: number }> | null>(null);
  const [mobileTab, setMobileTab] = useState<"catalog" | "cart" | "checkout">("catalog");

  // ── Optional POS Vehicle Helper State ─────────────────────────────────────
  const [isPosVehicleHelperExpanded, setIsPosVehicleHelperExpanded] = useState(false);
  const [posVehicleBrand, setPosVehicleBrand] = useState("");
  const [posVehicleModel, setPosVehicleModel] = useState("");
  const [posVehicleYear, setPosVehicleYear] = useState("");

  function isSellableInPOS(product: Product): boolean {
    const status = product.status || "Active";
    if (status === "Active") return true;
    if (status === "Discontinued") return product.stock > 0;
    return false;
  }

  const posBrands = useMemo(() => {
    const set = new Set<string>();
    for (const product of state.products) {
      if (!isSellableInPOS(product)) continue;
      for (const fit of product.fitments || []) {
        if (fit.brand) set.add(fit.brand.trim());
      }
    }
    return [...set].sort();
  }, [state.products]);

  const posModels = useMemo(() => {
    const set = new Set<string>();
    if (!posVehicleBrand) return [];
    for (const product of state.products) {
      if (!isSellableInPOS(product)) continue;
      for (const fit of product.fitments || []) {
        if (fit.brand && fit.brand.trim().toLowerCase() === posVehicleBrand.trim().toLowerCase() && fit.model) {
          set.add(fit.model.trim());
        }
      }
    }
    return [...set].sort();
  }, [state.products, posVehicleBrand]);

  const posYears = useMemo(() => {
    const set = new Set<string>();
    if (!posVehicleBrand || !posVehicleModel) return [];
    for (const product of state.products) {
      if (!isSellableInPOS(product)) continue;
      for (const fit of product.fitments || []) {
        const sameBrand = fit.brand && fit.brand.trim().toLowerCase() === posVehicleBrand.trim().toLowerCase();
        const sameModel = fit.model && fit.model.trim().toLowerCase() === posVehicleModel.trim().toLowerCase();
        if (sameBrand && sameModel) {
          const rawYear = (fit.year || "").trim();
          const rawYearTo = (fit.yearTo || "").trim();
          if (rawYear.includes("-") || rawYear.includes("–")) {
            const parts = rawYear.split(/[-–]/).map((s) => s.trim());
            const start = Number(parts[0]);
            const end = Number(parts[1] || parts[0]);
            if (!isNaN(start) && !isNaN(end)) {
              for (let y = start; y <= end; y++) {
                set.add(String(y));
              }
            }
          } else {
            const fromYear = Number(rawYear);
            const toYear = rawYearTo !== "" ? Number(rawYearTo) : fromYear;
            if (!isNaN(fromYear) && !isNaN(toYear)) {
              for (let y = fromYear; y <= toYear; y++) {
                set.add(String(y));
              }
            } else if (rawYear) {
              set.add(rawYear);
            }
          }
        }
      }
    }
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [state.products, posVehicleBrand, posVehicleModel]);

  function getPosProductCompatibility(product: (typeof state.products)[0]): "universal" | "compatible" | "unconfigured" | "incompatible" {
    const selBrand = (posVehicleBrand || "").trim();
    const selModel = (posVehicleModel || "").trim();
    const selYearStr = (posVehicleYear || "").trim();

    // If vehicle filter is incomplete, return neutral status
    if (!selBrand || !selModel || !selYearStr) {
      return product.isUniversalFit ? "universal" : "unconfigured";
    }

    // State A — Universal Fit
    if (product.isUniversalFit === true) {
      return "universal";
    }

    // State B — No Fitment Configured
    const fitments = product.fitments || [];
    if (fitments.length === 0) {
      return "unconfigured";
    }

    // State C & D — Explicit Vehicle-Specific Match Evaluation
    const isMatch = fitments.some((fit) =>
      isFitmentMatch(fit, selBrand, selModel, selYearStr)
    );

    return isMatch ? "compatible" : "incompatible";
  }

  // ── Customer Details State ────────────────────────────────────────────────
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("new");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");

  // ── Payment details state ─────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Paid");
  const [amountPaidInput, setAmountPaidInput] = useState("");
  const [discount, setDiscount] = useState(0);
  const [discountInput, setDiscountInput] = useState("0");
  const [orderNote, setOrderNote] = useState("");
  const [billedBy, setBilledBy] = useState<"Owner" | "Staff" | "">("");

  // ── Generated Invoice Result ──────────────────────────────────────────────
  const [generatedInvoice, setGeneratedInvoice] = useState<Invoice | null>(null);

  // ── Validation and UI feedback states ─────────────────────────────────────
  const [validationError, setValidationError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // ── Hold / Recall States ─────────────────────────────────────────────────
  const [heldBillsDrawerOpen, setHeldBillsDrawerOpen] = useState(false);
  const [activeHoldBillId, setActiveHoldBillId] = useState<string | null>(null);
  const [heldBillsSearch, setHeldBillsSearch] = useState("");
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<string | null>(null);

  // ── Store Credit State ───────────────────────────────────────────────────
  const [useStoreCredit, setUseStoreCredit] = useState(false);
  const [storeCreditToUseInput, setStoreCreditToUseInput] = useState("");

  const selectedCustomerObj = useMemo(() => {
    if (customerMode === "existing" && selectedCustomerId) {
      return state.customers.find((c) => c.id === selectedCustomerId);
    }
    if (customerMode === "new" && customerPhone.trim()) {
      return state.customers.find((c) => c.phone === customerPhone.trim());
    }
    return undefined;
  }, [customerMode, selectedCustomerId, customerPhone, state.customers]);

  const availableStoreCredit = useMemo(() => {
    if (!selectedCustomerObj) return 0;
    return getCustomerCreditBalance(selectedCustomerObj.id);
  }, [selectedCustomerObj, getCustomerCreditBalance]);

  const customerDebt = useMemo(() => {
    if (!selectedCustomerObj) return 0;
    return getCustomerOutstandingBalance(selectedCustomerObj.id);
  }, [selectedCustomerObj, getCustomerOutstandingBalance]);

  // ── Cart & Credit Totals ──────────────────────────────────────────────────
  const subtotal = cart.reduce((sum, item) => sum + item.product.sellPrice * item.quantity, 0);
  const discountAmount = Math.round((subtotal * discount) / 100);
  const total = subtotal - discountAmount;

  const storeCreditRedeemed = useMemo(() => {
    if (!useStoreCredit || availableStoreCredit <= 0) return 0;
    const parsed = Number(storeCreditToUseInput);
    const amountToUse = storeCreditToUseInput === "" || isNaN(parsed) ? availableStoreCredit : parsed;
    return Math.max(0, Math.min(amountToUse, availableStoreCredit, total));
  }, [useStoreCredit, availableStoreCredit, storeCreditToUseInput, total]);

  const netPayable = Math.max(0, total - storeCreditRedeemed);

  const amountPaid = useMemo(() => {
    if (paymentStatus === "Paid") return netPayable;
    if (paymentStatus === "Debt") return 0;
    const val = Number(amountPaidInput) || 0;
    return Math.min(val, netPayable);
  }, [paymentStatus, netPayable, amountPaidInput]);

  const dueAmount = netPayable - amountPaid;
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  // ── Hold / Recall Handlers ───────────────────────────────────────────────
  function handleHoldCurrentBill() {
    if (cart.length === 0) {
      showToast("Cannot hold an empty bill.", "error");
      return;
    }
    const billData = {
      items: cart,
      customerMode,
      selectedCustomerId,
      customerName: customerName || "Walk-in Customer",
      customerPhone,
      customerSearchQuery,
      vehicleNumber,
      vehicleModel,
      paymentMethod,
      paymentStatus,
      amountPaidInput,
      discount,
      discountInput,
      notes: orderNote,
      billedBy,
      subtotal,
      total,
    };

    try {
      if (activeHoldBillId) {
        updateHoldBill(activeHoldBillId, billData);
        showToast("Held bill updated successfully.", "success");
      } else {
        createHoldBill(billData);
        showToast("Bill placed on hold.", "success");
      }
      handleNewBill();
    } catch (err) {
      showToast("Failed to place bill on hold.", "error");
    }
  }

  function handleRecallHoldBill(bill: HoldBill) {
    let hasStockAdjustment = false;
    const validatedItems = bill.items
      .map((item) => {
        const liveProd = state.products.find((p) => p.id === item.product.id);
        if (!liveProd || !isSellableInPOS(liveProd) || liveProd.stock <= 0) {
          hasStockAdjustment = true;
          return null;
        }
        const cappedQty = Math.min(item.quantity, liveProd.stock);
        if (cappedQty !== item.quantity) {
          hasStockAdjustment = true;
        }
        return {
          product: liveProd,
          quantity: cappedQty,
        };
      })
      .filter((item): item is CartItem => item !== null);

    setCart(validatedItems);
    setCustomerMode(bill.customerMode);
    setSelectedCustomerId(bill.selectedCustomerId);
    setCustomerName(bill.customerName === "Walk-in Customer" ? "" : bill.customerName);
    setCustomerPhone(bill.customerPhone);
    setCustomerSearchQuery(bill.customerSearchQuery);
    setVehicleNumber(bill.vehicleNumber);
    setVehicleModel(bill.vehicleModel);
    setPaymentMethod(bill.paymentMethod);
    setPaymentStatus(bill.paymentStatus);
    setAmountPaidInput(bill.amountPaidInput);
    setDiscount(bill.discount);
    setDiscountInput(bill.discountInput);
    setOrderNote(bill.notes);
    setBilledBy(bill.billedBy);
    setActiveHoldBillId(bill.id);
    setHeldBillsDrawerOpen(false);

    if (hasStockAdjustment) {
      showToast(`Recalled ${bill.holdNumber} — items adjusted for current inventory stock/status.`, "info");
    } else {
      showToast(`Recalled ${bill.holdNumber} successfully.`, "success");
    }
  }

  function handleDeleteHoldBill(id: string) {
    try {
      deleteHoldBill(id);
      if (id === activeHoldBillId) {
        setActiveHoldBillId(null);
      }
      setDeleteConfirmTarget(null);
      showToast("Held bill discarded.", "success");
    } catch (err) {
      showToast("Failed to delete held bill.", "error");
    }
  }

  // Keyboard Shortcut Ctrl+H / Cmd+H to Hold Bill
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        if (cart.length > 0) {
          handleHoldCurrentBill();
        } else {
          showToast("Cart is empty. Add items before holding.", "info");
        }
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    cart,
    activeHoldBillId,
    customerMode,
    selectedCustomerId,
    customerName,
    customerPhone,
    customerSearchQuery,
    vehicleNumber,
    vehicleModel,
    paymentMethod,
    paymentStatus,
    amountPaidInput,
    discount,
    discountInput,
    orderNote,
    billedBy,
    subtotal,
    total
  ]);

  // ── Discount helpers ─────────────────────────────────────────────────────
  function handlePresetDiscount(pct: number) {
    setDiscount(pct);
    setDiscountInput(String(pct));
  }

  function handleCustomDiscountChange(val: string) {
    if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
      setDiscountInput(val);
      const num = parseFloat(val);
      if (!isNaN(num)) {
        if (num >= 0 && num <= 100) setDiscount(num);
      } else {
        setDiscount(0);
      }
    }
  }

  // ── Dynamic categories ────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const sellable = state.products.filter(isSellableInPOS);
    const cats = Array.from(new Set(sellable.map((p) => p.category))).sort();
    return ["All", ...cats];
  }, [state.products]);

  // Cart Totals are declared at the top of the component to prevent hoisting errors

  // ── Filtered products ─────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let list = state.products.filter(isSellableInPOS);
    if (selectedCategory !== "All") list = list.filter((p) => p.category === selectedCategory);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q)
    );
  }, [state.products, search, selectedCategory]);

  // ── Filtered customers ────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return state.customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }, [state.customers, customerSearchQuery]);

  // ── Cart helpers ──────────────────────────────────────────────────────────
  function addToCart(productId: string) {
    const product = state.products.find((p) => p.id === productId);
    if (!product || !isSellableInPOS(product) || product.stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === productId);
      if (existing) {
        if (existing.quantity >= product.stock) {
          return prev;
        }
        return prev.map((i) =>
          i.product.id === productId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  function updateQty(productId: string, qty: number) {
    const product = state.products.find((p) => p.id === productId);
    if (!product) return;
    if (qty <= 0) { removeFromCart(productId); return; }
    const cappedQty = Math.min(qty, product.stock);
    setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, quantity: cappedQty } : i)));
  }

  // ── Generate Invoice ──────────────────────────────────────────────────────
  function handleGenerateInvoice(bypassNegativeStockCheck = false) {
    setValidationError("");
    if (cart.length === 0) {
      showToast("Add at least one product to the cart.", "error");
      return;
    }

    // Live inventory status validation check
    const negativeItems: Array<{ name: string; currentStock: number; sellQty: number; resultStock: number }> = [];

    for (const item of cart) {
      const liveProduct = state.products.find((p) => p.id === item.product.id);
      if (!liveProduct) {
        setValidationError(`Product "${item.product.name}" is no longer available in inventory.`);
        showToast(`Product "${item.product.name}" was removed from inventory.`, "error");
        return;
      }
      if ((liveProduct.status || "Active") !== "Active" || liveProduct.status === "Discontinued") {
        setValidationError(`Product "${liveProduct.name}" is ${liveProduct.status || "Inactive/Discontinued"} and cannot be sold.`);
        showToast(`Product "${liveProduct.name}" is not active for sale.`, "error");
        return;
      }
      if (item.quantity > liveProduct.stock) {
        negativeItems.push({
          name: liveProduct.name,
          currentStock: liveProduct.stock,
          sellQty: item.quantity,
          resultStock: liveProduct.stock - item.quantity,
        });
      }
    }

    if (!bypassNegativeStockCheck && negativeItems.length > 0) {
      setNegativeStockConfirmItems(negativeItems);
      return;
    }

    if (!billedBy) {
      setValidationError("Billed By is required. Please select Owner or Staff.");
      showToast("Please select who is billing this invoice.", "error");
      return;
    }

    let customerId: string | null = null;
    let finalName = customerName.trim();
    let finalPhone = customerPhone.trim();

    if (customerMode === "existing" && selectedCustomerId) {
      const c = state.customers.find((c) => c.id === selectedCustomerId);
      if (c) {
        customerId = c.id;
        finalName = c.name;
        finalPhone = c.phone;
      }
    } else if (finalName && finalName !== "Walk-in Customer" && finalPhone) {
      const byPhone = state.customers.find((c) => c.phone === finalPhone);
      if (byPhone) {
        customerId = byPhone.id;
        finalName = byPhone.name;
      } else {
        customerId = `c-${crypto.randomUUID()}`;
      }
    }

    // Business validation: Debt/Partial must have registered customer details
    if (paymentStatus === "Debt" || paymentStatus === "Partial") {
      if (!selectedCustomerId && (!finalName || finalName.toLowerCase() === "walk-in customer")) {
        setValidationError("Credit sales require a registered customer.");
        showToast("Credit sales require a registered customer.", "error");
        return;
      }
      if (!finalName || finalName.toLowerCase() === "walk-in customer") {
        setValidationError("Credit sales require a registered customer.");
        showToast("Credit sales require a registered customer.", "error");
        return;
      }
      if (!finalPhone) {
        setValidationError("Customer Phone is required for Debt or Partial payment status.");
        showToast("Customer details required for debt tracking.", "error");
        return;
      }
      const cleanedPhone = finalPhone.replace(/\D/g, "");
      if (cleanedPhone.length < 10) {
        setValidationError("Please enter a valid 10-digit mobile number for debt tracking.");
        showToast("Invalid phone number format.", "error");
        return;
      }
    }

    if (paymentStatus === "Partial") {
      const paid = Number(amountPaidInput) || 0;
      if (paid <= 0) {
        setValidationError("Paid amount must be greater than 0 for Partial payment. Otherwise, select Debt.");
        showToast("Invalid paid amount.", "error");
        return;
      }
      if (paid >= total) {
        setValidationError(`Paid amount cannot be greater than or equal to total (₹${total.toLocaleString()}). For full payments, select Paid.`);
        showToast("Invalid paid amount.", "error");
        return;
      }
    }

    // Default walk-in name if none provided for Paid invoices
    if (!finalName) {
      finalName = "Walk-in Customer";
    }

    setIsSubmitting(true);

    const generateUUID = () => {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
      return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    };
    const invId = `inv-${generateUUID()}`;
    const invoice: Invoice = {
      id: invId,
      invoiceNumber: getNextInvoiceNumber(),
      customerId,
      customer: finalName,
      customerPhone: finalPhone,
      vehicleNumber: vehicleNumber.trim(),
      vehicleModel: vehicleModel.trim(),
      paymentMethod,
      paymentStatus,
      amountPaid,
      dueAmount,
      subtotal,
      discount,
      total,
      notes: orderNote.trim(),
      date: toLocalDateStr(new Date()),
      createdAt: new Date().toISOString(),
      items: cart.map((i, idx) => ({
        id: `inv-item-${invId}-${idx}`,
        productId: i.product.id,
        name: i.product.name,
        quantity: i.quantity,
        price: i.product.sellPrice,
        costPrice: i.product.currentCost,
      })),
      billedBy,
      shopSnapshot: shopSettings ? {
        shopName: shopSettings.shopName,
        ownerName: shopSettings.ownerName,
        phone: shopSettings.phone,
        address: shopSettings.address,
        gstNumber: shopSettings.gstNumber,
        showLogo: shopSettings.showLogo,
        showGST: shopSettings.showGST,
        showAddress: shopSettings.showAddress,
        showPhone: shopSettings.showPhone,
        footerMessage: shopSettings.footerMessage,
      } : undefined,
    };

    try {
      addInvoice(invoice, storeCreditRedeemed);
      showToast("Invoice generated successfully!", "success");
      setGeneratedInvoice(invoice);
      if (activeHoldBillId) {
        deleteHoldBill(activeHoldBillId);
        setActiveHoldBillId(null);
      }
    } catch (err) {
      showToast("Failed to create invoice.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNewBill() {
    setCart([]);
    setSearch("");
    setSelectedCategory("All");
    setCustomerMode("new");
    setSelectedCustomerId("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerSearchQuery("");
    setVehicleNumber("");
    setVehicleModel("");
    setPaymentMethod("Cash");
    setPaymentStatus("Paid");
    setAmountPaidInput("");
    setDiscount(0);
    setDiscountInput("0");
    setOrderNote("");
    setUseStoreCredit(false);
    setStoreCreditToUseInput("");
    setGeneratedInvoice(null);
    setBilledBy("");
    setValidationError("");
    setShowClearConfirm(false);
    setActiveHoldBillId(null); // Clear hold bill workspace tracking
  }

  if (generatedInvoice) {
    return <InvoiceReceipt invoice={generatedInvoice} onNewBill={handleNewBill} shopSettings={shopSettings} />;
  }

  // ── Category badge color helper ──────────────────────────────────────────
  const getCategoryStyles = (cat: string) => {
    const c = cat.toLowerCase();
    if (c === "lights") return "bg-amber-50 text-amber-700 border-amber-200";
    if (c === "audio") return "bg-blue-50 text-blue-700 border-blue-200";
    if (c === "electronics") return "bg-purple-50 text-purple-700 border-purple-200";
    if (c === "accessories") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (c === "wipers") return "bg-sky-50 text-sky-700 border-sky-200";
    if (c === "tools") return "bg-rose-50 text-rose-700 border-rose-200";
    if (c === "care") return "bg-teal-50 text-teal-700 border-teal-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  MAIN POS WORKSPACE
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] gap-0 -m-4 sm:-m-6 overflow-hidden min-w-0 min-h-0">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-2.5 sm:py-3 bg-white border-b border-slate-200 shrink-0 gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-navy-950 flex items-center justify-center shrink-0">
            <ReceiptText size={15} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Billing / POS</h1>
            <p className="text-[10px] sm:text-xs text-slate-400 leading-tight">Workstation · {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Held Bills Manager Button with count badge */}
          <button
            type="button"
            onClick={() => setHeldBillsDrawerOpen(true)}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl transition cursor-pointer relative"
          >
            <ReceiptText size={14} className="text-slate-500" />
            <span className="hidden sm:inline">Held Bills</span>
            <span className="sm:hidden">Held</span>
            {state.holdBills && state.holdBills.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-white shadow-sm ring-2 ring-white">
                {state.holdBills.length}
              </span>
            )}
          </button>

          {/* Hold Current Bill Button — disabled if empty */}
          <button
            type="button"
            onClick={handleHoldCurrentBill}
            disabled={cart.length === 0}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed border border-amber-600 text-white text-xs font-bold px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl transition cursor-pointer"
          >
            <Coins size={14} />
            <span className="hidden sm:inline">{activeHoldBillId ? "Update Hold" : "Hold Bill"}</span>
            <span className="sm:hidden">{activeHoldBillId ? "Update" : "Hold"}</span>
          </button>

          {cart.length > 0 && (
            <div className="hidden md:flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full shrink-0">
              <ShoppingCart size={13} />
              {totalItems} item{totalItems !== 1 ? "s" : ""} · ₹{total.toLocaleString()}
            </div>
          )}
          <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-full font-mono shrink-0">
            #{getNextInvoiceNumber()}
          </div>
        </div>
      </div>

      {/* ── Tablet & Mobile Tab Navigation Bar (visible < 1024px) ───────────── */}
      <div className="flex items-center justify-between bg-slate-900 text-white p-1 border-b border-slate-800 lg:hidden shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab("catalog")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${mobileTab === "catalog" ? "bg-amber-500 text-slate-950 shadow-xs" : "text-slate-300 hover:text-white"
            }`}
        >
          <Package size={14} />
          Products
          <span className="text-[10px] bg-slate-950/40 px-1.5 py-0.5 rounded-full font-mono">
            {filteredProducts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab("cart")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer relative ${mobileTab === "cart" ? "bg-amber-500 text-slate-950 shadow-xs" : "text-slate-300 hover:text-white"
            }`}
        >
          <ShoppingCart size={14} />
          Cart
          {totalItems > 0 && (
            <span className="text-[10px] bg-slate-950 text-amber-400 px-1.5 py-0.5 rounded-full font-extrabold font-mono">
              {totalItems}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMobileTab("checkout")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${mobileTab === "checkout" ? "bg-amber-500 text-slate-950 shadow-xs" : "text-slate-300 hover:text-white"
            }`}
        >
          <ReceiptText size={14} />
          Checkout
          {netPayable > 0 && (
            <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded-full font-mono">
              ₹{netPayable.toLocaleString()}
            </span>
          )}
        </button>
      </div>

      {/* ── 3-Panel Workspace ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-w-0 min-h-0">

        {/* ══════════════════════════════════════════════════════════════════
            PANEL 1 — Products Catalog  (flex: 1.2 on Desktop)
        ══════════════════════════════════════════════════════════════════ */}
        <div className={`flex-col bg-slate-50 border-r border-slate-200 min-w-0 min-h-0 lg:w-[42%] lg:flex ${mobileTab === "catalog" ? "flex flex-1" : "hidden lg:flex"}`}>
          {/* POS Vehicle Filter Bar (Collapsible) */}
          <div className="px-5 py-2.5 bg-gradient-to-r from-slate-900 via-navy-950 to-slate-900 text-white shrink-0 border-b border-navy-800 transition-all">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsPosVehicleHelperExpanded((prev) => !prev)}
                className="flex items-center gap-2 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer select-none text-left flex-1"
              >
                <Car size={14} className="shrink-0" />
                <span className="truncate">Vehicle Compatibility Helper</span>
                {isPosVehicleHelperExpanded ? (
                  <ChevronUp size={14} className="text-slate-300 shrink-0" />
                ) : (
                  <ChevronDown size={14} className="text-slate-300 shrink-0" />
                )}
              </button>

              {(posVehicleBrand || posVehicleModel || posVehicleYear) && (
                <button
                  type="button"
                  onClick={() => {
                    setPosVehicleBrand("");
                    setPosVehicleModel("");
                    setPosVehicleYear("");
                  }}
                  className="text-[11px] font-semibold text-slate-300 hover:text-white underline cursor-pointer shrink-0"
                >
                  Reset Filter
                </button>
              )}
            </div>

            {!isPosVehicleHelperExpanded ? (
              /* Collapsed Summary State */
              <div
                onClick={() => setIsPosVehicleHelperExpanded(true)}
                className="mt-1 text-[11px] text-slate-300 flex items-center justify-between cursor-pointer hover:text-white transition-colors"
              >
                <span>
                  {posVehicleBrand && posVehicleModel && posVehicleYear
                    ? `Selected Vehicle: ${posVehicleBrand} ${posVehicleModel} • ${posVehicleYear}`
                    : posVehicleBrand && posVehicleModel
                      ? `Selected Vehicle: ${posVehicleBrand} ${posVehicleModel}`
                      : posVehicleBrand
                        ? `Selected Vehicle: ${posVehicleBrand}`
                        : "No vehicle selected"}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Click to configure</span>
              </div>
            ) : (
              /* Expanded Cascading Selectors */
              <div className="grid grid-cols-3 gap-2 mt-2.5 pt-2 border-t border-navy-800/80">
                <SearchableSelect
                  value={posVehicleBrand}
                  onChange={(val) => {
                    setPosVehicleBrand(val);
                    setPosVehicleModel("");
                    setPosVehicleYear("");
                  }}
                  options={posBrands}
                  placeholder="Make (All)"
                  allOptionLabel="Make (All)"
                  dark={true}
                />
                <SearchableSelect
                  disabled={!posVehicleBrand}
                  value={posVehicleModel}
                  onChange={(val) => {
                    setPosVehicleModel(val);
                    setPosVehicleYear("");
                  }}
                  options={posModels}
                  placeholder={!posVehicleBrand ? "Select Make" : "Model (All)"}
                  allOptionLabel="Model (All)"
                  dark={true}
                />
                <SearchableSelect
                  disabled={!posVehicleModel}
                  value={posVehicleYear}
                  onChange={(val) => setPosVehicleYear(val)}
                  options={posYears}
                  placeholder={!posVehicleModel ? "Select Model" : "Year (All)"}
                  allOptionLabel="Year (All)"
                  dark={true}
                />
              </div>
            )}
          </div>

          {/* Search bar */}
          <div className="px-5 pt-3 pb-3 bg-white border-b border-slate-100 shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search products — name, SKU, brand..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Category pills */}
          <div className="flex items-center gap-2 px-5 py-2.5 bg-white border-b border-slate-100 overflow-x-auto shrink-0 scrollbar-thin">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedCategory(c)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border cursor-pointer shrink-0 ${selectedCategory === c
                  ? "bg-navy-950 border-navy-950 text-white shadow-sm"
                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Results label */}
          <div className="px-5 py-2 shrink-0 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {filteredProducts.length} {filteredProducts.length === 1 ? "product" : "products"}
              {selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}
            </span>
            {selectedCategory !== "All" && (
              <button
                type="button"
                onClick={() => setSelectedCategory("All")}
                className="text-xs text-slate-400 hover:text-slate-700 underline cursor-pointer"
              >
                Clear filter
              </button>
            )}
          </div>

          {/* Product grid — scrollable */}
          <div className="flex-1 overflow-y-auto px-5 pb-5 scrollbar-thin">
            {filteredProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center mb-3">
                  <Package size={24} className="text-slate-400" />
                </div>
                <p className="font-bold text-slate-500 text-sm">No products found</p>
                <p className="text-xs text-slate-400 mt-1">Try a different search or category</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredProducts.map((product) => {
                  const inCart = cart.find((i) => i.product.id === product.id);
                  const outOfStock = product.stock === 0;
                  const isMaxInCart = Boolean(inCart && inCart.quantity >= product.stock);
                  const lowStock = !outOfStock && !isMaxInCart && product.stock <= product.lowStockThreshold;
                  const compatStatus = getPosProductCompatibility(product);
                  const isVehicleFilterActive = Boolean(posVehicleBrand && posVehicleModel && posVehicleYear);

                  return (
                    <div
                      key={product.id}
                      onClick={() => !outOfStock && !isMaxInCart && addToCart(product.id)}
                      className={`relative bg-white rounded-xl border p-4 flex flex-col justify-between cursor-pointer select-none transition-all duration-150 group ${outOfStock
                        ? "border-slate-150 opacity-55 cursor-not-allowed"
                        : isMaxInCart
                          ? "border-amber-300 bg-amber-50/15 cursor-default shadow-xs"
                          : inCart
                            ? "border-amber-400 shadow-md ring-2 ring-amber-300/40 bg-amber-50/20"
                            : "border-slate-200 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5"
                        }`}
                    >
                      {/* Qty badge */}
                      {inCart && (
                        <span className={`absolute -top-2 -right-2 font-extrabold rounded-full flex items-center justify-center text-xs shadow border-2 border-white z-10 ${isMaxInCart
                          ? "bg-amber-600 text-white min-w-6 h-6 px-1.5 text-[10px]"
                          : "bg-amber-500 text-white w-6 h-6"
                          }`}>
                          {inCart.quantity}
                        </span>
                      )}

                      {/* Top: category + brand */}
                      <div className="flex items-start justify-between gap-1 mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getCategoryStyles(product.category)}`}>
                          {product.category}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">{product.brand}</span>
                      </div>

                      {/* Name */}
                      <p className="font-bold text-slate-800 text-sm leading-snug group-hover:text-navy-950 transition-colors line-clamp-2 min-h-[2.5rem]">
                        {product.name}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400 mt-1">SKU: {product.sku}</p>
                      {product.status === "Discontinued" && (
                        <div className="mt-1.5">
                          <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-900 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            <AlertTriangle size={10} className="text-amber-600 shrink-0" />
                            Discontinued — Clearance
                          </span>
                        </div>
                      )}

                      {/* Vehicle Compatibility Status Badge */}
                      {isVehicleFilterActive && (
                        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                          {compatStatus === "universal" ? (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                              <Sparkles size={11} className="text-amber-600" />
                              {product.status === "Discontinued" ? "Universal Fit — Discontinued Clearance" : "Universal Fit"}
                            </span>
                          ) : compatStatus === "compatible" ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              <CheckCircle size={11} className="text-emerald-600" />
                              {product.status === "Discontinued" ? "Compatible — Discontinued Clearance" : "Compatible"}
                            </span>
                          ) : compatStatus === "unconfigured" ? (
                            <span className="inline-flex items-center gap-1 font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                              <Info size={11} className="text-slate-400" />
                              No specific vehicles configured
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-md">
                              <AlertCircle size={11} className="text-amber-600" />
                              ⚠️ May Not Fit
                            </span>
                          )}
                        </div>
                      )}

                      {/* Bottom: stock + price */}
                      <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${outOfStock ? "bg-red-500" : isMaxInCart ? "bg-amber-500" : lowStock ? "bg-orange-400 animate-pulse" : "bg-green-500"}`} />
                          <span className="text-[10px] text-slate-500 font-medium">
                            {outOfStock ? "Out of stock" : isMaxInCart ? `Max in cart (${product.stock})` : lowStock ? `${product.stock} left` : `${product.stock} in stock`}
                          </span>
                        </div>
                        <span className="font-extrabold text-navy-950 text-base">₹{product.sellPrice.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PANEL 2 — Active Cart  (flex: 0.7 on Desktop)
        ══════════════════════════════════════════════════════════════════ */}
        <div className={`flex-col bg-white border-r border-slate-200 min-w-0 min-h-0 lg:w-[28%] lg:flex ${mobileTab === "cart" ? "flex flex-1" : "hidden lg:flex"}`}>
          {/* Cart header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-navy-950" />
              <h2 className="font-bold text-slate-800 text-sm">Active Cart</h2>
              {cart.length > 0 && (
                <span className="bg-navy-950 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {totalItems}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              showClearConfirm ? (
                <div className="flex items-center gap-2 select-none animate-in fade-in duration-200">
                  <span className="text-[10px] text-red-500 font-bold">Clear cart?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCart([]);
                      setShowClearConfirm(false);
                      showToast("Cart cleared", "info");
                    }}
                    className="text-[10px] bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded font-bold cursor-pointer transition-colors active:scale-95"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold cursor-pointer transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-semibold transition-colors cursor-pointer"
                >
                  <Trash2 size={12} />
                  Clear
                </button>
              )
            )}
          </div>

          {/* Cart items — scrollable */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <div className="w-12 h-12 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center mb-3">
                  <ShoppingCart size={20} className="text-slate-300" />
                </div>
                <p className="font-bold text-sm text-slate-400">Cart is empty</p>
                <p className="text-xs text-slate-350 mt-1">Click products to add them</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => {
                  const isItemIncompatible = Boolean(
                    posVehicleBrand &&
                    posVehicleModel &&
                    posVehicleYear &&
                    getPosProductCompatibility(item.product) === "incompatible"
                  );

                  return (
                    <div key={item.product.id} className={`rounded-xl border p-3 ${isItemIncompatible ? "bg-amber-50/50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-800 leading-snug truncate" title={item.product.name}>
                            {item.product.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {item.product.sku}</p>
                          {isItemIncompatible && (
                            <p className="text-[10px] text-amber-900 font-bold mt-1 flex items-center gap-1 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                              <AlertCircle size={11} className="text-amber-600 shrink-0" />
                              ⚠️ May not fit selected vehicle
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors cursor-pointer shrink-0 mt-0.5"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        {/* Qty controls */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateQty(item.product.id, item.quantity - 1)}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-500 flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-90"
                          >
                            <Minus size={11} />
                          </button>
                          <span className="w-7 text-center font-bold text-sm text-slate-800">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.product.id, item.quantity + 1)}
                            disabled={item.quantity >= item.product.stock}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-green-50 hover:border-green-200 hover:text-green-600 flex items-center justify-center transition-all disabled:opacity-30 cursor-pointer shadow-sm active:scale-90"
                          >
                            <Plus size={11} />
                          </button>
                        </div>

                        <div className="text-right">
                          <span className="block font-bold text-sm text-slate-900">
                            ₹{(item.product.sellPrice * item.quantity).toLocaleString()}
                          </span>
                          {item.quantity > 1 && (
                            <span className="block text-[10px] text-slate-400">
                              ₹{item.product.sellPrice.toLocaleString()} each
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart totals */}
          <div className="shrink-0 border-t border-slate-100 px-5 py-4 bg-white space-y-2">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-700">₹{subtotal.toLocaleString()}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-green-600 font-semibold">
                <span>Discount ({discount}%)</span>
                <span>−₹{discountAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-dashed border-slate-200 pt-2.5 mt-1">
              <span className="font-bold text-slate-900 text-sm">Total</span>
              <span className="font-extrabold text-navy-950 text-xl">₹{total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PANEL 3 — Checkout / Billing Form  (flex: 1 on Desktop)
        ══════════════════════════════════════════════════════════════════ */}
        <div className={`flex-col bg-white min-w-0 min-h-0 lg:w-[30%] lg:flex ${mobileTab === "checkout" ? "flex flex-1" : "hidden lg:flex"}`}>
          {/* Panel heading */}
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 shrink-0">
            <FileText size={15} className="text-slate-400" />
            <h2 className="font-bold text-slate-800 text-sm">Billing Details</h2>
          </div>

          {/* Scrollable form body */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-5">
            {/* Validation Error Banner */}
            {validationError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-4 py-3 rounded-xl flex items-start gap-2.5 animate-in slide-in-from-top-1 duration-150">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Validation Warning</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed font-medium">{validationError}</p>
                </div>
              </div>
            )}

            {/* ── SECTION: Invoice Info ───────────────────────────────── */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invoice No.</p>
                <p className="font-mono font-bold text-slate-800 text-sm mt-0.5">{getNextInvoiceNumber()}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</p>
                <p className="font-semibold text-slate-700 text-sm mt-0.5">
                  {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>

            {/* ── SECTION: Customer ──────────────────────────────────── */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <User size={13} className="text-slate-400" />
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Customer</h3>
              </div>

              {/* Toggle */}
              <div className="flex p-1 bg-slate-100 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setCustomerMode("existing"); setCustomerName(""); setCustomerPhone(""); setSelectedCustomerId(""); setCustomerSearchQuery(""); }}
                  className={`flex-1 py-1.5 text-center rounded-md transition-all cursor-pointer ${customerMode === "existing" ? "bg-white text-navy-950 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Existing
                </button>
                <button
                  type="button"
                  onClick={() => { setCustomerMode("new"); setSelectedCustomerId(""); setCustomerName(""); setCustomerPhone(""); }}
                  className={`flex-1 py-1.5 text-center rounded-md transition-all cursor-pointer ${customerMode === "new" ? "bg-white text-navy-950 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Walk-in / New
                </button>
              </div>

              {customerMode === "existing" ? (
                selectedCustomerId ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-slate-800 text-sm">{customerName}</p>
                      <p className="text-xs text-slate-500">{customerPhone}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {customerDebt > 0 && (
                          <span className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full font-bold">
                            ⚠ ₹{customerDebt.toLocaleString()} debt
                          </span>
                        )}
                        {availableStoreCredit > 0 && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Coins size={10} className="text-emerald-600" />
                            ₹{availableStoreCredit.toLocaleString()} Credit
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedCustomerId(""); setCustomerName(""); setCustomerPhone(""); setUseStoreCredit(false); setStoreCreditToUseInput(""); }}
                      className="text-[10px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer shrink-0"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search by name or phone..."
                        value={customerSearchQuery}
                        onChange={(e) => setCustomerSearchQuery(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                      />
                    </div>
                    {customerSearchQuery.trim() && (
                      <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-20">
                        {filteredCustomers.length === 0 ? (
                          <div className="p-3 text-xs text-slate-400 text-center">No customers found</div>
                        ) : (
                          filteredCustomers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setSelectedCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone); setCustomerSearchQuery(""); }}
                              className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b last:border-0 border-slate-100 flex justify-between items-center transition cursor-pointer"
                            >
                              <div>
                                <p className="text-sm font-bold text-slate-800">{c.name}</p>
                                <p className="text-xs text-slate-500">{c.phone}</p>
                              </div>
                              {(() => {
                                const debt = getCustomerOutstandingBalance(c.id);
                                return debt > 0 ? (
                                  <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-bold border border-red-100">
                                    ₹{debt.toLocaleString()} due
                                  </span>
                                ) : null;
                              })()}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Customer Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="col-span-2 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                  <input
                    type="tel"
                    placeholder="Mobile Number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="col-span-2 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                </div>
              )}
            </div>

            {/* ── SECTION: Store Credit Redemption ─────────────────── */}
            {availableStoreCredit > 0 && (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useStoreCredit}
                      onChange={(e) => {
                        setUseStoreCredit(e.target.checked);
                        if (e.target.checked && !storeCreditToUseInput) {
                          setStoreCreditToUseInput(String(Math.min(availableStoreCredit, total)));
                        }
                      }}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                    />
                    <span className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                      <Coins size={14} className="text-emerald-600" />
                      Apply Store Credit
                    </span>
                  </label>
                  <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                    Avail: ₹{availableStoreCredit.toLocaleString()}
                  </span>
                </div>

                {useStoreCredit && (
                  <div className="space-y-2 pt-1 border-t border-emerald-200/60 animate-in slide-in-from-top-1 duration-150">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                        <input
                          type="number"
                          min="0"
                          max={Math.min(availableStoreCredit, total)}
                          placeholder={`Max ₹${Math.min(availableStoreCredit, total).toLocaleString()}`}
                          value={storeCreditToUseInput}
                          onChange={(e) => setStoreCreditToUseInput(e.target.value)}
                          className="w-full border border-emerald-300 rounded-lg pl-7 pr-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setStoreCreditToUseInput(String(Math.min(availableStoreCredit, total)))}
                        className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-2 rounded-lg font-bold transition cursor-pointer shrink-0"
                      >
                        Use Max
                      </button>
                    </div>
                    {storeCreditRedeemed > 0 && (
                      <p className="text-[11px] font-semibold text-emerald-700 flex justify-between items-center">
                        <span>Redeeming:</span>
                        <span className="font-bold">−₹{storeCreditRedeemed.toLocaleString()}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── SECTION: Vehicle ───────────────────────────────────── */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Car size={13} className="text-slate-400" />
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Vehicle</h3>
                <span className="text-[10px] text-slate-400 font-medium">(optional)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Reg. No. e.g. MH12AB1234"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white uppercase"
                />
                <input
                  type="text"
                  placeholder="Model e.g. Swift"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                />
              </div>
            </div>

            {/* ── SECTION: Discount ──────────────────────────────────── */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Tag size={13} className="text-slate-400" />
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Discount</h3>
              </div>

              {/* Preset pills */}
              <div className="flex gap-1.5">
                {[0, 5, 10, 15, 20].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handlePresetDiscount(pct)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${discount === pct && discountInput === String(pct)
                      ? "bg-navy-950 border-navy-950 text-white shadow-sm"
                      : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                      }`}
                  >
                    {pct === 0 ? "0%" : `${pct}%`}
                  </button>
                ))}
              </div>

              {/* Custom input */}
              <div className="relative flex items-center">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Custom %"
                  value={discountInput}
                  onChange={(e) => handleCustomDiscountChange(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                />
                <span className="absolute right-3.5 text-slate-400 font-bold text-sm select-none">%</span>
              </div>

              {discount > 0 && (
                <div className="flex justify-between items-center text-xs font-semibold text-green-700 bg-green-50 border border-green-100 px-3 py-2 rounded-lg">
                  <span>Saving</span>
                  <span>₹{discountAmount.toLocaleString()} off</span>
                </div>
              )}
            </div>

            {/* ── SECTION: Payment Method ────────────────────────────── */}
            {paymentStatus === "Debt" ? (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-800 font-medium">
                <AlertCircle size={16} className="text-amber-600 shrink-0" />
                <span>Credit Sale — No payment received. Customer balance will increase.</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Coins size={13} className="text-slate-400" />
                  <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Payment Method</h3>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "Cash", label: "Cash", icon: <Coins size={14} /> },
                    { id: "UPI", label: "UPI", icon: <Smartphone size={14} /> },
                    { id: "Card", label: "Card", icon: <CreditCard size={14} /> },
                  ].map((item) => {
                    const active = paymentMethod === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setPaymentMethod(item.id as PaymentMethod)}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all cursor-pointer active:scale-95 ${active
                            ? "bg-navy-950 border-navy-950 text-white shadow-md"
                            : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                          }`}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── SECTION: Payment Status ────────────────────────────── */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle size={13} className="text-slate-400" />
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Payment Status</h3>
              </div>
              <div className="flex gap-2">
                {(["Paid", "Partial", "Debt"] as PaymentStatus[]).map((s) => {
                  const active = paymentStatus === s;
                  const colors: Record<string, string> = {
                    Paid: active ? "bg-green-600 border-green-600 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-green-50 hover:border-green-200 hover:text-green-700",
                    Partial: active ? "bg-orange-500 border-orange-500 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700",
                    Debt: active ? "bg-red-500 border-red-500 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600",
                  };
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPaymentStatus(s)}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 ${colors[s]}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>

              {paymentStatus === "Partial" && (
                <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                  <label className="block text-xs text-slate-500 font-semibold uppercase">Amount Paid (₹)</label>
                  <input
                    type="number"
                    min="0"
                    max={total}
                    placeholder={`Max ₹${total.toLocaleString()}`}
                    value={amountPaidInput}
                    onChange={(e) => setAmountPaidInput(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white"
                  />
                  {dueAmount > 0 && (
                    <p className="text-xs text-red-500 font-semibold bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                      ⚠ ₹{dueAmount.toLocaleString()} will be recorded as debt
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── SECTION: Billed By ─────────────────────────────────── */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <User size={13} className="text-slate-400" />
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">
                  Billed By <span className="text-red-500">*</span>
                </h3>
              </div>
              <div className="flex gap-2">
                {(["Owner", "Staff"] as const).map((role) => {
                  const active = billedBy === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setBilledBy(role)}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 ${active
                        ? "bg-navy-950 border-navy-950 text-white shadow-md"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── SECTION: Notes ─────────────────────────────────────── */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Notes</h3>
              <textarea
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="Special instructions or remarks..."
                rows={2}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              />
            </div>

          </div>

          {/* ── Fixed bottom: totals + generate bill ────────────────────── */}
          <div className="shrink-0 border-t border-slate-200 px-5 pt-4 pb-5 bg-slate-50 space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="font-medium text-slate-700">₹{subtotal.toLocaleString()}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600 font-semibold">
                  <span>Discount ({discount}%)</span>
                  <span>−₹{discountAmount.toLocaleString()}</span>
                </div>
              )}
              {storeCreditRedeemed > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                  <span>Store Credit Applied</span>
                  <span>−₹{storeCreditRedeemed.toLocaleString()}</span>
                </div>
              )}
              {storeCreditRedeemed > 0 && (
                <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1.5">
                  <span>Net Payable</span>
                  <span className="text-navy-950 font-extrabold">₹{netPayable.toLocaleString()}</span>
                </div>
              )}
              {amountPaid > 0 && amountPaid < netPayable && (
                <div className="flex justify-between text-blue-600 font-semibold">
                  <span>Paid</span>
                  <span>₹{amountPaid.toLocaleString()}</span>
                </div>
              )}
              {dueAmount > 0 && (
                <div className="flex justify-between text-red-500 font-bold">
                  <span>Due</span>
                  <span>₹{dueAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-slate-900 border-t border-slate-200 pt-2 mt-1">
                <span className="text-base">Final Total</span>
                <span className="text-navy-950 text-xl font-black">₹{netPayable.toLocaleString()}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleGenerateInvoice()}
              disabled={cart.length === 0 || isSubmitting}
              className="w-full flex items-center justify-center gap-2.5 bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 disabled:bg-slate-200 disabled:cursor-not-allowed text-navy-950 py-3.5 rounded-xl font-extrabold text-sm transition-all shadow-md cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-navy-950 border-t-transparent animate-spin" />
                  Generating Invoice...
                </>
              ) : (
                <>
                  <ReceiptText size={16} />
                  {cart.length === 0 ? "Add products to cart" : `Generate Bill · ₹${netPayable.toLocaleString()}`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Held Bills Side-Drawer / Modal ─────────────────────────────────── */}
      {heldBillsDrawerOpen && (
        <div
          onClick={() => setHeldBillsDrawerOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-end z-50 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-full sm:max-w-md h-full flex flex-col shadow-2xl border-l border-slate-200 animate-in slide-in-from-right duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50 shrink-0">
              <div>
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <ReceiptText size={18} className="text-amber-500" />
                  Held Bills
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Select a parked cart to resume checkout</p>
              </div>
              <button
                onClick={() => setHeldBillsDrawerOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Box */}
            <div className="p-4 border-b border-slate-100 shrink-0 bg-white">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Hold #, customer, phone, vehicle..."
                  value={heldBillsSearch}
                  onChange={(e) => setHeldBillsSearch(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
                  autoFocus
                />
                {heldBillsSearch && (
                  <button
                    onClick={() => setHeldBillsSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* List area */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3 scrollbar-thin">
              {(() => {
                const query = heldBillsSearch.trim().toLowerCase();
                const filtered = (state.holdBills || []).filter((b) => {
                  if (!query) return true;
                  return (
                    b.holdNumber.toLowerCase().includes(query) ||
                    b.customerName.toLowerCase().includes(query) ||
                    b.customerPhone.includes(query) ||
                    b.vehicleNumber.toLowerCase().includes(query) ||
                    b.vehicleModel.toLowerCase().includes(query)
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div className="h-full flex flex-col items-center justify-center text-center py-16">
                      <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center mb-3">
                        <ReceiptText size={20} className="text-slate-400" />
                      </div>
                      <p className="font-bold text-slate-500 text-xs">No held bills found</p>
                      <p className="text-[11px] text-slate-400 mt-1">Try a different search term</p>
                    </div>
                  );
                }

                return filtered.map((b) => {
                  const itemCount = b.items.reduce((s, item) => s + item.quantity, 0);
                  const isCurrentActive = b.id === activeHoldBillId;

                  return (
                    <div
                      key={b.id}
                      className={`bg-white rounded-xl border p-4 shadow-sm space-y-3 relative transition hover:border-slate-300 ${isCurrentActive ? "ring-2 ring-amber-400 border-amber-400" : "border-slate-200"
                        }`}
                    >
                      {/* Top Header Card */}
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-900 text-xs uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {b.holdNumber}
                            </span>
                            {isCurrentActive && (
                              <span className="text-[9px] font-extrabold uppercase bg-amber-500 text-white px-1.5 py-0.5 rounded tracking-wide animate-pulse">
                                Active Now
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-slate-800 text-sm mt-1.5">
                            {b.customerName || "Walk-in Customer"}
                          </h3>
                          {b.customerPhone && (
                            <p className="text-[10px] text-slate-500">{b.customerPhone}</p>
                          )}
                          {(b.vehicleNumber || b.vehicleModel) && (
                            <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                              🚗 {b.vehicleModel || "Vehicle"} ({b.vehicleNumber || "No Plate"})
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-900 font-mono">₹{b.total.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{itemCount} Item{itemCount !== 1 ? "s" : ""}</p>
                        </div>
                      </div>

                      {/* Items details block */}
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-[11px] space-y-1">
                        {b.items.slice(0, 3).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-slate-600">
                            <span className="truncate max-w-[70%] text-[10px]">• {item.product.name}</span>
                            <span className="font-semibold text-slate-800 font-mono text-[10px]">×{item.quantity}</span>
                          </div>
                        ))}
                        {b.items.length > 3 && (
                          <div className="text-slate-400 italic text-[10px] text-right font-medium pt-0.5 border-t border-slate-100/50">
                            + {b.items.length - 3} more product{b.items.length - 3 !== 1 ? "s" : ""}
                          </div>
                        )}
                      </div>

                      {/* Timestamp labels */}
                      <div className="flex justify-between items-center text-[9px] text-slate-400 font-medium font-mono">
                        <div>
                          <span>Created: {new Date(b.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div>
                          <span>Edited: {new Date(b.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleRecallHoldBill(b)}
                          className="flex-1 bg-navy-950 hover:bg-slate-800 text-white py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 active:scale-95 border-none"
                        >
                          Continue Billing
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmTarget(b.id)}
                          className="px-3 border border-red-200 hover:bg-red-50 text-red-600 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center active:scale-95 bg-white"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ─────────────────────────────────────── */}
      {deleteConfirmTarget && (() => {
        const targetBill = (state.holdBills || []).find((b) => b.id === deleteConfirmTarget);
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs border border-slate-200 p-5 space-y-4">
              <div className="text-center">
                <AlertCircle size={32} className="text-red-500 mx-auto mb-2" />
                <h3 className="font-bold text-slate-800 text-sm">Discard Held Bill?</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  This will discard <strong>{targetBill?.holdNumber || "this bill"}</strong> permanently. This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmTarget(null)}
                  className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteHoldBill(deleteConfirmTarget)}
                  className="flex-1 bg-red-600 hover:bg-red-750 text-white py-2 rounded-xl text-xs font-bold transition cursor-pointer border-none"
                >
                  Yes, Discard
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {negativeStockConfirmItems && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 border border-amber-200">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">Negative Stock Warning</h3>
                <p className="text-xs text-slate-500">Owner confirmation required to proceed</p>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2 text-xs">
              <p className="text-amber-900 font-semibold">
                Completing this invoice will result in negative stock for the following item(s):
              </p>
              <div className="space-y-1.5 divide-y divide-amber-200/60 pt-1">
                {negativeStockConfirmItems.map((item, idx) => (
                  <div key={idx} className="pt-1.5 flex justify-between items-center text-slate-700">
                    <span className="font-medium text-slate-800 truncate max-w-[200px]">{item.name}</span>
                    <span className="font-mono text-amber-900">
                      {item.currentStock} → <strong className="text-rose-600 font-bold">{item.resultStock}</strong> ({item.sellQty} sold)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setNegativeStockConfirmItems(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setNegativeStockConfirmItems(null);
                  handleGenerateInvoice(true);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors shadow-md cursor-pointer"
              >
                Confirm & Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  INVOICE RECEIPT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  Paid: "bg-green-100 text-green-700",
  Partial: "bg-orange-100 text-orange-700",
  Debt: "bg-red-100 text-red-600",
};

const METHOD_STYLES: Record<string, string> = {
  Cash: "bg-green-50 text-green-700",
  UPI: "bg-blue-50 text-blue-700",
  Card: "bg-purple-50 text-purple-700",
  Credit: "bg-red-50 text-red-600",
};

function InvoiceReceipt({ invoice, onNewBill, shopSettings }: { invoice: Invoice; onNewBill: () => void; shopSettings?: any }) {
  function handlePrint() {
    applyDynamicPrintPageStyle("A4");
    window.print();
  }

  function handleWhatsApp() {
    if (!invoice.customerPhone) { alert("No customer phone number to send to."); return; }
    const cleanPhone = invoice.customerPhone.replace(/\D/g, "");
    const MAX_ITEMS = 15;
    const itemsToShow = invoice.items.slice(0, MAX_ITEMS);
    const hiddenCount = Math.max(0, invoice.items.length - MAX_ITEMS);

    let lines = itemsToShow
      .map((item) => `• ${item.name} ×${item.quantity} = ₹${(item.price * item.quantity).toLocaleString()}`)
      .join("\n");

    if (hiddenCount > 0) {
      lines += `\n• ... +${hiddenCount} more items`;
    }

    const creditApplied = invoice.creditRedeemed || 0;
    const netPayable = Math.max(0, invoice.total - creditApplied);

    const msg =
      `*${invoice.invoiceNumber}*\n` +
      `Date: ${formatInvoiceDate(invoice)}\n` +
      `Customer: ${invoice.customer}\n` +
      (invoice.vehicleModel ? `Vehicle: ${invoice.vehicleModel} (${invoice.vehicleNumber})\n` : "") +
      `\n${lines}\n\n` +
      `Subtotal: ₹${invoice.subtotal.toLocaleString()}\n` +
      (invoice.discount > 0
        ? `Discount (${invoice.discount}%): −₹${Math.round((invoice.subtotal * invoice.discount) / 100).toLocaleString()}\n`
        : "") +
      (creditApplied > 0
        ? `Store Credit Applied: −₹${creditApplied.toLocaleString()}\n`
        : "") +
      `*Net Payable: ₹${netPayable.toLocaleString()}*\n` +
      `Paid: ₹${invoice.amountPaid.toLocaleString()}\n` +
      (invoice.dueAmount > 0 ? `*Due Balance: ₹${invoice.dueAmount.toLocaleString()}*\n` : "") +
      `Payment: ${invoice.paymentMethod} · ${invoice.paymentStatus}\n` +
      (invoice.notes ? `\nNote: ${invoice.notes}\n` : "") +
      `\nThank you! — 7 Star Car Accessories`;
    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle size={20} className="text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Invoice Generated!</h1>
            <p className="text-sm text-slate-500">{invoice.invoiceNumber}</p>
          </div>
        </div>
        <button
          onClick={onNewBill}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} />
          New Bill
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:block">
        {/* Printable Receipt */}
        <div className="lg:col-span-2 print:col-span-3">
          <PrintableInvoice invoice={invoice} shopSettings={shopSettings} />
        </div>

        {/* Actions panel */}
        <div className="space-y-4 print:hidden">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-sm">
            <h2 className="font-semibold text-slate-800 text-sm">Summary</h2>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex justify-between"><span className="text-slate-500">Invoice #</span><span className="font-medium text-slate-800">{invoice.invoiceNumber}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Customer</span><span className="font-medium text-slate-800 text-right max-w-[60%] truncate">{invoice.customer}</span></div>
              {invoice.customerPhone && (
                <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-medium">{invoice.customerPhone}</span></div>
              )}
              {invoice.billedBy && (
                <div className="flex justify-between"><span className="text-slate-500">Billed By</span><span className="font-medium text-slate-800">{invoice.billedBy}</span></div>
              )}
              <div className="flex justify-between border-t pt-2"><span className="text-slate-500">Total</span><span className="font-bold text-base text-slate-900">₹{invoice.total.toLocaleString()}</span></div>
            </div>
          </div>

          <button onClick={handlePrint} className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-white py-3 rounded-xl font-semibold text-sm transition-colors cursor-pointer">
            <Printer size={16} />
            Print Invoice
          </button>

          {invoice.customerPhone && (
            <button onClick={handleWhatsApp} className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-semibold text-sm transition-colors cursor-pointer">
              <MessageCircle size={16} />
              Send via WhatsApp
            </button>
          )}

          <button onClick={onNewBill} className="w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 py-3 rounded-xl font-semibold text-sm transition-colors cursor-pointer">
            <Plus size={16} />
            New Bill
          </button>
        </div>
      </div>
    </div>
  );
}