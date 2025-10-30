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
  if (texts.length < 2) return [];

  // indexering
  const id2idx = new Map<number, number>(texts.map((t,i)=>[t.id!, i]));
  const n = texts.length;

  // exposure & judged
  const judgedPairs = new Set<string>();
  const judgedPairsCounts = opts.judgedPairsCounts ?? new Map<string, number>();
  const exposure = new Array(n).fill(0);
  for (const j of existing) {
    const ia = id2idx.get(j.textAId), ib = id2idx.get(j.textBId);
    if (ia==null || ib==null || ia===ib) continue;
    const kkey = key(j.textAId, j.textBId);
    judgedPairs.add(kkey);
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

  // Hulp: wat is "reliable" op individueel niveau?
  const isReliable = (iIdx: number): boolean => {
    if (!hasBT) return false;
    const se = seOf(texts[iIdx].id!);
    return Number.isFinite(se) && se <= SE_RELIABLE;
  };

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

  function scoreOpp(iIdx: number, jIdx: number, allowRepeat = false): number {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);

    const isBridging = dsu.find(iIdx) !== dsu.find(jIdx);
    const count = judgedPairsCounts.get(kkey) ?? 0;

    // In de normale fasen: beide moeten underCap zijn.
    // In relaxed/last-resort fase roepen we scoreOpp met allowRepeat of
    // passen we pre-filters toe; daarom geen harde early-return hier.
    let s = 0;

    // fairness: lage gezamenlijke exposure
    s -= (exposure[iIdx] + exposure[jIdx]);

    // bridging grote bonus (ook in fase 2 toegestaan)
    if (isBridging) s += 1000;

    // herhaal penalty (alleen relevant als we repeats toestaan)
    if (count > 0) {
      // zwaardere penalty tenzij bridging; bij allowRepeat accepteren we deze trade-off
      s -= (isBridging ? 2 : 8) * Math.min(count, 3); // max -24 (niet-bridging), -6 (bridging)
    }

    if (hasBT) {
      const dθ    = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const seI   = seOf(idI), seJ = seOf(idJ);
      const sumSE = (Number.isFinite(seI)?seI:2) + (Number.isFinite(seJ)?seJ:2);

      // informatief: kleine Δθ
      s += 10 - 10*Math.min(dθ, 1);
      // informatief: hoge som van SE's (cap 2)
      s += 5 * Math.min(sumSE, 2);

      // extra prioriteit als minstens één tekst echt nog hoog is
      if ((Number.isFinite(seI) && seI > SE_REPEAT) || (Number.isFinite(seJ) && seJ > SE_REPEAT)) {
        s += 15;
      }

      // near-certain penalty
      if (dθ > 3) s -= 20;

      // lichte bonus als precies één van de twee nog werk nodig heeft
      const iNeeds = !(Number.isFinite(seI) && seI <= SE_RELIABLE);
      const jNeeds = !(Number.isFinite(seJ) && seJ <= SE_RELIABLE);
      if (iNeeds !== jNeeds) s += 5;
    }

    // tie-breaker
    s += Math.random()*0.01;
    return s;
  }

  function selectPair(iIdx: number, jIdx: number, selected: Pair[]): boolean {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    const kkey = key(idI, idJ);
    if (judgedPairs.has(kkey)) return false;
    if (!underCap(iIdx) || !underCap(jIdx)) return false;

    const flip = Math.random() < 0.5;
    selected.push({ textA: flip ? texts[jIdx] : texts[iIdx], textB: flip ? texts[iIdx] : texts[jIdx] });

    judgedPairs.add(kkey);
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
        const idI = texts[i].id!, idJ = texts[j].id!;
        if (judgedPairs.has(key(idI,idJ))) continue;
        const sc = scoreOpp(i,j); bridges.push({iIdx:i,jIdx:j,score:sc});
      }
    }
    bridges.sort((a,b)=>b.score-a.score);
    for (const b of bridges){
      if (selected.length >= batchSize) break;
      if (allInOneComponent(dsu, n)) break;
      selectPair(b.iIdx, b.jIdx, selected);
    }
  }

  // FASE 2 — INTRA-COMPONENT (beide underCap)
  if (selected.length < batchSize) {
    const cands: Array<{iIdx:number;jIdx:number;score:number}> = [];
    for (let i=0;i<n;i++){
      if (!underCap(i)) continue;
      for (let j=i+1;j<n;j++){
        if (!underCap(j)) continue;
        const idI = texts[i].id!, idJ = texts[j].id!;
        if (judgedPairs.has(key(idI,idJ))) continue;
        const sc = scoreOpp(i,j); cands.push({iIdx:i,jIdx:j,score:sc});
      }
    }
    cands.sort((a,b)=>b.score-a.score);
    for (const c of cands){
      if (selected.length >= batchSize) break;
      selectPair(c.iIdx, c.jIdx, selected);
    }
  }

  // FASE 3 — RELAXED FILL (tenzij we al vol zitten)
  // Doel: laat paren toe met minstens één "needs work" tekst, zelfs als de ander al betrouwbaar is.
  // Nog steeds géén repeats in deze stap.
  if (selected.length < batchSize) {
    const relaxed: Array<{iIdx:number;jIdx:number;score:number}> = [];
    for (let i=0;i<n;i++){
      const iNeeds = underCap(i); // "heeft nog werk" volgens onze hoofdregel
      // Als i geen werk heeft én ook betrouwbaar is, kan i nog als "partner" dienen,
      // maar we willen dan dat j wél needs-work is.
      for (let j=i+1;j<n;j++){
        const jNeeds = underCap(j);
        const atLeastOneNeeds = iNeeds || jNeeds;
        if (!atLeastOneNeeds) continue;

        const idI = texts[i].id!, idJ = texts[j].id!;
        const kkey = key(idI,idJ);
        if (judgedPairs.has(kkey)) continue; // nog steeds geen repeats in relaxed

        // De “betrouwbare” tekst mag mee, maar niet twee volledig betrouwbare bij elkaar.
        if (!iNeeds && !jNeeds) continue;

        const sc = scoreOpp(i,j); relaxed.push({iIdx:i,jIdx:j,score:sc});
      }
    }
    relaxed.sort((a,b)=>b.score-a.score);
    for (const r of relaxed) {
      if (selected.length >= batchSize) break;

      // In relaxed fill selecteren we alleen als ten minste één kant underCap is.
      const ok =
        (underCap(r.iIdx) || underCap(r.jIdx)) &&
        // en het paar is nog niet eerder beoordeeld:
        !judgedPairs.has(key(texts[r.iIdx].id!, texts[r.jIdx].id!));

      if (!ok) continue;

      const idI = texts[r.iIdx].id!, idJ = texts[r.jIdx].id!;
      const kkey = key(idI, idJ);
      const flip = Math.random() < 0.5;
      selected.push({ textA: flip ? texts[r.jIdx] : texts[r.iIdx], textB: flip ? texts[r.iIdx] : texts[r.jIdx] });
      judgedPairs.add(kkey);
      exposure[r.iIdx]++; exposure[r.jIdx]++;
      dsu.union(r.iIdx, r.jIdx);
    }
  }

  // FASE 4 — LAST RESORT (met repeats): als we nog niet vol zitten, sta repeats toe
  // Dit is nuttig wanneer alle informatieve combinaties al eens beoordeeld zijn.
  if (selected.length < batchSize) {
    const last: Array<{iIdx:number;jIdx:number;score:number;rep:number}> = [];
    for (let i=0;i<n;i++){
      // Minstens één moet nog werk hebben (anders blijven we betrouwbare teksten rondpompen)
      const iNeeds = underCap(i);
      for (let j=i+1;j<n;j++){
        const jNeeds = underCap(j);
        if (!(iNeeds || jNeeds)) continue;

        const idI = texts[i].id!, idJ = texts[j].id!;
        const kkey = key(idI,idJ);
        const rep = judgedPairsCounts.get(kkey) ?? 0;

        // Scoor met repeats toegestaan, zwaardere penalty zit in scoreOpp()
        const sc = scoreOpp(i, j, true);
        // Bevoordeel paren die minder vaak zijn herhaald
        last.push({ iIdx: i, jIdx: j, score: sc - rep * 5, rep });
      }
    }
    last.sort((a,b)=>b.score-a.score);

    for (const c of last) {
      if (selected.length >= batchSize) break;

      const idI = texts[c.iIdx].id!, idJ = texts[c.jIdx].id!;
      const kkey = key(idI, idJ);

      // repeats nu toegestaan (maar we updaten judgedPairs en counts lokaal)
      const flip = Math.random() < 0.5;
      selected.push({ textA: flip ? texts[c.jIdx] : texts[c.iIdx], textB: flip ? texts[c.iIdx] : texts[c.jIdx] });

      // update lokale staten
      judgedPairs.add(kkey); // zodat we binnen deze batch niet exact hetzelfde paar dubbel kiezen
      judgedPairsCounts.set(kkey, (judgedPairsCounts.get(kkey) ?? 0) + 1);
      exposure[c.iIdx]++; exposure[c.jIdx]++;
      dsu.union(c.iIdx, c.jIdx);
    }
  }

  return selected;
}
