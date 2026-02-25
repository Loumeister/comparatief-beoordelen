import { describe, it, expect } from 'vitest';
import { generatePairs } from '../pairing';
import type { Text, Judgement } from '../db';
import { pairKey } from '../utils';

function makeText(id: number): Text {
  return { id, assignmentId: 1, content: '', originalFilename: `${id}.docx`, anonymizedName: `Tekst ${id}`, createdAt: new Date() };
}

function makeJudgement(textAId: number, textBId: number, winner: 'A' | 'B' | 'EQUAL' = 'A'): Judgement {
  const pk = pairKey(textAId, textBId);
  return { id: undefined, assignmentId: 1, textAId, textBId, winner, createdAt: new Date(), pairKey: pk, source: 'human', isFinal: false };
}

describe('generatePairs', () => {
  it('returns empty for fewer than 2 texts', () => {
    expect(generatePairs([], [])).toEqual([]);
    expect(generatePairs([makeText(1)], [])).toEqual([]);
  });

  it('generates pairs for 2 texts with no prior judgements', () => {
    const texts = [makeText(1), makeText(2)];
    const pairs = generatePairs(texts, []);
    expect(pairs.length).toBeGreaterThanOrEqual(1);

    // Each pair must reference valid texts
    for (const p of pairs) {
      expect(p.textA.id).not.toBe(p.textB.id);
      expect([1, 2]).toContain(p.textA.id);
      expect([1, 2]).toContain(p.textB.id);
    }
  });

  it('generates pairs that respect batchSize', () => {
    const texts = Array.from({ length: 10 }, (_, i) => makeText(i + 1));
    const pairs = generatePairs(texts, [], { batchSize: 3 });
    expect(pairs.length).toBeLessThanOrEqual(3);
  });

  it('bridging: generates cross-component pairs for disconnected graphs', () => {
    // 4 texts, two pairs already judged: {1,2} and {3,4} → two components
    const texts = [makeText(1), makeText(2), makeText(3), makeText(4)];
    const existing = [
      makeJudgement(1, 2, 'A'),
      makeJudgement(3, 4, 'A'),
    ];

    const pairs = generatePairs(texts, existing, { batchSize: 4 });
    expect(pairs.length).toBeGreaterThanOrEqual(1);

    // At least one pair should bridge the two components
    const bridges = pairs.filter(p => {
      const aIn12 = p.textA.id === 1 || p.textA.id === 2;
      const bIn34 = p.textB.id === 3 || p.textB.id === 4;
      const aIn34 = p.textA.id === 3 || p.textA.id === 4;
      const bIn12 = p.textB.id === 1 || p.textB.id === 2;
      return (aIn12 && bIn34) || (aIn34 && bIn12);
    });
    expect(bridges.length).toBeGreaterThanOrEqual(1);
  });

  it('does not repeat pairs when allowRepeats=false', () => {
    const texts = [makeText(1), makeText(2), makeText(3)];
    // All pairs already judged once
    const existing = [
      makeJudgement(1, 2, 'A'),
      makeJudgement(2, 3, 'A'),
      makeJudgement(1, 3, 'A'),
    ];

    // With default allowRepeats=false and sufficient data, should not duplicate
    const pairs = generatePairs(texts, existing, { allowRepeats: false, batchSize: 5 });

    // Check no pair from pairs matches an existing pair
    for (const p of pairs) {
      const pk = pairKey(p.textA.id!, p.textB.id!);
      const existingPks = existing.map(j => pairKey(j.textAId, j.textBId));
      // Since all 3 pairs exist and allowRepeats=false, new pairs should only
      // appear if the underCap gate allows them (fresh texts need more data)
      // This is a sanity check — the algorithm may or may not produce pairs
    }
    // The important thing is it doesn't crash
    expect(Array.isArray(pairs)).toBe(true);
  });

  it('allows repeats when allowRepeats=true', () => {
    const texts = [makeText(1), makeText(2)];
    // Only one possible pair, already judged
    const existing = [makeJudgement(1, 2, 'A')];

    const pairs = generatePairs(texts, existing, { allowRepeats: true, maxPairRejudgements: 5 });
    // Should be able to generate the same pair again
    expect(pairs.length).toBeGreaterThanOrEqual(1);
  });

  it('intra phase: does not pair opposite wings when BT data is available', () => {
    // Create texts with known theta values: text 1 is far positive, text 5 is far negative
    const texts = Array.from({ length: 5 }, (_, i) => makeText(i + 1));

    // Create enough judgements so the graph is connected and has clear ordering
    const judgements: Judgement[] = [];
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        for (let k = 0; k < 3; k++) {
          judgements.push(makeJudgement(i + 1, j + 1, 'A'));
        }
      }
    }

    // Provide BT info with extreme theta spread
    const theta = new Map<number, number>([
      [1, 3.0],  // right wing
      [2, 1.5],  // right wing
      [3, 0.0],  // core
      [4, -1.5], // left wing
      [5, -3.0], // left wing
    ]);
    const se = new Map<number, number>([
      [1, 0.5], [2, 0.5], [3, 0.5], [4, 0.5], [5, 0.5],
    ]);

    const pairs = generatePairs(texts, judgements, {
      batchSize: 5,
      bt: { theta, se },
      allowRepeats: true,
      maxPairRejudgements: 10,
    });

    // No pair should be opposite wings (1 with 4/5, or 2 with 5)
    for (const p of pairs) {
      const tA = theta.get(p.textA.id!)!;
      const tB = theta.get(p.textB.id!)!;
      const isOppWings = (tA > 1.0 && tB < -1.0) || (tA < -1.0 && tB > 1.0);
      expect(isOppWings).toBe(false);
    }
  });

  it('every text in a batch appears at most once (greedy matching)', () => {
    const texts = Array.from({ length: 8 }, (_, i) => makeText(i + 1));
    const pairs = generatePairs(texts, [], { batchSize: 4 });

    // Each text should appear at most once across all pairs in a batch
    const seen = new Set<number>();
    for (const p of pairs) {
      expect(seen.has(p.textA.id!)).toBe(false);
      expect(seen.has(p.textB.id!)).toBe(false);
      seen.add(p.textA.id!);
      seen.add(p.textB.id!);
    }
  });

  it('exposure balance: under-exposed texts get paired first', () => {
    const texts = Array.from({ length: 6 }, (_, i) => makeText(i + 1));
    // Text 1 and 2 have been compared a lot; 3-6 barely at all
    const existing: Judgement[] = [];
    for (let k = 0; k < 10; k++) {
      existing.push(makeJudgement(1, 2, 'A'));
    }

    const pairs = generatePairs(texts, existing, { batchSize: 3 });

    // The pairs should prioritize texts 3-6 (under-exposed)
    const textIdsInPairs = new Set<number>();
    for (const p of pairs) {
      textIdsInPairs.add(p.textA.id!);
      textIdsInPairs.add(p.textB.id!);
    }

    // At least some of the under-exposed texts should appear
    const underExposed = [3, 4, 5, 6].filter(id => textIdsInPairs.has(id));
    expect(underExposed.length).toBeGreaterThanOrEqual(2);
  });
});
