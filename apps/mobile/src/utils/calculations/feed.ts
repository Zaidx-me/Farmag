/**
 * Feed stock calculation — mobile helper (spec §5.6).
 *
 * feedClosing = openingStock + purchases − consumption (never negative; enforced).
 * `transferred` is the NET feed transferred in/out for the period: positive when
 * feed was transferred IN, negative when transferred OUT. It is added to the
 * balance like a purchase (inflow) and floored at 0.
 */

export function feedClosingStock(
  initial: number,
  purchases: number,
  consumed: number,
  transferred: number
): number {
  return Math.max(0, initial + purchases - consumed + transferred);
}