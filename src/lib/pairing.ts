// src/lib/pairing.ts
import { Text, Judgement } from "./db";
import { MIN_BASE, SE_RELIABLE, SE_REPEAT, DEFAULT_BATCH_SIZE } from "@/lib/constants";

export interface Pair {
  textA: Text;
  textB: Text;
}

type BTInfo = {
  theta?: Map<number, number>;
  se?: Map<number, number>;
};

type Options = {
  targetComparisonsPerText?: number;
  batchSize?: number;
  bt?: BTInfo;
  judgedPairsCounts?: Map<string, number>;
  allowRepeats?: boolean;
  maxPairRejudgements?: number;
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
    a = this.find(a);
    b = this.find(b);
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

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : 0.5 * (a[m - 1] + a[m]);
}

export function generatePairs(texts: Text[], existing: Judgement[], opts: Options = {}): Pair[] {
  const target = opts.targetComparisonsPerText ?? 10;
  const batchSize = Math.max(2, opts.batchSize ?? DEFAULT_BATCH_SIZE);
  const allowRepeats = opts.allowRepeats ?? false;
  const maxRejudgements = Math.max(1, opts.maxPairRejudgements ?? 3);

  if (texts.length < 2) return [];

  // indexering
  const id2idx = new Map<number, number>(texts.map((t, i) => [t.id!, i]));
  const n = texts.length;

  // exposure & judged
  const judgedPairsCounts = opts.judgedPairsCounts ?? new Map<string, number>();
  const exposure = new Array(n).fill(0);
  for (const j of existing) {
    const ia = id2idx.get(j.textAId),
      ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    const kkey = key(j.textAId, j.textBId);
    judgedPairsCounts.set(kkey, (judgedPairsCounts.get(kkey) ?? 0) + 1);
    exposure[ia]++;
    exposure[ib]++;
  }

  // connectiviteit
  const dsu = new DSU(n);
  for (const j of existing) {
    const ia = id2idx.get(j.textAId),
      ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    dsu.union(ia, ib);
  }

  // BT helpers
  const hasBT = Boolean(opts.bt?.theta && opts.bt?.se);
  const thetaOf = (id: number) => (hasBT ? (opts.bt!.theta!.get(id) ?? 0) : 0);
  const seOf = (id: number) => (hasBT ? (opts.bt!.se!.get(id) ?? Infinity) : Infinity);

  // --- nieuwe balans- en kernparameters ---
  // theta→z: centre & scale
  let mu = 0,
    sigma = 1;
  if (hasBT) {
    const arr = texts.map((t) => thetaOf(t.id!));
    mu = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    const varc = arr.reduce((s, t) => s + (t - mu) * (t - mu), 0) / Math.max(1, arr.length);
    sigma = Math.sqrt(Math.max(varc, 1e-12));
  }
  const zOf = (id: number) => (thetaOf(id) - mu) / sigma;
  const isCore = (id: number) => Math.abs(zOf(id)) <= 1.0; // core = |z| ≤ 1
  const isLeftWing = (id: number) => zOf(id) < -1.0;
  const isRightWing = (id: number) => zOf(id) > 1.0;

  // relatieve exposure mediaan
  const expMedian = median(exposure);

  // gate: wie heeft nog werk nodig?
  const underCap = (iIdx: number): boolean => {
    // 1) bridging vóór alles
    if (!allInOneComponent(dsu, n)) return true;

    // 2) fair floor
    if (exposure[iIdx] < MIN_BASE) return true;

    // 3) relative exposure balancing: onder mediaan → nog meedoen
    if (exposure[iIdx] < expMedian) return true;

    // 4) met BT: nog niet betrouwbaar → nog meedoen
    if (hasBT) {
      const se = seOf(texts[iIdx].id!);
      if (!Number.isFinite(se)) return true; // cold-start
      if (se > SE_RELIABLE) return true;
    }

    // 5) anders klaar
    return false;
  };

  // score van een kandidaatpaar
  function scoreOpp(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!,
      idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    const count = judgedPairsCounts.get(kkey) ?? 0;

    // basisgate
    if (!underCap(iIdx) || !underCap(jIdx)) return -Infinity;

    let s = 0;

    // fairness: lage gezamenlijke exposure
    s -= exposure[iIdx] + exposure[jIdx];

    // bridging met duidelijke maar niet allesbepalende bonus
    const isBridge = dsu.find(iIdx) !== dsu.find(jIdx);
    if (isBridge) s += 200;

    // repeats-penalty als géén bridge
    if (count > 0 && !isBridge) s -= 10;

    if (hasBT) {
      const dθ = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const seI = seOf(idI),
        seJ = seOf(idJ);
      const sumSE = (Number.isFinite(seI) ? seI : 2) + (Number.isFinite(seJ) ? seJ : 2);

      // Fisher-informatie: max bij Δθ=0
      const p = 1 / (1 + Math.exp(dθ));
      const info = p * (1 - p); // 0..0.25
      s += 40 * info; // 0..10
      s += 4 * Math.min(sumSE, 2); // 0..8  (meer aandacht voor hoge SE)

      // extra als minstens één tekst duidelijk nog werk nodig heeft
      if ((Number.isFinite(seI) && seI > SE_REPEAT) || (Number.isFinite(seJ) && seJ > SE_REPEAT)) {
        s += 8;
      }

      // kern/wings-compositie:
      const coreI = isCore(idI),
        coreJ = isCore(idJ);
      const sameLeftWing = isLeftWing(idI) && isLeftWing(idJ);
      const sameRightWing = isRightWing(idI) && isRightWing(idJ);

      if (coreI && coreJ)
        s += 10; // core-core stimuleren
      else if (coreI || coreJ) s += 6; // core-wing oké
      if (sameLeftWing || sameRightWing) s -= 14; // wing-wing (zelfde kant) afremmen

      // heel grote Δθ zelden informatief → stevige straf
      if (dθ > 3) s -= 80;
      else if (dθ > 2) s -= 30;
    }

    // lichte voorkeur voor underexposed i/j t.o.v. mediaan
    const defI = Math.max(0, expMedian - exposure[iIdx]);
    const defJ = Math.max(0, expMedian - exposure[jIdx]);
    s += 2 * (defI + defJ);

    // tie-breaker
    s += Math.random() * 0.01;
    return s;
  }

  function canUsePair(iIdx: number, jIdx: number): boolean {
    const idI = texts[iIdx].id!,
      idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    const count = judgedPairsCounts.get(kkey) ?? 0;
    const isBridge = dsu.find(iIdx) !== dsu.find(jIdx);

    if (!allowRepeats && count > 0 && !isBridge) return false;
    if (allowRepeats && count >= maxRejudgements && !isBridge) return false;
    return true;
  }

  function selectPair(iIdx: number, jIdx: number, selected: Pair[]): boolean {
    if (!underCap(iIdx) || !underCap(jIdx)) return false;
    if (!canUsePair(iIdx, jIdx)) return false;

    const idI = texts[iIdx].id!,
      idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);

    const flip = Math.random() < 0.5;
    selected.push({ textA: flip ? texts[jIdx] : texts[iIdx], textB: flip ? texts[iIdx] : texts[jIdx] });

    // simuleer effect in-batch
    judgedPairsCounts.set(kkey, (judgedPairsCounts.get(kkey) ?? 0) + 1);
    exposure[iIdx]++;
    exposure[jIdx]++;
    dsu.union(iIdx, jIdx);
    return true;
  }

  const selected: Pair[] = [];

  // --- FASE 1: BRIDGING (greedy matching, disjoint nodes) ---
  if (!allInOneComponent(dsu, n)) {
    const bridges: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      if (!underCap(i)) continue;
      for (let j = i + 1; j < n; j++) {
        if (!underCap(j)) continue;
        if (dsu.find(i) === dsu.find(j)) continue;
        if (!canUsePair(i, j)) continue;
        const sc = scoreOpp(i, j);
        if (sc > -Infinity) bridges.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
    bridges.sort((a, b) => b.score - a.score);
    const used = new Array(n).fill(false);
    for (const b of bridges) {
      if (selected.length >= batchSize) break;
      if (allInOneComponent(dsu, n)) break;
      const { iIdx, jIdx } = b;
      if (used[iIdx] || used[jIdx]) continue;
      if (!selectPair(iIdx, jIdx, selected)) continue;
      used[iIdx] = true;
      used[jIdx] = true;
    }
  }

  // --- FASE 2: INTRA-COMPONENT (greedy matching, disjoint nodes) ---
  if (selected.length < batchSize) {
    const cands: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      if (!underCap(i)) continue;
      for (let j = i + 1; j < n; j++) {
        if (!underCap(j)) continue;
        if (!canUsePair(i, j)) continue;
        const sc = scoreOpp(i, j);
        if (sc > -Infinity) cands.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    const used = new Array(n).fill(false);
    for (const c of cands) {
      if (selected.length >= batchSize) break;
      const { iIdx, jIdx } = c;
      if (used[iIdx] || used[jIdx]) continue;
      if (!selectPair(iIdx, jIdx, selected)) continue;
      used[iIdx] = true;
      used[jIdx] = true;
    }
  }

  return selected;
}
