import { Judgement, Text } from './db';

interface BTResult {
  textId: number;
  theta: number;
  standardError: number;
  rank: number;
  label: string;
  grade: number;
  reliability: string;
}

/**
 * Bradley-Terry model with ridge regularization
 * Calculates ability scores (theta) from pairwise comparisons
 */
export function calculateBradleyTerry(
  texts: Text[],
  judgements: Judgement[],
  lambda: number = 0.1
): BTResult[] {
  const n = texts.length;
  
  if (n === 0) {
    return [];
  }

  // Initialize theta values (log-ability)
  const theta = new Array(n).fill(0);
  const textIdToIndex = new Map(texts.map((t, i) => [t.id!, i]));
  
  // Count wins and total comparisons for each text
  const wins = new Array(n).fill(0);
  const comparisons = new Array(n).fill(0);
  
  judgements.forEach(j => {
    const idxA = textIdToIndex.get(j.textAId);
    const idxB = textIdToIndex.get(j.textBId);
    
    if (idxA === undefined || idxB === undefined) return;
    
    if (j.winner === 'A') {
      wins[idxA] += 1;
      comparisons[idxA] += 1;
      comparisons[idxB] += 1;
    } else if (j.winner === 'B') {
      wins[idxB] += 1;
      comparisons[idxA] += 1;
      comparisons[idxB] += 1;
    } else if (j.winner === 'EQUAL') {
      wins[idxA] += 0.5;
      wins[idxB] += 0.5;
      comparisons[idxA] += 1;
      comparisons[idxB] += 1;
    }
  });

  // Newton-Raphson iteration
  const maxIterations = 100;
  const tolerance = 1e-6;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const gradient = new Array(n).fill(0);
    const hessianDiag = new Array(n).fill(lambda); // Ridge regularization
    
    // Calculate gradient and Hessian diagonal
    for (let i = 0; i < n; i++) {
      gradient[i] = wins[i] - lambda * theta[i];
      
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        
        const idxI = texts[i].id!;
        const idxJ = texts[j].id!;
        
        // Count comparisons between i and j
        const compIJ = judgements.filter(
          jdg => (jdg.textAId === idxI && jdg.textBId === idxJ) ||
                 (jdg.textAId === idxJ && jdg.textBId === idxI)
        ).length;
        
        if (compIJ > 0) {
          const prob = 1 / (1 + Math.exp(theta[j] - theta[i]));
          gradient[i] -= compIJ * prob;
          hessianDiag[i] += compIJ * prob * (1 - prob);
        }
      }
    }
    
    // Update theta
    let maxChange = 0;
    for (let i = 0; i < n; i++) {
      const change = gradient[i] / hessianDiag[i];
      theta[i] += change;
      maxChange = Math.max(maxChange, Math.abs(change));
    }
    
    if (maxChange < tolerance) {
      break;
    }
  }

  // Calculate standard errors (approximation)
  const standardErrors = comparisons.map((count, i) => {
    if (count === 0) return Infinity;
    return 1 / Math.sqrt(count + lambda);
  });

  // Normalize theta (mean = 0)
  const meanTheta = theta.reduce((a, b) => a + b, 0) / n;
  const normalizedTheta = theta.map(t => t - meanTheta);

  // Sort by theta and assign ranks
  const results = texts.map((text, i) => ({
    textId: text.id!,
    theta: normalizedTheta[i],
    standardError: standardErrors[i],
    anonymizedName: text.anonymizedName,
  }));

  results.sort((a, b) => b.theta - a.theta);

  // Assign ranks, labels, grades, and reliability
  return results.map((r, i) => ({
    textId: r.textId,
    theta: r.theta,
    standardError: r.standardError,
    rank: i + 1,
    label: labelFromRank(i + 1, n),
    grade: gradeFromTheta(r.theta),
    reliability: reliabilityFromSE(r.standardError),
  }));
}

/**
 * Assign label based on rank quartiles
 */
function labelFromRank(rank: number, total: number): string {
  const percentile = rank / total;
  
  if (percentile <= 0.25) return 'Topgroep';
  if (percentile <= 0.50) return 'Bovengemiddeld';
  if (percentile <= 0.75) return 'Gemiddeld';
  return 'Onder gemiddeld';
}

/**
 * Map theta to grade (1-10 scale)
 * Uses z-score mapping: grade = 7 + 1.2 * z
 */
function gradeFromTheta(theta: number): number {
  const grade = 7 + 1.2 * theta;
  return Math.max(1, Math.min(10, Math.round(grade * 10) / 10));
}

/**
 * Determine reliability from standard error
 */
function reliabilityFromSE(se: number): string {
  if (se < 0.3) return 'Resultaat betrouwbaar';
  if (se < 0.5) return 'Nog enkele vergelijkingen nodig';
  return 'Onvoldoende gegevens';
}
