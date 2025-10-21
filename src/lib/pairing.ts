import { Text, Judgement } from "./db";

export interface Pair {
  textA: Text;
  textB: Text;
}

type BTInfo = {
  theta?: Map<number, number>; // textId -> theta (gecentreerd)
  se?: Map<number, number>; // textId -> standaardfout
};

type Options = {
  targetComparisonsPerText?: number; // default 10
  batchSize?: number; // default: berekend uit target
  bt?: BTInfo; // optioneel: informatief pairen
  minReliability?: number; // minimum betrouwbaarheid (max SE threshold), default 0.3
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

/**
 * Verbeterde pairing:
 * - Balanced exposure
 * - Forceert cross-component paren om grafiek te verbinden
 * - Informatiewinst: kleine |Δθ| en hoge (SE_t + SE_u) krijgen voorrang (als bt-info beschikbaar)
 * - Fallbacks wanneer bijna vol
 */
export function generatePairs(texts: Text[], existingJudgements: Judgement[], opts: Options = {}): Pair[] {
  const target = opts.targetComparisonsPerText ?? 10;
  const batchSize = opts.batchSize ?? Math.ceil((target * texts.length) / 4); // maak batches klein & frequent
  if (texts.length < 2) return [];

  // index mapping
  const id2idx = new Map<number, number>(texts.map((t, i) => [t.id!, i]));
  const n = texts.length;

  // judged pairs set + exposure counts
  const judgedPairs = new Set<string>();
  const exposure = new Array(n).fill(0);

  existingJudgements.forEach((j) => {
    const ia = id2idx.get(j.textAId);
    const ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) return;
    judgedPairs.add(key(j.textAId, j.textBId));
    exposure[ia] += 1;
    exposure[ib] += 1;
  });

  // Union-Find voor connectiviteit van de bestaande grafiek
  const dsu = new DSU(n);
  existingJudgements.forEach((j) => {
    const ia = id2idx.get(j.textAId);
    const ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) return;
    dsu.union(ia, ib);
  });

  // helpers om bt-info veilig te lezen
  const thetaOf = (id: number) => opts.bt?.theta?.get(id) ?? 0;
  const seOf = (id: number) => opts.bt?.se?.get(id) ?? 1;

  // Betrouwbaarheid threshold: als SE > dit, dan onbetrouwbaar
  const minReliability = opts.minReliability ?? 0.3;

  // exposure target gehaald?
  // MAAR: als SE hoog is (onbetrouwbaar), negeer dan target en blijf pairen
  const underCap = (i: number) => {
    if (exposure[i] < target) return true;
    // Boven target, maar checken of betrouwbaarheid te laag is
    const id = texts[i].id!;
    const se = seOf(id);
    // Als SE > threshold, is het onbetrouwbaar en mag het meer vergelijkingen krijgen
    return se > minReliability;
  };

  // Scoring van kandidaat tegenstander (informatiewinst + connectiviteit + fairness)
  function scoreOpp(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!,
      idJ = texts[jIdx].id!;
    // vermijd duplicate of judged
    if (judgedPairs.has(key(idI, idJ))) return -Infinity;
    if (!underCap(iIdx) || !underCap(jIdx)) return -Infinity;

    // base: prioriteit voor lage gezamenlijke exposure
    let s = -(exposure[iIdx] + exposure[jIdx]); // lager is beter, dus negatief

    // connectiviteit: grote bonus als ze in verschillende componenten zitten
    if (dsu.find(iIdx) !== dsu.find(jIdx)) s += 1000;

    // informatiewinst indien θ/SE beschikbaar:
    const hasBT = opts.bt?.theta && opts.bt?.se;
    if (hasBT) {
      const dtheta = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const sumSE = seOf(idI) + seOf(idJ);
      // kleine |Δθ| is leerrijk (moeilijke vergelijking) → hogere score
      // normaliseer grofweg: we trekken dtheta af en tellen SE op
      s += 10 - 10 * Math.min(dtheta, 1); // cap
      s += 5 * Math.min(sumSE, 2); // cap
    }

    // kleine jitter om deterministische ties te breken
    s += Math.random() * 0.01;
    return s;
  }

  // Genereer ALLE mogelijke paren (niet-judged, under cap)
  const allPairs: Array<{ textA: Text; textB: Text; iIdx: number; jIdx: number; score: number }> = [];
  
  for (let i = 0; i < n; i++) {
    if (!underCap(i)) continue;
    for (let j = i + 1; j < n; j++) {
      if (!underCap(j)) continue;
      const pairKey = key(texts[i].id!, texts[j].id!);
      if (!judgedPairs.has(pairKey)) {
        const score = scoreOpp(i, j);
        if (score > -Infinity) {
          allPairs.push({
            textA: texts[i],
            textB: texts[j],
            iIdx: i,
            jIdx: j,
            score,
          });
        }
      }
    }
  }

  // Sorteer op score (hogere score = betere keuze)
  // Dit prioriteert automatisch lage gezamenlijke exposure door de scoreOpp logica
  allPairs.sort((a, b) => b.score - a.score);

  // Selecteer top N voor batch
  const selected: Pair[] = [];
  for (let i = 0; i < Math.min(batchSize, allPairs.length); i++) {
    const pair = allPairs[i];
    selected.push({ textA: pair.textA, textB: pair.textB });
    
    // Update state voor volgende iteraties (indien nodig)
    judgedPairs.add(key(pair.textA.id!, pair.textB.id!));
    exposure[pair.iIdx]++;
    exposure[pair.jIdx]++;
    dsu.union(pair.iIdx, pair.jIdx);
  }

  // lichte shuffle voor variatie in UI
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }
  return selected;
}
