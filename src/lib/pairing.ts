// src/lib/pairing.ts
import { Text, Judgement } from "./db";

export interface Pair {
  textA: Text;
  textB: Text;
}

type BTInfo = {
  theta?: Map<number, number>; // textId -> theta
  se?: Map<number, number>;    // textId -> SE
};

type Options = {
  targetComparisonsPerText?: number;  // richtwaarde, alleen voor progress
  batchSize?: number;                 // aantal paren per batch
  bt?: BTInfo;                        // actuele BT-info
  seThreshold?: number;               // “klaar” als SE ≤ seThreshold (bv. 0.75)
  seRepeatThreshold?: number;         // herhalen pas bij SE ≥ deze drempel (bv. 0.75)
  judgedPairsCounts?: Map<string, number>;
  postTargetMode?: boolean;           // doorbeoordelen volgens strikte regels
  minBase?: number;                   // minimum exposures/tekst, bv. 3–5
};

function key(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

/** DSU voor connectiviteit */
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
    a = this.find(a); b = this.find(b);
    if (a === b) return;
    if (this.rank[a] < this.rank[b]) [a, b] = [b, a];
    this.parent[b] = a;
    if (this.rank[a] === this.rank[b]) this.rank[a]++;
  }
}

function allInOneComponent(dsu: DSU, n: number): boolean {
  const r0 = dsu.find(0);
  for (let i = 1; i < n; i++) if (dsu.find(i) !== r0) return false;
  return true;
}

/**
 * Strikte pairing:
 * - Pair alleen teksten die “werk” nodig hebben: SE > seThreshold of exposure < minBase
 * - Herhaling alleen als (bridge) of (minstens één SE ≥ seRepeatThreshold)
 * - PostTarget: zelfde regels; we laten alleen harde target-exposure los
 * - Geen UI-/positieaanpassing: A en B blijven zoals door caller aangeleverd
 */
export function generatePairs(
  texts: Text[],
  existingJudgements: Judgement[],
  opts: Options = {}
): Pair[] {
  const target = opts.targetComparisonsPerText ?? 10;
  const rawBatch = opts.batchSize ?? Math.ceil((target * texts.length) / 4);
  const batchSize = Math.max(2, rawBatch);

  const seThreshold = opts.seThreshold ?? 0.75;
  const seRepeatThreshold = opts.seRepeatThreshold ?? seThreshold;
  const minBase = Math.max(0, opts.minBase ?? 3);

  if (texts.length < 2) return [];

  // index
  const id2idx = new Map<number, number>(texts.map((t, i) => [t.id!, i]));
  const n = texts.length;

  // judged pairs / counts / exposure
  const judgedPairs = new Set<string>();
  const judgedPairsCounts = opts.judgedPairsCounts ?? new Map<string, number>();
  const exposure = new Array(n).fill(0);

  for (const j of existingJudgements) {
    const ia = id2idx.get(j.textAId);
    const ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    const k = key(j.textAId, j.textBId);
    judgedPairs.add(k);
    judgedPairsCounts.set(k, (judgedPairsCounts.get(k) ?? 0) + 1);
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
  const seOf = (id: number) => (hasBT ? (opts.bt!.se!.get(id) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY);

  // “Heeft nog werk?”
  const needsWork = (i: number) => {
    const id = texts[i].id!;
    if (!hasBT) {
      // Zonder BT: val terug op minimumexposure als harde eis
      return exposure[i] < Math.max(minBase, target);
    }
    return seOf(id) > seThreshold || exposure[i] < minBase;
  };

  // Herhalen zinvol?
  const canRepeat = (iIdx: number, jIdx: number) => {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const count = judgedPairsCounts.get(key(idI, idJ)) ?? 0;
    if (count === 0) return true;          // eerste keer altijd oké
    if (dsu.find(iIdx) !== dsu.find(jIdx)) return true; // bridge
    if (!hasBT) return false;
    // herhalen alleen als minstens één nog duidelijk onzeker is
    return seOf(idI) >= seRepeatThreshold || seOf(idJ) >= seRepeatThreshold;
  };

  // Scoring van kandidaatparen
  function scoreOpp(iIdx: number, jIdx: number): number {
    if (!needsWork(iIdx) || !needsWork(jIdx)) return -Infinity;
    if (!canRepeat(iIdx, jIdx)) return -Infinity;

    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    let s = 0;

    // Bridges zijn prioriteit
    const bridge = dsu.find(iIdx) !== dsu.find(jIdx);
    if (bridge) s += 1000;

    // Lage gezamenlijke exposure prefereren
    s -= (exposure[iIdx] + exposure[jIdx]);

    if (hasBT) {
      const dθ = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const sumSE = seOf(idI) + seOf(idJ);

      // Informatief: kleine Δθ en hogere SE
      s += 10 - 10 * Math.min(dθ, 1);
      s += 5 * Math.min(sumSE, 2);

      // Straf op bijna zekere uitslagen
      if (dθ > 3) s -= 20;

      // Bonus als minstens één ≥ seRepeatThreshold
      if (seOf(idI) >= seRepeatThreshold || seOf(idJ) >= seRepeatThreshold) s += 15;
    }

    // mini tiebreak
    s += Math.random() * 0.001;
    return s;
  }

  // Selectie: volgorde van aangeboden teksten bepalen; A en B worden getoond zoals aangeleverd
  function selectPair(iIdx: number, jIdx: number, selected: Pair[]) {
    // geen flipping/logica voor links/rechts — UI blijft alfabetisch sorteren
    selected.push({ textA: texts[iIdx], textB: texts[jIdx] });

    // update state
    const k = key(texts[iIdx].id!, texts[jIdx].id!);
    judgedPairs.add(k);
    exposure[iIdx]++; exposure[jIdx]++;
    dsu.union(iIdx, jIdx);
  }

  const selected: Pair[] = [];

  // Fase 1: bridges
  const bridges: Array<{ iIdx: number; jIdx: number; score: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (dsu.find(i) === dsu.find(j)) continue;
      const sc = scoreOpp(i, j);
      if (sc > -Infinity) bridges.push({ iIdx: i, jIdx: j, score: sc });
    }
  }
  bridges.sort((a, b) => b.score - a.score);
  for (const b of bridges) {
    if (selected.length >= batchSize) break;
    if (allInOneComponent(dsu, n)) break;
    selectPair(b.iIdx, b.jIdx, selected);
  }

  // Fase 2: intra-component informatief
  if (selected.length < batchSize) {
    const candidates: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (dsu.find(i) !== dsu.find(j)) continue;
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
