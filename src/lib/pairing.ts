// src/lib/pairing.ts
import { Text, Judgement } from "./db";
import { MIN_BASE, SE_RELIABLE, SE_REPEAT, DEFAULT_BATCH_SIZE } from "@/lib/constants";

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
  const judgedPairs = new Set<string>();                     // alle historisch al beoordeelde paren
  const judgedPairsCounts = opts.judgedPairsCounts ?? new Map<string, number>(); // # keer beoordeeld (historisch)
  const exposure = new Array(n).fill(0);                     // # keer dat tekst i voorkwam (historisch)
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

  // ————————————
  // Tekststatus: heeft deze tekst nog werk nodig?
  // 1) zolang graaf niet connected: iedereen mag meedoen (bridging eerst)
  // 2) fair floor: tot MIN_BASE iedereen meedoen
  // 3) met BT: klaar = SE ≤ SE_RELIABLE
  // 4) anders fallback op target exposure
  // ————————————
  const needsWork = (iIdx: number): boolean => {
    if (!allInOneComponent(dsu, n)) return true;
    if (exposure[iIdx] < MIN_BASE) return true;
    if (hasBT) {
      const se = seOf(texts[iIdx].id!);
      if (!Number.isFinite(se)) return true; // ∞/NaN → nog werk
      return se > SE_RELIABLE;
    }
    return exposure[iIdx] < target;
  };

  // score voor een kandidaat-paar (zonder repeats)
  function scoreOpp(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    const isBridging = dsu.find(iIdx) !== dsu.find(jIdx);
    const count = judgedPairsCounts.get(kkey) ?? 0;

    // beide moeten meedoen in deze fase (fase 1 & 2 & 3 sturen via filters)
    let s = 0;

    // fairness: lage gezamenlijke exposure
    s -= (exposure[iIdx] + exposure[jIdx]);

    // bridging grote bonus
    if (isBridging) s += 1000;

    // herhaal penalty als geen bridging
    if (count > 0 && !isBridging) s -= 5;

    if (hasBT) {
      const dθ    = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const seI   = seOf(idI), seJ = seOf(idJ);
      const sumSE = (Number.isFinite(seI) ? seI : 2) + (Number.isFinite(seJ) ? seJ : 2);

      // informatief: kleine Δθ
      s += 10 - 10 * Math.min(dθ, 1);
      // informatief: hoge som van SE's (cap 2)
      s += 5 * Math.min(sumSE, 2);

      // extra prioriteit als minstens één tekst echt nog hoog is
      if ((Number.isFinite(seI) && seI > SE_REPEAT) || (Number.isFinite(seJ) && seJ > SE_REPEAT)) {
        s += 15;
      }

      // near-certain penalty
      if (dθ > 3) s -= 20;
    }

    s += Math.random() * 0.01; // tie-breaker
    return s;
  }

  // selecteer een paar ZONDER repeats
  function selectPairNoRepeat(iIdx: number, jIdx: number, selected: Pair[]): boolean {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    if (judgedPairs.has(kkey)) return false;

    // beide moeten (in de fase waar dit gebruikt wordt) door de filter komen
    const flip = Math.random() < 0.5;
    selected.push({ textA: flip ? texts[jIdx] : texts[iIdx], textB: flip ? texts[iIdx] : texts[jIdx] });

    judgedPairs.add(kkey);               // voorkom herselectie binnen dezelfde batch-run
    exposure[iIdx]++; exposure[jIdx]++;  // update lokale exposure
    dsu.union(iIdx, jIdx);               // grafen kunnen samensmelten
    return true;
  }

  // selecteer een paar MET repeats toegestaan (last resort)
  const pickedThisBatch = new Set<string>(); // voorkom dubbele picks binnen déze batch
  function scoreOppAllowRepeat(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    const isBridging = dsu.find(iIdx) !== dsu.find(jIdx);
    const count = judgedPairsCounts.get(kkey) ?? 0;

    let s = 0;

    // blijven prioriteren: minstens één needsWork is het doel van deze fase
    if (!(needsWork(iIdx) || needsWork(jIdx))) return -Infinity;

    // fairness
    s -= (exposure[iIdx] + exposure[jIdx]);

    // bridging bonus (kan in praktijk zelden voorkomen in deze fase)
    if (isBridging) s += 800;

    // herhaal-penalty sterker in deze fase
    if (count > 0) s -= 8 * Math.min(count, 5); // cap de straf

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
    if (pickedThisBatch.has(kkey)) return false; // niet twee keer in dezelfde batch

    const flip = Math.random() < 0.5;
    selected.push({ textA: flip ? texts[jIdx] : texts[iIdx], textB: flip ? texts[iIdx] : texts[jIdx] });

    pickedThisBatch.add(kkey);
    // let op: judgedPairs (historische set) laten we staan; we laten nu expliciet repeats toe
    judgedPairsCounts.set(kkey, (judgedPairsCounts.get(kkey) ?? 0) + 1);
    exposure[iIdx]++; exposure[jIdx]++;
    dsu.union(iIdx, jIdx);
    return true;
  }

  const selected: Pair[] = [];

  // ——————————————————
  // FASE 1 — BRIDGING
  // ——————————————————
  if (!allInOneComponent(dsu, n)) {
    const bridges: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      if (!needsWork(i)) continue; // in bridging-fase: iedereen mag, maar we pushen “needsWork” eerst
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

  // ——————————————————
  // FASE 2 — INTRA: beide “needsWork”, geen repeats
  // ——————————————————
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

  // ——————————————————
  // FASE 3 — RELAXED: minstens één “needsWork”, geen repeats
  // ——————————————————
  if (selected.length < batchSize) {
    const cands: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!(needsWork(i) || needsWork(j))) continue; // minstens één moet werk nodig hebben
        const idI = texts[i].id!, idJ = texts[j].id!;
        if (judgedPairs.has(key(idI, idJ))) continue;   // nog steeds geen repeats in fase 3
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

  // ——————————————————
  // FASE 4 — LAST RESORT: minstens één “needsWork”, repeats toegestaan
  // ——————————————————
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
