import { Text, Judgement } from "./db";
import { isConnected } from "./graph";
import {
  COHORT_MEDIAN_OK,
  COHORT_PCT_RELIABLE,
  SE_MAX_EDGE,
  SE_RELIABLE,
} from "@/lib/constants";

interface BTResult {
  textId: number;
  theta: number;
  standardError: number;
  rank: number;
  grade: number;
}

export interface ReliabilityAssessment {
  isReliable: boolean;
  coreReliable: boolean;
  corePercentage: number;
  graphConnected: boolean;
  pctReliable: number;
  medianSE: number;
  maxSE: number;
  topHasLadder: boolean;
  bottomHasLadder: boolean;
  convergenceOk: boolean;
  kendallTau: number | null;
  maxGradeDelta: number | null;
  message: string;
}

/**
 * Check of een uiterste (top/bottom) voldoende "ladder-bewijs" heeft
 * - Ten minste m matches tegen nabije buren (|Δθ| ≤ threshold)
 * - Ten minste 1 niet-triviale uitkomst
 */
function hasLadderEvidence(
  textId: number,
  theta: number,
  allResults: BTResult[],
  judgements: Judgement[],
  minMatches: number = 3,
  thetaThreshold: number = 1.5
): boolean {
  // Vind nabije buren
  const neighbors = allResults.filter(
    (r) => r.textId !== textId && Math.abs(r.theta - theta) <= thetaThreshold
  );

  if (neighbors.length === 0) return false;

  // Tel vergelijkingen tegen deze buren
  const neighborIds = new Set(neighbors.map((n) => n.textId));
  const matchesAgainstNeighbors = judgements.filter(
    (j) =>
      (j.textAId === textId && neighborIds.has(j.textBId)) ||
      (j.textBId === textId && neighborIds.has(j.textAId))
  );

  const hasNonTrivial = matchesAgainstNeighbors.some(j => j.winner !== "EQUAL");
  return matchesAgainstNeighbors.length >= minMatches && hasNonTrivial;
}

/**
 * Robuuste betrouwbaarheidscheck met:
 * 1. De vergelijkingsgraaf moet verbonden zijn
 * 2. Stopregel volgens constants: genoeg individuele SE's of cohort-SE ok
 * 3. Optionele convergentie: Kendall's τ ≥ 0.98 én max grade Δ ≤ 0.1
 */
