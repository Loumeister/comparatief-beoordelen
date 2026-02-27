import { describe, it, expect } from 'vitest';
import { pairKey, kendallTau } from '../utils';

describe('pairKey', () => {
  it('returns "small-big" regardless of argument order', () => {
    expect(pairKey(1, 2)).toBe('1-2');
    expect(pairKey(2, 1)).toBe('1-2');
  });

  it('handles equal IDs', () => {
    expect(pairKey(5, 5)).toBe('5-5');
  });

  it('handles large IDs', () => {
    expect(pairKey(999, 1)).toBe('1-999');
  });
});

describe('kendallTau', () => {
  it('returns 0 for mismatched lengths', () => {
    expect(kendallTau([1, 2], [1])).toBe(0);
  });

  it('returns 0 for arrays shorter than 2', () => {
    expect(kendallTau([1], [1])).toBe(0);
    expect(kendallTau([], [])).toBe(0);
  });

  it('returns 1 for perfectly concordant rankings', () => {
    expect(kendallTau([1, 2, 3, 4], [1, 2, 3, 4])).toBe(1);
  });

  it('returns -1 for perfectly reversed rankings', () => {
    expect(kendallTau([1, 2, 3, 4], [4, 3, 2, 1])).toBe(-1);
  });

  it('returns 0 for fully tied rankings (all equal)', () => {
    // All zeros → no concordant or discordant → returns 0
    expect(kendallTau([5, 5, 5], [5, 5, 5])).toBe(0);
  });

  it('handles partial agreement', () => {
    // [1,2,3] vs [1,3,2]: one swap out of 3 pairs
    const tau = kendallTau([1, 2, 3], [1, 3, 2]);
    // Pairs: (1,2)→(1,3) concordant, (1,3)→(1,2) concordant, (2,3)→(3,2) discordant
    // tau = (2-1)/3 = 1/3
    expect(tau).toBeCloseTo(1 / 3, 5);
  });

  it('is symmetric in its inputs', () => {
    const a = [1, 3, 2, 4];
    const b = [2, 1, 4, 3];
    expect(kendallTau(a, b)).toBeCloseTo(kendallTau(b, a), 10);
  });
});
