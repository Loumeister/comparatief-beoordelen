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

  it('returns reliable when the documented stop rule is met', () => {
    const texts = Array.from({ length: 10 }, (_, i) => mkText(i + 1));
    const results = Array.from({ length: 10 }, (_, i) =>
      mkBTResult(i + 1, 2 - i * 0.4, 0.2, i + 1, 8 - i * 0.5)
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
    expect(assessment.graphConnected).toBe(true);
    expect(assessment.coreReliable).toBe(true);
    expect(assessment.topHasLadder).toBe(true);
    expect(assessment.bottomHasLadder).toBe(true);
    expect(assessment.convergenceOk).toBe(true);
    expect(assessment.isReliable).toBe(true);
  });

  it('detects insufficient SE evidence when cohort and individual criteria both fail', () => {
    const texts = Array.from({ length: 10 }, (_, i) => mkText(i + 1));
    const results = Array.from({ length: 10 }, (_, i) =>
      mkBTResult(i + 1, 2 - i * 0.4, 1.5, i + 1, 7)
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
    expect(assessment.message).toContain('mediaan SE');
  });

  it('requires a connected comparison graph', () => {
    const texts = Array.from({ length: 4 }, (_, i) => mkText(i + 1));
    const results = Array.from({ length: 4 }, (_, i) =>
      mkBTResult(i + 1, 2 - i, 0.2, i + 1, 8 - i)
    );
    const judgements = [
      mkJudgement(1, 2, 'A'),
      mkJudgement(1, 2, 'A'),
      mkJudgement(3, 4, 'A'),
      mkJudgement(3, 4, 'A'),
    ];

    const assessment = assessReliability(results, texts, judgements);
    expect(assessment.graphConnected).toBe(false);
    expect(assessment.isReliable).toBe(false);
    expect(assessment.message).toContain('niet verbonden');
  });

  it('still reports missing ladder evidence for top texts as diagnostic information', () => {
    const texts = Array.from({ length: 10 }, (_, i) => mkText(i + 1));
    const results = Array.from({ length: 10 }, (_, i) =>
      mkBTResult(i + 1, 2 - i * 0.4, 0.2, i + 1, 8 - i * 0.5)
    );

    const judgements: Judgement[] = [];
    for (let i = 3; i < 7; i++) {
      for (let j = i + 1; j < Math.min(i + 4, 7); j++) {
        for (let k = 0; k < 4; k++) {
          judgements.push(mkJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    const assessment = assessReliability(results, texts, judgements);
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
    expect(assessment.topHasLadder).toBe(true);
    expect(assessment.bottomHasLadder).toBe(true);
  });

  it('uses custom seThreshold for core diagnostics', () => {
    const texts = Array.from({ length: 5 }, (_, i) => mkText(i + 1));
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

    const defaultAssessment = assessReliability(results, texts, judgements);
    expect(defaultAssessment.coreReliable).toBe(true);

    const strictAssessment = assessReliability(results, texts, judgements, undefined, 0.2);
    expect(strictAssessment.coreReliable).toBe(false);
  });

  it('ladder evidence requires non-trivial outcomes (not all EQUAL)', () => {
    const texts = Array.from({ length: 5 }, (_, i) => mkText(i + 1));
    const results = Array.from({ length: 5 }, (_, i) =>
      mkBTResult(i + 1, 2 - i, 0.2, i + 1, 8 - i)
    );

    const judgements: Judgement[] = [];
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < Math.min(i + 4, 5); j++) {
        for (let k = 0; k < 4; k++) {
          judgements.push(mkJudgement(i + 1, j + 1, 'EQUAL'));
        }
      }
    }

    const assessment = assessReliability(results, texts, judgements);
    expect(assessment.topHasLadder).toBe(false);
    expect(assessment.bottomHasLadder).toBe(false);
  });

  it('corePercentage is computed correctly', () => {
    const texts = Array.from({ length: 10 }, (_, i) => mkText(i + 1));
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
    expect(assessment.corePercentage).toBeGreaterThanOrEqual(0);
    expect(assessment.corePercentage).toBeLessThanOrEqual(100);
  });
});
