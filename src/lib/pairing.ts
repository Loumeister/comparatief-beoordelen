// src/lib/pairing.ts
import { Text, Judgement } from "./db";
import { MIN_BASE, SE_RELIABLE, SE_REPEAT, DEFAULT_BATCH_SIZE } from "@/lib/constants";
import { pairKey } from "@/lib/utils";

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

  // exposure & judged (tel ALLE judgements)
  const judgedPairsCounts = opts.judgedPairsCounts ?? new Map<string, number>();
  const exposure = new Array(n).fill(0);
  for (const j of existing) {
    const ia = id2idx.get(j.textAId),
      ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    const kkey = pairKey(j.textAId, j.textBId);
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

  // core/wings detectie
  const CORE_Z = 1.0; // |z| ≤ 1 is core
  const isCore = (id: number) => Math.abs(zOf(id)) <= CORE_Z;
  const isLeftWing = (id: number) => zOf(id) < -CORE_Z;
  const isRightWing = (id: number) => zOf(id) > CORE_Z;
  const isOppositeWings = (id1: number, id2: number) =>
    (isLeftWing(id1) && isRightWing(id2)) || (isRightWing(id1) && isLeftWing(id2));

  // relatieve exposure mediaan
  const expMedian = median(exposure);

  // wie heeft nog werk?
  const underCap = (iIdx: number): boolean => {
    if (!allInOneComponent(dsu, n)) return true; // bridging eerst
    if (exposure[iIdx] < MIN_BASE) return true; // fair floor
    if (exposure[iIdx] < expMedian) return true; // balans t.o.v. mediaan
    if (hasBT) {
      const se = seOf(texts[iIdx].id!);
      if (!Number.isFinite(se)) return true; // cold-start
      if (se > SE_RELIABLE) return true; // nog niet betrouwbaar
    }
    return false; // anders klaar
  };

  // score voor kandidaat
  function scoreOpp(iIdx: number, jIdx: number, phase: "bridge" | "intra"): number {
    const idI = texts[iIdx].id!,
      idJ = texts[jIdx].id!;
    const kkey = pairKey(idI, idJ);
    const count = judgedPairsCounts.get(kkey) ?? 0;

    // basis gate: minstens één tekst moet nog werk nodig hebben
    // (een goed-gemeten tekst is een nuttige partner voor een onzekere tekst)
    if (!underCap(iIdx) && !underCap(jIdx)) return -Infinity;

    // **HARD RULE**: in INTRA fase geen opposite-wings
    if (phase === "intra" && hasBT && isOppositeWings(idI, idJ)) return -Infinity;

    let s = 0;

    // fairness: lage gezamenlijke exposure
    s -= exposure[iIdx] + exposure[jIdx];

    // bridgingbonus: genoeg om te verbinden, niet dominant
    const isBridge = dsu.find(iIdx) !== dsu.find(jIdx);
    if (isBridge) s += 150;

    // repeats-penalty als géén bridge
    if (count > 0 && !isBridge) s -= 10;

    if (hasBT) {
      const dθ = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const seI = seOf(idI),
        seJ = seOf(idJ);
      const sumSE = (Number.isFinite(seI) ? seI : 2) + (Number.isFinite(seJ) ? seJ : 2);

      // Fisher-informatie
      const p = 1 / (1 + Math.exp(dθ));
      const info = p * (1 - p); // 0..0.25
      s += 36 * info; // 0..9

      // aandacht voor hoge SE
      s += 4 * Math.min(sumSE, 2); // 0..8

      // prioriteit als minstens één tekst echt nog hoog is
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
      if (sameLeftWing || sameRightWing) s -= 12; // wing-wing zelfde kant: afremmen

      // Δθ-str af
      if (dθ > 3) s -= 80;
      else if (dθ > 2) s -= 30;

      // Extra: in bridging mag opposite-wings, maar niet super ver uit elkaar
      if (phase === "bridge" && isOppositeWings(idI, idJ) && dθ > 2.5) {
        s -= 40;
      }
    }

    // lichte voorkeur voor underexposed t.o.v. mediaan
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
    const kkey = pairKey(idI, idJ);
    const count = judgedPairsCounts.get(kkey) ?? 0;
    const isBridge = dsu.find(iIdx) !== dsu.find(jIdx);

    if (!allowRepeats && count > 0 && !isBridge) return false;
    if (allowRepeats && count >= maxRejudgements && !isBridge) return false;
    return true;
  }

  function selectPair(iIdx: number, jIdx: number, selected: Pair[]): boolean {
    if (!canUsePair(iIdx, jIdx)) return false;
    if (!underCap(iIdx) && !underCap(jIdx)) return false;

    const idI = texts[iIdx].id!,
      idJ = texts[jIdx].id!;
    const kkey = pairKey(idI, idJ);

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

  // --- FASE 1: BRIDGING (disjoint nodes, greedy matching) ---
  if (!allInOneComponent(dsu, n)) {
    const bridges: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      if (!underCap(i)) continue;
      for (let j = i + 1; j < n; j++) {
        if (!underCap(j)) continue;
        if (dsu.find(i) === dsu.find(j)) continue;
        if (!canUsePair(i, j)) continue;
        const sc = scoreOpp(i, j, "bridge");
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

  // --- FASE 2: INTRA-COMPONENT (geen opposite-wings) ---
  // Teksten mogen max 2× in een batch voorkomen (narrative thread voor docent)
  if (selected.length < batchSize) {
    const cands: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      if (!underCap(i)) continue;
      for (let j = i + 1; j < n; j++) {
        if (!underCap(j)) continue;
        if (!canUsePair(i, j)) continue;
        const sc = scoreOpp(i, j, "intra");
        if (sc > -Infinity) cands.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    const MAX_APPEARANCES = 2;
    const usedCount = new Array(n).fill(0);
    // Tel ook bridging-paren mee
    for (const p of selected) {
      const ia = id2idx.get(p.textA.id!);
      const ib = id2idx.get(p.textB.id!);
      if (ia != null) usedCount[ia]++;
      if (ib != null) usedCount[ib]++;
    }
    for (const c of cands) {
      if (selected.length >= batchSize) break;
      const { iIdx, jIdx } = c;
      if (usedCount[iIdx] >= MAX_APPEARANCES || usedCount[jIdx] >= MAX_APPEARANCES) continue;
      if (!selectPair(iIdx, jIdx, selected)) continue;
      usedCount[iIdx]++;
      usedCount[jIdx]++;
    }
  }

  return chainOrder(selected);
}

/**
 * Herorden paren zodat opeenvolgende paren een tekst delen (narrative thread).
 * Greedy: kies steeds het paar dat een tekst deelt met het vorige.
 */
function chainOrder(pairs: Pair[]): Pair[] {
  if (pairs.length <= 1) return pairs;

  const remaining = [...pairs];
  const ordered: Pair[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    const lastIds = new Set([last.textA.id!, last.textB.id!]);

    // Zoek een paar dat een tekst deelt met het vorige
    let bestIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      if (lastIds.has(remaining[i].textA.id!) || lastIds.has(remaining[i].textB.id!)) {
        bestIdx = i;
        break;
      }
    }

    if (bestIdx >= 0) {
      ordered.push(remaining.splice(bestIdx, 1)[0]);
    } else {
      // Geen gedeelde tekst — neem de volgende
      ordered.push(remaining.shift()!);
    }
  }

  return ordered;
}
