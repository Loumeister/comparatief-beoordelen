import { describe, it, expect } from 'vitest';
import { calculateBradleyTerry } from '../bradley-terry';
import type { Text, Judgement } from '../db';

// Helper: create a minimal Text object
function makeText(id: number): Text {
  return { id, assignmentId: 1, content: '', originalFilename: `${id}.docx`, anonymizedName: `Tekst ${id}`, createdAt: new Date() };
}

// Helper: create a judgement (A wins by default)
function makeJudgement(textAId: number, textBId: number, winner: 'A' | 'B' | 'EQUAL' = 'A'): Judgement {
  const pk = `${Math.min(textAId, textBId)}-${Math.max(textAId, textBId)}`;
  return { id: undefined, assignmentId: 1, textAId, textBId, winner, createdAt: new Date(), pairKey: pk, source: 'human', isFinal: false };
}

describe('calculateBradleyTerry', () => {
  it('returns empty array for empty input', () => {
    expect(calculateBradleyTerry([], [])).toEqual([]);
  });

  it('returns one result for a single text (no judgements possible)', () => {
    const texts = [makeText(1)];
    const results = calculateBradleyTerry(texts, []);
    expect(results).toHaveLength(1);
    expect(results[0].rank).toBe(1);
    expect(results[0].theta).toBe(0); // single text, centered at 0
  });

  it('ranks text with more wins higher (simple 2-text case)', () => {
    const texts = [makeText(1), makeText(2)];
    // A always beats B: 5 decisive wins for text 1
    const judgements = Array.from({ length: 5 }, () => makeJudgement(1, 2, 'A'));

    const results = calculateBradleyTerry(texts, judgements);
    expect(results).toHaveLength(2);

    const t1 = results.find(r => r.textId === 1)!;
    const t2 = results.find(r => r.textId === 2)!;

    expect(t1.theta).toBeGreaterThan(t2.theta);
    expect(t1.rank).toBe(1);
    expect(t2.rank).toBe(2);
  });

  it('produces theta ≈ 0 for both texts when all outcomes are ties', () => {
    const texts = [makeText(1), makeText(2)];
    const judgements = Array.from({ length: 10 }, () => makeJudgement(1, 2, 'EQUAL'));

    const results = calculateBradleyTerry(texts, judgements);
    const t1 = results.find(r => r.textId === 1)!;
    const t2 = results.find(r => r.textId === 2)!;

    // With equal wins on both sides (ties split 0.5/0.5), thetas should be near 0
    expect(Math.abs(t1.theta)).toBeLessThan(0.05);
    expect(Math.abs(t2.theta)).toBeLessThan(0.05);
  });

  it('ranks 3 texts correctly in a clear transitive order (A > B > C)', () => {
    const texts = [makeText(1), makeText(2), makeText(3)];
    const judgements = [
      // A beats B 5 times
      ...Array.from({ length: 5 }, () => makeJudgement(1, 2, 'A')),
      // B beats C 5 times
      ...Array.from({ length: 5 }, () => makeJudgement(2, 3, 'A')),
      // A beats C 5 times
      ...Array.from({ length: 5 }, () => makeJudgement(1, 3, 'A')),
    ];

    const results = calculateBradleyTerry(texts, judgements);
    expect(results.map(r => r.textId)).toEqual([1, 2, 3]);
  });

  it('thetas sum to approximately zero (centering constraint)', () => {
    const texts = [makeText(1), makeText(2), makeText(3), makeText(4)];
    const judgements = [
      ...Array.from({ length: 3 }, () => makeJudgement(1, 2, 'A')),
      ...Array.from({ length: 3 }, () => makeJudgement(2, 3, 'A')),
      ...Array.from({ length: 3 }, () => makeJudgement(3, 4, 'A')),
      ...Array.from({ length: 2 }, () => makeJudgement(1, 4, 'A')),
    ];

    const results = calculateBradleyTerry(texts, judgements);
    const sumTheta = results.reduce((s, r) => s + r.theta, 0);
    expect(Math.abs(sumTheta)).toBeLessThan(0.01);
  });

  it('produces finite SEs for a connected graph', () => {
    const texts = [makeText(1), makeText(2), makeText(3)];
    const judgements = [
      ...Array.from({ length: 4 }, () => makeJudgement(1, 2, 'A')),
      ...Array.from({ length: 4 }, () => makeJudgement(2, 3, 'A')),
      ...Array.from({ length: 4 }, () => makeJudgement(1, 3, 'A')),
    ];

    const results = calculateBradleyTerry(texts, judgements);
    for (const r of results) {
      expect(r.standardError).toBeGreaterThan(0);
      expect(Number.isFinite(r.standardError)).toBe(true);
    }
  });

  it('reports isGraphConnected=true for a connected graph', () => {
    const texts = [makeText(1), makeText(2), makeText(3)];
    const judgements = [
      makeJudgement(1, 2, 'A'),
      makeJudgement(2, 3, 'A'),
    ];

    const results = calculateBradleyTerry(texts, judgements);
    expect(results[0].isGraphConnected).toBe(true);
    expect(results[0].components).toBe(1);
  });

  it('reports isGraphConnected=false for a disconnected graph', () => {
    const texts = [makeText(1), makeText(2), makeText(3)];
    // Only 1 vs 2 compared; 3 is isolated
    const judgements = [makeJudgement(1, 2, 'A')];

    const results = calculateBradleyTerry(texts, judgements);
    expect(results[0].isGraphConnected).toBe(false);
    expect(results[0].components).toBe(2);
  });

  it('Hessian SE: off-diagonal computed correctly (regression test for double-counting bug)', () => {
    // With 3 texts, each compared once, the SEs should be symmetric for symmetric data
    const texts = [makeText(1), makeText(2), makeText(3)];
    const judgements = [
      makeJudgement(1, 2, 'A'),
      makeJudgement(2, 3, 'A'),
      makeJudgement(1, 3, 'A'),
    ];

    const results = calculateBradleyTerry(texts, judgements);
    // All three SEs should be reasonable (not inflated by double-counting)
    for (const r of results) {
      expect(r.standardError).toBeLessThan(5); // sanity: not blown up
      expect(r.standardError).toBeGreaterThan(0.1); // sanity: not collapsed
    }

    // With only 1 comparison per pair, SEs should be relatively large
    // but NOT infinite for a connected graph
    expect(results.every(r => Number.isFinite(r.standardError))).toBe(true);
  });

  it('more data → smaller SEs', () => {
    const texts = [makeText(1), makeText(2)];
    const fewJudgements = [makeJudgement(1, 2, 'A'), makeJudgement(1, 2, 'A')];
    const manyJudgements = Array.from({ length: 20 }, () => makeJudgement(1, 2, 'A'));

    const fewResults = calculateBradleyTerry(texts, fewJudgements);
    const manyResults = calculateBradleyTerry(texts, manyJudgements);

    const seFew = fewResults.find(r => r.textId === 1)!.standardError;
    const seMany = manyResults.find(r => r.textId === 1)!.standardError;

    expect(seMany).toBeLessThan(seFew);
  });

  it('labels are assigned by percentile: top 10%, next 40%, next 40%, bottom 10%', () => {
    // 10 texts with clear ordering
    const texts = Array.from({ length: 10 }, (_, i) => makeText(i + 1));
    const judgements: Judgement[] = [];
    // Create a clear chain: 1 > 2 > 3 > ... > 10 with enough data
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < 10; j++) {
        for (let k = 0; k < 5; k++) {
          judgements.push(makeJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    const results = calculateBradleyTerry(texts, judgements);
    expect(results[0].label).toBe('Topgroep');          // rank 1 = top 10%
    expect(results[4].label).toBe('Bovengemiddeld');     // rank 5 = top 50%
    expect(results[5].label).toBe('Gemiddeld');          // rank 6 = 60th percentile
    expect(results[9].label).toBe('Onder gemiddeld');    // rank 10 = bottom 10%
  });

  it('grades respect min/max bounds', () => {
    const texts = [makeText(1), makeText(2)];
    // Extremely one-sided: all wins for text 1
    const judgements = Array.from({ length: 50 }, () => makeJudgement(1, 2, 'A'));

    const results = calculateBradleyTerry(texts, judgements, 0.1, 0.1, { base: 7, scale: 1.2, min: 1, max: 10 });
    for (const r of results) {
      expect(r.grade).toBeGreaterThanOrEqual(1);
      expect(r.grade).toBeLessThanOrEqual(10);
    }
  });

  it('grades use custom base and scale', () => {
    const texts = [makeText(1), makeText(2), makeText(3)];
    const judgements = [
      ...Array.from({ length: 5 }, () => makeJudgement(1, 2, 'A')),
      ...Array.from({ length: 5 }, () => makeJudgement(2, 3, 'A')),
      ...Array.from({ length: 5 }, () => makeJudgement(1, 3, 'A')),
    ];

    const resultsDefault = calculateBradleyTerry(texts, judgements);
    const resultsCustom = calculateBradleyTerry(texts, judgements, 0.1, 0.1, { base: 5, scale: 2.0 });

    // The middle text should get approximately the base grade
    const midDefault = resultsDefault.find(r => r.rank === 2)!;
    const midCustom = resultsCustom.find(r => r.rank === 2)!;

    expect(midDefault.grade).toBeCloseTo(7, 0); // default base=7
    expect(midCustom.grade).toBeCloseTo(5, 0);  // custom base=5
  });

  it('lambda regularization pulls thetas toward zero', () => {
    const texts = [makeText(1), makeText(2)];
    const judgements = Array.from({ length: 3 }, () => makeJudgement(1, 2, 'A'));

    const lowLambda = calculateBradleyTerry(texts, judgements, 0.01);
    const highLambda = calculateBradleyTerry(texts, judgements, 5.0);

    const thetaDiffLow = Math.abs(lowLambda[0].theta - lowLambda[1].theta);
    const thetaDiffHigh = Math.abs(highLambda[0].theta - highLambda[1].theta);

    // Higher lambda → stronger pull toward 0 → smaller difference
    expect(thetaDiffHigh).toBeLessThan(thetaDiffLow);
  });

  it('handles B-wins correctly (not just A-wins)', () => {
    const texts = [makeText(1), makeText(2)];
    const judgements = Array.from({ length: 5 }, () => makeJudgement(1, 2, 'B'));

    const results = calculateBradleyTerry(texts, judgements);
    const t1 = results.find(r => r.textId === 1)!;
    const t2 = results.find(r => r.textId === 2)!;

    // Text 2 should be ranked higher since B always wins
    expect(t2.theta).toBeGreaterThan(t1.theta);
    expect(t2.rank).toBe(1);
  });
});
