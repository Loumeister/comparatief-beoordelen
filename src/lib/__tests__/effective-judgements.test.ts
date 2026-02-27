import { describe, it, expect } from 'vitest';
import { getEffectiveJudgements } from '../effective-judgements';
import type { Judgement } from '../db';

function mkJudgement(overrides: Partial<Judgement> & { textAId: number; textBId: number }): Judgement {
  const textAId = overrides.textAId;
  const textBId = overrides.textBId;
  return {
    id: Math.random() * 1e9 | 0,
    assignmentId: 1,
    winner: 'A' as const,
    createdAt: new Date(),
    pairKey: `${Math.min(textAId, textBId)}-${Math.max(textAId, textBId)}`,
    ...overrides,
  };
}

describe('getEffectiveJudgements', () => {
  it('returns empty array for empty input', () => {
    expect(getEffectiveJudgements([])).toEqual([]);
  });

  it('returns all judgements when each pair has one judgement', () => {
    const judgements = [
      mkJudgement({ textAId: 1, textBId: 2 }),
      mkJudgement({ textAId: 3, textBId: 4 }),
    ];
    const result = getEffectiveJudgements(judgements);
    expect(result).toHaveLength(2);
  });

  it('keeps only the newest final judgement when isFinal is set', () => {
    const old = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'A',
      isFinal: true,
      createdAt: new Date('2024-01-01'),
    });
    const newer = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'B',
      isFinal: true,
      createdAt: new Date('2024-06-01'),
    });
    const nonFinal = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'A',
      isFinal: false,
      createdAt: new Date('2024-12-01'),
    });

    const result = getEffectiveJudgements([old, newer, nonFinal]);
    expect(result).toHaveLength(1);
    expect(result[0].winner).toBe('B'); // newest final wins
    expect(result[0].createdAt).toEqual(new Date('2024-06-01'));
  });

  it('deduplicates per rater (keeps newest per rater per pair)', () => {
    const rater1old = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'A',
      raterId: 'rater1',
      createdAt: new Date('2024-01-01'),
    });
    const rater1new = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'B',
      raterId: 'rater1',
      createdAt: new Date('2024-06-01'),
    });
    const rater2 = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'A',
      raterId: 'rater2',
      createdAt: new Date('2024-03-01'),
    });

    const result = getEffectiveJudgements([rater1old, rater1new, rater2]);
    expect(result).toHaveLength(2);

    const rater1Result = result.find(j => j.raterId === 'rater1');
    expect(rater1Result?.winner).toBe('B'); // newest for rater1

    const rater2Result = result.find(j => j.raterId === 'rater2');
    expect(rater2Result?.winner).toBe('A');
  });

  it('treats missing raterId as "unknown"', () => {
    const j1 = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'A',
      createdAt: new Date('2024-01-01'),
    });
    const j2 = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'B',
      createdAt: new Date('2024-06-01'),
    });
    // Both have no raterId -> grouped as "unknown" -> only newest kept
    const result = getEffectiveJudgements([j1, j2]);
    expect(result).toHaveLength(1);
    expect(result[0].winner).toBe('B');
  });

  it('uses pairKey for grouping (canonical order)', () => {
    // Same pair, different A/B order
    const j1 = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'A',
      raterId: 'r1',
      pairKey: '1-2',
      createdAt: new Date('2024-01-01'),
    });
    const j2 = mkJudgement({
      textAId: 2,
      textBId: 1,
      winner: 'B',
      raterId: 'r1',
      pairKey: '1-2',
      createdAt: new Date('2024-06-01'),
    });
    const result = getEffectiveJudgements([j1, j2]);
    // Same rater, same pair -> only newest
    expect(result).toHaveLength(1);
    expect(result[0].createdAt).toEqual(new Date('2024-06-01'));
  });

  it('computes pairKey from textAId/textBId when pairKey is missing', () => {
    const j1 = mkJudgement({
      textAId: 3,
      textBId: 1,
      winner: 'A',
      raterId: 'r1',
      pairKey: undefined,
      createdAt: new Date('2024-01-01'),
    });
    const j2 = mkJudgement({
      textAId: 1,
      textBId: 3,
      winner: 'B',
      raterId: 'r1',
      pairKey: undefined,
      createdAt: new Date('2024-06-01'),
    });
    const result = getEffectiveJudgements([j1, j2]);
    // Both should hash to "1-3" -> same rater -> only newest
    expect(result).toHaveLength(1);
  });

  it('keeps multiple raters for different pairs', () => {
    const judgements = [
      mkJudgement({ textAId: 1, textBId: 2, winner: 'A', raterId: 'r1' }),
      mkJudgement({ textAId: 1, textBId: 2, winner: 'B', raterId: 'r2' }),
      mkJudgement({ textAId: 3, textBId: 4, winner: 'A', raterId: 'r1' }),
    ];
    const result = getEffectiveJudgements(judgements);
    expect(result).toHaveLength(3);
  });

  it('final judgement overrides all non-final, regardless of rater', () => {
    const nonFinal1 = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'A',
      raterId: 'r1',
      createdAt: new Date('2024-01-01'),
    });
    const nonFinal2 = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'B',
      raterId: 'r2',
      createdAt: new Date('2024-03-01'),
    });
    const finalJ = mkJudgement({
      textAId: 1,
      textBId: 2,
      winner: 'EQUAL',
      raterId: 'moderator',
      isFinal: true,
      createdAt: new Date('2024-06-01'),
    });

    const result = getEffectiveJudgements([nonFinal1, nonFinal2, finalJ]);
    // Final overrides everything -> only 1 result
    expect(result).toHaveLength(1);
    expect(result[0].winner).toBe('EQUAL');
  });
});
