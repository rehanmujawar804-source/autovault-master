"use client";

import { useState, useMemo, useEffect } from "react";
import { useStore } from "@/lib/store";
import type { Invoice, CartItem, PaymentMethod, PaymentStatus, HoldBill } from "@/types";
import PrintableInvoice from "@/components/PrintableInvoice";
import { toLocalDateStr, formatInvoiceDate } from "@/lib/dateUtils";
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
  Package,
  Tag,
  User,
  Car,
  FileText,
  ChevronDown,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  BILLING / POS PAGE  —  Desktop-First Workstation Layout
// ─────────────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { state, addInvoice, getNextInvoiceNumber, showToast, dispatch, createHoldBill, updateHoldBill, deleteHoldBill } = useStore();

  // ── Search & Filter State ─────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);

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

  // ── Cart Totals ───────────────────────────────────────────────────────────
  const subtotal = cart.reduce((sum, item) => sum + item.product.sellPrice * item.quantity, 0);
  const discountAmount = Math.round((subtotal * discount) / 100);
  const total = subtotal - discountAmount;

  const amountPaid = useMemo(() => {
    if (paymentStatus === "Paid") return total;
    if (paymentStatus === "Debt") return 0;
    const val = Number(amountPaidInput) || 0;
    return Math.min(val, total);
  }, [paymentStatus, total, amountPaidInput]);

  const dueAmount = total - amountPaid;
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
        if (!liveProd || (liveProd.status || "Active") !== "Active" || liveProd.stock <= 0) {
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
    const cats = Array.from(new Set(state.products.map((p) => p.category))).sort();
    return ["All", ...cats];
  }, [state.products]);

  // Cart Totals are declared at the top of the component to prevent hoisting errors

  // ── Filtered products ─────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let list = state.products.filter((p) => (p.status || "Active") === "Active");
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
    if (!product || product.stock === 0 || (product.status || "Active") !== "Active") return;
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === productId);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
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
    if (qty > product.stock) return;
    setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i)));
  }

  // ── Generate Invoice ──────────────────────────────────────────────────────
  function handleGenerateInvoice() {
    setValidationError("");
    if (cart.length === 0) {
      showToast("Add at least one product to the cart.", "error");
      return;
    }

    // Live inventory stock & status validation check
    for (const item of cart) {
      const liveProduct = state.products.find((p) => p.id === item.product.id);
      if (!liveProduct) {
        setValidationError(`Product "${item.product.name}" is no longer available in inventory.`);
        showToast(`Product "${item.product.name}" was removed from inventory.`, "error");
        return;
      }
      if ((liveProduct.status || "Active") !== "Active") {
        setValidationError(`Product "${liveProduct.name}" is ${liveProduct.status || "Inactive"} and cannot be sold.`);
        showToast(`Product "${liveProduct.name}" is not active.`, "error");
        return;
      }
      if (item.quantity > liveProduct.stock) {
        setValidationError(`Insufficient stock for "${liveProduct.name}". Available: ${liveProduct.stock}, Cart: ${item.quantity}.`);
        showToast(`Insufficient stock for "${liveProduct.name}".`, "error");
        return;
      }
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

    // Business validation: Debt/Partial must have customer details
    if (paymentStatus === "Debt" || paymentStatus === "Partial") {
      if (!finalName || finalName.toLowerCase() === "walk-in customer") {
        setValidationError("Customer Name is required for Debt or Partial payment status.");
        showToast("Customer details required for debt tracking.", "error");
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

    const invId = `inv-${crypto.randomUUID()}`;
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
    };

    try {
      addInvoice(invoice);
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
    setGeneratedInvoice(null);
    setBilledBy("");
    setValidationError("");
    setShowClearConfirm(false);
    setActiveHoldBillId(null); // Clear hold bill workspace tracking
  }

  if (generatedInvoice) {
    return <InvoiceReceipt invoice={generatedInvoice} onNewBill={handleNewBill} />;
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
    <div className="flex flex-col h-[calc(100vh-3rem)] gap-0 -m-6">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-navy-950 flex items-center justify-center">
            <ReceiptText size={15} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Billing / POS</h1>
            <p className="text-xs text-slate-400 leading-tight">Workstation · {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Held Bills Manager Button with count badge */}
          <button
            type="button"
            onClick={() => setHeldBillsDrawerOpen(true)}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl transition cursor-pointer relative"
          >
            <ReceiptText size={14} className="text-slate-500" />
            Held Bills
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
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-650 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed border border-amber-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition cursor-pointer"
          >
            <Coins size={14} />
            {activeHoldBillId ? "Update Hold" : "Hold Bill"}
          </button>

          {cart.length > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full shrink-0">
              <ShoppingCart size={13} />
              {totalItems} item{totalItems !== 1 ? "s" : ""} · ₹{total.toLocaleString()}
            </div>
          )}
          <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full font-mono shrink-0">
            #{getNextInvoiceNumber()}
          </div>
        </div>
      </div>

      {/* ── 3-Panel Workspace ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ══════════════════════════════════════════════════════════════════
            PANEL 1 — Products Catalog  (flex: 1.2)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col bg-slate-50 border-r border-slate-200" style={{ width: "42%" }}>
          {/* Search bar */}
          <div className="px-5 pt-4 pb-3 bg-white border-b border-slate-100 shrink-0">
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
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border cursor-pointer shrink-0 ${
                  selectedCategory === c
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
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredProducts.map((product) => {
                  const inCart = cart.find((i) => i.product.id === product.id);
                  const outOfStock = product.stock === 0;
                  const lowStock = !outOfStock && product.stock <= product.lowStockThreshold;

                  return (
                    <div
                      key={product.id}
                      onClick={() => !outOfStock && addToCart(product.id)}
                      className={`relative bg-white rounded-xl border p-4 flex flex-col justify-between cursor-pointer select-none transition-all duration-150 group ${
                        outOfStock
                          ? "border-slate-150 opacity-55 cursor-not-allowed"
                          : inCart
                          ? "border-amber-400 shadow-md ring-2 ring-amber-300/40 bg-amber-50/20"
                          : "border-slate-200 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5"
                      }`}
                    >
                      {/* Qty badge */}
                      {inCart && (
                        <span className="absolute -top-2 -right-2 bg-amber-500 text-white font-extrabold rounded-full w-6 h-6 flex items-center justify-center text-xs shadow border-2 border-white z-10">
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

                      {/* Bottom: stock + price */}
                      <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${outOfStock ? "bg-red-500" : lowStock ? "bg-orange-400 animate-pulse" : "bg-green-500"}`} />
                          <span className="text-[10px] text-slate-500 font-medium">
                            {outOfStock ? "Out of stock" : lowStock ? `${product.stock} left` : `${product.stock} in stock`}
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
            PANEL 2 — Active Cart  (flex: 0.7)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col bg-white border-r border-slate-200" style={{ width: "28%" }}>
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
                {cart.map((item) => (
                  <div key={item.product.id} className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-800 leading-snug truncate" title={item.product.name}>
                          {item.product.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {item.product.sku}</p>
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
                ))}
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
            PANEL 3 — Checkout / Billing Form  (flex: 1)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col bg-white" style={{ width: "30%" }}>
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
                      {(() => {
                        const c = state.customers.find((c) => c.id === selectedCustomerId);
                        return c && c.debt > 0 ? (
                          <span className="mt-1 inline-block text-[10px] bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full font-bold">
                            ⚠ ₹{c.debt.toLocaleString()} debt
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedCustomerId(""); setCustomerName(""); setCustomerPhone(""); }}
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
                              {c.debt > 0 && (
                                <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-bold border border-red-100">
                                  ₹{c.debt.toLocaleString()} due
                                </span>
                              )}
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
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      discount === pct && discountInput === String(pct)
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
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Coins size={13} className="text-slate-400" />
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Payment Method</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "Cash", label: "Cash", icon: <Coins size={14} /> },
                  { id: "UPI", label: "UPI", icon: <Smartphone size={14} /> },
                  { id: "Card", label: "Card", icon: <CreditCard size={14} /> },
                  { id: "Credit", label: "Credit", icon: <AlertCircle size={14} /> },
                ].map((item) => {
                  const active = paymentMethod === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPaymentMethod(item.id as PaymentMethod)}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all cursor-pointer active:scale-95 ${
                        active
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
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                        active
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
              {amountPaid > 0 && amountPaid < total && (
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
                <span className="text-navy-950 text-xl font-black">₹{total.toLocaleString()}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateInvoice}
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
                  {cart.length === 0 ? "Add products to cart" : `Generate Bill · ₹${total.toLocaleString()}`}
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
            className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl border-l border-slate-200 animate-in slide-in-from-right duration-200"
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
                      className={`bg-white rounded-xl border p-4 shadow-sm space-y-3 relative transition hover:border-slate-300 ${
                        isCurrentActive ? "ring-2 ring-amber-400 border-amber-400" : "border-slate-200"
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

function InvoiceReceipt({ invoice, onNewBill }: { invoice: Invoice; onNewBill: () => void }) {
  function handlePrint() { window.print(); }

  function handleWhatsApp() {
    if (!invoice.customerPhone) { alert("No customer phone number to send to."); return; }
    const lines = invoice.items
      .map((item) => `• ${item.name} ×${item.quantity} = ₹${(item.price * item.quantity).toLocaleString()}`)
      .join("\n");
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
      `*Total: ₹${invoice.total.toLocaleString()}*\n` +
      (invoice.dueAmount > 0 ? `Due: ₹${invoice.dueAmount.toLocaleString()}\n` : "") +
      `Payment: ${invoice.paymentMethod} · ${invoice.paymentStatus}\n` +
      (invoice.notes ? `\nNote: ${invoice.notes}\n` : "") +
      `\nThank you! — 7 Star Car Accessories`;
    window.open(`https://wa.me/91${invoice.customerPhone}?text=${encodeURIComponent(msg)}`, "_blank");
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
          <PrintableInvoice invoice={invoice} />
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