export function assessReliability(
  currentResults: BTResult[],
  texts: Text[],
  judgements: Judgement[],
  previousResults?: { textId: number; rank: number; grade: number }[],
  seThreshold: number = SE_RELIABLE
): ReliabilityAssessment {
  const n = currentResults.length;

  if (n === 0) {
    return {
      isReliable: false,
      coreReliable: false,
      corePercentage: 0,
      graphConnected: false,
      pctReliable: 0,
      medianSE: Infinity,
      maxSE: Infinity,
      topHasLadder: false,
      bottomHasLadder: false,
      convergenceOk: false,
      kendallTau: null,
      maxGradeDelta: null,
      message: "Geen resultaten beschikbaar",
    };
  }

  const graphConnected = isConnected(texts, judgements);

  const seList = currentResults.map((r) => r.standardError).sort(compareStandardErrors);
  const medianSE = n % 2 === 1 ? seList[(n - 1) / 2] : (seList[n / 2 - 1] + seList[n / 2]) / 2;
  const maxSE = seList[n - 1];
  const pctReliable = (currentResults.filter((r) => r.standardError <= SE_RELIABLE).length / n) * 100;
  const individualCriterionMet = pctReliable >= COHORT_PCT_RELIABLE;
  const cohortCriterionMet = medianSE <= COHORT_MEDIAN_OK && maxSE <= SE_MAX_EDGE;

  // KERNSET (middelste 80%, percentielen 10-90) blijft beschikbaar als diagnose.
  const sorted = [...currentResults].sort((a, b) => b.theta - a.theta);
  const lo = Math.floor(0.1 * n);
  const hi = Math.ceil(0.9 * n);
  const core = sorted.slice(lo, hi);

  const coreReliableCount = core.filter((r) => r.standardError <= seThreshold).length;
  const corePercentage = core.length > 0 ? (coreReliableCount / core.length) * 100 : 0;
  const coreReliable = corePercentage >= 80;
  const stopCriterionMet = individualCriterionMet || cohortCriterionMet;

  // 2. UITERSTEN ladder-bewijs (top/bottom 10%, minstens 1 tekst per kant)
  let topHasLadder = true;
  let bottomHasLadder = true;

  if (n > 2) {
    const extremeCount = Math.max(1, Math.floor(0.1 * n));
    const topTexts = sorted.slice(0, extremeCount);
    const bottomTexts = sorted.slice(n - extremeCount);

    topHasLadder = topTexts.every(t =>
      hasLadderEvidence(t.textId, t.theta, currentResults, judgements));
    bottomHasLadder = bottomTexts.every(t =>
      hasLadderEvidence(t.textId, t.theta, currentResults, judgements));
  }

  // 3. CONVERGENTIE (alleen als we vorige resultaten hebben)
  let convergenceOk = true; // standaard true als geen vorige fit
  let kendallTau: number | null = null;
  let maxGradeDelta: number | null = null;

  if (previousResults && previousResults.length === n) {
    // Map textId -> rank/grade
    const prevMap = new Map(previousResults.map((r) => [r.textId, { rank: r.rank, grade: r.grade }]));
    const currMap = new Map(currentResults.map((r) => [r.textId, { rank: r.rank, grade: r.grade }]));

    // Zelfde volgorde voor vergelijking
    const textIds = currentResults.map((r) => r.textId);
    const prevRanks: number[] = [];
    const currRanks: number[] = [];
    const gradeDiffs: number[] = [];

    for (const tid of textIds) {
      const prev = prevMap.get(tid);
      const curr = currMap.get(tid);
      if (prev && curr) {
        prevRanks.push(prev.rank);
        currRanks.push(curr.rank);
        gradeDiffs.push(Math.abs(curr.grade - prev.grade));
      }
    }

    // Kendall's tau (simpel)
    if (prevRanks.length > 1) {
      kendallTau = calculateKendallTau(prevRanks, currRanks);
      maxGradeDelta = Math.max(...gradeDiffs);

      convergenceOk = kendallTau >= 0.98 && maxGradeDelta <= 0.1;
    }
  }

  // EINDBESLISSING
  const isReliable = graphConnected && stopCriterionMet && convergenceOk;

  let message = "";
  if (isReliable) {
    message = "Genoeg resultaten om cijfers te rapporteren.";
  } else {
    const issues: string[] = [];
    if (!graphConnected) issues.push("vergelijkingsnetwerk is nog niet verbonden");
    if (!stopCriterionMet) {
      issues.push(
        `${Math.round(pctReliable)}% betrouwbaar, mediaan SE ${formatSE(medianSE)}, max SE ${formatSE(maxSE)}`
      );
    }
    if (!convergenceOk) issues.push("rangorde nog niet stabiel");
    message = `Meer vergelijkingen nodig: ${issues.join(", ")}.`;
  }

  return {
    isReliable,
    coreReliable,
    corePercentage,
    graphConnected,
    pctReliable,
    medianSE,
    maxSE,
    topHasLadder,
    bottomHasLadder,
    convergenceOk,
    kendallTau,
    maxGradeDelta,
    message,
  };
}

function compareStandardErrors(a: number, b: number): number {
  const normalizedA = Number.isNaN(a) ? Infinity : a;
  const normalizedB = Number.isNaN(b) ? Infinity : b;

  if (normalizedA === normalizedB) return 0;
  return normalizedA < normalizedB ? -1 : 1;
}

function formatSE(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "onbekend";
}

function calculateKendallTau(ranks1: number[], ranks2: number[]): number {
  const n = ranks1.length;
  if (n < 2) return 1;

  let concordant = 0;
  let discordant = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sign1 = Math.sign(ranks1[i] - ranks1[j]);
      const sign2 = Math.sign(ranks2[i] - ranks2[j]);

      if (sign1 === sign2 && sign1 !== 0) concordant++;
      else if (sign1 !== 0 && sign2 !== 0) discordant++;
    }
  }

  const total = concordant + discordant;
  return total === 0 ? 1 : (concordant - discordant) / total;
}
