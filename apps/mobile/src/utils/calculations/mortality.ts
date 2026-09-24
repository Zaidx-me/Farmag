/**
 * Mortality-percentage calculation — mobile mirror of the API helper
 * (apps/api/src/modules/batches/calculations.ts, spec §5.6).
 *
 * Parity contract: identical numeric outputs to the API for identical inputs.
 * Signature mirrors the API exactly: (cumulativeMortality, initialBirds).
 */

export function mortalityPercent(cumulativeMortality: number, initialBirds: number): number {
  if (initialBirds <= 0) return 0;
  return (cumulativeMortality / initialBirds) * 100;
}