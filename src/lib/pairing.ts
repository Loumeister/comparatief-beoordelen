// src/lib/pairing.ts
import { Text, Judgement } from "./db";

export interface Pair {
  textA: Text;
  textB: Text;
}

type BTInfo = {
  theta?: Map<number, number>; // textId -> theta (gecentreerd)
  se?: Map<number, number>;    // textId -> standaardfout
};

type Options = {
  targetComparisonsPerText?: number; // default 10
  batchSize?: number;                // default: berekend uit target
  bt?: BTInfo;                       // optioneel: informatief pairen
  seThreshold?: number;              // max SE voor "voldoende"; boven deze drempel doorpairen (default 0.30)
  seRepeatThreshold?: number;        // herhaling toestaan als SE > deze drempel (default 0.8)
  judgedPairsCounts?: Map<string, number>; // aantal eerdere beoordelingen per paar (historisch)
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

function allInOneComponent(dsu: DSU, n: number): boolean {
  const root0 = dsu.find(0);
  for (let i = 1; i < n; i++) if (dsu.find(i) !== root0) return false;
  return true;
}

/**
 * Verbeterde pairing:
 * - Fase 1: absolute prioriteit voor cross-component paren (grafiek verbinden)
 * - Fase 2: informatieve paren binnen componenten (kleine |Δθ|, hoge SE, gebalanceerde exposure)
 * - SE-override: boven target blijven pairen als SE te hoog is (alleen als BT-info aanwezig)
 * - Δθ-penalty voor bijna-zekere uitslagen
 * - Links/rechts randomisatie voor bias-reductie
 * - Herhaling vermijden, behalve wanneer informatief (SE-gedreven) of bridging
 */
export function generatePairs(
  texts: Text[],
  existingJudgements: Judgement[],
  opts: Options = {}
): Pair[] {
  const target = opts.targetComparisonsPerText ?? 10;
  const rawBatch = opts.batchSize ?? Math.ceil((target * texts.length) / 4);
  const batchSize = Math.max(4, rawBatch);
  const seThreshold = opts.seThreshold ?? 0.3;
  const seRepeatThreshold = opts.seRepeatThreshold ?? 0.8;

  if (texts.length < 2) return [];

  // index mapping
  const id2idx = new Map<number, number>(texts.map((t, i) => [t.id!, i]));
  const n = texts.length;

  // Historische counts en exposure
  const judgedPairsCounts = opts.judgedPairsCounts ?? new Map<string, number>();
  const exposure = new Array(n).fill(0);

  for (const j of existingJudgements) {
    const ia = id2idx.get(j.textAId);
    const ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    const kkey = key(j.textAId, j.textBId);
    judgedPairsCounts.set(kkey, (judgedPairsCounts.get(kkey) ?? 0) + 1);
    exposure[ia]++;
    exposure[ib]++;
  }

  // connectiviteit (op basis van historische oordelen)
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

  // Score (informatie + fairness + connectiviteit) — herhaling alleen als informatief
  function scoreOpp(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);

    const count = judgedPairsCounts.get(kkey) ?? 0;        // historisch # beoordelingen
    const highSE = hasBT && (seOf(idI) > seRepeatThreshold || seOf(idJ) > seRepeatThreshold);
    const isBridging = dsu.find(iIdx) !== dsu.find(jIdx);

    // Vermijd herhaling tenzij informatief of bridging
    if (count > 0 && !highSE && !isBridging) return -Infinity;

    if (!underCap(iIdx) || !underCap(jIdx)) return -Infinity;

    // basis: lage gezamenlijke exposure prefereren
    let s = -(exposure[iIdx] + exposure[jIdx]);

    // lichte penalty voor herhalingen (weinig, want informatief/bridging is al geëist)
    if (count > 0) s -= 5;

    // bridging bonus
    if (isBridging) s += 1000;

    if (hasBT) {
      const dθ = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const sumSE = seOf(idI) + seOf(idJ);
      // kleine Δθ is informatiever
      s += 10 - 10 * Math.min(dθ, 1);
      // hoge onzekerheid (SE) is informatiever
      s += 5 * Math.min(sumSE, 2);
      // penalty op bijna-zekere uitslagen
      if (dθ > 3) s -= 20;
    }

    // tie breaker
    s += Math.random() * 0.01;
    return s;
  }

  // Alleen binnen **deze batch** willen we geen duplicaten:
  const usedPairsThisBatch = new Set<string>();

  // Helper om paar te selecteren (met left/right flip) en state te updaten
  function selectPair(iIdx: number, jIdx: number, selected: Pair[]): boolean {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    if (usedPairsThisBatch.has(kkey)) return false;
    if (!underCap(iIdx) || !underCap(jIdx)) return false;

    const flip = Math.random() < 0.5;
    selected.push({
      textA: flip ? texts[jIdx] : texts[iIdx],
      textB: flip ? texts[iIdx] : texts[jIdx],
    });

    usedPairsThisBatch.add(kkey);
    judgedPairsCounts.set(kkey, (judgedPairsCounts.get(kkey) ?? 0) + 1); // update historisch count voor latere keuzes in batch
    exposure[iIdx]++; exposure[jIdx]++;
    dsu.union(iIdx, jIdx);
    return true;
  }

  const selected: Pair[] = [];

  // ----- FASE 1: BRIDGING -----
  const bridges: Array<{ iIdx: number; jIdx: number; score: number }> = [];
  for (let i = 0; i < n; i++) {
    if (!underCap(i)) continue;
    for (let j = i + 1; j < n; j++) {
      if (!underCap(j)) continue;
      if (dsu.find(i) !== dsu.find(j)) {
        const sc = scoreOpp(i, j);
        if (sc > -Infinity) bridges.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
  }
  bridges.sort((a, b) => b.score - a.score);

  for (const b of bridges) {
    if (selected.length >= batchSize) break;
    if (allInOneComponent(dsu, n)) break; // al verbonden
    selectPair(b.iIdx, b.jIdx, selected);
  }

  // ----- FASE 2: INTRA-COMPONENT -----
  if (selected.length < batchSize) {
    const candidates: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      if (!underCap(i)) continue;
      for (let j = i + 1; j < n; j++) {
        if (!underCap(j)) continue;
        const sc = scoreOpp(i, j);
        if (sc > -Infinity) candidates.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    for (const c of candidates) {
      if (selected.length >= batchSize) break;
      selectPair(c.iIdx, c.jIdx, selected);
    }
  }

  return selected;
}
