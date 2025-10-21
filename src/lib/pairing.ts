import { Text, Judgement } from "./db";

export interface Pair {
  textA: Text;
  textB: Text;
}

type BTInfo = {
  theta?: Map<number, number>; // textId -> theta (gecentreerd)
  se?: Map<number, number>; // textId -> standaardfout
};

type Options = {
  targetComparisonsPerText?: number; // default 10
  batchSize?: number; // default: berekend uit target
  bt?: BTInfo; // optioneel: informatief pairen
  seThreshold?: number; // max toegestane SE voordat we "doorpairen" (default 0.30)
  // optioneel voor later: priorityTextIds?: number[]
};

function key(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

/** Union-Find om componenten te detecteren (grafiekconnectiviteit). */
class DSU {
  parent: number[];
  rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x: number) {
    return this.parent[x] === x ? x : (this.parent[x] = this.find(this.parent[x]));
  }
  union(a: number, b: number) {
    a = this.find(a);
    b = this.find(b);
    if (a === b) return;
    if (this.rank[a] < this.rank[b]) [a, b] = [b, a];
    this.parent[b] = a;
    if (this.rank[a] === this.rank[b]) this.rank[a]++;
  }
}

/**
 * Verbeterde pairing:
 * - Balanced exposure
 * - Forceert cross-component paren om grafiek te verbinden
 * - Informatiewinst: kleine |Δθ| en hoge (SE_t + SE_u) krijgen voorrang (als bt-info beschikbaar)
 * - Fallbacks wanneer bijna vol of SE-override niets oplevert
 * - Links/rechts randomiseren per paar
 */
export function generatePairs(
  texts: Text[],
  existingJudgements: Judgement[],
  opts: Options = {}
): Pair[] {
  const target = opts.targetComparisonsPerText ?? 10;
  const batchSize = opts.batchSize ?? Math.ceil((target * texts.length) / 4);
  const seThreshold = opts.seThreshold ?? 0.30;
  if (texts.length < 2) return [];

  // index mapping
  const id2idx = new Map<number, number>(texts.map((t, i) => [t.id!, i]));
  const n = texts.length;

  // judged pairs + exposure
  const judgedPairs = new Set<string>();
  const exposure = new Array(n).fill(0);
  for (const j of existingJudgements) {
    const ia = id2idx.get(j.textAId);
    const ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    judgedPairs.add(key(j.textAId, j.textBId));
    exposure[ia]++; exposure[ib]++;
  }

  // connectiviteit
  const dsu = new DSU(n);
  for (const j of existingJudgements) {
    const ia = id2idx.get(j.textAId);
    const ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    dsu.union(ia, ib);
  }

  // BT helpers
  const hasBT = Boolean(opts.bt?.theta && opts.bt?.se);
  const thetaOf = (id: number) => (hasBT ? (opts.bt!.theta!.get(id) ?? 0) : 0);
  const seOf    = (id: number) => (hasBT ? (opts.bt!.se!.get(id)    ?? 1) : 1);

  // Onder cap als: exposure < target, of (alleen mét BT) SE > drempel
  const underCap = (i: number) => {
    if (exposure[i] < target) return true;
    if (!hasBT) return false; // zonder BT-info geen SE-override
    const id = texts[i].id!;
    return seOf(id) > seThreshold;
  };

  // Score voor kandidaat
  function scoreOpp(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    if (judgedPairs.has(key(idI, idJ))) return -Infinity;
    if (!underCap(iIdx) || !underCap(jIdx)) return -Infinity;

    // base: lagere gezamenlijke exposure → beter
    let s = -(exposure[iIdx] + exposure[jIdx]);

    // connectiviteit bonus
    if (dsu.find(iIdx) !== dsu.find(jIdx)) s += 1000;

    // informatiewinst
    if (hasBT) {
      const dtheta = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const sumSE  = seOf(idI) + seOf(idJ);
      s += (10 - 10 * Math.min(dtheta, 1)); // kleine Δθ is beter
      s += 5 * Math.min(sumSE, 2);          // hoge onzekerheid → informatief
    }

    // breek ties
    s += Math.random() * 0.01;
    return s;
  }

  // Kandidatenlijst
  const allPairs: Array<{ iIdx: number; jIdx: number; score: number }> = [];
  for (let i = 0; i < n; i++) {
    if (!underCap(i)) continue;
    for (let j = i + 1; j < n; j++) {
      if (!underCap(j)) continue;
      if (!judgedPairs.has(key(texts[i].id!, texts[j].id!))) {
        const sc = scoreOpp(i, j);
        if (sc > -Infinity) allPairs.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
  }
  allPairs.sort((a, b) => b.score - a.score);

  // Selectie (greedy op gesorteerde lijst). Als dit niets oplevert, fallback zonder SE-override.
  const selected: Pair[] = [];
  const used = new Set<string>();

  const tryFill = (respectSEOverride: boolean) => {
    for (let k = 0; k < allPairs.length && selected.length < batchSize; k++) {
      const { iIdx, jIdx } = allPairs[k];
      const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
      const kkey = key(idI, idJ);
      if (used.has(kkey)) continue;

      // respecteer cap (met of zonder SE-override)
      const capI = respectSEOverride ? underCap(iIdx) : (exposure[iIdx] < target);
      const capJ = respectSEOverride ? underCap(jIdx) : (exposure[jIdx] < target);
      if (!capI || !capJ) continue;

      // voeg toe
      const flip = Math.random() < 0.5; // links/rechts randomiseren
      selected.push({
        textA: flip ? texts[jIdx] : texts[iIdx],
        textB: flip ? texts[iIdx] : texts[jIdx],
      });
      used.add(kkey);
      // update state zodat we niet teveel dezelfde inzetten binnen de batch
      exposure[iIdx]++; exposure[jIdx]++;
      dsu.union(iIdx, jIdx);
    }
  };

  // Eerst met SE-override (informatief doorpairen), dan zoniet gelukt: fallback zonder override
  tryFill(true);
  if (selected.length === 0) tryFill(false);

  return selected;
}
