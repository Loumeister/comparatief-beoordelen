import { describe, it, expect } from 'vitest';
import { assessReliability } from '../reliability';
import type { Text, Judgement } from '../db';

function makeText(id: number): Text {
  return { id, assignmentId: 1, content: '', originalFilename: `${id}.docx`, anonymizedName: `Tekst ${id}`, createdAt: new Date() };
}

function makeJudgement(textAId: number, textBId: number, winner: 'A' | 'B' | 'EQUAL' = 'A'): Judgement {
  const pk = `${Math.min(textAId, textBId)}-${Math.max(textAId, textBId)}`;
  return { id: undefined, assignmentId: 1, textAId, textBId, winner, createdAt: new Date(), pairKey: pk, source: 'human', isFinal: false };
}

// A BTResult-like object
function makeBTResult(textId: number, theta: number, se: number, rank: number, grade: number) {
  return { textId, theta, standardError: se, rank, grade };
}

describe('assessReliability', () => {
  it('returns not reliable for empty results', () => {
    const result = assessReliability([], [], []);
    expect(result.isReliable).toBe(false);
    expect(result.corePercentage).toBe(0);
  });

  it('returns reliable when all conditions met', () => {
    // 10 texts, all with low SE, good ladder evidence
    const texts = Array.from({ length: 10 }, (_, i) => makeText(i + 1));
    const btResults = texts.map((t, i) => makeBTResult(t.id!, 2 - i * 0.4, 0.2, i + 1, 8 - i * 0.5));

    // Create enough judgements so ladder evidence exists for all extremes
    const judgements: Judgement[] = [];
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < 10; j++) {
        for (let k = 0; k < 4; k++) {
          judgements.push(makeJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    const result = assessReliability(btResults, texts, judgements);
    expect(result.coreReliable).toBe(true);
    expect(result.corePercentage).toBeGreaterThanOrEqual(80);
    expect(result.topHasLadder).toBe(true);
    expect(result.bottomHasLadder).toBe(true);
    expect(result.isReliable).toBe(true);
  });

  it('core not reliable when SEs are too high', () => {
    const texts = Array.from({ length: 5 }, (_, i) => makeText(i + 1));
    // High SE for everyone
    const btResults = texts.map((t, i) => makeBTResult(t.id!, 1 - i * 0.4, 2.0, i + 1, 7));

    const judgements = [makeJudgement(1, 2, 'A')]; // barely any data

    const result = assessReliability(btResults, texts, judgements);
    expect(result.coreReliable).toBe(false);
  });

  it('ladder evidence fails when extreme texts have no neighbor comparisons', () => {
    const texts = Array.from({ length: 5 }, (_, i) => makeText(i + 1));
    // Good SEs but no direct comparisons for extreme texts against neighbors
    const btResults = [
      makeBTResult(1, 2.0, 0.2, 1, 9),    // top extreme
      makeBTResult(2, 0.5, 0.2, 2, 7.5),
      makeBTResult(3, 0.0, 0.2, 3, 7),
      makeBTResult(4, -0.5, 0.2, 4, 6.5),
      makeBTResult(5, -2.0, 0.2, 5, 5),    // bottom extreme
    ];

    // Only comparisons between middle texts — extremes are isolated
    const judgements = [
      ...Array.from({ length: 5 }, () => makeJudgement(2, 3, 'A')),
      ...Array.from({ length: 5 }, () => makeJudgement(3, 4, 'A')),
      ...Array.from({ length: 5 }, () => makeJudgement(2, 4, 'A')),
    ];

    const result = assessReliability(btResults, texts, judgements);
    // Top text (1) has no comparisons against neighbors
    expect(result.topHasLadder).toBe(false);
    // Bottom text (5) has no comparisons against neighbors
    expect(result.bottomHasLadder).toBe(false);
  });

  it('convergence check: stable ranking → convergenceOk=true', () => {
    const texts = Array.from({ length: 5 }, (_, i) => makeText(i + 1));
    const btResults = texts.map((t, i) => makeBTResult(t.id!, 1 - i * 0.4, 0.2, i + 1, 8 - i * 0.5));

    // Same ranking and grades as previous fit
    const previousResults = texts.map((t, i) => ({ textId: t.id!, rank: i + 1, grade: 8 - i * 0.5 }));

    const judgements: Judgement[] = [];
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        for (let k = 0; k < 5; k++) {
          judgements.push(makeJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    const result = assessReliability(btResults, texts, judgements, previousResults);
    expect(result.convergenceOk).toBe(true);
    expect(result.kendallTau).toBeCloseTo(1.0, 1);
    expect(result.maxGradeDelta).toBe(0);
  });

  it('convergence check: swapped ranking → convergenceOk=false', () => {
    const texts = Array.from({ length: 5 }, (_, i) => makeText(i + 1));
    const btResults = texts.map((t, i) => makeBTResult(t.id!, 1 - i * 0.4, 0.2, i + 1, 8 - i * 0.5));

    // Previous had completely reversed ranking
    const previousResults = texts.map((t, i) => ({ textId: t.id!, rank: 5 - i, grade: 5 + i * 0.5 }));

    const judgements: Judgement[] = [];
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        for (let k = 0; k < 5; k++) {
          judgements.push(makeJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    const result = assessReliability(btResults, texts, judgements, previousResults);
    expect(result.convergenceOk).toBe(false);
    expect(result.kendallTau!).toBeLessThan(0.98);
  });

  it('convergence defaults to true when no previous results', () => {
    const texts = Array.from({ length: 3 }, (_, i) => makeText(i + 1));
    const btResults = texts.map((t, i) => makeBTResult(t.id!, 0.5 - i * 0.3, 0.2, i + 1, 7.5 - i));
    const judgements = [makeJudgement(1, 2, 'A'), makeJudgement(2, 3, 'A')];

    const result = assessReliability(btResults, texts, judgements);
    expect(result.convergenceOk).toBe(true);
    expect(result.kendallTau).toBeNull();
  });

  it('message explains which conditions failed', () => {
    const texts = Array.from({ length: 5 }, (_, i) => makeText(i + 1));
    const btResults = texts.map((t, i) => makeBTResult(t.id!, 0.5 - i * 0.2, 1.5, i + 1, 7));
    const judgements: Judgement[] = [];

    const result = assessReliability(btResults, texts, judgements);
    expect(result.isReliable).toBe(false);
    expect(result.message).toContain('kernset');
  });

  it('ladder evidence requires non-trivial outcomes (not all ties)', () => {
    const texts = Array.from({ length: 5 }, (_, i) => makeText(i + 1));
    const btResults = [
      makeBTResult(1, 2.0, 0.2, 1, 9),
      makeBTResult(2, 1.0, 0.2, 2, 8),
      makeBTResult(3, 0.0, 0.2, 3, 7),
      makeBTResult(4, -1.0, 0.2, 4, 6),
      makeBTResult(5, -2.0, 0.2, 5, 5),
    ];

    // Text 1 compared to neighbors but ALL ties — should fail non-trivial check
    const judgements = [
      ...Array.from({ length: 5 }, () => makeJudgement(1, 2, 'EQUAL')),
      ...Array.from({ length: 5 }, () => makeJudgement(4, 5, 'EQUAL')),
      // Some real judgements for middle texts
      ...Array.from({ length: 5 }, () => makeJudgement(2, 3, 'A')),
      ...Array.from({ length: 5 }, () => makeJudgement(3, 4, 'A')),
    ];

    const result = assessReliability(btResults, texts, judgements);
    // Top text only has ties → no non-trivial evidence
    expect(result.topHasLadder).toBe(false);
    // Bottom text only has ties → no non-trivial evidence
    expect(result.bottomHasLadder).toBe(false);
  });

  it('2 texts: ladder evidence is skipped (n <= 2)', () => {
    const texts = [makeText(1), makeText(2)];
    const btResults = [
      makeBTResult(1, 0.5, 0.2, 1, 8),
      makeBTResult(2, -0.5, 0.2, 2, 6),
    ];
    const judgements = Array.from({ length: 10 }, () => makeJudgement(1, 2, 'A'));

    const result = assessReliability(btResults, texts, judgements);
    // With n <= 2, ladder check is skipped (defaults to true)
    expect(result.topHasLadder).toBe(true);
    expect(result.bottomHasLadder).toBe(true);
  });
});
