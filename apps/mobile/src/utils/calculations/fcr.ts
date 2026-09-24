/**
 * Feed-conversion-ratio calculation — mobile mirror of the API helper
 * (apps/api/src/modules/batches/calculations.ts, spec §5.6).
 *
 * Parity contract: identical numeric outputs to the API for identical inputs.
 * Signature mirrors the API exactly:
 *   fcr(feedConsumedKg, currentBirdsCount, currentAvgWeightKg, initialBirds, initialAverageWeightKg)
 *
 * FCR = Σ feedConsumedKg ÷ ((currentBirds × currentAvgWeightKg)
 *       − (initialBirds × initialAverageWeightKg)).
 * Returns `{ value: null, incomplete: true }` when a required weight is missing
 * or the weight gain is non-positive. Happy-path value is rounded to 4dp.
 */

export interface FcrResult {
  value: number | null;
  incomplete: boolean;
}

export function fcr(
  feedConsumedKg: number,
  currentBirdsCount: number,
  currentAvgWeightKg: number | null,
  initialBirds: number,
  initialAverageWeightKg: number | null
): FcrResult {
  if (currentAvgWeightKg === null || initialAverageWeightKg === null) {
    return { value: null, incomplete: true };
  }
  const gain = currentBirdsCount * currentAvgWeightKg - initialBirds * initialAverageWeightKg;
  if (gain <= 0) return { value: null, incomplete: true };
  return { value: Math.round((feedConsumedKg / gain) * 10_000) / 10_000, incomplete: false };
}