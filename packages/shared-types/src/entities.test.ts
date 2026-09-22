import { describe, expect, it } from 'vitest';
import type { Batch, DailyRecord } from './entities.js';

describe('entities', () => {
  it('expose camelCase wire fields', () => {
    const daily: DailyRecord = {
      id: 'uuid', batchId: 'uuid', recordDate: '2026-01-01', birdsAtStart: 10000,
      mortality: 100, birdsRemaining: 9900, createdBy: 'uuid', createdAt: '', updatedAt: ''
    };
    expect(daily.birdsRemaining).toBe(9900);
    const b: Batch = { id: 'u', farmId: 'u', shedId: 'u', batchNumber: 'B-001', breed: 'Broiler',
      arrivalDate: '2026-01-01', initialBirds: 10000, status: 'ACTIVE', createdAt: '', updatedAt: '' };
    expect(b.status).toBe('ACTIVE');
  });
});
