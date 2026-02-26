import { describe, it, expect } from 'vitest';
import { calculateAnchoredGrades } from '../anchor-grading';

// Testdata: 5 teksten met bekende theta-waarden
const results = [
  { textId: 1, theta: 2.0 },
  { textId: 2, theta: 1.0 },
  { textId: 3, theta: 0.0 },
  { textId: 4, theta: -1.0 },
  { textId: 5, theta: -2.0 },
];

const defaultGrading = { scale: 1.2, sigma: 1.414, min: 1, max: 10 };

describe('calculateAnchoredGrades', () => {
  it('retourneert null als er geen anchors zijn', () => {
    const result = calculateAnchoredGrades(results, [], defaultGrading);
    expect(result).toBeNull();
  });

  it('retourneert null als anchors undefined is', () => {
    const result = calculateAnchoredGrades(results, undefined as any, defaultGrading);
    expect(result).toBeNull();
  });

  it('retourneert null als anchor textId niet bestaat', () => {
    const result = calculateAnchoredGrades(results, [{ textId: 999, grade: 7 }], defaultGrading);
    expect(result).toBeNull();
  });

  describe('1 anchor', () => {
    it('verschuift alle cijfers zodat het ankerpunt het opgegeven cijfer krijgt', () => {
      // Zet tekst 3 (theta=0) als anker op 6.0
      const anchored = calculateAnchoredGrades(results, [{ textId: 3, grade: 6.0 }], defaultGrading);
      expect(anchored).not.toBeNull();
      const map = new Map(anchored!.map(r => [r.textId, r.anchoredGrade]));

      // Tekst 3 moet precies 6.0 krijgen
      expect(map.get(3)).toBeCloseTo(6.0, 1);
    });

    it('behoudt de relatieve spreiding (scale/sigma)', () => {
      // Tekst 3 (theta=0) → 6.0
      const anchored = calculateAnchoredGrades(results, [{ textId: 3, grade: 6.0 }], defaultGrading);
      const map = new Map(anchored!.map(r => [r.textId, r.anchoredGrade]));

      // Tekst 1 (theta=2.0) moet hoger liggen dan tekst 3
      // b = scale/sigma = 1.2/1.414 ≈ 0.849
      // grade(1) = 6.0 + 0.849 * (2.0 - 0.0) ≈ 7.7
      expect(map.get(1)!).toBeGreaterThan(map.get(3)!);
      expect(map.get(5)!).toBeLessThan(map.get(3)!);

      // Verschil tussen tekst 1 en 2 moet gelijk zijn aan verschil tussen 2 en 3
      const diff12 = map.get(1)! - map.get(2)!;
      const diff23 = map.get(2)! - map.get(3)!;
      expect(diff12).toBeCloseTo(diff23, 0);
    });

    it('respecteert min/max grenzen', () => {
      // Zet tekst 1 (theta=2.0, hoogste) als anker op 9.5 → tekst 1 zou 10+ worden
      const anchored = calculateAnchoredGrades(results, [{ textId: 5, grade: 2.0 }], defaultGrading);
      const map = new Map(anchored!.map(r => [r.textId, r.anchoredGrade]));

      // Geen enkel cijfer mag buiten min/max vallen
      for (const r of anchored!) {
        expect(r.anchoredGrade).toBeGreaterThanOrEqual(defaultGrading.min);
        expect(r.anchoredGrade).toBeLessThanOrEqual(defaultGrading.max);
      }
    });
  });

  describe('2 anchors', () => {
    it('fit gaat precies door beide ankerpunten', () => {
      // Tekst 1 (theta=2.0) → 8.0, Tekst 5 (theta=-2.0) → 4.0
      const anchored = calculateAnchoredGrades(
        results,
        [{ textId: 1, grade: 8.0 }, { textId: 5, grade: 4.0 }],
        defaultGrading,
      );
      const map = new Map(anchored!.map(r => [r.textId, r.anchoredGrade]));

      expect(map.get(1)).toBeCloseTo(8.0, 1);
      expect(map.get(5)).toBeCloseTo(4.0, 1);
    });

    it('tussenliggende teksten volgen lineaire interpolatie', () => {
      // Tekst 1 → 8.0, Tekst 5 → 4.0
      // b = (8-4)/(2-(-2)) = 1.0
      // a = 6.0 - 1.0*0 = 6.0
      // Tekst 3 (theta=0) → 6.0
      const anchored = calculateAnchoredGrades(
        results,
        [{ textId: 1, grade: 8.0 }, { textId: 5, grade: 4.0 }],
        defaultGrading,
      );
      const map = new Map(anchored!.map(r => [r.textId, r.anchoredGrade]));

      expect(map.get(3)).toBeCloseTo(6.0, 1);
      expect(map.get(2)).toBeCloseTo(7.0, 1);
      expect(map.get(4)).toBeCloseTo(5.0, 1);
    });
  });

  describe('3 anchors (least-squares)', () => {
    it('fit benadert alle ankerpunten zo goed mogelijk', () => {
      // 3 ankerpunten: tekst 1 → 9, tekst 3 → 6, tekst 5 → 3
      // Perfecte lineaire relatie: b = 1.5, a = 6
      const anchored = calculateAnchoredGrades(
        results,
        [
          { textId: 1, grade: 9.0 },
          { textId: 3, grade: 6.0 },
          { textId: 5, grade: 3.0 },
        ],
        defaultGrading,
      );
      const map = new Map(anchored!.map(r => [r.textId, r.anchoredGrade]));

      // Bij een perfect lineair patroon gaat de fit exact door alle punten
      expect(map.get(1)).toBeCloseTo(9.0, 1);
      expect(map.get(3)).toBeCloseTo(6.0, 1);
      expect(map.get(5)).toBeCloseTo(3.0, 1);
    });

    it('behandelt niet-lineaire ankerpunten gracefully', () => {
      // Ankerpunten die niet perfect lineair zijn
      const anchored = calculateAnchoredGrades(
        results,
        [
          { textId: 1, grade: 8.0 },
          { textId: 3, grade: 7.0 },  // hoger dan lineair verwacht
          { textId: 5, grade: 4.0 },
        ],
        defaultGrading,
      );

      // Alle resultaten moeten bestaan en binnen grenzen vallen
      expect(anchored).not.toBeNull();
      for (const r of anchored!) {
        expect(r.anchoredGrade).toBeGreaterThanOrEqual(defaultGrading.min);
        expect(r.anchoredGrade).toBeLessThanOrEqual(defaultGrading.max);
      }
    });
  });

  it('retourneert resultaten voor alle teksten, niet alleen ankers', () => {
    const anchored = calculateAnchoredGrades(
      results,
      [{ textId: 3, grade: 7.0 }],
      defaultGrading,
    );
    expect(anchored).toHaveLength(results.length);
    const ids = new Set(anchored!.map(r => r.textId));
    for (const r of results) {
      expect(ids.has(r.textId)).toBe(true);
    }
  });
});
