// src/lib/constants.ts
export const MIN_BASE = 5;          // min. vergelijkingen per tekst vóór "klaar"
export const SE_RELIABLE = 0.70;    // SE ≤ 0.75 = "Resultaat betrouwbaar"
export const SE_SOME_MORE = 1.00;   // SE ≤ 1.00 = "Nog enkele vergelijkingen nodig"
export const SE_REPEAT   = 1.00;    // >1.00: extra prioriteit / herhaal oké
export const SE_MAX_CAP  = 1.40;    // uitersten mogen hoog, maar capped in stopregel
export const SE_MAX_EDGE = 1.40;    // alias voor SE_MAX_CAP
export const STOP_PCT_RELIABLE = 70; // % teksten met SE ≤ 0.75
export const COHORT_PCT_RELIABLE = 70; // alias voor STOP_PCT_RELIABLE
export const STOP_MEDIAN_OK    = 0.80; // mediaan(SE) drempel
export const COHORT_MEDIAN_OK = 0.80; // alias voor STOP_MEDIAN_OK
export const DEFAULT_BATCH_SIZE = 8;
export const DEFAULT_COMPARISONS_PER_TEXT = 10;
