import { describe, expect, it } from 'vitest';

import { latestSevenDayWeights } from './weight-curve';

describe('latestSevenDayWeights', () => {
  it('returns points ascending by date', () => {
    const records = [
      { recordDate: '2026-09-20', averageWeightKg: '1.0' },
      { recordDate: '2026-09-21', averageWeightKg: '1.1' },
      { recordDate: '2026-09-22', averageWeightKg: '1.2' },
      { recordDate: '2026-09-23', averageWeightKg: '1.3' },
      { recordDate: '2026-09-24', averageWeightKg: '1.4' },
    ];
    expect(latestSevenDayWeights(records)).toEqual([
      { date: '2026-09-20', weightKg: 1 },
      { date: '2026-09-21', weightKg: 1.1 },
      { date: '2026-09-22', weightKg: 1.2 },
      { date: '2026-09-23', weightKg: 1.3 },
      { date: '2026-09-24', weightKg: 1.4 },
    ]);
  });

  it('caps at the latest 7 records', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      recordDate: `2026-09-${String(i + 1).padStart(2, '0')}`,
      averageWeightKg: String(1 + i / 10),
    }));
    const points = latestSevenDayWeights(records);
    expect(points).toHaveLength(7);
    expect(points[0].date).toBe('2026-09-04');
    expect(points[6].date).toBe('2026-09-10');
  });

  it('maps missing weights to null and ignores non-finite values', () => {
    const records = [
      { recordDate: '2026-09-23', averageWeightKg: null },
      { recordDate: '2026-09-24', averageWeightKg: '1.4' },
      { recordDate: '2026-09-22', averageWeightKg: 'not-a-number' },
    ];
    expect(latestSevenDayWeights(records)).toEqual([
      { date: '2026-09-22', weightKg: null },
      { date: '2026-09-23', weightKg: null },
      { date: '2026-09-24', weightKg: 1.4 },
    ]);
  });

  it('returns an empty array for no records', () => {
    expect(latestSevenDayWeights([])).toEqual([]);
  });
});