// src/lib/split-half.ts
// PLAN-13: Split-half reliability coefficient via Monte Carlo random splits.
// Splits judgements in half, runs a lightweight BT on each, computes Spearman
// rank correlation, applies Spearman-Brown correction, and averages over splits.

import type { Judgement, Text } from './db';

/**
 * Lightweight BT fit: returns only theta vector (no SE, grading, infit).
 * Used internally for split-half reliability — runs fast on half-datasets.
 */
function fitBTThetas(
  texts: Text[],
  judgements: Judgement[],
  lambda: number = 0.1,
): Map<number, number> {
  const n = texts.length;
  if (n === 0) return new Map();

  const idxOf = new Map<number, number>(texts.map((t, i) => [t.id!, i]));

  // Precompute n_ij and w_ij
  const n_ij: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const w_ij: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (const j of judgements) {
    const ia = idxOf.get(j.textAId);
    const ib = idxOf.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;

    n_ij[ia][ib] += 1;
    n_ij[ib][ia] += 1;

    if (j.winner === 'A') w_ij[ia][ib] += 1;
    else if (j.winner === 'B') w_ij[ib][ia] += 1;
    else if (j.winner === 'EQUAL') {
      w_ij[ia][ib] += 0.5;
      w_ij[ib][ia] += 0.5;
    }
  }

  // Newton-Raphson with diagonal Hessian
  const theta = new Array(n).fill(0);
  const maxIter = 60;
  const tol = 1e-5;

  for (let iter = 0; iter < maxIter; iter++) {
    const grad = new Array(n).fill(0);
    const Hdiag = new Array(n).fill(lambda);

    for (let i = 0; i < n; i++) {
      let wins_i = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        wins_i += w_ij[i][j];
      }
      grad[i] = wins_i - lambda * theta[i];

      for (let j = 0; j < n; j++) {
        const nij = n_ij[i][j];
        if (i === j || nij === 0) continue;
        const pij = 1 / (1 + Math.exp(theta[j] - theta[i]));
        grad[i] -= nij * pij;
        Hdiag[i] += nij * pij * (1 - pij);
      }
    }

    let maxChange = 0;
    for (let i = 0; i < n; i++) {
      const delta = grad[i] / Math.max(Hdiag[i], 1e-12);
      theta[i] += delta;
      if (Math.abs(delta) > maxChange) maxChange = Math.abs(delta);
    }

    // Center
    const mean = theta.reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < n; i++) theta[i] -= mean;

    if (maxChange < tol) break;
  }

  const result = new Map<number, number>();
  texts.forEach((t, i) => result.set(t.id!, theta[i]));
  return result;
}

/**
 * Spearman rank correlation between two maps of textId -> theta.
 * Only includes texts present in both maps.
 */
function spearmanCorrelation(
  mapA: Map<number, number>,
  mapB: Map<number, number>,
): number | null {
  // Find shared text IDs
  const shared: number[] = [];
  for (const id of mapA.keys()) {
    if (mapB.has(id)) shared.push(id);
  }
  const n = shared.length;
  if (n < 3) return null;

  // Convert thetas to ranks
  const rank = (vals: number[]): number[] => {
    const indexed = vals.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => b.v - a.v); // descending
    const ranks = new Array(n).fill(0);
    indexed.forEach((item, r) => { ranks[item.i] = r + 1; });
    return ranks;
  };

  const valsA = shared.map(id => mapA.get(id)!);
  const valsB = shared.map(id => mapB.get(id)!);

  const ranksA = rank(valsA);
  const ranksB = rank(valsB);

  // Spearman rho = 1 - 6 * Σd² / (n(n²-1))
  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = ranksA[i] - ranksB[i];
    sumD2 += d * d;
  }

  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

/**
 * Seeded pseudo-random number generator (xorshift32) for reproducible splits.
 */
function xorshift32(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xFFFFFFFF;
  };
}

/**
 * Fisher-Yates shuffle using a seeded RNG.
 */
function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface SplitHalfResult {
  coefficient: number;      // Spearman-Brown corrected correlation (0-1)
  rawCorrelations: number[]; // per-split half correlations
  numSplits: number;         // actual number of splits performed
}

/**
 * Compute Monte Carlo split-half reliability.
 *
 * 1. Randomly split all judgements into two halves
 * 2. Run BT on each half independently
 * 3. Compute Spearman rank correlation between the two theta vectors
 * 4. Apply Spearman-Brown correction: r_full = 2 * r_half / (1 + r_half)
 * 5. Repeat for `numSplits` random splits and average
 *
 * Returns null if there are too few judgements (<6) to do a meaningful split.
 */
export function calculateSplitHalfReliability(
  texts: Text[],
  judgements: Judgement[],
  numSplits: number = 20,
  lambda: number = 0.1,
): SplitHalfResult | null {
  if (judgements.length < 6 || texts.length < 3) return null;

  const rawCorrelations: number[] = [];
  const seed = 42;

  for (let s = 0; s < numSplits; s++) {
    const rng = xorshift32(seed + s * 7919);
    const shuffled = shuffleArray(judgements, rng);

    const mid = Math.floor(shuffled.length / 2);
    const halfA = shuffled.slice(0, mid);
    const halfB = shuffled.slice(mid);

    const thetasA = fitBTThetas(texts, halfA, lambda);
    const thetasB = fitBTThetas(texts, halfB, lambda);

    const rho = spearmanCorrelation(thetasA, thetasB);
    if (rho != null) rawCorrelations.push(rho);
  }

  if (rawCorrelations.length === 0) return null;

  // Average half-correlation
  const meanRho = rawCorrelations.reduce((a, b) => a + b, 0) / rawCorrelations.length;

  // Spearman-Brown correction: r_full = 2 * r_half / (1 + r_half)
  const coefficient = meanRho > -1 ? (2 * meanRho) / (1 + meanRho) : 0;

  return {
    coefficient: Math.max(0, Math.min(1, coefficient)),
    rawCorrelations,
    numSplits: rawCorrelations.length,
  };
}
