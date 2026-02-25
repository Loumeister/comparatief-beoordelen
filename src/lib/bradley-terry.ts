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
  // Nieuw: signaal over graafconnectiviteit (voor UI/pairing)
  isGraphConnected?: boolean;
  components?: number;
}

/**
 * Bradley–Terry met ridge-regularisatie en VOLLEDIGE Hessian voor SE
 * - Precompute n_ij (aantal vergelijkingen) en w_ij (wins van i tegen j; ties = 0.5)
 * - Newton-Raphson/IRLS met per-iteratie centering Σθ=0 (voor stabiliteit)
 * - SE uit inverse van de gereduceerde, volledige Hessian (Cholesky op SPD)
 * - Check op graafconnectiviteit (nuttig voor pairing/waarschuwing)
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

  // index mapping
  const idxOf = new Map<number, number>(texts.map((t, i) => [t.id!, i]));

  // Precompute n_ij en w_ij
  const n_ij: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const w_ij: number[][] = Array.from({ length: n }, () => Array(n).fill(0)); // wins voor i tegen j
  const exposure = new Array(n).fill(0);

  for (const j of judgements) {
    const ia = idxOf.get(j.textAId);
    const ib = idxOf.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;

    n_ij[ia][ib] += 1;
    n_ij[ib][ia] += 1;
    exposure[ia] += 1;
    exposure[ib] += 1;

    if (j.winner === "A") w_ij[ia][ib] += 1;
    else if (j.winner === "B") w_ij[ib][ia] += 1;
    else if (j.winner === "EQUAL") {
      // 0,5-split approach (blijft ongewijzigd in deze minimale upgrade)
      w_ij[ia][ib] += 0.5;
      w_ij[ib][ia] += 0.5;
    }
  }

  // Init theta
  const theta = new Array(n).fill(0);

  // Newton-Raphson (diag Hessian voor de updates) + per-iteratie centering
  const maxIter = 100;
  const tol = 1e-6;
  for (let iter = 0; iter < maxIter; iter++) {
    const grad = new Array(n).fill(0);
    const Hdiag = new Array(n).fill(lambda); // ridge op diag

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

    // Damped update om oscillaties te voorkomen
    const damping = 1.0; // evt. 0.5–1.0
    let maxChange = 0;
    for (let i = 0; i < n; i++) {
      const delta = damping * (grad[i] / Math.max(Hdiag[i], 1e-12));
      theta[i] += delta;
      if (Math.abs(delta) > maxChange) maxChange = Math.abs(delta);
    }

    // Centering: Σθ = 0
    const meanTheta = theta.reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < n; i++) theta[i] -= meanTheta;

    if (maxChange < tol) break;
  }

  // ---------- VOLLEDIGE HESSIAN voor SE (bij finale theta) ----------
  // H_ii = lambda + Σ_j n_ij p_ij(1-p_ij)
  // H_ij = - n_ij p_ij(1-p_ij) (i != j)
  const H: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  // Pass 1: diagonaal — loop alle j!=i voor Hii accumulatie
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
  // Pass 2: off-diagonaal — elk paar (i,j) precies één keer bezoeken
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

  // Graafconnectiviteit (op basis van n_ij > 0)
  const compCount = countGraphComponents(n_ij);

  // SE’s via gereduceerde inverse (fix 1 referentie om de nul-som gauge te hanteren)
  // We kiezen de laatste index als referentie en nemen de (n-1)x(n-1) submatrix.
  const ref = n - 1;
  const { variancesReduced, ok } = invertReducedForVariances(H, ref);

  // Map variances terug naar volledige vector:
  // In deze gauge is var(ref) niet gedefinieerd; we benaderen die conservatief
  // als het gemiddelde van de nabije variances (praktisch voor reliability)
  const se = new Array(n).fill(Infinity);
  if (ok) {
    let avgVar = 0;
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      if (i === ref) continue;
      const v = variancesReduced[indexAfterRef(i, ref)];
      if (Number.isFinite(v)) {
        se[i] = Math.sqrt(Math.max(v, 0));
        avgVar += v;
        cnt++;
      }
    }
    const refVar = cnt > 0 ? Math.max(avgVar / cnt, 0) : Infinity;
    se[ref] = Number.isFinite(refVar) ? Math.sqrt(refVar) : Infinity;
  } else {
    // Fallback: gebruik diagonale benadering 1/√H[i][i]
    // Dit is minder nauwkeurig maar geeft een redelijke schatting
    for (let i = 0; i < n; i++) {
      const Hii = H[i][i];
      if (Hii > 1e-12) {
        se[i] = 1 / Math.sqrt(Hii);
      } else {
        se[i] = Infinity;
      }
    }
  }

  // Normaliseer (μ=0), bereken σ voor z-score
  const mu = theta.reduce((a, b) => a + b, 0) / n;
  const centered = theta.map((t) => t - mu);
  const variance = centered.reduce((s, t) => s + t * t, 0) / Math.max(n, 1);
  const sigma = Math.sqrt(Math.max(variance, 1e-12));

  // Bouw resultaten
  const outBasic = texts.map((t, i) => ({
    textId: t.id!,
    theta: centered[i],
    standardError: se[i],
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

  const results: BTResult[] = outBasic.map((r, i) => ({
    textId: r.textId,
    theta: r.theta,
    standardError: r.standardError,
    rank: i + 1,
    label: labelFromRank(i, n, topPct),
    grade: gradeFromTheta(r.theta, sigma),
    reliability: reliabilityFromSE(r.standardError),
    isGraphConnected: compCount === 1,
    components: compCount,
  }));

  return results;
}

/* ================== Helpers: matrix/graph utils ================== */

