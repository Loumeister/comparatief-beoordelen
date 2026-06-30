// src/lib/reliability-status.ts
// Derives cohort reliability status from ExportData results.

import { SE_RELIABLE, SE_MAX_EDGE, COHORT_PCT_RELIABLE, COHORT_MEDIAN_OK } from "@/lib/constants";
import type { ExportData } from "@/lib/export";

export function getReliabilityStatus(
  results: ExportData[],
  graphConnected: boolean = true,
): 'insufficient' | 'moderate' | 'reliable' {
  const n = results.length;
  if (n === 0) return 'insufficient';
  if (!graphConnected) return 'insufficient';

  const seList = results.map(r => r.standardError).sort(compareStandardErrors);
  const medianSE = n % 2 === 1 ? seList[(n - 1) / 2] : (seList[n / 2 - 1] + seList[n / 2]) / 2;
  const maxSE = seList[n - 1];

  const pctReliable = (results.filter(r => r.standardError <= SE_RELIABLE).length / n) * 100;
  const cohortCriterionMet = medianSE <= COHORT_MEDIAN_OK && maxSE <= SE_MAX_EDGE;
  const individualCriterionMet = pctReliable >= COHORT_PCT_RELIABLE;

  if (individualCriterionMet || cohortCriterionMet) return 'reliable';
  if (medianSE <= 1.00) return 'moderate';
  return 'insufficient';
}

function compareStandardErrors(a: number, b: number): number {
  const normalizedA = Number.isNaN(a) ? Infinity : a;
  const normalizedB = Number.isNaN(b) ? Infinity : b;

  if (normalizedA === normalizedB) return 0;
  return normalizedA < normalizedB ? -1 : 1;
}
