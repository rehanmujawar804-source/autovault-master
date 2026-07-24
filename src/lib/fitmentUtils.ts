/**
 * AutoVault ERP — Vehicle Fitment Shared Utility Engine
 *
 * Centralizes normalization, range parsing, smart overlap merging,
 * range matching, and display formatting across all pages & store modules.
 */

import type { VehicleFitment } from "@/types";

export function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .trim()
    .toLowerCase()
    .replace(/(?:^|\s|-|\/)\S/g, (m) => m.toUpperCase());
}

export interface ParsedFitmentRange {
  brand: string;
  model: string;
  fromYear: number;
  toYear: number;
  originalYear: string;
  originalYearTo?: string;
}

/**
 * Parses any VehicleFitment object into canonical numeric boundaries.
 * Correctly handles single years, yearTo ranges, and legacy hyphenated strings ("2018-2022", "2018–2022").
 */
export function parseFitmentBoundary(fitment: VehicleFitment): ParsedFitmentRange {
  const brand = (fitment.brand || "").trim();
  const model = (fitment.model || "").trim();
  const rawYear = (fitment.year || "").trim();
  const rawYearTo = (fitment.yearTo || "").trim();

  let fromYear = 0;
  let toYear = 0;

  if (rawYear.includes("-") || rawYear.includes("–")) {
    const parts = rawYear.split(/[-–]/).map((s) => s.trim());
    fromYear = Number(parts[0]) || 0;
    toYear = Number(parts[1] || parts[0]) || fromYear;
  } else {
    fromYear = Number(rawYear) || 0;
    toYear = rawYearTo !== "" ? (Number(rawYearTo) || fromYear) : fromYear;
  }

  return {
    brand,
    model,
    fromYear,
    toYear,
    originalYear: rawYear,
    originalYearTo: rawYearTo || undefined,
  };
}

/**
 * Evaluates whether a selected numeric year falls within fromYear..toYear (inclusive).
 */
export function isYearInRange(selectedYear: number, fromYear: number, toYear: number): boolean {
  if (isNaN(selectedYear) || isNaN(fromYear) || isNaN(toYear)) return false;
  return fromYear <= selectedYear && selectedYear <= toYear;
}

/**
 * Evaluates whether a VehicleFitment object matches a target Brand, Model, and Year.
 * Used consistently across Vehicle Fitment search, POS evaluator, and catalog filters.
 */
export function isFitmentMatch(
  fitment: VehicleFitment,
  selectedBrand: string,
  selectedModel: string,
  selectedYear: number | string
): boolean {
  if (!fitment || !fitment.brand || !fitment.model) return false;

  const fBrand = fitment.brand.trim().toLowerCase();
  const fModel = fitment.model.trim().toLowerCase();
  const selBrand = selectedBrand.trim().toLowerCase();
  const selModel = selectedModel.trim().toLowerCase();

  if (fBrand !== selBrand || fModel !== selModel) return false;

  const parsed = parseFitmentBoundary(fitment);
  const selYearNum = typeof selectedYear === "number" ? selectedYear : Number(String(selectedYear).trim());

  if (isNaN(selYearNum)) {
    const selYearStr = String(selectedYear).trim();
    return parsed.originalYear === selYearStr || (parsed.originalYearTo ?? parsed.originalYear) === selYearStr;
  }

  return isYearInRange(selYearNum, parsed.fromYear, parsed.toYear);
}

/**
 * Formats a VehicleFitment object for display (e.g. "Honda City (2018–2022)").
 */
export function formatFitmentDisplay(fitment: VehicleFitment): string {
  const brand = toTitleCase(fitment.brand);
  const model = toTitleCase(fitment.model);
  const parsed = parseFitmentBoundary(fitment);

  let yearStr = "";
  if (parsed.fromYear > 0 && parsed.toYear > 0) {
    yearStr = parsed.fromYear === parsed.toYear ? `${parsed.fromYear}` : `${parsed.fromYear}–${parsed.toYear}`;
  } else {
    yearStr = fitment.yearTo && fitment.yearTo !== fitment.year ? `${fitment.year}–${fitment.yearTo}` : fitment.year;
  }

  return `${brand} ${model}${yearStr ? ` (${yearStr})` : ""}`;
}

