import { describe, it, expect } from 'vitest';
import { calculateBradleyTerry } from '../bradley-terry';
import type { Text, Judgement } from '../db';

// Helper: make a Text object
function mkText(id: number, assignmentId = 1): Text {
  return {
    id,
    assignmentId,
    content: `Text ${id}`,
    originalFilename: `text${id}.txt`,
    anonymizedName: `Tekst ${id}`,
    createdAt: new Date(),
  };
}

// Helper: make a Judgement
function mkJudgement(
  textAId: number,
  textBId: number,
  winner: 'A' | 'B' | 'EQUAL',
  assignmentId = 1,
): Judgement {
  return {
    id: Math.random() * 1e9 | 0,
    assignmentId,
    textAId,
    textBId,
    winner,
    createdAt: new Date(),
    pairKey: `${Math.min(textAId, textBId)}-${Math.max(textAId, textBId)}`,
  };
}

describe('calculateBradleyTerry', () => {
  it('returns empty array for no texts', () => {
    expect(calculateBradleyTerry([], [])).toEqual([]);
  });

  it('returns a single result for one text (no judgements possible)', () => {
    const texts = [mkText(1)];
    const results = calculateBradleyTerry(texts, []);
    expect(results).toHaveLength(1);
    expect(results[0].textId).toBe(1);
    expect(results[0].rank).toBe(1);
  });

  it('ranks texts correctly in a clear ordering (A > B > C)', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    // A beats B, A beats C, B beats C — clear order: 1 > 2 > 3
    const judgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(1, 3, 'A'),
      mkJudgement(2, 3, 'A'),
      // Repeat for stability
      mkJudgement(1, 2, 'A'),
      mkJudgement(1, 3, 'A'),
      mkJudgement(2, 3, 'A'),
    ];
    const results = calculateBradleyTerry(texts, judgements);
    expect(results).toHaveLength(3);

    // Rank 1 should be text 1, rank 3 should be text 3
    const byRank = [...results].sort((a, b) => a.rank - b.rank);
    expect(byRank[0].textId).toBe(1);
    expect(byRank[1].textId).toBe(2);
    expect(byRank[2].textId).toBe(3);

    // Theta should be monotonically decreasing by rank
    expect(byRank[0].theta).toBeGreaterThan(byRank[1].theta);
    expect(byRank[1].theta).toBeGreaterThan(byRank[2].theta);
  });

  it('handles ties (EQUAL) correctly', () => {
    const texts = [mkText(1), mkText(2)];
    // All ties — thetas should be approximately equal
    const judgements = [
      mkJudgement(1, 2, 'EQUAL'),
      mkJudgement(1, 2, 'EQUAL'),
      mkJudgement(1, 2, 'EQUAL'),
    ];
    const results = calculateBradleyTerry(texts, judgements);
    expect(results).toHaveLength(2);

    // With all ties, thetas should be very close to 0
    for (const r of results) {
      expect(Math.abs(r.theta)).toBeLessThan(0.1);
    }
  });

  it('theta sums to approximately zero (centering)', () => {
    const texts = [mkText(1), mkText(2), mkText(3), mkText(4)];
    const judgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(3, 4, 'A'),
      mkJudgement(1, 4, 'A'),
      mkJudgement(1, 3, 'B'),
      mkJudgement(2, 4, 'A'),
    ];
    const results = calculateBradleyTerry(texts, judgements);
    const thetaSum = results.reduce((s, r) => s + r.theta, 0);
    expect(Math.abs(thetaSum)).toBeLessThan(0.01);
  });

  it('computes finite standard errors', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    const judgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(1, 3, 'A'),
    ];
    const results = calculateBradleyTerry(texts, judgements);
    for (const r of results) {
      expect(r.standardError).toBeGreaterThan(0);
      expect(Number.isFinite(r.standardError)).toBe(true);
    }
  });

  it('SE decreases with more comparisons', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    const fewJudgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(1, 3, 'A'),
    ];
    const manyJudgements = [
      ...fewJudgements,
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(1, 3, 'A'),
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(1, 3, 'A'),
    ];

    const fewResults = calculateBradleyTerry(texts, fewJudgements);
    const manyResults = calculateBradleyTerry(texts, manyJudgements);

    // Average SE should decrease with more data
    const avgSEFew = fewResults.reduce((s, r) => s + r.standardError, 0) / fewResults.length;
    const avgSEMany = manyResults.reduce((s, r) => s + r.standardError, 0) / manyResults.length;
    expect(avgSEMany).toBeLessThan(avgSEFew);
  });

  it('assigns correct labels based on percentile', () => {
    // 10 texts, clear ranking
    const texts = Array.from({ length: 10 }, (_, i) => mkText(i + 1));
    const judgements: Judgement[] = [];
    // Create a clear linear order: 1 > 2 > ... > 10
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < 10; j++) {
        // Text i+1 beats text j+1 (lower id is better)
        judgements.push(mkJudgement(i + 1, j + 1, 'A'));
        judgements.push(mkJudgement(i + 1, j + 1, 'A'));
      }
    }

    const results = calculateBradleyTerry(texts, judgements);
    const byRank = [...results].sort((a, b) => a.rank - b.rank);

    // Top 10% (rank 1) = "Topgroep"
    expect(byRank[0].label).toBe('Topgroep');
    // Ranks 2-5 (11-50%) = "Bovengemiddeld"
    expect(byRank[1].label).toBe('Bovengemiddeld');
    expect(byRank[4].label).toBe('Bovengemiddeld');
    // Ranks 6-9 (51-90%) = "Gemiddeld"
    expect(byRank[5].label).toBe('Gemiddeld');
    expect(byRank[8].label).toBe('Gemiddeld');
    // Rank 10 (bottom 10%) = "Onder gemiddeld"
    expect(byRank[9].label).toBe('Onder gemiddeld');
  });

  it('computes grades within [min, max] range', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    const judgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(1, 3, 'A'),
    ];
    const results = calculateBradleyTerry(texts, judgements, 0.1, 0.1, {
      base: 7,
      scale: 1.2,
      min: 1,
      max: 10,
    });
    for (const r of results) {
      expect(r.grade).toBeGreaterThanOrEqual(1);
      expect(r.grade).toBeLessThanOrEqual(10);
    }
  });

  it('respects custom grading parameters', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    const judgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(1, 3, 'A'),
    ];
    const results = calculateBradleyTerry(texts, judgements, 0.1, 0.1, {
      base: 5,
      scale: 2,
      min: 2,
      max: 8,
    });
    for (const r of results) {
      expect(r.grade).toBeGreaterThanOrEqual(2);
      expect(r.grade).toBeLessThanOrEqual(8);
    }
  });

  it('computes low infit for perfectly consistent data (overfit)', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    // Perfectly consistent: 1 always beats 2, 2 always beats 3, 1 always beats 3
    const judgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(1, 3, 'A'),
      mkJudgement(1, 3, 'A'),
    ];
    const results = calculateBradleyTerry(texts, judgements);
    for (const r of results) {
      expect(r.infit).toBeDefined();
      // Perfectly predictable outcomes → low residuals → infit < 1.0
      expect(r.infit!).toBeGreaterThanOrEqual(0);
      expect(r.infit!).toBeLessThan(1.0);
    }
  });

  it('computes higher infit for inconsistent data', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    // Contradictory: 1 beats 2, 2 beats 3, but 3 beats 1 (cycle)
    const judgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(1, 3, 'B'), // 3 beats 1 — contradicts transitive order
      mkJudgement(1, 3, 'B'),
    ];
    const inconsistentResults = calculateBradleyTerry(texts, judgements);

    // Also compute for consistent data
    const consistentJudgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(1, 3, 'A'),
      mkJudgement(1, 3, 'A'),
    ];
    const consistentResults = calculateBradleyTerry(texts, consistentJudgements);

    // Average infit should be higher for inconsistent data
    const avgInfitIncon = inconsistentResults.reduce((s, r) => s + r.infit!, 0) / 3;
    const avgInfitCon = consistentResults.reduce((s, r) => s + r.infit!, 0) / 3;
    expect(avgInfitIncon).toBeGreaterThan(avgInfitCon);
  });

  it('detects graph connectivity', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    // Only 1-2 compared, 3 is isolated
    const disconnected = [mkJudgement(1, 2, 'A')];
    const rDisconnected = calculateBradleyTerry(texts, disconnected);
    expect(rDisconnected[0].isGraphConnected).toBe(false);
    expect(rDisconnected[0].components).toBe(2);

    // All connected
    const connected = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
    ];
    const rConnected = calculateBradleyTerry(texts, connected);
    expect(rConnected[0].isGraphConnected).toBe(true);
    expect(rConnected[0].components).toBe(1);
  });

  it('sets reliability labels based on SE thresholds', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    // Few comparisons -> high SE -> "Onvoldoende gegevens"
    const fewJudgements = [mkJudgement(1, 2, 'A')];
    const fewResults = calculateBradleyTerry(texts, fewJudgements);
    // Text 3 has no comparisons, should be unreliable
    const text3 = fewResults.find(r => r.textId === 3);
    expect(text3?.reliability).toBe('Onvoldoende gegevens');
  });

  it('handles lambda = 0.3 (stronger regularization) without errors', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    const judgements = [mkJudgement(1, 2, 'A'), mkJudgement(2, 3, 'B')];
    const results = calculateBradleyTerry(texts, judgements, 0.3);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(Number.isFinite(r.theta)).toBe(true);
    }
  });

  it('skips judgements where textA === textB', () => {
    const texts = [mkText(1), mkText(2)];
    const judgements = [
      mkJudgement(1, 1, 'A'), // self-comparison — should be ignored
      mkJudgement(1, 2, 'A'),
    ];
    const results = calculateBradleyTerry(texts, judgements);
    expect(results).toHaveLength(2);
    // Should still produce valid results (only the 1-2 comparison counts)
    const byRank = [...results].sort((a, b) => a.rank - b.rank);
    expect(byRank[0].textId).toBe(1);
  });

  it('skips judgements referencing unknown text IDs', () => {
    const texts = [mkText(1), mkText(2)];
    const judgements = [
      mkJudgement(1, 999, 'A'), // unknown text — should be ignored
      mkJudgement(1, 2, 'B'),
    ];
    const results = calculateBradleyTerry(texts, judgements);
    expect(results).toHaveLength(2);
  });
});
