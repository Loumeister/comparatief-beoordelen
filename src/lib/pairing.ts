import { Text, Judgement } from "./db";
import { isConnected } from "./graph";

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
 * Verbeterde pairing met hard bridging en SE-override:
 * - FASE 1: Cross-component paren (bridging) krijgen absolute prioriteit
 * - FASE 2: Informatieve paren binnen componenten
 * - SE-override: blijft pairen als SE > threshold (0.30), ook na target exposure
 * - Links/rechts randomisatie per paar om kant-bias te voorkomen
 */
export function generatePairs(
  texts: Text[],
  existingJudgements: Judgement[],
  opts: Options = {}
): Pair[] {
  const target = opts.targetComparisonsPerText ?? 10;
  const rawBatch = opts.batchSize ?? Math.ceil((target * texts.length) / 4);
  const batchSize = Math.max(4, rawBatch);
  if (texts.length < 2) return [];

  const id2idx = new Map<number, number>(texts.map((t, i) => [t.id!, i]));
  const n = texts.length;

  const judgedPairs = new Set<string>();
  const exposure = new Array(n).fill(0);
  for (const j of existingJudgements) {
    const ia = id2idx.get(j.textAId), ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    judgedPairs.add(key(j.textAId, j.textBId));
    exposure[ia]++; exposure[ib]++;
  }

  const dsu = new DSU(n);
  for (const j of existingJudgements) {
    const ia = id2idx.get(j.textAId), ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    dsu.union(ia, ib);
  }

  const hasBT = Boolean(opts.bt?.theta && opts.bt?.se);
  const thetaOf = (id: number) => (hasBT ? (opts.bt!.theta!.get(id) ?? 0) : 0);
  const seOf    = (id: number) => (hasBT ? (opts.bt!.se!.get(id)    ?? 1) : 1);
  const seThreshold = 0.30;

  const underCap = (i: number) => {
    if (exposure[i] < target) return true;
    if (!hasBT) return false;
    const id = texts[i].id!;
    return seOf(id) > seThreshold; // doorpairen als SE te hoog
  };

  function scoreOpp(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    if (judgedPairs.has(key(idI, idJ))) return -Infinity;
    if (!underCap(iIdx) || !underCap(jIdx)) return -Infinity;

    let s = -(exposure[iIdx] + exposure[jIdx]);
    if (dsu.find(iIdx) !== dsu.find(jIdx)) s += 1000; // bridging bonus

    if (hasBT) {
      const dθ = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const sumSE = seOf(idI) + seOf(idJ);
      s += (10 - 10 * Math.min(dθ, 1));   // kleine Δθ beter
      s += 5 * Math.min(sumSE, 2);        // hoge onzekerheid→informatief
      if (dθ > 3) s -= 20;                // penalty op bijna-zekere uitslag
    }

    s += Math.random() * 0.01;
    return s;
  }

  // ----- FASE 1: BRIDGING -----
  const selected: Pair[] = [];
  const used = new Set<string>();

  function selectPair(iIdx: number, jIdx: number) {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    if (used.has(kkey) || judgedPairs.has(kkey)) return false;
    if (!underCap(iIdx) || !underCap(jIdx)) return false;
    const flip = Math.random() < 0.5;
    selected.push({ textA: flip ? texts[jIdx] : texts[iIdx], textB: flip ? texts[iIdx] : texts[jIdx] });
    used.add(kkey);
    judgedPairs.add(kkey);
    exposure[iIdx]++; exposure[jIdx]++;
    dsu.union(iIdx, jIdx);
    return true;
  }

  // verzamel mogelijke brugparen
  const bridges: Array<{iIdx:number;jIdx:number;score:number}> = [];
  for (let i = 0; i < n; i++) {
    if (!underCap(i)) continue;
    for (let j = i + 1; j < n; j++) {
      if (!underCap(j)) continue;
      if (dsu.find(i) !== dsu.find(j) && !judgedPairs.has(key(texts[i].id!, texts[j].id!))) {
        const sc = scoreOpp(i, j);
        if (sc > -Infinity) bridges.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
  }
  bridges.sort((a, b) => b.score - a.score);

  // kies bridges totdat verbonden of batch vol
  for (const b of bridges) {
    if (selected.length >= batchSize) break;
    selectPair(b.iIdx, b.jIdx);
  }

  // ----- FASE 2: INTRA-COMPONENT (informatief) -----
  // alle resterende kandidaten
  const candidates: Array<{iIdx:number;jIdx:number;score:number}> = [];
  for (let i = 0; i < n; i++) {
    if (!underCap(i)) continue;
    for (let j = i + 1; j < n; j++) {
      if (!underCap(j)) continue;
      if (!judgedPairs.has(key(texts[i].id!, texts[j].id!))) {
        const sc = scoreOpp(i, j);
        if (sc > -Infinity) candidates.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    if (selected.length >= batchSize) break;
    selectPair(c.iIdx, c.jIdx);
  }

  return selected;
}
