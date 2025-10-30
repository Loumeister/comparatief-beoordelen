// src/lib/pairing.ts
import { Text, Judgement } from "./db";
import { MIN_BASE, SE_RELIABLE, SE_REPEAT, DEFAULT_BATCH_SIZE } from "./constants";

export interface Pair { textA: Text; textB: Text; }

type BTInfo = {
  theta?: Map<number, number>;
  se?: Map<number, number>;
};

type Options = {
  targetComparisonsPerText?: number;
  batchSize?: number;
  bt?: BTInfo;
  judgedPairsCounts?: Map<string, number>;
};

function key(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

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

export function generatePairs(texts: Text[], existing: Judgement[], opts: Options = {}): Pair[] {
  const target = opts.targetComparisonsPerText ?? 10;
  const batchSize = Math.max(2, opts.batchSize ?? DEFAULT_BATCH_SIZE);
  if (texts.length < 2) return [];

  // indexering
  const id2idx = new Map<number, number>(texts.map((t, i) => [t.id!, i]));
  const n = texts.length;

  // exposure & judged
  const judgedPairs = new Set<string>();
  const judgedPairsCounts = opts.judgedPairsCounts ?? new Map<string, number>();
  const exposure = new Array(n).fill(0);
  for (const j of existing) {
    const ia = id2idx.get(j.textAId), ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    const kkey = key(j.textAId, j.textBId);
    judgedPairs.add(kkey);
    judgedPairsCounts.set(kkey, (judgedPairsCounts.get(kkey) ?? 0) + 1);
    exposure[ia]++; exposure[ib]++;
  }

  // connectiviteit
  const dsu = new DSU(n);
  for (const j of existing) {
    const ia = id2idx.get(j.textAId), ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    dsu.union(ia, ib);
  }

  // BT helpers
  const hasBT = Boolean(opts.bt?.theta && opts.bt?.se);
  const thetaOf = (id: number) => (hasBT ? (opts.bt!.theta!.get(id) ?? 0) : 0);
  const seOf    = (id: number) => (hasBT ? (opts.bt!.se!.get(id)    ?? Infinity) : Infinity);

  const needsWork = (iIdx: number): boolean => {
    if (!allInOneComponent(dsu, n)) return true;
    if (exposure[iIdx] < MIN_BASE) return true;
    if (hasBT) {
      const se = seOf(texts[iIdx].id!);
      if (!Number.isFinite(se)) return true;
      return se > SE_RELIABLE;
    }
    return exposure[iIdx] < target;
  };

  function scoreOpp(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    const isBridging = dsu.find(iIdx) !== dsu.find(jIdx);
    const count = judgedPairsCounts.get(kkey) ?? 0;

    let s = 0;
    s -= (exposure[iIdx] + exposure[jIdx]);

    if (isBridging) s += 1000;
    if (count > 0 && !isBridging) s -= 5;

    // NIEUW: Sterke bonus voor studenten die nog niet in batch zitten
    const iInBatch = studentsInBatch.has(idI);
    const jInBatch = studentsInBatch.has(idJ);
    if (!iInBatch && !jInBatch) s += 100; // Beide nieuw: grote bonus
    else if (!iInBatch || !jInBatch) s += 50; // Een nieuw: middelgrote bonus
    else s -= 30; // Beide al in batch: penalty

    if (hasBT) {
      const dθ    = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const seI   = seOf(idI), seJ = seOf(idJ);
      const sumSE = (Number.isFinite(seI) ? seI : 2) + (Number.isFinite(seJ) ? seJ : 2);

      s += 10 - 10 * Math.min(dθ, 1);
      s += 5 * Math.min(sumSE, 2);

      if ((Number.isFinite(seI) && seI > SE_REPEAT) || (Number.isFinite(seJ) && seJ > SE_REPEAT)) {
        s += 15;
      }
      if (dθ > 3) s -= 20;
    }

    s += Math.random() * 0.01;
    return s;
  }

  function selectPairNoRepeat(iIdx: number, jIdx: number, selected: Pair[]): boolean {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    if (judgedPairs.has(kkey)) return false;

    const flip = Math.random() < 0.5;
    selected.push({ textA: flip ? texts[jIdx] : texts[iIdx], textB: flip ? texts[iIdx] : texts[jIdx] });

    // Track studenten in batch
    studentsInBatch.add(idI);
    studentsInBatch.add(idJ);
    
    judgedPairs.add(kkey);
    exposure[iIdx]++; exposure[jIdx]++;
    dsu.union(iIdx, jIdx);
    return true;
  }

  const pickedThisBatch = new Set<string>();
  const studentsInBatch = new Set<number>(); // Track welke studenten al in batch zitten
  
  function scoreOppAllowRepeat(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    const isBridging = dsu.find(iIdx) !== dsu.find(jIdx);
    const count = judgedPairsCounts.get(kkey) ?? 0;

    if (!(needsWork(iIdx) || needsWork(jIdx))) return -Infinity;

    let s = 0;
    s -= (exposure[iIdx] + exposure[jIdx]);
    if (isBridging) s += 800;
    if (count > 0) s -= 8 * Math.min(count, 5);

    if (hasBT) {
      const dθ    = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const seI   = seOf(idI), seJ = seOf(idJ);
      const sumSE = (Number.isFinite(seI) ? seI : 2) + (Number.isFinite(seJ) ? seJ : 2);
      s += 8 - 8 * Math.min(dθ, 1);
      s += 4 * Math.min(sumSE, 2);
      if ((Number.isFinite(seI) && seI > SE_REPEAT) || (Number.isFinite(seJ) && seJ > SE_REPEAT)) {
        s += 12;
      }
      if (dθ > 3) s -= 16;
    }

    s += Math.random() * 0.01;
    return s;
  }
  function selectPairAllowRepeat(iIdx: number, jIdx: number, selected: Pair[]): boolean {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    if (pickedThisBatch.has(kkey)) return false;

    const flip = Math.random() < 0.5;
    selected.push({ textA: flip ? texts[jIdx] : texts[iIdx], textB: flip ? texts[iIdx] : texts[jIdx] });

    // Track studenten in batch
    studentsInBatch.add(idI);
    studentsInBatch.add(idJ);
    
    pickedThisBatch.add(kkey);
    judgedPairsCounts.set(kkey, (judgedPairsCounts.get(kkey) ?? 0) + 1);
    exposure[iIdx]++; exposure[jIdx]++;
    dsu.union(iIdx, jIdx);
    return true;
  }

  const selected: Pair[] = [];

  // FASE 1 — BRIDGING
  if (!allInOneComponent(dsu, n)) {
    const bridges: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      if (!needsWork(i)) continue;
      for (let j = i + 1; j < n; j++) {
        if (!needsWork(j)) continue;
        if (dsu.find(i) === dsu.find(j)) continue;
        const idI = texts[i].id!, idJ = texts[j].id!;
        if (judgedPairs.has(key(idI, idJ))) continue;
        const sc = scoreOpp(i, j);
        if (sc > -Infinity) bridges.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
    bridges.sort((a, b) => b.score - a.score);
    for (const b of bridges) {
      if (selected.length >= batchSize) break;
      if (allInOneComponent(dsu, n)) break;
      selectPairNoRepeat(b.iIdx, b.jIdx, selected);
    }
  }

  // FASE 2 — INTRA: beide “needsWork”, geen repeats
  if (selected.length < batchSize) {
    const cands: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      if (!needsWork(i)) continue;
      for (let j = i + 1; j < n; j++) {
        if (!needsWork(j)) continue;
        const idI = texts[i].id!, idJ = texts[j].id!;
        if (judgedPairs.has(key(idI, idJ))) continue;
        const sc = scoreOpp(i, j);
        if (sc > -Infinity) cands.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      if (selected.length >= batchSize) break;
      selectPairNoRepeat(c.iIdx, c.jIdx, selected);
    }
  }

  // FASE 3 — RELAXED: minstens één “needsWork”, geen repeats
  if (selected.length < batchSize) {
    const cands: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!(needsWork(i) || needsWork(j))) continue;
        const idI = texts[i].id!, idJ = texts[j].id!;
        if (judgedPairs.has(key(idI, idJ))) continue;
        const sc = scoreOpp(i, j);
        if (sc > -Infinity) cands.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      if (selected.length >= batchSize) break;
      selectPairNoRepeat(c.iIdx, c.jIdx, selected);
    }
  }

  // FASE 4 — LAST RESORT: minstens één “needsWork”, repeats toegestaan
  if (selected.length < batchSize) {
    const cands: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!(needsWork(i) || needsWork(j))) continue;
        const sc = scoreOppAllowRepeat(i, j);
        if (sc > -Infinity) cands.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      if (selected.length >= batchSize) break;
      selectPairAllowRepeat(c.iIdx, c.jIdx, selected);
    }
  }

  return selected;
}
