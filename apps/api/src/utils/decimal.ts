import type { Prisma } from '@prisma/client';

export type DecimalValue = Prisma.Decimal | string | number;

export function decimalToString(value: DecimalValue | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value.toString();
}