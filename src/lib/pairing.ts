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

  // Iteratief batch selecteren:
  const selected: Pair[] = [];
  let safety = texts.length * texts.length; // guard

  while (selected.length < batchSize && safety-- > 0) {
    // kies “uitdunningskandidaat” t met laagste exposure en nog onder target
    let tIdx = -1;
    let bestExp = Infinity;
    for (let i = 0; i < n; i++) {
      if (underCap(i) && exposure[i] < bestExp) {
        bestExp = exposure[i];
        tIdx = i;
      }
    }
    if (tIdx === -1) break; // iedereen vol of geen kandidaten

    // zoek beste tegenstander u
    let uIdx = -1;
    let bestScore = -Infinity;
    for (let j = 0; j < n; j++) {
      if (j === tIdx) continue;
      const sc = scoreOpp(tIdx, j);
      if (sc > bestScore) {
        bestScore = sc;
        uIdx = j;
      }
    }

    // fallback: als niks geldig (bestScore == -Infinity), probeer hard cross-component te forceren of breek af
    if (uIdx === -1 || bestScore === -Infinity) {
      // forceer kruis als mogelijk (i in comp A, zoek j in comp B onder cap & niet judged)
      let forced = false;
      outer: for (let i = 0; i < n; i++) {
        if (!underCap(i)) continue;
        for (let j = 0; j < n; j++) {
          if (i === j || !underCap(j)) continue;
          if (dsu.find(i) !== dsu.find(j) && !judgedPairs.has(key(texts[i].id!, texts[j].id!))) {
            selected.push({ textA: texts[i], textB: texts[j] });
            judgedPairs.add(key(texts[i].id!, texts[j].id!));
            exposure[i]++;
            exposure[j]++;
            dsu.union(i, j);
            forced = true;
            break outer;
          }
        }
      }
      if (!forced) break; // niets meer te doen
      continue;
    }

    // voeg paar toe & update staat
    const a = texts[tIdx],
      b = texts[uIdx];
    selected.push({ textA: a, textB: b });
    judgedPairs.add(key(a.id!, b.id!));
    exposure[tIdx]++;
    exposure[uIdx]++;
    dsu.union(tIdx, uIdx);
  }

  // lichte shuffle voor variatie in UI
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }
  return selected;
}
