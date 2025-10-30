// src/lib/constants.ts
export const MIN_BASE = 5;          // min. vergelijkingen per tekst vóór "klaar"
export const SE_RELIABLE = 0.75;    // SE ≤ 0.75 = "Resultaat betrouwbaar"
export const SE_REPEAT   = 1.00;    // >1.00: extra prioriteit / herhaal oké
export const SE_MAX_CAP  = 1.40;    // uitersten mogen hoog, maar capped in stopregel
export const STOP_PCT_RELIABLE = 70; // % teksten met SE ≤ 0.75
export const STOP_MEDIAN_OK    = 0.80; // mediaan(SE) drempel
export const DEFAULT_BATCH_SIZE = 8;
export const DEFAULT_COMPARISONS_PER_TEXT = 10;
