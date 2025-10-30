import { Judgement } from './db';

export function getEffectiveJudgements(all: Judgement[]): Judgement[] {
  // groepeer per pairKey
  const byPair = new Map<string, Judgement[]>();
  for (const j of all) {
    const pk = j.pairKey ?? [j.textAId, j.textBId].sort((a,b)=>a-b).join('-');
    if (!byPair.has(pk)) byPair.set(pk, []);
    byPair.get(pk)!.push(j);
  }

  const effective: Judgement[] = [];

  for (const list of byPair.values()) {
    // 1) finale moderatie domineert
    const finals = list.filter(j => j.isFinal === true);
    if (finals.length > 0) {
      finals.sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime());
      effective.push(finals[0]);
      continue;
    }

    // 2) anders: per rater alleen het nieuwste oordeel
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
