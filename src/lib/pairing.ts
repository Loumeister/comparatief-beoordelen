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
  /**
   * Sta herhaaloordelen toe als er onvoldoende nieuwe paren zijn.
   */
  allowRepeats?: boolean;
  /**
   * Maximaal aantal extra oordelen per pair in repeat-modus.
   */
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

  // gate: wie heeft nog werk nodig?
  const underCap = (iIdx: number): boolean => {
    if (!allInOneComponent(dsu, n)) return true; // bridging eerst af
    if (exposure[iIdx] < MIN_BASE) return true; // fair floor
    if (hasBT) {
      const se = seOf(texts[iIdx].id!);
      if (!Number.isFinite(se)) return true;
      return se > SE_RELIABLE; // nog niet betrouwbaar
    }
    return exposure[iIdx] < target; // fallback
  };

  // score van een kandidaatpaar
  function scoreOpp(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!,
      idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    const count = judgedPairsCounts.get(kkey) ?? 0;

    if (!underCap(iIdx) || !underCap(jIdx)) return -Infinity;

    let s = 0;

    // fairness: lage gezamenlijke exposure
    s -= exposure[iIdx] + exposure[jIdx];

    // bridging-boost (niet overdreven; er is al een aparte bridging-fase)
    const isBridging = dsu.find(iIdx) !== dsu.find(jIdx);
    if (isBridging) s += 200;

    // repeats-penalty als geen bridging
    if (count > 0 && !isBridging) s -= 5;

    if (hasBT) {
      const dθ = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const seI = seOf(idI),
        seJ = seOf(idJ);
      const sumSE = (Number.isFinite(seI) ? seI : 2) + (Number.isFinite(seJ) ? seJ : 2);

      // Fisher-informatie: max bij Δθ=0
      const p = 1 / (1 + Math.exp(dθ));
      const info = p * (1 - p); // 0..0.25
      s += 40 * info; // 0..10
      s += 4 * Math.min(sumSE, 2); // 0..8 (focus op onzekere teksten)

      if ((Number.isFinite(seI) && seI > SE_REPEAT) || (Number.isFinite(seJ) && seJ > SE_REPEAT)) {
        s += 10;
      }
    }

    // tie-breaker
    s += Math.random() * 0.01;
    return s;
  }

  function canUsePair(iIdx: number, jIdx: number): boolean {
    const idI = texts[iIdx].id!,
      idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    const count = judgedPairsCounts.get(kkey) ?? 0;
    const isBridging = dsu.find(iIdx) !== dsu.find(jIdx);

    // als geen repeats: sla paren over die al bestaan (behalve bridging)
    if (!allowRepeats && count > 0 && !isBridging) return false;

    // met repeats: sta toe tot cap
    if (allowRepeats && count >= maxRejudgements && !isBridging) return false;

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

    // update lokale staat (simulatief) zodat scoring in dezelfde batch de juiste druk voelt
    judgedPairsCounts.set(kkey, (judgedPairsCounts.get(kkey) ?? 0) + 1);
    exposure[iIdx]++;
    exposure[jIdx]++;
    dsu.union(iIdx, jIdx);
    return true;
  }

  const selected: Pair[] = [];

  // FASE 1 — BRIDGING (met greedy matching: 1× per tekst in deze fase)
  if (!allInOneComponent(dsu, n)) {
    const bridges: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      if (!underCap(i)) continue;
      for (let j = i + 1; j < n; j++) {
        if (!underCap(j)) continue;
        if (dsu.find(i) === dsu.find(j)) continue; // alleen verschillende componenten
        if (!canUsePair(i, j)) continue;
        const sc = scoreOpp(i, j);
        if (sc > -Infinity) bridges.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
    bridges.sort((a, b) => b.score - a.score);

    // greedy matching: disjoint nodes
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

  // FASE 2 — INTRA-COMPONENT (greedy matching: 1× per tekst in deze fase)
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
