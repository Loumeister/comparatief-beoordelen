import { describe, it, expect } from 'vitest';
import { assessReliability } from '../reliability';
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

function mkBTResult(textId: number, theta: number, se: number, rank: number, grade: number) {
  return { textId, theta, standardError: se, rank, grade };
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

describe('assessReliability', () => {
  it('returns unreliable for empty results', () => {
    const result = assessReliability([], [], []);
    expect(result.isReliable).toBe(false);
    expect(result.message).toBe('Geen resultaten beschikbaar');
  });

  it('returns reliable when all conditions are met', () => {
    // 10 texts with very low SE, spread out thetas, good ladder evidence
    const texts = Array.from({ length: 10 }, (_, i) => mkText(i + 1));
    const results = Array.from({ length: 10 }, (_, i) =>
      mkBTResult(i + 1, 2 - i * 0.4, 0.2, i + 1, 8 - i * 0.5)
    );

    // Create judgements: each text compared to neighbors multiple times
    const judgements: Judgement[] = [];
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < Math.min(i + 4, 10); j++) {
        // 4 comparisons per pair with nearby texts
        for (let k = 0; k < 4; k++) {
          judgements.push(mkJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    const assessment = assessReliability(results, texts, judgements);
    expect(assessment.coreReliable).toBe(true);
    expect(assessment.topHasLadder).toBe(true);
    expect(assessment.bottomHasLadder).toBe(true);
    expect(assessment.convergenceOk).toBe(true);
    expect(assessment.isReliable).toBe(true);
  });

  it('detects unreliable core when SEs are too high', () => {
    const texts = Array.from({ length: 10 }, (_, i) => mkText(i + 1));
    // All texts have high SE (> threshold of 0.35)
    const results = Array.from({ length: 10 }, (_, i) =>
      mkBTResult(i + 1, 2 - i * 0.4, 0.8, i + 1, 7)
    );
    const judgements: Judgement[] = [];
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < Math.min(i + 4, 10); j++) {
        for (let k = 0; k < 4; k++) {
          judgements.push(mkJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    const assessment = assessReliability(results, texts, judgements);
    expect(assessment.coreReliable).toBe(false);
    expect(assessment.isReliable).toBe(false);
    expect(assessment.message).toContain('kernset');
  });

  it('detects missing ladder evidence for top texts', () => {
    const texts = Array.from({ length: 10 }, (_, i) => mkText(i + 1));
    const results = Array.from({ length: 10 }, (_, i) =>
      mkBTResult(i + 1, 2 - i * 0.4, 0.2, i + 1, 8 - i * 0.5)
    );

    // Only judgements for middle texts (no neighbor comparisons for extremes)
    const judgements: Judgement[] = [];
    for (let i = 3; i < 7; i++) {
      for (let j = i + 1; j < Math.min(i + 4, 7); j++) {
        for (let k = 0; k < 4; k++) {
          judgements.push(mkJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    const assessment = assessReliability(results, texts, judgements);
    // Top text (id 1) has no comparisons against neighbors
    expect(assessment.topHasLadder).toBe(false);
    expect(assessment.isReliable).toBe(false);
  });

  it('detects convergence failure when rankings shift', () => {
    const texts = Array.from({ length: 5 }, (_, i) => mkText(i + 1));
    const results = Array.from({ length: 5 }, (_, i) =>
      mkBTResult(i + 1, 2 - i, 0.2, i + 1, 8 - i)
    );

    const judgements: Judgement[] = [];
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        for (let k = 0; k < 4; k++) {
          judgements.push(mkJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    // Previous results with reversed ranking
    const previousResults = [
      { textId: 1, rank: 5, grade: 4 },
      { textId: 2, rank: 4, grade: 5 },
      { textId: 3, rank: 3, grade: 6 },
      { textId: 4, rank: 2, grade: 7 },
      { textId: 5, rank: 1, grade: 8 },
    ];

    const assessment = assessReliability(results, texts, judgements, previousResults);
    expect(assessment.convergenceOk).toBe(false);
    expect(assessment.kendallTau).not.toBeNull();
    expect(assessment.kendallTau!).toBeLessThan(0);
    expect(assessment.isReliable).toBe(false);
    expect(assessment.message).toContain('stabiel');
  });

  it('convergenceOk defaults to true without previous results', () => {
    const texts = [mkText(1), mkText(2)];
    const results = [
      mkBTResult(1, 1, 0.2, 1, 8),
      mkBTResult(2, -1, 0.2, 2, 6),
    ];
    const judgements = [mkJudgement(1, 2, 'A')];

    const assessment = assessReliability(results, texts, judgements);
    expect(assessment.convergenceOk).toBe(true);
    expect(assessment.kendallTau).toBeNull();
  });

  it('skips ladder checks for n <= 2', () => {
    const texts = [mkText(1), mkText(2)];
    const results = [
      mkBTResult(1, 1, 0.2, 1, 8),
      mkBTResult(2, -1, 0.2, 2, 6),
    ];
    const judgements = [mkJudgement(1, 2, 'A')];

    const assessment = assessReliability(results, texts, judgements);
    // With n=2, ladder checks are skipped (default true)
    expect(assessment.topHasLadder).toBe(true);
    expect(assessment.bottomHasLadder).toBe(true);
  });

  it('uses custom seThreshold', () => {
    const texts = Array.from({ length: 5 }, (_, i) => mkText(i + 1));
    // SE of 0.3 — below default threshold (0.35) but above strict threshold (0.2)
    const results = Array.from({ length: 5 }, (_, i) =>
      mkBTResult(i + 1, 2 - i, 0.3, i + 1, 8 - i)
    );
    const judgements: Judgement[] = [];
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        for (let k = 0; k < 4; k++) {
          judgements.push(mkJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    // With default threshold (0.35), core is reliable
    const defaultAssessment = assessReliability(results, texts, judgements);
    expect(defaultAssessment.coreReliable).toBe(true);

    // With strict threshold (0.2), core is NOT reliable
    const strictAssessment = assessReliability(results, texts, judgements, undefined, 0.2);
    expect(strictAssessment.coreReliable).toBe(false);
  });

  it('ladder evidence requires non-trivial outcomes (not all EQUAL)', () => {
    const texts = Array.from({ length: 5 }, (_, i) => mkText(i + 1));
    const results = Array.from({ length: 5 }, (_, i) =>
      mkBTResult(i + 1, 2 - i, 0.2, i + 1, 8 - i)
    );

    // All judgements are ties — top/bottom should fail ladder check
    const judgements: Judgement[] = [];
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < Math.min(i + 4, 5); j++) {
        for (let k = 0; k < 4; k++) {
          judgements.push(mkJudgement(i + 1, j + 1, 'EQUAL'));
        }
      }
    }

    const assessment = assessReliability(results, texts, judgements);
    // Ladder requires at least 1 non-trivial (non-EQUAL) outcome
    expect(assessment.topHasLadder).toBe(false);
    expect(assessment.bottomHasLadder).toBe(false);
  });

  it('corePercentage is computed correctly', () => {
    const texts = Array.from({ length: 10 }, (_, i) => mkText(i + 1));
    // Mix of low and high SE — 6 reliable, 4 not (but core is middle 80%)
    const results = Array.from({ length: 10 }, (_, i) =>
      mkBTResult(i + 1, 2 - i * 0.4, i < 7 ? 0.2 : 0.5, i + 1, 7)
    );
    const judgements: Judgement[] = [];
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < Math.min(i + 4, 10); j++) {
        for (let k = 0; k < 4; k++) {
          judgements.push(mkJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    const assessment = assessReliability(results, texts, judgements);
    // corePercentage should be between 0 and 100
    expect(assessment.corePercentage).toBeGreaterThanOrEqual(0);
    expect(assessment.corePercentage).toBeLessThanOrEqual(100);
  });
});
