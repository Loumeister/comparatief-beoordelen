import { Text, Judgement } from './db';

export interface Pair {
  textA: Text;
  textB: Text;
}

/**
 * Generate balanced pairs for comparison
 * Each text appears approximately the same number of times
 * No duplicate pairs
 */
export function generatePairs(
  texts: Text[],
  existingJudgements: Judgement[],
  targetComparisonsPerText: number = 10
): Pair[] {
  if (texts.length < 2) {
    return [];
  }

  // Track which pairs have been judged
  const judgedPairs = new Set(
    existingJudgements.map(j => 
      `${Math.min(j.textAId, j.textBId)}-${Math.max(j.textAId, j.textBId)}`
    )
  );

  // Count appearances for each text
  const appearances = new Map<number, number>();
  texts.forEach(t => appearances.set(t.id!, 0));

  existingJudgements.forEach(j => {
    appearances.set(j.textAId, (appearances.get(j.textAId) || 0) + 1);
    appearances.set(j.textBId, (appearances.get(j.textBId) || 0) + 1);
  });

  // Generate all possible pairs
  const allPairs: Pair[] = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const pairKey = `${Math.min(texts[i].id!, texts[j].id!)}-${Math.max(texts[i].id!, texts[j].id!)}`;
      
      if (!judgedPairs.has(pairKey)) {
        allPairs.push({
          textA: texts[i],
          textB: texts[j]
        });
      }
    }
  }

  // Sort pairs by combined appearance count (prioritize texts that appear less)
  allPairs.sort((a, b) => {
    const countA = (appearances.get(a.textA.id!) || 0) + (appearances.get(a.textB.id!) || 0);
    const countB = (appearances.get(b.textA.id!) || 0) + (appearances.get(b.textB.id!) || 0);
    return countA - countB;
  });

  // Select pairs for balanced exposure
  const selectedPairs: Pair[] = [];
  const maxAppearances = targetComparisonsPerText;

  for (const pair of allPairs) {
    const countA = appearances.get(pair.textA.id!) || 0;
    const countB = appearances.get(pair.textB.id!) || 0;

    if (countA < maxAppearances && countB < maxAppearances) {
      selectedPairs.push(pair);
      appearances.set(pair.textA.id!, countA + 1);
      appearances.set(pair.textB.id!, countB + 1);
    }

    // Stop when we have enough pairs or all texts are balanced
    if (selectedPairs.length >= targetComparisonsPerText * texts.length / 2) {
      break;
    }
  }

  return selectedPairs;
}
