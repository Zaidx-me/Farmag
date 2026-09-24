/**
 * Bird-count calculation — mobile mirror of the API helper
 * (apps/api/src/modules/batches/calculations.ts, spec §5.6).
 *
 * Parity contract: identical numeric outputs to the API for identical inputs.
 * Signature mirrors the API exactly: (initialBirds, cumulativeMortality, cumulativeSold).
 */

export function currentBirds(initialBirds: number, cumulativeMortality: number, cumulativeSold: number): number {
  return Math.max(0, initialBirds - cumulativeMortality - cumulativeSold);
}