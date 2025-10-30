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
  targetComparisonsPerText?: number;  // alleen voor progress
  batchSize?: number;                 // aantal paren per batch
  bt?: BTInfo;                        // actuele BT-info
  seThreshold?: number;               // “klaar” als SE ≤ seThreshold (bv. 0.75)
  seRepeatThreshold?: number;         // herhalen pas bij SE ≥ deze drempel (bv. 0.75)
  judgedPairsCounts?: Map<string, number>;
  minBase?: number;                   // minimum exposures/tekst, bv. 3–5
  allowFreeWhenEmpty?: boolean;       // <<< NIEUW: als geen informatieve paren, maak dan een kleine “vrije” batch
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
  const allowFreeWhenEmpty = opts.allowFreeWhenEmpty ?? false;

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

  // Scoring van kandidaatparen (strikt/informatief)
  function scoreOpp(iIdx: number, jIdx: number): number {
    if (!needsWork(iIdx) || !needsWork(jIdx)) return -Infinity;
    if (!canRepeat(iIdx, jIdx)) return -Infinity;

    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    let s = 0;

    const bridge = dsu.find(iIdx) !== dsu.find(jIdx);
    if (bridge) s += 1000;

    // Lage gezamenlijke exposure prefereren
    s -= (exposure[iIdx] + exposure[jIdx]);

    if (hasBT) {
      const dθ = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const sumSE = seOf(idI) + seOf(idJ);
      s += 10 - 10 * Math.min(dθ, 1);           // kleine Δθ informatief
      s += 5 * Math.min(sumSE, 2);              // hogere SE informatief
      if (dθ > 3) s -= 20;                      // bijna-zeker => minder waardevol
      if (seOf(idI) >= seRepeatThreshold || seOf(idJ) >= seRepeatThreshold) s += 15;
    }

    s += Math.random() * 0.001; // tiebreak
    return s;
  }

  // Scoring “vrije modus” (als er geen strikte kandidaten zijn)
  function scoreFree(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const k = key(idI, idJ);
    if (judgedPairs.has(k)) return -Infinity; // geen directe dubbele aanbieding
    let s = 0;

    // nog steeds bridges prefereren (past altijd)
    const bridge = dsu.find(iIdx) !== dsu.find(jIdx);
    if (bridge) s += 200;

    // Exposures balanceren
    s -= (exposure[iIdx] + exposure[jIdx]);

    // Nog steeds: voorkom bijna-zekere blowouts en prefereer kleine Δθ
    if (hasBT) {
      const dθ = Math.abs(thetaOf(idI) - thetaOf(idJ));
      s += 6 - 6 * Math.min(dθ, 1);   // iets milder dan strikt
      if (dθ > 3) s -= 10;
    }

    s += Math.random() * 0.001;
    return s;
  }

  function selectPair(iIdx: number, jIdx: number, selected: Pair[]) {
    selected.push({ textA: texts[iIdx], textB: texts[jIdx] });
    const k = key(texts[iIdx].id!, texts[jIdx].id!);
    judgedPairs.add(k);
    exposure[iIdx]++; exposure[jIdx]++;
    dsu.union(iIdx, jIdx);
  }

  const selected: Pair[] = [];

  // Fase 1: bridges (strikt)
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

  // Fase 2: intra-component (strikt)
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

  // Fase 3: vrije modus (pas als fase 1+2 niets opleveren)
  if (selected.length === 0 && allowFreeWhenEmpty) {
    const free: Array<{ iIdx: number; jIdx: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sc = scoreFree(i, j);
        if (sc > -Infinity) free.push({ iIdx: i, jIdx: j, score: sc });
      }
    }
    free.sort((a, b) => b.score - a.score);
    for (const f of free) {
      if (selected.length >= Math.max(2, Math.ceil(batchSize / 2))) break; // kleine vrije batch
      selectPair(f.iIdx, f.jIdx, selected);
    }
  }

  return selected;
}