/** Aantal componenten in de ongerichte graaf met edges waar n_ij>0. */
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

/** Index mapping voor het reduceren van H: sla de rij/kolom 'ref' over. */
function indexAfterRef(i: number, ref: number): number {
  return i < ref ? i : i - 1;
}

/**
 * Inverteer de gereduceerde SPD-matrix H_rr (n-1 x n-1) via Cholesky en
 * geef de diagonaal van de inverse terug (variancesReduced).
 */
function invertReducedForVariances(H: number[][], ref: number): { variancesReduced: number[]; ok: boolean } {
  const n = H.length;
  if (n <= 1) return { variancesReduced: [], ok: false };

  // Bouw H_rr (zonder 'ref' rij/kolom)
  const m = n - 1;
  const Hr: number[][] = Array.from({ length: m }, () => Array(m).fill(0));
  for (let i = 0; i < n; i++) {
    if (i === ref) continue;
    for (let j = 0; j < n; j++) {
      if (j === ref) continue;
      Hr[indexAfterRef(i, ref)][indexAfterRef(j, ref)] = H[i][j];
    }
  }

  // Cholesky decompositie Hr = L L^T (Hr moet SPD zijn)
  const L = choleskyDecompose(Hr);
  if (!L) return { variancesReduced: new Array(m).fill(Infinity), ok: false };

  // Diagonaal van Hr^{-1} efficiënt via kolom-voor-kolom solves:
  // Voor elke e_k: los Hr x = e_k -> x; dan var_k = x_k.
  // (We kunnen ook alle kolommen doen en alleen diag nemen.)
  const variances: number[] = new Array(m).fill(0);
  for (let k = 0; k < m; k++) {
    const ek = new Array(m).fill(0);
    ek[k] = 1;
    const y = forwardSubstitution(L, ek);
    const x = backSubstitutionTranspose(L, y); // opl voor Hr x = e_k
    variances[k] = x[k];
  }

  return { variancesReduced: variances, ok: true };
}

/** Cholesky (lower-triangular) voor symmetrische positief-def. matrix. */
function choleskyDecompose(A: number[][]): number[][] | null {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 1e-12) return null; // niet SPD (numeriek)
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
  // lost L^T x = y op
  const n = L.length;
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= L[k][i] * x[k];
    x[i] = sum / L[i][i];
  }
  return x;
}
