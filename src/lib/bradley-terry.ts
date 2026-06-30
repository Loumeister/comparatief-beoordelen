// src/lib/bradley-terry.ts
import type { Judgement, Text } from "@/lib/db";
import { SE_RELIABLE, SE_SOME_MORE } from "@/lib/constants";

interface BTResult {
  textId: number;
  theta: number;
  standardError: number;
  rank: number;
  label: string;
  grade: number;
  reliability: string;
  infit?: number;
  infitLabel?: string;
  isGraphConnected?: boolean;
  components?: number;
}

/**
 * Bradley-Terry with ridge regularization and full-Hessian standard errors.
 * Ties are represented as half-wins for each text.
 */
export function calculateBradleyTerry(
  texts: Text[],
  judgements: Judgement[],
  lambda: number = 0.1,
  topPct: number = 0.1,
  grading: { base?: number; scale?: number; min?: number; max?: number } = {},
): BTResult[] {
  const base = grading.base ?? 7;
  const scale = grading.scale ?? 1.2;
  const gmin = grading.min ?? 1;
  const gmax = grading.max ?? 10;

  const n = texts.length;
  if (n === 0) return [];

  const idxOf = new Map<number, number>(texts.map((t, i) => [t.id!, i]));

  const n_ij: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const w_ij: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (const j of judgements) {
    const ia = idxOf.get(j.textAId);
    const ib = idxOf.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;

    n_ij[ia][ib] += 1;
    n_ij[ib][ia] += 1;

    if (j.winner === "A") w_ij[ia][ib] += 1;
    else if (j.winner === "B") w_ij[ib][ia] += 1;
    else if (j.winner === "EQUAL") {
      w_ij[ia][ib] += 0.5;
      w_ij[ib][ia] += 0.5;
    }
  }

  const theta = new Array(n).fill(0);

  const maxIter = 100;
  const tol = 1e-6;
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

    const meanTheta = theta.reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < n; i++) theta[i] -= meanTheta;

    if (maxChange < tol) break;
  }

  const H: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    let Hii = lambda;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const nij = n_ij[i][j];
      if (nij === 0) continue;
      const pij = 1 / (1 + Math.exp(theta[j] - theta[i]));
      Hii += nij * pij * (1 - pij);
    }
    H[i][i] = Hii;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const nij = n_ij[i][j];
      if (nij === 0) continue;
      const pij = 1 / (1 + Math.exp(theta[j] - theta[i]));
      const w = nij * pij * (1 - pij);
      H[i][j] = -w;
      H[j][i] = -w;
    }
  }

  const compCount = countGraphComponents(n_ij);

  const se = new Array(n).fill(Infinity);
  const { variances, ok } = invertForCenteredVariances(H);
  if (ok) {
    for (let i = 0; i < n; i++) {
      const v = variances[i];
      if (Number.isFinite(v)) se[i] = Math.sqrt(Math.max(v, 0));
    }
  } else {
    for (let i = 0; i < n; i++) {
      const Hii = H[i][i];
      se[i] = Hii > 1e-12 ? 1 / Math.sqrt(Hii) : Infinity;
    }
  }

  const infitNum = new Array(n).fill(0);
  const infitDen = new Array(n).fill(0);
  for (const j of judgements) {
    const ia = idxOf.get(j.textAId);
    const ib = idxOf.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;

    const p_ab = 1 / (1 + Math.exp(theta[ib] - theta[ia]));
    const v = p_ab * (1 - p_ab);
    const obs = j.winner === "A" ? 1 : j.winner === "B" ? 0 : 0.5;
    const r2 = (obs - p_ab) ** 2;

    infitNum[ia] += r2;
    infitNum[ib] += r2;
    infitDen[ia] += v;
    infitDen[ib] += v;
  }
  const infit = new Array(n).fill(1.0);
  for (let i = 0; i < n; i++) {
    if (infitDen[i] > 0) infit[i] = infitNum[i] / infitDen[i];
  }

  const mu = theta.reduce((a, b) => a + b, 0) / n;
  const centered = theta.map((t) => t - mu);
  const variance = centered.reduce((s, t) => s + t * t, 0) / Math.max(n, 1);
  const sigma = Math.sqrt(Math.max(variance, 1e-12));

  const outBasic = texts.map((t, i) => ({
    textId: t.id!,
    theta: centered[i],
    standardError: se[i],
    infit: infit[i],
  }));
  outBasic.sort((a, b) => b.theta - a.theta);

  function labelFromRank(zeroBasedRank: number, total: number, topPct: number): string {
    const pct = (zeroBasedRank + 1) / total;
    if (pct <= topPct) return "Topgroep";
    if (pct <= 0.5) return "Bovengemiddeld";
    if (pct <= 0.9) return "Gemiddeld";
    return "Onder gemiddeld";
  }

  function gradeFromTheta(thetaCentered: number, stdTheta: number): number {
    const z = stdTheta > 1e-12 ? thetaCentered / stdTheta : 0;
    const raw = base + scale * z;
    return Math.max(gmin, Math.min(gmax, Math.round(raw * 10) / 10));
  }

  function reliabilityFromSE(s: number): string {
    if (s <= SE_RELIABLE) return "Resultaat betrouwbaar";
    if (s <= SE_SOME_MORE) return "Nog enkele vergelijkingen nodig";
    return "Onvoldoende gegevens";
  }

  function infitLabelFromValue(v: number): string {
    if (v > 1.3 || v < 0.7) return "Afwijkend patroon";
    return "Goed passend";
  }

  return outBasic.map((r, i) => ({
    textId: r.textId,
    theta: r.theta,
    standardError: r.standardError,
    rank: i + 1,
    label: labelFromRank(i, n, topPct),
    grade: gradeFromTheta(r.theta, sigma),
    reliability: reliabilityFromSE(r.standardError),
    infit: r.infit,
    infitLabel: infitLabelFromValue(r.infit),
    isGraphConnected: compCount === 1,
    components: compCount,
  }));
}

