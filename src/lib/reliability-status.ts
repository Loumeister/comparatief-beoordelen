// src/lib/reliability-status.ts
// Derives cohort reliability status from ExportData results.

import { SE_RELIABLE, SE_MAX_EDGE, COHORT_PCT_RELIABLE, COHORT_MEDIAN_OK } from "@/lib/constants";
import type { ExportData } from "@/lib/export";

export function getReliabilityStatus(results: ExportData[]): 'insufficient' | 'moderate' | 'reliable' {
  const n = results.length;
  if (n === 0) return 'insufficient';

  const seList = results.map(r => r.standardError).sort((a, b) => a - b);
  const medianSE = n % 2 === 1 ? seList[(n - 1) / 2] : (seList[n / 2 - 1] + seList[n / 2]) / 2;
  const maxSE = Math.max(...seList);

  const pctReliable = (results.filter(r => r.standardError <= SE_RELIABLE).length / n) * 100;
  const cohortCriterionMet = medianSE <= COHORT_MEDIAN_OK && maxSE <= SE_MAX_EDGE;
  const individualCriterionMet = pctReliable >= COHORT_PCT_RELIABLE;

  if (individualCriterionMet || cohortCriterionMet) return 'reliable';
  if (medianSE <= 1.00) return 'moderate';
  return 'insufficient';
}
