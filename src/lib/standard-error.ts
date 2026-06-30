export function compareStandardErrors(a: number, b: number): number {
  const normalizedA = Number.isNaN(a) ? Infinity : a;
  const normalizedB = Number.isNaN(b) ? Infinity : b;

  if (normalizedA === normalizedB) return 0;
  return normalizedA < normalizedB ? -1 : 1;
}
