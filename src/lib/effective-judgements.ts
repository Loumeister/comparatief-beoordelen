// src/lib/effective-judgements.ts
import { Judgement } from './db';

/**
 * Bepaalt welke oordelen effectief meetellen volgens deze regels:
 * 1. Als er finale moderatie is voor een paar, telt alleen de laatste finale moderatie
 * 2. Anders: per rater telt alleen het nieuwste oordeel voor dat paar
 */
export function getEffectiveJudgements(all: Judgement[]): Judgement[] {
  // Groepeer per pairKey
  const byPair = new Map<string, Judgement[]>();
  for (const j of all) {
    const pk = j.pairKey ?? [j.textAId, j.textBId].sort((a, b) => a - b).join('-');
    if (!byPair.has(pk)) byPair.set(pk, []);
    byPair.get(pk)!.push(j);
  }

  const effective: Judgement[] = [];

  for (const list of byPair.values()) {
    // 1) Finale moderatie domineert
    const finals = list.filter(j => j.isFinal === true);
    if (finals.length > 0) {
      finals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      effective.push(finals[0]);
      continue;
    }

    // 2) Anders: per rater alleen het nieuwste oordeel
    const byRater = new Map<string, Judgement>();
    for (const j of list) {
      const r = j.raterId ?? 'unknown';
      const prev = byRater.get(r);
      if (!prev || j.createdAt > prev.createdAt) {
        byRater.set(r, j);
      }
    }
    effective.push(...byRater.values());
  }

  return effective;
}
