import { Judgement } from './db';

function safePairKey(j: Judgement): string {
  const a = Math.min(j.textAId, j.textBId);
  const b = Math.max(j.textAId, j.textBId);
  return j.pairKey ?? `${a}-${b}`;
}

function toTime(d: any): number {
  // ondersteunt Date of ISO/string
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

export function getEffectiveJudgements(all: Judgement[]): Judgement[] {
  // 0) sanity: filter incomplete/self-pairs
  const input = all.filter(j =>
    typeof j.textAId === 'number' &&
    typeof j.textBId === 'number' &&
    j.textAId !== j.textBId
  );

  // 1) groepeer per pairKey
  const byPair = new Map<string, Judgement[]>();
  for (const j of input) {
    const pk = safePairKey(j);
    (byPair.get(pk) ?? byPair.set(pk, []).get(pk)!).push(j);
  }

  const effective: Judgement[] = [];

  for (const list of byPair.values()) {
    // 2) verwijder alle gesupersedede oordelen
    const supersededIds = new Set<number>();
    for (const j of list) {
      if (typeof j.supersedesJudgementId === 'number') {
        supersededIds.add(j.supersedesJudgementId);
      }
    }
    const unsuperseded = list.filter(j => !supersededIds.has(j.id as number));

    // 3) als er finale moderaties zijn, pak de laatste finale
    const finals = unsuperseded.filter(j => j.isFinal === true);
    if (finals.length > 0) {
      finals.sort((a, b) => {
        const dt = toTime(b.createdAt) - toTime(a.createdAt);
        if (dt !== 0) return dt;
        // stabiele tiebreaker
        return (b.id ?? 0) - (a.id ?? 0);
      });
      effective.push(finals[0]);
      continue;
    }

    // 4) anders: per rater alleen het nieuwste oordeel
    const byRater = new Map<string, Judgement>();
    for (const j of unsuperseded) {
      const r = j.raterId ?? 'unknown';
      const prev = byRater.get(r);
      if (!prev) {
        byRater.set(r, j);
        continue;
      }
      const dt = toTime(j.createdAt) - toTime(prev.createdAt);
      if (dt > 0) {
        byRater.set(r, j);
      } else if (dt === 0) {
        // tiebreak op id (hoger = nieuwer)
        if ((j.id ?? 0) > (prev.id ?? 0)) byRater.set(r, j);
      }
    }

    effective.push(...byRater.values());
  }

  return effective;
}
