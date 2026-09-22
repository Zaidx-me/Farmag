import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { currentBirds, fcr, mortalityPercent, summary } from '../src/modules/batches/calculations.js';

describe('batch calculations', () => {
  it('currentBirds subtracts mortality and sold birds', () => {
    expect(currentBirds(10000, 100, 0)).toBe(9900);
  });

  it('currentBirds floors at 0', () => {
    expect(currentBirds(0, 20000, 100)).toBe(0);
  });

  it('mortalityPercent computes percentage', () => {
    expect(mortalityPercent(100, 10000)).toBe(1);
  });

  it('mortalityPercent guards against division by zero', () => {
    expect(mortalityPercent(50, 0)).toBe(0);
  });

  it('fcr returns incomplete when a weight is missing', () => {
    expect(fcr(10000, 9500, null, 10000, 0.05)).toEqual({ value: null, incomplete: true });
    expect(fcr(10000, 9500, 1.8, 10000, null)).toEqual({ value: null, incomplete: true });
  });

  it('fcr computes the happy-path ratio rounded to 4dp', () => {
    // gain = (9500 × 1.8) − (10000 × 0.05) = 16600 → 10000 / 16600 ≈ 0.6024
    expect(fcr(10000, 9500, 1.8, 10000, 0.05)).toEqual({ value: 0.6024, incomplete: false });
  });

  it('fcr guards against non-positive gain', () => {
    expect(fcr(10000, 100, 0.05, 10000, 0.05)).toEqual({ value: null, incomplete: true });
  });

  it('summary aggregates mortality, feed and latest weight', () => {
    const batch = { initialBirds: 10000, initialAverageWeightKg: new Prisma.Decimal('0.05') };
    const dailyRecords = [
      { recordDate: new Date('2026-09-01'), mortality: 10, feedConsumedKg: new Prisma.Decimal('100.000'), averageWeightKg: null },
      { recordDate: new Date('2026-09-02'), mortality: 20, feedConsumedKg: new Prisma.Decimal('200.000'), averageWeightKg: new Prisma.Decimal('1.500') },
      { recordDate: new Date('2026-09-03'), mortality: 30, feedConsumedKg: new Prisma.Decimal('300.000'), averageWeightKg: new Prisma.Decimal('1.800') },
    ];
    const sales = [{ birdsSold: 100 }, { birdsSold: 50 }];

    const result = summary(batch, dailyRecords, sales);

    expect(result.currentBirds).toBe(10000 - 60 - 150);
    expect(result.mortalityPct).toBe(0.6);
    expect(new Prisma.Decimal(result.totalFeedConsumed).equals(new Prisma.Decimal(600))).toBe(true);
    expect(new Prisma.Decimal(result.currentAvgWeightKg ?? '0').equals(new Prisma.Decimal('1.800'))).toBe(true);
    expect(result.fcr.incomplete).toBe(false);
    expect(result.fcr.value).toBeGreaterThan(0);
  });
});