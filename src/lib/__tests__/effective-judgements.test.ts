import { describe, it, expect } from 'vitest';
import { getEffectiveJudgements } from '../effective-judgements';
import type { Judgement } from '../db';

function makeJudgement(
  id: number,
  textAId: number,
  textBId: number,
  winner: 'A' | 'B' | 'EQUAL',
  opts: { raterId?: string; isFinal?: boolean; createdAt?: Date } = {}
): Judgement {
  const pk = `${Math.min(textAId, textBId)}-${Math.max(textAId, textBId)}`;
  return {
    id,
    assignmentId: 1,
    textAId,
    textBId,
    winner,
    createdAt: opts.createdAt ?? new Date(),
    raterId: opts.raterId ?? 'rater-1',
    pairKey: pk,
    source: 'human',
    isFinal: opts.isFinal ?? false,
  };
}

describe('getEffectiveJudgements', () => {
  it('returns empty for empty input', () => {
    expect(getEffectiveJudgements([])).toEqual([]);
  });

  it('returns all judgements when each pair has one judgement', () => {
    const js = [
      makeJudgement(1, 1, 2, 'A'),
      makeJudgement(2, 2, 3, 'B'),
      makeJudgement(3, 1, 3, 'EQUAL'),
    ];
    const result = getEffectiveJudgements(js);
    expect(result).toHaveLength(3);
  });

  it('per-rater dedup: keeps only the newest judgement per rater per pair', () => {
    const earlier = new Date('2024-01-01');
    const later = new Date('2024-06-01');

    const js = [
      makeJudgement(1, 1, 2, 'A', { raterId: 'rater-jan', createdAt: earlier }),
      makeJudgement(2, 1, 2, 'B', { raterId: 'rater-jan', createdAt: later }),  // newer → keep
    ];

    const result = getEffectiveJudgements(js);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
    expect(result[0].winner).toBe('B');
  });

  it('keeps judgements from different raters on the same pair', () => {
    const js = [
      makeJudgement(1, 1, 2, 'A', { raterId: 'rater-jan' }),
      makeJudgement(2, 1, 2, 'B', { raterId: 'rater-piet' }),
    ];

    const result = getEffectiveJudgements(js);
    expect(result).toHaveLength(2);
  });

  it('isFinal moderation overrides all normal judgements for that pair', () => {
    const earlier = new Date('2024-01-01');
    const later = new Date('2024-06-01');

    const js = [
      makeJudgement(1, 1, 2, 'A', { raterId: 'rater-jan', createdAt: earlier }),
      makeJudgement(2, 1, 2, 'B', { raterId: 'rater-piet', createdAt: earlier }),
      makeJudgement(3, 1, 2, 'EQUAL', { raterId: 'moderator', createdAt: later, isFinal: true }),
    ];

    const result = getEffectiveJudgements(js);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
    expect(result[0].isFinal).toBe(true);
    expect(result[0].winner).toBe('EQUAL');
  });

  it('when multiple finals exist, keeps only the newest', () => {
    const t1 = new Date('2024-01-01');
    const t2 = new Date('2024-06-01');
    const t3 = new Date('2024-12-01');

    const js = [
      makeJudgement(1, 1, 2, 'A', { raterId: 'mod-1', createdAt: t1, isFinal: true }),
      makeJudgement(2, 1, 2, 'B', { raterId: 'mod-2', createdAt: t3, isFinal: true }), // newest
      makeJudgement(3, 1, 2, 'EQUAL', { raterId: 'mod-1', createdAt: t2, isFinal: true }),
    ];

    const result = getEffectiveJudgements(js);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('handles different pairs independently', () => {
    const earlier = new Date('2024-01-01');
    const later = new Date('2024-06-01');

    const js = [
      // Pair 1-2: rater changes mind
      makeJudgement(1, 1, 2, 'A', { raterId: 'jan', createdAt: earlier }),
      makeJudgement(2, 1, 2, 'B', { raterId: 'jan', createdAt: later }),
      // Pair 2-3: single judgement
      makeJudgement(3, 2, 3, 'A', { raterId: 'jan', createdAt: earlier }),
      // Pair 1-3: final moderation
      makeJudgement(4, 1, 3, 'A', { raterId: 'jan', createdAt: earlier }),
      makeJudgement(5, 1, 3, 'EQUAL', { raterId: 'mod', createdAt: later, isFinal: true }),
    ];

    const result = getEffectiveJudgements(js);
    expect(result).toHaveLength(3); // one per pair

    const pair12 = result.find(j => j.pairKey === '1-2')!;
    expect(pair12.id).toBe(2); // newer

    const pair23 = result.find(j => j.pairKey === '2-3')!;
    expect(pair23.id).toBe(3);

    const pair13 = result.find(j => j.pairKey === '1-3')!;
    expect(pair13.id).toBe(5); // final
  });

  it('computes pairKey from textAId/textBId when pairKey is missing', () => {
    const js: Judgement[] = [
      { id: 1, assignmentId: 1, textAId: 3, textBId: 1, winner: 'A', createdAt: new Date(), raterId: 'r1' },
      { id: 2, assignmentId: 1, textAId: 1, textBId: 3, winner: 'B', createdAt: new Date(Date.now() + 1000), raterId: 'r1' },
    ];

    // Both should be grouped under the same pair (1-3) regardless of order
    const result = getEffectiveJudgements(js);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2); // newer
  });

  it('unknown raterId treated as single rater', () => {
    const earlier = new Date('2024-01-01');
    const later = new Date('2024-06-01');

    const js: Judgement[] = [
      { id: 1, assignmentId: 1, textAId: 1, textBId: 2, winner: 'A', createdAt: earlier, pairKey: '1-2' },
      { id: 2, assignmentId: 1, textAId: 1, textBId: 2, winner: 'B', createdAt: later, pairKey: '1-2' },
    ];

    // Both have undefined raterId → grouped under 'unknown' → keep newest
    const result = getEffectiveJudgements(js);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});
