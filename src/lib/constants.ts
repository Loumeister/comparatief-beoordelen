// src/lib/constants.ts

// Minimum aantal vergelijkingen per tekst voordat SE-criteria worden gebruikt
export const MIN_BASE = 3;

// SE drempelwaarden
export const SE_RELIABLE = 0.75;  // Onder deze waarde is resultaat betrouwbaar
export const SE_REPEAT = 0.80;    // Boven deze waarde herhalingen toestaan

// Standaard instellingen
export const DEFAULT_COMPARISONS_PER_TEXT = 10;
export const DEFAULT_BATCH_SIZE = 5;
