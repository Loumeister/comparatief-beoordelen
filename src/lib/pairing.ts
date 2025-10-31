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
  /**
   * Sta herhaaloordelen toe wanneer er nog teksten zijn die
   * onder-exposed zijn of een (te) hoge SE hebben.
   * Default: false (eerst altijd nieuwe paren proberen)
   */
  allowRepeats?: boolean;
  /**
   * Maximaal aantal oordelen per pair dat we toestaan in repeat-modus
   * (exclusief wat al bestaat). Default: 3.
   */
  maxPairRejudgements?: number;
};

function key(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

class DSU {
  parent: number[]; rank: number[];
  constructor(n: number) { this.parent = Array.from({length:n}, (_,i)=>i); this.rank = new Array(n).fill(0); }
  find(x: number){ return this.parent[x]===x ? x : (this.parent[x]=this.find(this.parent[x])); }
  union(a: number, b: number){ a=this.find(a); b=this.find(b); if(a===b) return;
    if(this.rank[a]<this.rank[b]) [a,b]=[b,a]; this.parent[b]=a; if(this.rank[a]===this.rank[b]) this.rank[a]++; }
}
function allInOneComponent(dsu: DSU, n: number): boolean {
  const r0 = dsu.find(0); for(let i=1;i<n;i++) if(dsu.find(i)!==r0) return false; return true;
}

export function generatePairs(texts: Text[], existing: Judgement[], opts: Options = {}): Pair[] {
  const target = opts.targetComparisonsPerText ?? 10;
  const batchSize = Math.max(2, opts.batchSize ?? DEFAULT_BATCH_SIZE);
  const allowRepeats = opts.allowRepeats ?? false;
  const maxRejudgements = Math.max(1, opts.maxPairRejudgements ?? 3);

  if (texts.length < 2) return [];

  // indexering
  const id2idx = new Map<number, number>(texts.map((t,i)=>[t.id!, i]));
  const n = texts.length;

  // exposure & judged
  const judgedPairsCounts = opts.judgedPairsCounts ?? new Map<string, number>();
  const exposure = new Array(n).fill(0);
  for (const j of existing) {
    const ia = id2idx.get(j.textAId), ib = id2idx.get(j.textBId);
    if (ia==null || ib==null || ia===ib) continue;
    const kkey = key(j.textAId, j.textBId);
    judgedPairsCounts.set(kkey, (judgedPairsCounts.get(kkey) ?? 0) + 1);
    exposure[ia]++; exposure[ib]++;
  }

  // connectiviteit
  const dsu = new DSU(n);
  for (const j of existing) {
    const ia = id2idx.get(j.textAId), ib = id2idx.get(j.textBId);
    if (ia==null || ib==null || ia===ib) continue;
    dsu.union(ia, ib);
  }

  // BT helpers
  const hasBT = Boolean(opts.bt?.theta && opts.bt?.se);
  const thetaOf = (id: number) => (hasBT ? (opts.bt!.theta!.get(id) ?? 0) : 0);
  const seOf    = (id: number) => (hasBT ? (opts.bt!.se!.get(id)    ?? Infinity) : Infinity);

  // onderCap: bridging vóór alles, anders fair floor, dan SE
  const underCap = (iIdx: number): boolean => {
    // 1) als niet verbonden: iedereen mag meedoen (bridging fase beslist)
    if (!allInOneComponent(dsu, n)) return true;
    // 2) fair floor voor robuuste initialisatie
    if (exposure[iIdx] < MIN_BASE) return true;
    // 3) met BT: klaar = SE ≤ SE_RELIABLE, anders werkt het nog
    if (hasBT) {
      const se = seOf(texts[iIdx].id!);
      if (!Number.isFinite(se)) return true; // cold-start/∞ ⇒ nog werk
      return se > SE_RELIABLE;
    }
    // 4) fallback zonder BT
    return exposure[iIdx] < target;
  };

  function scoreOpp(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    const count = judgedPairsCounts.get(kkey) ?? 0;

    if (!underCap(iIdx) || !underCap(jIdx)) return -Infinity;

    let s = 0;

    // fairness: lage gezamenlijke exposure
    s -= (exposure[iIdx] + exposure[jIdx]);

    // bridging grote bonus (ook in fase 2 toegestaan)
    const isBridging = dsu.find(iIdx) !== dsu.find(jIdx);
    if (isBridging) s += 200; // ruim genoeg, maar niet allesoverstemmend

    // herhaal penalty als geen bridging
    if (count > 0 && !isBridging) s -= 5;

    if (hasBT) {
      const dθ    = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const seI   = seOf(idI), seJ = seOf(idJ);
      const sumSE = (Number.isFinite(seI)?seI:2) + (Number.isFinite(seJ)?seJ:2);

      // Fisher-info benadering (max bij Δθ=0, daalt netjes af)
      const absD = Math.abs(dθ);
      const p = 1 / (1 + Math.exp(absD));
      const info = p * (1 - p); // ∈ (0, 0.25]

      /** Informatieve paren:
       *  - Hoog als Δθ klein (via info)
       *  - Ook wat hoger als SE-som groot is (je wilt onzekerheid afbouwen)
       */
      s += 40 * info;                   // 0..10 bij Δθ≈0 → zachte afbouw
      s += 4 * Math.min(sumSE, 2);      // 0..8 extra als er nog onzekerheid is

      // Extra prioriteit als tenminste één tekst nog duidelijk onstabiel is
      if ((Number.isFinite(seI) && seI > SE_REPEAT) || (Number.isFinite(seJ) && seJ > SE_REPEAT)) {
        s += 10; // was 15; iets ingetogener zodat info-term meer weegt
      }

      // Geen harde knalstraffen meer voor dθ>2/3; info-term regelt dit al
    }

    // tie-breaker
    s += Math.random()*0.01;
    return s;
  }

  function canUsePair(iIdx: number, jIdx: number): boolean {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    const count = judgedPairsCounts.get(kkey) ?? 0;
    const isBridging = dsu.find(iIdx) !== dsu.find(jIdx);

    // als geen repeats: koppel overslaan zodra al beoordeeld (behalve voor bridging)
    if (!allowRepeats && count > 0 && !isBridging) return false;

    // met repeats: sta toe tot aan cap
    if (allowRepeats && count >= maxRejudgements && !isBridging) return false;

    return true;
  }

  function selectPair(iIdx: number, jIdx: number, selected: Pair[]): boolean {
    if (!underCap(iIdx) || !underCap(jIdx)) return false;
    if (!canUsePair(iIdx, jIdx)) return false;

    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);

    const flip = Math.random() < 0.5;
    selected.push({ textA: flip ? texts[jIdx] : texts[iIdx], textB: flip ? texts[iIdx] : texts[jIdx] });

    // bij selectie telt exposure op, pair-counts ook; union voor connectivity
    judgedPairsCounts.set(kkey, (judgedPairsCounts.get(kkey) ?? 0) + 1);
    exposure[iIdx]++; exposure[jIdx]++;
    dsu.union(iIdx, jIdx);
    return true;
  }

  const selected: Pair[] = [];

  // FASE 1 — BRIDGING
  if (!allInOneComponent(dsu, n)) {
    const bridges: Array<{iIdx:number;jIdx:number;score:number}> = [];
    for (let i=0;i<n;i++){
      if (!underCap(i)) continue;
      for (let j=i+1;j<n;j++){
        if (!underCap(j)) continue;
        if (dsu.find(i) === dsu.find(j)) continue;
        if (!canUsePair(i,j)) continue;
        const sc = scoreOpp(i,j); if (sc > -Infinity) bridges.push({iIdx:i,jIdx:j,score:sc});
      }
    }
    bridges.sort((a,b)=>b.score-a.score);
    for (const b of bridges){
      if (selected.length >= batchSize) break;
      if (allInOneComponent(dsu, n)) break;
      selectPair(b.iIdx, b.jIdx, selected);
    }
  }

  // FASE 2 — INTRA-COMPONENT
  if (selected.length < batchSize) {
    const cands: Array<{iIdx:number;jIdx:number;score:number}> = [];
    for (let i=0;i<n;i++){
      if (!underCap(i)) continue;
      for (let j=i+1;j<n;j++){
        if (!underCap(j)) continue;
        if (!canUsePair(i,j)) continue;
        const sc = scoreOpp(i,j); if (sc > -Infinity) cands.push({iIdx:i,jIdx:j,score:sc});
      }
    }
    cands.sort((a,b)=>b.score-a.score);
    for (const c of cands){
      if (selected.length >= batchSize) break;
      selectPair(c.iIdx, c.jIdx, selected);
    }
  }

  return selected;
}