function countGraphComponents(n_ij: number[][]): number {
  const n = n_ij.length;
  if (n <= 1) return n;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (n_ij[i][j] > 0) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  const seen = new Array(n).fill(false);
  let comps = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    comps++;
    const stack = [s];
    seen[s] = true;
    while (stack.length) {
      const u = stack.pop()!;
      for (const v of adj[u]) {
        if (!seen[v]) {
          seen[v] = true;
          stack.push(v);
        }
      }
    }
  }
  return comps;
}

function invertForCenteredVariances(H: number[][]): { variances: number[]; ok: boolean } {
  const n = H.length;
  if (n <= 1) return { variances: [Infinity], ok: false };

  const L = choleskyDecompose(H);
  if (!L) return { variances: new Array(n).fill(Infinity), ok: false };

  const inv: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let k = 0; k < n; k++) {
    const ek = new Array(n).fill(0);
    ek[k] = 1;
    const y = forwardSubstitution(L, ek);
    const x = backSubstitutionTranspose(L, y);
    for (let i = 0; i < n; i++) inv[i][k] = x[i];
  }

  const rowMeans = inv.map((row) => row.reduce((a, b) => a + b, 0) / n);
  const grandMean = rowMeans.reduce((a, b) => a + b, 0) / n;
  const variances = new Array(n).fill(0).map((_, i) => inv[i][i] - 2 * rowMeans[i] + grandMean);

  return { variances, ok: true };
}

function choleskyDecompose(A: number[][]): number[][] | null {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 1e-12) return null;
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

function forwardSubstitution(L: number[][], b: number[]): number[] {
  const n = L.length;
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= L[i][k] * y[k];
    y[i] = sum / L[i][i];
  }
  return y;
}

function backSubstitutionTranspose(L: number[][], y: number[]): number[] {
  const n = L.length;
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= L[k][i] * x[k];
    x[i] = sum / L[i][i];
  }
  return x;
}
