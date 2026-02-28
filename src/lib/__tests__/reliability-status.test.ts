import { describe, it, expect } from 'vitest';
import { getReliabilityStatus } from '../reliability-status';
import type { ExportData } from '../export';

function mkExportData(se: number): ExportData {
  return {
    anonymizedName: 'Tekst',
    rank: 1,
    label: 'Gemiddeld',
    grade: 7,
    theta: 0,
    standardError: se,
    reliability: 'Resultaat betrouwbaar',
    judgementCount: 10,
  };
}

describe('getReliabilityStatus', () => {
  it('returns "insufficient" for empty results', () => {
    expect(getReliabilityStatus([])).toBe('insufficient');
  });

  it('returns "reliable" when enough texts have SE <= 0.75', () => {
    // 8 out of 10 (80%) have SE <= 0.75 → exceeds COHORT_PCT_RELIABLE (70%)
    const results = [
      ...Array.from({ length: 8 }, () => mkExportData(0.5)),
      mkExportData(0.9),
      mkExportData(1.0),
    ];
    expect(getReliabilityStatus(results)).toBe('reliable');
  });

  it('returns "reliable" when median SE <= 0.80 and max SE <= 1.40', () => {
    // All SE = 0.78 → median=0.78 <= COHORT_MEDIAN_OK(0.80), max=0.78 <= SE_MAX_EDGE(1.40)
    const results = Array.from({ length: 5 }, () => mkExportData(0.78));
    expect(getReliabilityStatus(results)).toBe('reliable');
  });

  it('returns "moderate" when median SE <= 1.00 but criteria not met', () => {
    // 50% have SE <= 0.75 → below COHORT_PCT_RELIABLE(70%)
    // median SE = 0.9 → above COHORT_MEDIAN_OK(0.80) but below 1.00
    const results = [
      mkExportData(0.5),
      mkExportData(0.5),
      mkExportData(0.9),
      mkExportData(0.9),
      mkExportData(0.9),
      mkExportData(1.5), // high max SE → cohort criterion fails
    ];
    expect(getReliabilityStatus(results)).toBe('moderate');
  });

  it('returns "insufficient" when median SE > 1.00', () => {
    // All texts have very high SE
    const results = Array.from({ length: 5 }, () => mkExportData(2.0));
    expect(getReliabilityStatus(results)).toBe('insufficient');
  });

  it('handles single result', () => {
    // 1 text with low SE → 100% reliable → meets percentage criterion
    expect(getReliabilityStatus([mkExportData(0.3)])).toBe('reliable');
  });

  it('individual criterion alone is sufficient (even if cohort criterion fails)', () => {
    // 80% have SE <= 0.75 (individual criterion met)
    // But max SE > 1.40 (cohort criterion fails)
    const results = [
      ...Array.from({ length: 8 }, () => mkExportData(0.5)),
      mkExportData(1.2),
      mkExportData(2.0), // maxSE > 1.40
    ];
    expect(getReliabilityStatus(results)).toBe('reliable');
  });

  it('cohort criterion alone is sufficient (even if individual criterion fails)', () => {
    // All SE = 0.76 → 0% have SE <= 0.75 (individual criterion fails)
    // But median = 0.76 <= 0.80 and max = 0.76 <= 1.40 (cohort criterion met)
    const results = Array.from({ length: 5 }, () => mkExportData(0.76));
    expect(getReliabilityStatus(results)).toBe('reliable');
  });

  it('correctly computes median for even number of results', () => {
    // 4 results: SE = [0.5, 0.9, 1.1, 1.5] → sorted, median = (0.9+1.1)/2 = 1.0
    // individual: 1/4 = 25% <= 0.75 → fails
    // cohort: median=1.0 > 0.80 → fails; but median <= 1.00 → moderate
    const results = [mkExportData(0.5), mkExportData(0.9), mkExportData(1.1), mkExportData(1.5)];
    expect(getReliabilityStatus(results)).toBe('moderate');
  });

  it('correctly computes median for odd number of results', () => {
    // 5 results: SE = [0.5, 0.6, 0.7, 0.8, 0.9]
    // median = 0.7 <= 0.80, maxSE = 0.9 <= 1.40 → cohort criterion met
    const results = [
      mkExportData(0.5),
      mkExportData(0.6),
      mkExportData(0.7),
      mkExportData(0.8),
      mkExportData(0.9),
    ];
    expect(getReliabilityStatus(results)).toBe('reliable');
  });
});
