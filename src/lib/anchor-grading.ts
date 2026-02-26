// src/lib/anchor-grading.ts
// PLAN-6: Anchor-based grading — kalibreer cijfers op basis van ijkpunten
//
// Normaal: grade = base + scale * z (normreferentie — gemiddelde = basiscijfer)
// Met ijkpunten: grade = a + b * theta, gefit door de anchors
//   1 anchor: verschuif het centrum, houd dezelfde spreiding
//   2+ anchors: kleinste-kwadraten fit

import type { Anchor } from "@/lib/db";

export interface AnchoredGradeResult {
  textId: number;
  anchoredGrade: number;
}

/**
 * Bereken geijkte cijfers op basis van theta-waarden en ijkpunten.
 *
 * @param results  Array met textId en theta (uit BT-fit)
 * @param anchors  Ijkpunten: [{textId, grade}]
 * @param grading  Huidige cijferinstellingen (scale, sigma, min, max)
 * @returns        Geijkte cijfers per tekst, of null als er geen anchors zijn
 */
export function calculateAnchoredGrades(
  results: { textId: number; theta: number }[],
  anchors: Anchor[],
  grading: { scale: number; sigma: number; min: number; max: number },
): AnchoredGradeResult[] | null {
  if (!anchors || anchors.length === 0) return null;

  const thetaMap = new Map(results.map((r) => [r.textId, r.theta]));

  // Verzamel geldige anchors (textId moet bestaan in de resultaten)
  const validAnchors = anchors.filter((a) => thetaMap.has(a.textId));
  if (validAnchors.length === 0) return null;

  let a: number; // intercept
  let b: number; // slope

  if (validAnchors.length === 1) {
    // 1 anchor: verschuif het centrum, houd dezelfde spreiding
    // grade = anchor_grade + (scale/sigma) * (theta - anchor_theta)
    const anchor = validAnchors[0];
    const anchorTheta = thetaMap.get(anchor.textId)!;
    b = grading.sigma > 1e-12 ? grading.scale / grading.sigma : 0;
    a = anchor.grade - b * anchorTheta;
  } else {
    // 2+ anchors: kleinste-kwadraten fit grade = a + b * theta
    const n = validAnchors.length;
    let sumTheta = 0;
    let sumGrade = 0;
    for (const anc of validAnchors) {
      sumTheta += thetaMap.get(anc.textId)!;
      sumGrade += anc.grade;
    }
    const meanTheta = sumTheta / n;
    const meanGrade = sumGrade / n;

    let num = 0;
    let den = 0;
    for (const anc of validAnchors) {
      const t = thetaMap.get(anc.textId)!;
      num += (t - meanTheta) * (anc.grade - meanGrade);
      den += (t - meanTheta) ** 2;
    }

    b = den > 1e-12 ? num / den : 0;
    a = meanGrade - b * meanTheta;
  }

  // Bereken geijkt cijfer voor elke tekst
  return results.map((r) => {
    const raw = a + b * r.theta;
    const clamped = Math.max(grading.min, Math.min(grading.max, Math.round(raw * 10) / 10));
    return { textId: r.textId, anchoredGrade: clamped };
  });
}
