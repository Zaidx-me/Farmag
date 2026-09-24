import { describe, expect, it } from 'vitest';

import {
  buildLocalDailyRecord,
  buildSyncPayload,
  computeBirdsRemaining,
  resolveOperationType,
  toLocalDateISO,
} from './record';

describe('daily-entry record helpers', () => {
  it('computeBirdsRemaining subtracts mortality and floors at 0', () => {
    expect(computeBirdsRemaining(100, 3)).toBe(97);
    expect(computeBirdsRemaining(5, 9)).toBe(0);
  });

  it('resolveOperationType picks CREATE for a new record and UPDATE for an existing one', () => {
    expect(resolveOperationType(null)).toBe('CREATE');
    expect(resolveOperationType({ id: 'rec-1' })).toBe('UPDATE');
  });

  it('buildLocalDailyRecord maps values to the local row with pending sync status', () => {
    const row = buildLocalDailyRecord({
      id: 'local-1',
      batchId: 'batch-1',
      values: {
        recordDate: '2026-09-24',
        birdsAtStart: 100,
        mortality: 2,
        feedConsumedKg: '12.5',
        averageWeightKg: '1.8',
        humidityPercent: '65',
      },
      createdBy: 'user-1',
      createdAt: '2026-09-24T00:00:00.000Z',
    });
    expect(row).toEqual({
      id: 'local-1',
      batchId: 'batch-1',
      recordDate: '2026-09-24',
      birdsAtStart: 100,
      mortality: 2,
      birdsRemaining: 98,
      feedConsumedKg: '12.5',
      averageWeightKg: '1.8',
      humidityPercent: '65',
      createdBy: 'user-1',
      createdAt: '2026-09-24T00:00:00.000Z',
      syncStatus: 'pending',
    });
  });

  it('buildLocalDailyRecord omits optional fields that are not provided', () => {
    const row = buildLocalDailyRecord({
      id: 'local-2',
      batchId: 'batch-1',
      values: { recordDate: '2026-09-24', birdsAtStart: 100, mortality: 0 },
      createdBy: 'user-1',
    });
    expect(row.feedConsumedKg).toBeUndefined();
    expect(row.averageWeightKg).toBeUndefined();
    expect(row.humidityPercent).toBeUndefined();
    expect(row.notes).toBeUndefined();
    expect(row.createdAt).toBeTruthy();
  });

  it('buildSyncPayload includes batchId and the normalized values', () => {
    const payload = buildSyncPayload('batch-1', {
      recordDate: '2026-09-24',
      birdsAtStart: 100,
      mortality: 2,
      feedConsumedKg: '12.5',
    });
    expect(payload).toEqual({
      batchId: 'batch-1',
      recordDate: '2026-09-24',
      birdsAtStart: 100,
      mortality: 2,
      feedConsumedKg: '12.5',
    });
  });

  it('toLocalDateISO formats a local date as YYYY-MM-DD', () => {
    expect(toLocalDateISO(new Date(2026, 8, 24))).toBe('2026-09-24');
  });
});