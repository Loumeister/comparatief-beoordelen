// src/lib/pairing.ts
import { Text, Judgement } from "./db";

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
  seThreshold?: number;           // hoofd-drempel: “klaar” bij SE ≤ seThreshold (default 0.75)
  seRepeatThreshold?: number;     // herhalen mag pas als ≥ deze SE (default 0.75, gelijk aan hoofd-drempel)
  judgedPairsCounts?: Map<string, number>;
  // Nieuwe, strikte post-target modus: GEEN volledig relax,
  // maar nog paren zolang er teksten zijn met SE > seThreshold of onder-minimum exposure.
  postTargetMode?: boolean;
  minBase?: number;               // minimum exposures (bv. 3..5) als veiligheidsnet
};

function key(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

// Eenvoudige DSU voor connectiviteit
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

/**
 * Strikte pairing met post-target modus:
 * - Normaal: pair uitsluitend teksten die nog “werk” nodig hebben (SE > seThreshold of onder minBase)
 * - Herhalingen alleen zinvol als (bridge) of (minstens één SE > seRepeatThreshold)
 * - Post-target modus (als doel gehaald): zelfde regels, maar we laten de “target exposures” los;
 *   we blijven alleen werken aan teksten die nog SE > seThreshold hebben of minBase niet halen.
 * - Lichte links/rechts-balans: voorkom dat dezelfde tekst onevenredig vaak links staat.
 */
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
  const minBase = Math.max(0, opts.minBase ?? 3); // bv. 3–5

  if (texts.length < 2) return [];

  // index
  const id2idx = new Map<number, number>(texts.map((t, i) => [t.id!, i]));
  const n = texts.length;

  // judged pairs + exposure
  const judgedPairs = new Set<string>();
  const judgedPairsCounts = opts.judgedPairsCounts ?? new Map<string, number>();
  const exposure = new Array(n).fill(0);

  // lichte links/rechts-balans: tel hoe vaak elk id links stond
  const leftCount = new Map<number, number>();

  for (const j of existingJudgements) {
    const ia = id2idx.get(j.textAId);
    const ib = id2idx.get(j.textBId);
    if (ia == null || ib == null || ia === ib) continue;
    const k = key(j.textAId, j.textBId);
    judgedPairs.add(k);
    judgedPairsCounts.set(k, (judgedPairsCounts.get(k) ?? 0) + 1);
    exposure[ia]++;
    exposure[ib]++;
    // textA werd links getoond, textB rechts (consistent met UI die A links toont)
    leftCount.set(j.textAId, (leftCount.get(j.textAId) ?? 0) + 1);
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

  // “heeft nog werk” in normale én post-target modus
  const needsWork = (i: number) => {
    const id = texts[i].id!;
    if (!hasBT) {
      // Zonder BT: gebruik minBase als harde grens
      return exposure[i] < Math.max(minBase, target);
    }
    // Met BT: SE-criterium of minimum exposures
    return seOf(id) > seThreshold || exposure[i] < minBase;
  };

  // In normale modus: vereis needsWork(i) én needsWork(j)
  // In post-target modus: idem (we laten alleen de “target exposures” los).
  const eligiblePair = (i: number, j: number) => needsWork(i) && needsWork(j);

  // Herhalingslogica: alleen toestaan als informatief
  const canRepeat = (idI: number, idJ: number, iIdx: number, jIdx: number) => {
    const count = judgedPairsCounts.get(key(idI, idJ)) ?? 0;
    if (count === 0) return true; // eerste keer altijd ok
    const bridge = dsu.find(iIdx) !== dsu.find(jIdx);
    if (bridge) return true;
    if (!hasBT) return false;
    // alleen herhalen als minstens één nog duidelijk onzeker is
    return seOf(idI) > seRepeatThreshold || seOf(idJ) > seRepeatThreshold;
  };

  // Score
  function scoreOpp(iIdx: number, jIdx: number): number {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    if (!eligiblePair(iIdx, jIdx)) return -Infinity;
    if (!canRepeat(idI, idJ, iIdx, jIdx)) return -Infinity;

    let s = 0;

    // Bridge-boost
    const bridge = dsu.find(iIdx) !== dsu.find(jIdx);
    if (bridge) s += 1000;

    // Lage gezamenlijke exposure prefereren
    s -= (exposure[iIdx] + exposure[jIdx]);

    if (hasBT) {
      const dθ = Math.abs(thetaOf(idI) - thetaOf(idJ));
      const sumSE = seOf(idI) + seOf(idJ);

      // kleine Δθ is informatiever
      s += 10 - 10 * Math.min(dθ, 1);
      // hogere onzekerheid is informatiever
      s += 5 * Math.min(sumSE, 2);
      // penalty op bijna-zekere uitslagen
      if (dθ > 3) s -= 20;

      // extra prioriteit als minstens een van beide nog > seRepeatThreshold zit
      if (seOf(idI) > seRepeatThreshold || seOf(idJ) > seRepeatThreshold) s += 15;
    }

    // Lichte links/rechts-balans: zet bij voorkeur degene met hogere leftCount rechts
    const lI = leftCount.get(idI) ?? 0;
    const lJ = leftCount.get(idJ) ?? 0;
    // beloon paren waarbij de “meer linkse” kandidaat rechts komt (door een latere flip)
    // we kunnen dat via een klein bonusje sturen; flip doen we bij selectPair
    s += Math.abs(lI - lJ) * 0.01;

    // random tiebreak
    s += Math.random() * 0.001;

    return s;
  }

  function selectPair(iIdx: number, jIdx: number, selected: Pair[]): boolean {
    const idI = texts[iIdx].id!, idJ = texts[jIdx].id!;
    // Kies oriëntatie om linksbalans te egaliseren: zet degene met hogere leftCount RECHTS
    const lI = leftCount.get(idI) ?? 0;
    const lJ = leftCount.get(idJ) ?? 0;

    const A = lI <= lJ ? texts[iIdx] : texts[jIdx]; // minder vaak links => nu links
    const B = lI <= lJ ? texts[jIdx] : texts[iIdx];

    selected.push({ textA: A, textB: B });

    // update state
    const k = key(A.id!, B.id!);
    judgedPairs.add(k);
    const ia = id2idx.get(A.id!)!, ib = id2idx.get(B.id!)!;
    exposure[ia]++; exposure[ib]++;
    leftCount.set(A.id!, (leftCount.get(A.id!) ?? 0) + 1);
    dsu.union(ia, ib);
    return true;
  }

  const selected: Pair[] = [];

  // FASE 1: bridging waar mogelijk
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

  // FASE 2: intra-component informatief
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

  return selected;
}
