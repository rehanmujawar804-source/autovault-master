"use client";

import { useState, useEffect } from "react";
import { useStore, toTitleCase } from "@/lib/store";
import { X, AlertCircle, Sparkles, Layers, Info, CheckCircle2 } from "lucide-react";
import type { Product, VehicleFitment } from "@/types";

const YEAR_REGEX = /^\d{4}$/;

const INPUT =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/20 focus:border-navy-600 transition-all placeholder:text-slate-400";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
      {children}
    </label>
  );
}

interface BulkFitmentModalProps {
  isOpen: boolean;
  mode: "assign" | "remove";
  onClose: () => void;
  selectedProducts: Product[];
  onSuccess?: () => void;
}

export function BulkFitmentModal({
  isOpen,
  mode,
  onClose,
  selectedProducts,
  onSuccess,
}: BulkFitmentModalProps) {
  const { bulkAssignFitment, bulkRemoveFitment, showToast } = useStore();

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setBrand("");
      setModel("");
      setYear("");
      setYearTo("");
      setFormError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const count = selectedProducts.length;
  const hasUniversalFit = selectedProducts.some((p) => p.isUniversalFit === true);

  function handleSubmit() {
    setFormError("");

    const normBrand = toTitleCase(brand);
    const normModel = toTitleCase(model);
    const normYear = year.trim();
    const normYearToRaw = yearTo.trim();

    if (!normBrand) {
      setFormError("Brand / Make is required.");
      return;
    }
    if (!normModel) {
      setFormError("Model is required.");
      return;
    }
    if (!normYear) {
      setFormError("Year From is required.");
      return;
    }
    if (!YEAR_REGEX.test(normYear)) {
      setFormError("Year From must be a valid 4-digit year (e.g. 2018).");
      return;
    }

    let normYearTo: string | undefined = undefined;
    if (normYearToRaw) {
      if (!YEAR_REGEX.test(normYearToRaw)) {
        setFormError("Year To must be a valid 4-digit year (e.g. 2022).");
        return;
      }
      if (Number(normYearToRaw) < Number(normYear)) {
        setFormError("Year To must be greater than or equal to Year From.");
        return;
      }
      if (normYearToRaw !== normYear) {
        normYearTo = normYearToRaw;
      }
    }

    const fitment: VehicleFitment = {
      brand: normBrand,
      model: normModel,
      year: normYear,
      ...(normYearTo ? { yearTo: normYearTo } : {}),
    };

    const productIds = selectedProducts.map((p) => p.id);

    if (mode === "assign") {
      const res = bulkAssignFitment(productIds, fitment);
      showToast(
        `Fitment assignment completed. ${res.processedCount} product${res.processedCount === 1 ? "" : "s"} processed (${res.addedCount} assigned/merged, ${res.skippedCount} redundant skipped).`,
        "success"
      );
    } else {
      const res = bulkRemoveFitment(productIds, fitment);
      showToast(
        `Bulk removal completed. ${res.processedCount} product${res.processedCount === 1 ? "" : "s"} processed (${res.removedCount} removed, ${res.skippedCount} untouched).`,
        "success"
      );
    }

    if (onSuccess) {
      onSuccess();
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div>
            <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Layers size={18} className={mode === "assign" ? "text-amber-500" : "text-rose-500"} />
              {mode === "assign" ? "Bulk Assign Vehicle Fitment" : "Bulk Remove Vehicle Fitment"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Applying to <strong className="text-slate-800">{count}</strong> selected product{count === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {formError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-2.5 rounded-xl">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {mode === "assign" && hasUniversalFit && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200/80 text-amber-900 text-xs p-3 rounded-xl">
              <Sparkles size={14} className="shrink-0 mt-0.5 text-amber-600" />
              <span>
                Note: 1 or more selected products are marked as <strong>Universal Fit</strong>. Universal Fit products are compatible with all vehicles and will be skipped during specific fitment assignment.
              </span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <FieldLabel>Brand / Make *</FieldLabel>
              <input
                type="text"
                placeholder="e.g. Honda, Toyota, Hyundai"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={INPUT}
                autoFocus
              />
            </div>

            <div>
              <FieldLabel>Model *</FieldLabel>
              <input
                type="text"
                placeholder="e.g. City, Civic, Fortuner"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={INPUT}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Year From *</FieldLabel>
                <input
                  type="text"
                  placeholder="e.g. 2018"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  maxLength={4}
                  className={INPUT}
                />
              </div>

              <div>
                <FieldLabel>Year To (Optional)</FieldLabel>
                <input
                  type="text"
                  placeholder="e.g. 2022"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  maxLength={4}
                  className={INPUT}
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Leave Year To empty for a single-year fitment.
            </p>
          </div>

          {/* Selected Products Preview */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 max-h-28 overflow-y-auto space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Target Products ({count})
            </p>
            {selectedProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs text-slate-700">
                <span className="font-semibold truncate max-w-[200px]">{p.name}</span>
                <span className="font-mono text-[10px] text-slate-400">{p.sku}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className={`flex-1 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
              mode === "assign"
                ? "bg-navy-950 hover:bg-navy-850"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {mode === "assign"
              ? `Assign to ${count} Product${count === 1 ? "" : "s"}`
              : `Remove from ${count} Product${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
