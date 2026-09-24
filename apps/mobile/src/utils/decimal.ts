/**
 * Decimal-string arithmetic — stock/quantity math on the mobile side mirrors the
 * API's Prisma.Decimal discipline (spec §12: money/measurement as decimal strings,
 * never float). Values are aligned to a common scale and summed as BigInt, so
 * `0.1 + 0.2` is `0.3`, not `0.30000000000000004`. Results strip trailing zeros
 * (matching Prisma.Decimal.toString()).
 */

function alignDecimals(a: string, b: string): [string, string, number] {
  const aParts = a.split('.');
  const bParts = b.split('.');
  const aInt = aParts[0] ?? '0';
  const bInt = bParts[0] ?? '0';
  const aFrac = aParts[1] ?? '';
  const bFrac = bParts[1] ?? '';
  const scale = Math.max(aFrac.length, bFrac.length);
  const aScaled = aInt + aFrac.padEnd(scale, '0');
  const bScaled = bInt + bFrac.padEnd(scale, '0');
  return [aScaled, bScaled, scale];
}

function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const s = abs.toString();
  if (scale === 0) return negative ? `-${s}` : s;
  const padded = s.padStart(scale + 1, '0');
  const intPart = padded.slice(0, padded.length - scale);
  const fracPart = padded.slice(padded.length - scale).replace(/0+$/, '');
  const body = fracPart === '' ? intPart : `${intPart}.${fracPart}`;
  return negative ? `-${body}` : body;
}

/** `a + b` as a decimal string (never negative inputs). */
export function addDecimalStrings(a: string, b: string): string {
  const [aScaled, bScaled, scale] = alignDecimals(a, b);
  return formatScaled(BigInt(aScaled) + BigInt(bScaled), scale);
}

/** `a - b` as a decimal string, floored at 0 (stock can never go negative). */
export function subtractDecimalStrings(a: string, b: string): string {
  const [aScaled, bScaled, scale] = alignDecimals(a, b);
  const diff = BigInt(aScaled) - BigInt(bScaled);
  return formatScaled(diff < 0n ? 0n : diff, scale);
}

/** `a - b` as a decimal string (signed — money semantics, no floor). */
export function subtractDecimalStringsSigned(a: string, b: string): string {
  const [aScaled, bScaled, scale] = alignDecimals(a, b);
  return formatScaled(BigInt(aScaled) - BigInt(bScaled), scale);
}

/**
 * `a × b` as a decimal string, rounded to 2dp (half-up). Matches the API's
 * Decimal(12,2) money column: totalAmount = totalWeightKg × ratePerKg is stored
 * rounded to 2dp, so the client preview rounds identically.
 */
export function multiplyDecimalStrings(a: string, b: string): string {
  const aParts = a.split('.');
  const bParts = b.split('.');
  const aInt = aParts[0] ?? '0';
  const bInt = bParts[0] ?? '0';
  const aFrac = aParts[1] ?? '';
  const bFrac = bParts[1] ?? '';
  const aScale = aFrac.length;
  const bScale = bFrac.length;
  const product = BigInt(aInt + aFrac) * BigInt(bInt + bFrac);
  const scale = aScale + bScale;
  const roundScale = 2;
  if (scale <= roundScale) {
    return formatScaled(product * 10n ** BigInt(roundScale - scale), roundScale);
  }
  const divisor = 10n ** BigInt(scale - roundScale);
  const rounded = (product + divisor / 2n) / divisor;
  return formatScaled(rounded, roundScale);
}

/** -1 when a < b, 0 when equal, 1 when a > b. */
export function compareDecimalStrings(a: string, b: string): number {
  const [aScaled, bScaled] = alignDecimals(a, b);
  const diff = BigInt(aScaled) - BigInt(bScaled);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}