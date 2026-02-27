// src/lib/rater-analysis.ts
// Rater consistency metrics and disagreement analysis for team judgement mode.

import { Judgement, Text } from './db';
import { pairKey } from './utils';

/** Per-rater summary statistics */
export interface RaterStats {
  raterId: string;
  raterName: string;
  judgementCount: number;
  tieRate: number;          // fraction of EQUAL judgements
  modelAgreement: number;   // fraction that agree with BT predicted winner
  infit?: number;           // infit mean-square (1.0 = perfect fit); undefined if <10 judgements
  infitLabel?: string;      // "Goed consistent" / "Inconsistent patroon" / "Mogelijk onzorgvuldig"
}

/** A pair where raters explicitly disagree */
export interface Disagreement {
  textAId: number;
  textBId: number;
  textAName: string;
  textBName: string;
  raterVotes: { raterName: string; winner: 'A' | 'B' | 'EQUAL' }[];
  disagreementCount: number; // number of conflicting decisive votes
}

/** Full rater analysis result */
export interface RaterAnalysis {
  raterStats: RaterStats[];
  disagreements: Disagreement[];
  uniqueRaterCount: number;
}

/**
 * Compute per-rater statistics and disagreement analysis.
 *
 * @param judgements Effective judgements (already filtered via getEffectiveJudgements)
 * @param texts All texts for the assignment
 * @param btPredictions Map from textId -> theta (BT model fit)
 */
export function analyzeRaters(
  judgements: Judgement[],
  texts: Text[],
  btPredictions: Map<number, number>,
): RaterAnalysis {
  const textNameMap = new Map(texts.map(t => [t.id!, t.anonymizedName]));

  // Group judgements by raterId
  const byRater = new Map<string, Judgement[]>();
  for (const j of judgements) {
    const rid = j.raterId ?? 'unknown';
    if (!byRater.has(rid)) byRater.set(rid, []);
    byRater.get(rid)!.push(j);
  }

  // Per-rater stats
  const raterStats: RaterStats[] = [];
  for (const [rid, raterJudgements] of byRater) {
    const total = raterJudgements.length;
    const ties = raterJudgements.filter(j => j.winner === 'EQUAL').length;
    const tieRate = total > 0 ? ties / total : 0;

    // Model agreement: compare rater's choice with BT predicted winner
    let agreements = 0;
    let decisive = 0;
    for (const j of raterJudgements) {
      if (j.winner === 'EQUAL') continue;
      decisive++;
      const thetaA = btPredictions.get(j.textAId) ?? 0;
      const thetaB = btPredictions.get(j.textBId) ?? 0;
      const btWinner = thetaA > thetaB ? 'A' : thetaB > thetaA ? 'B' : 'EQUAL';
      if (btWinner === j.winner) agreements++;
    }
    const modelAgreement = decisive > 0 ? agreements / decisive : 1;

    // PLAN-12: Judge infit mean-square
    // infit_j = Σ(observed - expected)² / Σ var_ij
    // Only meaningful with ≥10 judgements
    let infit: number | undefined;
    let infitLabel: string | undefined;
    if (total >= 10) {
      let infitNum = 0;
      let infitDen = 0;
      for (const j of raterJudgements) {
        const thetaA = btPredictions.get(j.textAId) ?? 0;
        const thetaB = btPredictions.get(j.textBId) ?? 0;
        const pAB = 1 / (1 + Math.exp(thetaB - thetaA)); // P(A wins)
        const v = pAB * (1 - pAB);
        const obs = j.winner === 'A' ? 1 : j.winner === 'B' ? 0 : 0.5;
        const r2 = (obs - pAB) ** 2;
        infitNum += r2;
        infitDen += v;
      }
      infit = infitDen > 0 ? infitNum / infitDen : 1.0;
      infitLabel = infit > 1.5
        ? 'Mogelijk onzorgvuldig'
        : infit > 1.2
          ? 'Inconsistent patroon'
          : 'Goed consistent';
    }

    // Determine display name
    const sampleJ = raterJudgements[0];
    const name = sampleJ?.raterName || rid;

    raterStats.push({
      raterId: rid,
      raterName: name,
      judgementCount: total,
      tieRate,
      modelAgreement,
      infit,
      infitLabel,
    });
  }

  // Sort raters by judgement count (descending)
  raterStats.sort((a, b) => b.judgementCount - a.judgementCount);

  // Disagreement analysis: find pairs where raters disagree
  const disagreements: Disagreement[] = [];

  // Group judgements by pair
  const byPair = new Map<string, Judgement[]>();
  for (const j of judgements) {
    const pk = pairKey(j.textAId, j.textBId);
    if (!byPair.has(pk)) byPair.set(pk, []);
    byPair.get(pk)!.push(j);
  }

  for (const [, pairJudgements] of byPair) {
    // Only relevant if multiple raters judged this pair
    const raterIds = new Set(pairJudgements.map(j => j.raterId ?? 'unknown'));
    if (raterIds.size < 2) continue;

    // Collect decisive votes (A or B, not EQUAL)
    const decisiveVotes = pairJudgements.filter(j => j.winner !== 'EQUAL');
    const hasA = decisiveVotes.some(j => j.winner === 'A');
    const hasB = decisiveVotes.some(j => j.winner === 'B');

    if (hasA && hasB) {
      // Genuine disagreement
      const sample = pairJudgements[0];
      const raterVotes = pairJudgements.map(j => ({
        raterName: j.raterName || j.raterId || 'unknown',
        winner: j.winner,
      }));

      // Count the number of conflicting decisive votes
      const aCount = decisiveVotes.filter(j => j.winner === 'A').length;
      const bCount = decisiveVotes.filter(j => j.winner === 'B').length;

      disagreements.push({
        textAId: sample.textAId,
        textBId: sample.textBId,
        textAName: textNameMap.get(sample.textAId) || 'Onbekend',
        textBName: textNameMap.get(sample.textBId) || 'Onbekend',
        raterVotes,
        disagreementCount: Math.min(aCount, bCount),
      });
    }
  }

  // Sort disagreements by count (most contested first)
  disagreements.sort((a, b) => b.disagreementCount - a.disagreementCount);

  return {
    raterStats,
    disagreements,
    uniqueRaterCount: byRater.size,
  };
}

/**
 * Count unique raters from a list of judgements (quick helper for Dashboard).
 */
export function countUniqueRaters(judgements: Judgement[]): number {
  const raters = new Set<string>();
  for (const j of judgements) {
    raters.add(j.raterId ?? 'unknown');
  }
  return raters.size;
}
