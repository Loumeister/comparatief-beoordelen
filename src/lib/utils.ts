import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Canonical key for a text pair: "smallId-bigId" */
export function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

/**
 * Kendall's tau-b: rangcorrelatie tussen twee ranglijsten
 * Retourneert waarde tussen -1 en 1 (1 = perfecte overeenkomst)
 */
export function kendallTau(ranks1: number[], ranks2: number[]): number {
  const n = ranks1.length;
  if (n !== ranks2.length || n < 2) return 0;
  
  let concordant = 0;
  let discordant = 0;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sign1 = Math.sign(ranks1[i] - ranks1[j]);
      const sign2 = Math.sign(ranks2[i] - ranks2[j]);
      
      if (sign1 === sign2 && sign1 !== 0) concordant++;
      else if (sign1 !== 0 && sign2 !== 0) discordant++;
    }
  }
  
  const total = concordant + discordant;
  return total === 0 ? 0 : (concordant - discordant) / total;
}
