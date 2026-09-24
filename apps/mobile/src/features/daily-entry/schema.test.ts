import { describe, expect, it } from 'vitest';

import { dailyEntrySchema, normalizeDailyEntry } from './schema';

describe('dailyEntrySchema', () => {
  it('accepts a valid entry and coerces numeric strings', () => {
    const result = dailyEntrySchema.safeParse({
      recordDate: '2026-09-24',
      birdsAtStart: '100',
      mortality: '2',
      feedConsumedKg: '12.5',
      averageWeightKg: '1.8',
      humidityPercent: '65',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.birdsAtStart).toBe(100);
      expect(result.data.mortality).toBe(2);
      expect(result.data.feedConsumedKg).toBe('12.5');
    }
  });

  it('rejects mortality above birdsAtStart with an inline error', () => {
    const result = dailyEntrySchema.safeParse({
      recordDate: '2026-09-24',
      birdsAtStart: '10',
      mortality: '11',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((item) => item.path[0] === 'mortality');
      expect(issue?.message).toBe('Mortality cannot exceed birds at start');
    }
  });

  it('rejects a malformed date', () => {
    const result = dailyEntrySchema.safeParse({
      recordDate: '24/09/2026',
      birdsAtStart: '100',
      mortality: '0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative mortality', () => {
    const result = dailyEntrySchema.safeParse({
      recordDate: '2026-09-24',
      birdsAtStart: '100',
      mortality: '-1',
    });
    expect(result.success).toBe(false);
  });

  it('normalizes empty decimal strings away', () => {
    const values = normalizeDailyEntry({
      recordDate: '2026-09-24',
      birdsAtStart: 100,
      mortality: 0,
      feedConsumedKg: '',
      averageWeightKg: '',
      humidityPercent: '',
    });
    expect(values).toEqual({ recordDate: '2026-09-24', birdsAtStart: 100, mortality: 0 });
  });

  it('keeps provided decimals in the normalized values', () => {
    const values = normalizeDailyEntry({
      recordDate: '2026-09-24',
      birdsAtStart: 100,
      mortality: 2,
      feedConsumedKg: '12.5',
      notes: 'ok',
    });
    expect(values).toEqual({
      recordDate: '2026-09-24',
      birdsAtStart: 100,
      mortality: 2,
      feedConsumedKg: '12.5',
      notes: 'ok',
    });
  });
});