import type { RecentImportReport } from "@/types";

const STORAGE_KEY = "autovault_recent_import_reports";
const MAX_REPORTS = 5;

export function getRecentImportReports(): RecentImportReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_REPORTS);
    }
    return [];
  } catch {
    return [];
  }
}

export function saveRecentImportReport(report: RecentImportReport): RecentImportReport[] {
  if (typeof window === "undefined") return [report];
  try {
    const existing = getRecentImportReports();
    // Prepend new report, keep newest 5
    const updated = [report, ...existing].slice(0, MAX_REPORTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [report];
  }
}

/**
 * Clears stored recent import reports from localStorage during explicit store reset.
 * Fixes NEW-17: Prevents orphaned import reports from surviving factory store resets.
 */
export function clearRecentImportReports(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-blocking
  }
}

