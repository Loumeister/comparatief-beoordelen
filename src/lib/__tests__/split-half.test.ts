import { describe, it, expect } from 'vitest';
import { calculateSplitHalfReliability } from '../split-half';
import type { Text, Judgement } from '../db';

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

function mkJudgement(
  textAId: number,
  textBId: number,
  winner: 'A' | 'B' | 'EQUAL' = 'A',
): Judgement {
  return {
    id: Math.random() * 1e9 | 0,
    assignmentId: 1,
    textAId,
    textBId,
    winner,
    createdAt: new Date(),
    pairKey: `${Math.min(textAId, textBId)}-${Math.max(textAId, textBId)}`,
  };
}

describe('calculateSplitHalfReliability', () => {
  it('returns null for fewer than 6 judgements', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    const judgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(2, 3, 'A'),
      mkJudgement(1, 3, 'A'),
    ];
    expect(calculateSplitHalfReliability(texts, judgements)).toBeNull();
  });

  it('returns null for fewer than 3 texts', () => {
    const texts = [mkText(1), mkText(2)];
    const judgements = Array.from({ length: 10 }, () => mkJudgement(1, 2, 'A'));
    expect(calculateSplitHalfReliability(texts, judgements)).toBeNull();
  });

  it('returns null when the full comparison graph is disconnected', () => {
    const texts = [mkText(1), mkText(2), mkText(3), mkText(4)];
    const judgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(1, 2, 'A'),
      mkJudgement(1, 2, 'A'),
      mkJudgement(3, 4, 'A'),
      mkJudgement(3, 4, 'A'),
      mkJudgement(3, 4, 'A'),
    ];

    expect(calculateSplitHalfReliability(texts, judgements)).toBeNull();
  });

  it('returns a result with valid structure for sufficient data', () => {
    const texts = [mkText(1), mkText(2), mkText(3), mkText(4)];
    const judgements: Judgement[] = [];
    // 6+ judgements across all pairs
    for (let i = 1; i <= 4; i++) {
      for (let j = i + 1; j <= 4; j++) {
        judgements.push(mkJudgement(i, j, 'A'));
        judgements.push(mkJudgement(i, j, 'A'));
      }
    }

    const result = calculateSplitHalfReliability(texts, judgements);
    expect(result).not.toBeNull();
    expect(result!.coefficient).toBeGreaterThanOrEqual(0);
    expect(result!.coefficient).toBeLessThanOrEqual(1);
    expect(result!.numSplits).toBeGreaterThan(0);
    expect(result!.rawCorrelations).toHaveLength(result!.numSplits);
  });

  it('produces reproducible results (seeded PRNG)', () => {
    const texts = [mkText(1), mkText(2), mkText(3), mkText(4), mkText(5)];
    const judgements: Judgement[] = [];
    for (let i = 1; i <= 5; i++) {
      for (let j = i + 1; j <= 5; j++) {
        judgements.push(mkJudgement(i, j, 'A'));
        judgements.push(mkJudgement(i, j, 'A'));
        judgements.push(mkJudgement(i, j, 'A'));
      }
    }

    const r1 = calculateSplitHalfReliability(texts, judgements);
    const r2 = calculateSplitHalfReliability(texts, judgements);
    expect(r1!.coefficient).toBe(r2!.coefficient);
    expect(r1!.rawCorrelations).toEqual(r2!.rawCorrelations);
  });

  it('returns high coefficient for highly consistent data', () => {
    // Clear linear order: 1 > 2 > 3 > 4 > 5, many repeated judgements
    const texts = Array.from({ length: 5 }, (_, i) => mkText(i + 1));
    const judgements: Judgement[] = [];
    for (let i = 1; i <= 5; i++) {
      for (let j = i + 1; j <= 5; j++) {
        // 6 consistent judgements per pair
        for (let k = 0; k < 6; k++) {
          judgements.push(mkJudgement(i, j, 'A'));
        }
      }
    }

    const result = calculateSplitHalfReliability(texts, judgements);
    expect(result).not.toBeNull();
    // With perfectly consistent data, split-half coefficient should be high
    expect(result!.coefficient).toBeGreaterThan(0.7);
  });

  it('respects custom numSplits', () => {
    const texts = [mkText(1), mkText(2), mkText(3), mkText(4)];
    const judgements: Judgement[] = [];
    for (let i = 1; i <= 4; i++) {
      for (let j = i + 1; j <= 4; j++) {
        judgements.push(mkJudgement(i, j, 'A'));
        judgements.push(mkJudgement(i, j, 'A'));
      }
    }

    const result = calculateSplitHalfReliability(texts, judgements, 5);
    expect(result).not.toBeNull();
    expect(result!.numSplits).toBeGreaterThan(0);
    expect(result!.numSplits).toBeLessThanOrEqual(5);
    expect(result!.rawCorrelations).toHaveLength(result!.numSplits);
  });

  it('handles ties in judgements', () => {
    const texts = [mkText(1), mkText(2), mkText(3), mkText(4)];
    const judgements: Judgement[] = [];
    for (let i = 1; i <= 4; i++) {
      for (let j = i + 1; j <= 4; j++) {
        judgements.push(mkJudgement(i, j, 'EQUAL'));
        judgements.push(mkJudgement(i, j, 'EQUAL'));
      }
    }

    const result = calculateSplitHalfReliability(texts, judgements);
    expect(result).not.toBeNull();
    // With all ties, coefficient should still be finite
    expect(Number.isFinite(result!.coefficient)).toBe(true);
  });

  it('coefficient is clamped between 0 and 1', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    const judgements: Judgement[] = [];
    for (let k = 0; k < 4; k++) {
      judgements.push(mkJudgement(1, 2, k % 2 === 0 ? 'A' : 'B'));
      judgements.push(mkJudgement(2, 3, k % 2 === 0 ? 'A' : 'B'));
      judgements.push(mkJudgement(1, 3, k % 2 === 0 ? 'B' : 'A'));
    }

    const result = calculateSplitHalfReliability(texts, judgements);
    expect(result).not.toBeNull();
    expect(result!.coefficient).toBeGreaterThanOrEqual(0);
    expect(result!.coefficient).toBeLessThanOrEqual(1);
  });
});
