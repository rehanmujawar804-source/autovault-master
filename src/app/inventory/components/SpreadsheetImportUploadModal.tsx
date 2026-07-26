"use client";

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from "react";
import {
  X,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import type { RecentImportReport } from "@/types";
import { getRecentImportReports } from "@/lib/recentImportReports";
import { generateImportChangeReportXLSX } from "@/lib/spreadsheetUtils";
import { useStore } from "@/lib/store";

interface SpreadsheetImportUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: (file: File) => void;
  onDownloadTemplate: () => void;
}

export function SpreadsheetImportUploadModal({
  isOpen,
  onClose,
  onContinue,
  onDownloadTemplate,
}: SpreadsheetImportUploadModalProps) {
  const { showToast } = useStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentReports, setRecentReports] = useState<RecentImportReport[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRecentReports(getRecentImportReports());
      setSelectedFile(null);
      setErrorMessage(null);
      setIsDragging(false);
    }
  }, [isOpen]);

  async function handleDownloadReportXLSX(report: RecentImportReport) {
    try {
      const blob = await generateImportChangeReportXLSX(report);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const cleanName = report.fileName.replace(/\.[^/.]+$/, "");
      const dateStr = new Date(report.date).toISOString().slice(0, 10);
      link.download = `AutoVault_Import_Report_${cleanName}_${dateStr}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Detailed XLSX import change report downloaded", "success");
    } catch {
      showToast("Failed to generate XLSX import report.", "error");
    }
  }

  if (!isOpen) return null;

  function validateAndSetFile(file: File) {
    const fileName = file.name.toLowerCase();
    const isSupported =
      fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".csv");

    if (!isSupported) {
      setErrorMessage("Unsupported file type. Please upload a .xlsx, .xls, or .csv file.");
      setSelectedFile(null);
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
    // Reset file input value so re-selecting same file works
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  }

  function handleClose() {
    setSelectedFile(null);
    setErrorMessage(null);
    setIsDragging(false);
    onClose();
  }

  function handleContinue() {
    if (!selectedFile) return;
    const fileToProcess = selectedFile;
    setSelectedFile(null);
    setErrorMessage(null);
    setIsDragging(false);
    onContinue(fileToProcess);
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getFileExtension(filename: string): string {
    const parts = filename.split(".");
    return parts.length > 1 ? parts.pop()?.toUpperCase() || "FILE" : "FILE";
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in-50 zoom-in-95 duration-150">
        {/* Hidden Native File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="text-navy-950" size={20} />
              <h2 className="font-bold text-slate-800 text-lg">Import Spreadsheet</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload an existing CSV or XLSX file to add or update products in your catalog.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDownloadTemplate}
              className="flex items-center gap-1.5 text-xs font-bold text-navy-950 hover:text-navy-800 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              title="Download sample import template"
            >
              <Download size={13} className="text-slate-600" />
              <span>Sample Template</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Modal Body / Dropzone ── */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {!selectedFile ? (
            /* ── Dropzone State (No File Selected) ── */
            <div
              onDragEnter={handleDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                isDragging
                  ? "border-navy-950 bg-slate-100/80 scale-[0.99]"
                  : "border-slate-300 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-navy-950 mb-2">
                <UploadCloud size={28} />
              </div>
              <p className="font-bold text-slate-800 text-sm">Drag & drop your spreadsheet here</p>
              <p className="text-xs text-slate-500 mt-1">or browse files from your computer</p>

              {/* Supported Format Badges */}
              <div className="flex items-center gap-1.5 mt-4">
                <span className="text-[10px] font-mono font-extrabold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded uppercase">
                  .xlsx
                </span>
                <span className="text-[10px] font-mono font-extrabold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded uppercase">
                  .xls
                </span>
                <span className="text-[10px] font-mono font-extrabold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded uppercase">
                  .csv
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="mt-5 px-5 py-2 bg-navy-950 hover:bg-navy-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Browse Files
              </button>
            </div>
          ) : (
            /* ── Selected File State ── */
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0">
                  <FileSpreadsheet size={24} />
                </div>
                <div className="min-w-0">
                  <span
                    className="font-bold text-slate-900 text-sm block truncate"
                    title={selectedFile.name}
                  >
                    {selectedFile.name}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded uppercase">
                      {getFileExtension(selectedFile.name)}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      {formatFileSize(selectedFile.size)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-xl flex items-center gap-1.5 hidden sm:flex">
                  <CheckCircle2 size={15} className="text-emerald-600" /> File ready for preview.
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-bold text-slate-700 hover:text-slate-900 border border-slate-300 hover:bg-white px-3 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <RefreshCw size={13} className="text-slate-500" />
                  Replace
                </button>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-red-900 text-xs font-semibold animate-in fade-in-50 duration-100">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ── Recent Import Reports Section (Max 5) ── */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs uppercase tracking-wider">
                <FileSpreadsheet size={14} className="text-navy-950" />
                Recent Import Reports (Latest 5)
              </div>
              <span className="text-[10px] text-slate-400 font-mono font-semibold">Session & Local Storage</span>
            </div>

            {recentReports.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2 text-center bg-white rounded-xl border border-slate-200/60">
                No recent import reports available.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {recentReports.map((rep) => (
                  <div
                    key={rep.id}
                    className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs transition-colors hover:border-slate-300"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs truncate max-w-[200px]" title={rep.fileName}>
                          {rep.fileName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(rep.date).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </div>

                      {/* Summary Metrics Badges */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[10px] font-mono">
                        <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                          {rep.totalRows} rows
                        </span>
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-extrabold">
                          +{rep.addedCount} Added
                        </span>
                        <span className="bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-extrabold">
                          {rep.updatedCount} Updated
                        </span>
                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {rep.unchangedCount} Same
                        </span>
                        {rep.errorCount > 0 && (
                          <span className="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-extrabold">
                            {rep.errorCount} Errors
                          </span>
                        )}
                        {(rep.stockIncreasedCount > 0 || rep.stockDecreasedCount > 0) && (
                          <span className="bg-purple-50 text-purple-800 border border-purple-200 px-1.5 py-0.5 rounded">
                            Stock: +{rep.stockIncreasedCount} / -{rep.stockDecreasedCount}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadReportXLSX(rep)}
                      className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-navy-950 hover:text-navy-800 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                      title="Download detailed change report in XLSX format"
                    >
                      <Download size={12} className="text-slate-600" />
                      <span>Detailed Report (.xlsx)</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── How Stock Import Works Explanation ── */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px] uppercase tracking-wider">
              <FileSpreadsheet size={13} className="text-navy-950" />
              How Stock Import Works (.csv & .xlsx)
            </div>
            <ul className="space-y-1 text-[11px] list-disc list-inside text-slate-600 leading-relaxed font-medium">
              <li>
                <strong className="text-slate-800">New Products (New SKU):</strong> The <code className="bg-slate-200/70 px-1 py-0.5 rounded font-mono text-[10px] text-slate-800">Stock</code> value sets the product's <em>Initial Stock</em> (recorded as Opening Stock).
              </li>
              <li>
                <strong className="text-slate-800">Existing Products (Matching SKU):</strong> The <code className="bg-slate-200/70 px-1 py-0.5 rounded font-mono text-[10px] text-slate-800">Stock</code> value sets the desired <em>Current Stock</em>. Only the difference (+/-) is logged as an Import stock movement.
              </li>
            </ul>
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            {selectedFile ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 size={13} /> Staged for processing
              </span>
            ) : (
              <span>Select a file to continue</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="border border-slate-300 hover:bg-slate-200/80 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedFile}
              onClick={handleContinue}
              className="bg-navy-950 hover:bg-navy-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>Continue to Preview</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