/**
 * OPTION B — SMART RANGE OVERLAP PREVENTION
 *
 * Merges overlapping, enclosed, or touching vehicle fitment ranges for the SAME normalized Brand + Model.
 * Unrelated brands and models remain completely untouched.
 */
export function addOrMergeFitment(
  existingFitments: VehicleFitment[],
  newFitment: VehicleFitment
): {
  fitments: VehicleFitment[];
  wasMerged: boolean;
  wasAdded: boolean;
  isRedundant: boolean;
} {
  const normBrand = toTitleCase(newFitment.brand);
  const normModel = toTitleCase(newFitment.model);
  const newParsed = parseFitmentBoundary(newFitment);

  if (!normBrand || !normModel || newParsed.fromYear <= 0) {
    return { fitments: existingFitments, wasMerged: false, wasAdded: false, isRedundant: false };
  }

  const normTargetKey = `${normBrand.toLowerCase()}|${normModel.toLowerCase()}`;

  // Separate fitments into other models vs matching model
  const otherFitments: VehicleFitment[] = [];
  const matchingRanges: Array<{ from: number; to: number }> = [];

  for (const f of existingFitments || []) {
    const p = parseFitmentBoundary(f);
    const key = `${p.brand.toLowerCase()}|${p.model.toLowerCase()}`;
    if (key === normTargetKey) {
      if (p.fromYear > 0 && p.toYear > 0) {
        matchingRanges.push({ from: p.fromYear, to: p.toYear });
      }
    } else {
      otherFitments.push(f);
    }
  }

  // Check if new range is completely enclosed by an existing range
  const isEnclosed = matchingRanges.some(
    (r) => r.from <= newParsed.fromYear && newParsed.toYear <= r.to
  );

  if (isEnclosed) {
    return {
      fitments: existingFitments,
      wasMerged: false,
      wasAdded: false,
      isRedundant: true,
    };
  }

  // Add new range and sort all ranges by fromYear ascending, then toYear ascending
  const allRanges = [...matchingRanges, { from: newParsed.fromYear, to: newParsed.toYear }].sort(
    (a, b) => a.from - b.from || a.to - b.to
  );

  // Merge overlapping or touching ranges (touching: range1.to + 1 >= range2.from)
  const mergedRanges: Array<{ from: number; to: number }> = [];
  for (const r of allRanges) {
    if (mergedRanges.length === 0) {
      mergedRanges.push({ ...r });
    } else {
      const last = mergedRanges[mergedRanges.length - 1];
      if (r.from <= last.to + 1) {
        // Overlaps or touches — expand upper bound
        last.to = Math.max(last.to, r.to);
      } else {
        mergedRanges.push({ ...r });
      }
    }
  }

  // Reconstruct fitment objects for merged ranges
  const newMergedFitments: VehicleFitment[] = mergedRanges.map((r) => ({
    brand: normBrand,
    model: normModel,
    year: String(r.from),
    ...(r.from !== r.to ? { yearTo: String(r.to) } : {}),
  }));

  const finalFitments = [...otherFitments, ...newMergedFitments];
  const countBefore = matchingRanges.length;
  const countAfter = mergedRanges.length;

  const wasMerged = countBefore > 0 && countAfter <= countBefore;
  const wasAdded = !wasMerged && !isEnclosed;

  return {
    fitments: finalFitments,
    wasMerged,
    wasAdded,
    isRedundant: false,
  };
}

/**
 * Removes a specific fitment matching Brand, Model, and Year Range from a list of fitments.
 */
export function removeFitmentFromList(
  existingFitments: VehicleFitment[],
  targetFitment: VehicleFitment
): { fitments: VehicleFitment[]; removedCount: number } {
  const normBrand = targetFitment.brand.trim().toLowerCase();
  const normModel = targetFitment.model.trim().toLowerCase();
  const targetParsed = parseFitmentBoundary(targetFitment);

  let removedCount = 0;
  const updated = (existingFitments || []).filter((f) => {
    const p = parseFitmentBoundary(f);
    const sameBrand = p.brand.toLowerCase() === normBrand;
    const sameModel = p.model.toLowerCase() === normModel;
    const sameFrom = p.fromYear === targetParsed.fromYear;
    const sameTo = p.toYear === targetParsed.toYear;

    const isMatch = sameBrand && sameModel && sameFrom && sameTo;
    if (isMatch) {
      removedCount++;
      return false;
    }
    return true;
  });

  return { fitments: updated, removedCount };
}
