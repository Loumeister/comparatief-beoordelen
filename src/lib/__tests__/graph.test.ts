import { describe, it, expect } from 'vitest';
import { isConnected } from '../graph';
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

function mkJudgement(textAId: number, textBId: number): Judgement {
  return {
    id: Math.random() * 1e9 | 0,
    assignmentId: 1,
    textAId,
    textBId,
    winner: 'A',
    createdAt: new Date(),
    pairKey: `${Math.min(textAId, textBId)}-${Math.max(textAId, textBId)}`,
  };
}

describe('isConnected', () => {
  it('returns true for 0 texts', () => {
    expect(isConnected([], [])).toBe(true);
  });

  it('returns true for 1 text', () => {
    expect(isConnected([mkText(1)], [])).toBe(true);
  });

  it('returns false for 2+ texts with no judgements', () => {
    expect(isConnected([mkText(1), mkText(2)], [])).toBe(false);
  });

  it('returns true for 2 texts with a judgement', () => {
    expect(isConnected([mkText(1), mkText(2)], [mkJudgement(1, 2)])).toBe(true);
  });

  it('returns false when graph has disconnected components', () => {
    const texts = [mkText(1), mkText(2), mkText(3), mkText(4)];
    // 1-2 connected, 3-4 connected, but groups are disconnected
    const judgements = [mkJudgement(1, 2), mkJudgement(3, 4)];
    expect(isConnected(texts, judgements)).toBe(false);
  });

  it('returns true when all texts are transitively connected', () => {
    const texts = [mkText(1), mkText(2), mkText(3), mkText(4)];
    // Chain: 1-2, 2-3, 3-4
    const judgements = [mkJudgement(1, 2), mkJudgement(2, 3), mkJudgement(3, 4)];
    expect(isConnected(texts, judgements)).toBe(true);
  });

  it('handles star topology (one central node)', () => {
    const texts = [mkText(1), mkText(2), mkText(3), mkText(4)];
    // Star: 1 connected to 2, 3, 4
    const judgements = [mkJudgement(1, 2), mkJudgement(1, 3), mkJudgement(1, 4)];
    expect(isConnected(texts, judgements)).toBe(true);
  });

  it('returns false if one isolated text exists', () => {
    const texts = [mkText(1), mkText(2), mkText(3)];
    // 1-2 connected, 3 is isolated
    const judgements = [mkJudgement(1, 2)];
    expect(isConnected(texts, judgements)).toBe(false);
  });
});
