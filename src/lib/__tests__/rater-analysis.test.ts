import { describe, it, expect } from 'vitest';
import { analyzeRaters, countUniqueRaters } from '../rater-analysis';
import type { Text, Judgement } from '../db';

function mkText(id: number): Text {
  return {
    id,
    assignmentId: 1,
    content: `Text ${id}`,
    originalFilename: `text${id}.txt`,
    anonymizedName: `Tekst ${id}`,
    createdAt: new Date(),
  };
}

function mkJudgement(overrides: Partial<Judgement> & { textAId: number; textBId: number }): Judgement {
  return {
    id: Math.random() * 1e9 | 0,
    assignmentId: 1,
    winner: 'A' as const,
    createdAt: new Date(),
    pairKey: `${Math.min(overrides.textAId, overrides.textBId)}-${Math.max(overrides.textAId, overrides.textBId)}`,
    ...overrides,
  };
}

describe('analyzeRaters', () => {
  const texts = [mkText(1), mkText(2), mkText(3)];
  // BT predictions: 1 > 2 > 3
  const btPredictions = new Map<number, number>([[1, 1.5], [2, 0], [3, -1.5]]);

  it('returns empty stats for no judgements', () => {
    const result = analyzeRaters([], texts, btPredictions);
    expect(result.raterStats).toHaveLength(0);
    expect(result.disagreements).toHaveLength(0);
    expect(result.uniqueRaterCount).toBe(0);
  });

  it('counts unique raters correctly', () => {
    const judgements = [
      mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', raterName: 'Alice' }),
      mkJudgement({ textAId: 2, textBId: 3, raterId: 'r1', raterName: 'Alice' }),
      mkJudgement({ textAId: 1, textBId: 3, raterId: 'r2', raterName: 'Bob' }),
    ];
    const result = analyzeRaters(judgements, texts, btPredictions);
    expect(result.uniqueRaterCount).toBe(2);
    expect(result.raterStats).toHaveLength(2);
  });

  it('computes tie rate per rater', () => {
    const judgements = [
      mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', winner: 'A' }),
      mkJudgement({ textAId: 2, textBId: 3, raterId: 'r1', winner: 'EQUAL' }),
      mkJudgement({ textAId: 1, textBId: 3, raterId: 'r1', winner: 'EQUAL' }),
    ];
    const result = analyzeRaters(judgements, texts, btPredictions);
    const r1 = result.raterStats.find(s => s.raterId === 'r1');
    expect(r1).toBeDefined();
    expect(r1!.tieRate).toBeCloseTo(2 / 3, 5);
  });

  it('computes model agreement for decisive judgements', () => {
    // BT says 1 > 2 > 3
    const judgements = [
      mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', winner: 'A' }), // agrees
      mkJudgement({ textAId: 2, textBId: 3, raterId: 'r1', winner: 'A' }), // agrees
      mkJudgement({ textAId: 1, textBId: 3, raterId: 'r1', winner: 'B' }), // disagrees
    ];
    const result = analyzeRaters(judgements, texts, btPredictions);
    const r1 = result.raterStats.find(s => s.raterId === 'r1');
    expect(r1!.modelAgreement).toBeCloseTo(2 / 3, 5);
  });

  it('treats EQUAL judgements as not decisive (excluded from agreement calc)', () => {
    const judgements = [
      mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', winner: 'A' }),   // agrees
      mkJudgement({ textAId: 2, textBId: 3, raterId: 'r1', winner: 'EQUAL' }), // ignored
    ];
    const result = analyzeRaters(judgements, texts, btPredictions);
    const r1 = result.raterStats.find(s => s.raterId === 'r1');
    // Only 1 decisive judgement, which agrees → 100%
    expect(r1!.modelAgreement).toBe(1);
  });

  it('defaults modelAgreement to 1 when no decisive judgements', () => {
    const judgements = [
      mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', winner: 'EQUAL' }),
    ];
    const result = analyzeRaters(judgements, texts, btPredictions);
    const r1 = result.raterStats.find(s => s.raterId === 'r1');
    expect(r1!.modelAgreement).toBe(1);
  });

  it('treats missing raterId as "unknown"', () => {
    const judgements = [
      mkJudgement({ textAId: 1, textBId: 2 }), // no raterId
    ];
    const result = analyzeRaters(judgements, texts, btPredictions);
    expect(result.uniqueRaterCount).toBe(1);
    expect(result.raterStats[0].raterId).toBe('unknown');
  });

  it('sorts raters by judgement count descending', () => {
    const judgements = [
      mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', raterName: 'Alice' }),
      mkJudgement({ textAId: 1, textBId: 2, raterId: 'r2', raterName: 'Bob' }),
      mkJudgement({ textAId: 2, textBId: 3, raterId: 'r2', raterName: 'Bob' }),
      mkJudgement({ textAId: 1, textBId: 3, raterId: 'r2', raterName: 'Bob' }),
    ];
    const result = analyzeRaters(judgements, texts, btPredictions);
    expect(result.raterStats[0].raterId).toBe('r2'); // 3 judgements
    expect(result.raterStats[1].raterId).toBe('r1'); // 1 judgement
  });

  describe('disagreement detection', () => {
    it('detects disagreements between raters on the same pair', () => {
      const judgements = [
        mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', winner: 'A' }),
        mkJudgement({ textAId: 1, textBId: 2, raterId: 'r2', winner: 'B' }),
      ];
      const result = analyzeRaters(judgements, texts, btPredictions);
      expect(result.disagreements).toHaveLength(1);
      expect(result.disagreements[0].disagreementCount).toBe(1);
      expect(result.disagreements[0].raterVotes).toHaveLength(2);
    });

    it('does not flag agreement as disagreement', () => {
      const judgements = [
        mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', winner: 'A' }),
        mkJudgement({ textAId: 1, textBId: 2, raterId: 'r2', winner: 'A' }),
      ];
      const result = analyzeRaters(judgements, texts, btPredictions);
      expect(result.disagreements).toHaveLength(0);
    });

    it('ignores single-rater pairs for disagreements', () => {
      const judgements = [
        mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', winner: 'A' }),
      ];
      const result = analyzeRaters(judgements, texts, btPredictions);
      expect(result.disagreements).toHaveLength(0);
    });

    it('sorts disagreements by count (most contested first)', () => {
      const judgements = [
        // Pair 1-2: mild disagreement (1 vs 1)
        mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', winner: 'A' }),
        mkJudgement({ textAId: 1, textBId: 2, raterId: 'r2', winner: 'B' }),
        // Pair 2-3: stronger disagreement (2 vs 1)
        mkJudgement({ textAId: 2, textBId: 3, raterId: 'r1', winner: 'A' }),
        mkJudgement({ textAId: 2, textBId: 3, raterId: 'r2', winner: 'B' }),
        mkJudgement({ textAId: 2, textBId: 3, raterId: 'r3', winner: 'B' }),
      ];
      const result = analyzeRaters(judgements, texts, btPredictions);
      expect(result.disagreements.length).toBeGreaterThanOrEqual(2);
      // Most contested first
      expect(result.disagreements[0].disagreementCount).toBeGreaterThanOrEqual(
        result.disagreements[1].disagreementCount,
      );
    });

    it('resolves text names in disagreements', () => {
      const judgements = [
        mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', winner: 'A' }),
        mkJudgement({ textAId: 1, textBId: 2, raterId: 'r2', winner: 'B' }),
      ];
      const result = analyzeRaters(judgements, texts, btPredictions);
      expect(result.disagreements[0].textAName).toBe('Tekst 1');
      expect(result.disagreements[0].textBName).toBe('Tekst 2');
    });
  });

  describe('judge infit (PLAN-12)', () => {
    it('does not compute infit for raters with fewer than 10 judgements', () => {
      const judgements = [
        mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', winner: 'A' }),
      ];
      const result = analyzeRaters(judgements, texts, btPredictions);
      expect(result.raterStats[0].infit).toBeUndefined();
      expect(result.raterStats[0].infitLabel).toBeUndefined();
    });

    it('computes infit for raters with 10+ judgements', () => {
      const judgements: Judgement[] = [];
      // 12 consistent judgements by r1 (1 > 2 > 3)
      for (let k = 0; k < 4; k++) {
        judgements.push(mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', raterName: 'Alice', winner: 'A' }));
        judgements.push(mkJudgement({ textAId: 2, textBId: 3, raterId: 'r1', raterName: 'Alice', winner: 'A' }));
        judgements.push(mkJudgement({ textAId: 1, textBId: 3, raterId: 'r1', raterName: 'Alice', winner: 'A' }));
      }

      const result = analyzeRaters(judgements, texts, btPredictions);
      const r1 = result.raterStats.find(s => s.raterId === 'r1');
      expect(r1!.infit).toBeDefined();
      expect(r1!.infitLabel).toBeDefined();
      expect(r1!.infit!).toBeGreaterThan(0);
      expect(Number.isFinite(r1!.infit!)).toBe(true);
    });

    it('labels consistent rater as "Goed consistent"', () => {
      const judgements: Judgement[] = [];
      // BT says 1 > 2 > 3, rater always agrees
      for (let k = 0; k < 4; k++) {
        judgements.push(mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', raterName: 'Alice', winner: 'A' }));
        judgements.push(mkJudgement({ textAId: 2, textBId: 3, raterId: 'r1', raterName: 'Alice', winner: 'A' }));
        judgements.push(mkJudgement({ textAId: 1, textBId: 3, raterId: 'r1', raterName: 'Alice', winner: 'A' }));
      }

      const result = analyzeRaters(judgements, texts, btPredictions);
      const r1 = result.raterStats.find(s => s.raterId === 'r1');
      expect(r1!.infitLabel).toBe('Goed consistent');
    });

    it('produces higher infit for contradictory rater', () => {
      // Consistent rater
      const consistentJudgements: Judgement[] = [];
      for (let k = 0; k < 4; k++) {
        consistentJudgements.push(mkJudgement({ textAId: 1, textBId: 2, raterId: 'r1', winner: 'A' }));
        consistentJudgements.push(mkJudgement({ textAId: 2, textBId: 3, raterId: 'r1', winner: 'A' }));
        consistentJudgements.push(mkJudgement({ textAId: 1, textBId: 3, raterId: 'r1', winner: 'A' }));
      }

      // Contradictory rater (often disagrees with BT model)
      const contradictoryJudgements: Judgement[] = [];
      for (let k = 0; k < 4; k++) {
        contradictoryJudgements.push(mkJudgement({ textAId: 1, textBId: 2, raterId: 'r2', winner: 'B' }));
        contradictoryJudgements.push(mkJudgement({ textAId: 2, textBId: 3, raterId: 'r2', winner: 'B' }));
        contradictoryJudgements.push(mkJudgement({ textAId: 1, textBId: 3, raterId: 'r2', winner: 'B' }));
      }

      const consistentResult = analyzeRaters(consistentJudgements, texts, btPredictions);
      const contradictoryResult = analyzeRaters(contradictoryJudgements, texts, btPredictions);

      const r1 = consistentResult.raterStats[0];
      const r2 = contradictoryResult.raterStats[0];

      expect(r1.infit).toBeDefined();
      expect(r2.infit).toBeDefined();
      expect(r2.infit!).toBeGreaterThan(r1.infit!);
    });
  });
});

describe('countUniqueRaters', () => {
  it('returns 0 for empty input', () => {
    expect(countUniqueRaters([])).toBe(0);
  });

  it('counts distinct raterIds', () => {
    const judgements: Judgement[] = [
      { id: 1, assignmentId: 1, textAId: 1, textBId: 2, winner: 'A', createdAt: new Date(), raterId: 'r1' },
      { id: 2, assignmentId: 1, textAId: 2, textBId: 3, winner: 'A', createdAt: new Date(), raterId: 'r1' },
      { id: 3, assignmentId: 1, textAId: 1, textBId: 3, winner: 'B', createdAt: new Date(), raterId: 'r2' },
    ];
    expect(countUniqueRaters(judgements)).toBe(2);
  });

  it('treats missing raterId as "unknown"', () => {
    const judgements: Judgement[] = [
      { id: 1, assignmentId: 1, textAId: 1, textBId: 2, winner: 'A', createdAt: new Date() },
      { id: 2, assignmentId: 1, textAId: 2, textBId: 3, winner: 'A', createdAt: new Date() },
    ];
    expect(countUniqueRaters(judgements)).toBe(1);
  });
});
