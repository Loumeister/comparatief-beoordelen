import { Judgement, Text } from "./db";
import { SE_RELIABLE, SE_REPEAT } from "./constants";

export interface BTResultRow {
  textId: number;
  theta: number;
  standardError: number;
  rank: number;
  label: string;
  grade: number;
  reliability: string;
}

export interface BTResults {
  rows: BTResultRow[];
  cohort: {
    medianSE: number;
    maxSE: number;
    pctReliable: number; // 0..100
  };
}

/**
 * Bradley–Terry met ridge-regularisatie (diag-Hessian benadering)
 * - Precompute n_ij (aantal vergelijkingen) en w_ij (wins van i tegen j; ties = 0.5)
 * - Newton-Raphson/IRLS met per-iteratie centering Σθ=0
 * - SE uit regularized Hessian-diagonaal
 */
export function calculateBradleyTerry(
  texts: Text[],
  judgements: Judgement[],
  lambda: number = 0.1,
  topPct: number = 0.1,
  grading: { base?: number; scale?: number; min?: number; max?: number } = {}
): BTResults {
  const base = grading.base ?? 7;
  const scale = grading.scale ?? 1.2;
  const gmin = grading.min ?? 1;
  const gmax = grading.max ?? 10;
  const n = texts.length;
  if (n === 0) return { rows: [], cohort: { medianSE: Infinity, maxSE: Infinity, pctReliable: 0 } };

  // index mapping
  const idxOf = new Map<number, number>(texts.map((t, i) => [t.id!, i]));

  // Precompute n_ij en w_ij
  const n_ij: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const w_ij: number[][] = Array.from({ length: n }, () => Array(n).fill(0)); // wins voor i tegen j

  const exposure = new Array(n).fill(0);
  judgements.forEach((j) => {
    const ia = idxOf.get(j.textAId);
    const ib = idxOf.get(j.textBId);
    if (ia == null || ib == null || ia === ib) return;
    n_ij[ia][ib] += 1;
    n_ij[ib][ia] += 1;
    exposure[ia] += 1;
    exposure[ib] += 1;

    if (j.winner === "A") {
      w_ij[ia][ib] += 1;
    } else if (j.winner === "B") {
      w_ij[ib][ia] += 1;
    } else if (j.winner === "EQUAL") {
      w_ij[ia][ib] += 0.5;
      w_ij[ib][ia] += 0.5;
    }
  });

  // Init theta
  const theta = new Array(n).fill(0);

  // Newton-Raphson (diag Hessian) + per-iteratie centering
  const maxIter = 100;
  const tol = 1e-6;
  for (let iter = 0; iter < maxIter; iter++) {
    const grad = new Array(n).fill(0);
    const Hdiag = new Array(n).fill(lambda); // ridge

    for (let i = 0; i < n; i++) {
      // wins_i = Σ_j w_ij
      let wins_i = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        wins_i += w_ij[i][j];
      }
      grad[i] = wins_i - lambda * theta[i];

      // Σ_j n_ij * p_ij en Hessian diag
      for (let j = 0; j < n; j++) {
        const nij = n_ij[i][j];
        if (i === j || nij === 0) continue;
        const pij = 1 / (1 + Math.exp(theta[j] - theta[i])); // P(i>j)
        grad[i] -= nij * pij;
        Hdiag[i] += nij * pij * (1 - pij);
      }
    }

    // Update
    let maxChange = 0;
    for (let i = 0; i < n; i++) {
      const delta = grad[i] / Math.max(Hdiag[i], 1e-12);
      theta[i] += delta;
      if (Math.abs(delta) > maxChange) maxChange = Math.abs(delta);
    }

    // Centering: Σθ = 0
    const meanTheta = theta.reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < n; i++) theta[i] -= meanTheta;

    if (maxChange < tol) break;
  }

  // SE uit (reg.) Hessian diag, met guard; 0 exposure -> Infinity
  const se = new Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    if (exposure[i] === 0) {
      se[i] = Infinity;
    } else {
      // Recompute Hdiag bij finale theta (één pass)
      let Hii = lambda;
      for (let j = 0; j < n; j++) {
        const nij = n_ij[i][j];
        if (i === j || nij === 0) continue;
        const pij = 1 / (1 + Math.exp(theta[j] - theta[i]));
        Hii += nij * pij * (1 - pij);
      }
      se[i] = Hii > 0 ? 1 / Math.sqrt(Hii) : Infinity;
    }
  }

  // Normaliseer (μ=0), bereken σ voor z-score
  const mu = theta.reduce((a, b) => a + b, 0) / n;
  const centered = theta.map((t) => t - mu);
  const variance = centered.reduce((s, t) => s + t * t, 0) / Math.max(n, 1);
  const sigma = Math.sqrt(Math.max(variance, 1e-12));

  // Bouw resultaten
  const out = texts.map((t, i) => ({
    textId: t.id!,
    theta: centered[i],
    standardError: se[i],
  }));
  out.sort((a, b) => b.theta - a.theta);

  // Helper functies binnen calculateBradleyTerry scope
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

  const rows = out.map((r, i) => ({
    textId: r.textId,
    theta: r.theta,
    standardError: r.standardError,
    rank: i + 1,
    label: labelFromRank(i, n, topPct),
    grade: gradeFromTheta(r.theta, sigma),
    reliability: reliabilityFromSE(r.standardError),
  }));

  // Bereken cohort metrics
  const seList = out.map(o => o.standardError).filter(Number.isFinite).sort((a,b)=>a-b);
  const medianSE = seList.length ? seList[Math.floor(seList.length/2)] : Infinity;
  const maxSE = seList.length ? Math.max(...seList) : Infinity;
  const pctReliable = out.length ? (out.filter(o => o.standardError <= SE_RELIABLE).length / out.length) * 100 : 0;

  return { rows, cohort: { medianSE, maxSE, pctReliable } };
}

export function reliabilityFromSE(se: number): string {
  if (se <= SE_RELIABLE) return "Resultaat betrouwbaar";
  if (se <= SE_REPEAT) return "Nog enkele vergelijkingen nodig";
  return "Onvoldoende gegevens";
}

