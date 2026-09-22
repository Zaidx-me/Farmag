import { describe, expect, it } from 'vitest';
import { createBatchSchema } from './batch.js';

describe('batch schemas', () => {
  it('accepts a valid create payload', () => {
    const result = createBatchSchema.safeParse({
      shedId: 'f9a3b4f0-8c2d-4e6a-b9f1-2d7c8a3e5b42',
      batchNumber: 'BATCH-001',
      breed: 'Cobb 500',
      supplier: 'Local Hatchery',
      arrivalDate: '2026-09-22',
      initialBirds: 1000,
      initialAverageWeightKg: '0.042',
      costPerBird: '12.50',
      targetSaleDate: '2026-12-15',
      notes: 'First batch'
    });
    expect(result.success).toBe(true);
  });

  it('rejects initialBirds: 0', () => {
    const result = createBatchSchema.safeParse({
      shedId: 'f9a3b4f0-8c2d-4e6a-b9f1-2d7c8a3e5b42',
      batchNumber: 'BATCH-002',
      breed: 'Ross 308',
      arrivalDate: '2026-09-23',
      initialBirds: 0
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid date', () => {
    const result = createBatchSchema.safeParse({
      shedId: 'f9a3b4f0-8c2d-4e6a-b9f1-2d7c8a3e5b42',
      batchNumber: 'BATCH-003',
      breed: 'Cobb 500',
      arrivalDate: '22-09-2026',
      initialBirds: 500
    });
    expect(result.success).toBe(false);
  });

  it('rejects initialAverageWeightKg: "abc"', () => {
    const result = createBatchSchema.safeParse({
      shedId: 'f9a3b4f0-8c2d-4e6a-b9f1-2d7c8a3e5b42',
      batchNumber: 'BATCH-004',
      breed: 'Cobb 500',
      arrivalDate: '2026-09-24',
      initialBirds: 500,
      initialAverageWeightKg: 'abc'
    });
    expect(result.success).toBe(false);
  });

  it('rejects costPerBird with 3dp', () => {
    const result = createBatchSchema.safeParse({
      shedId: 'f9a3b4f0-8c2d-4e6a-b9f1-2d7c8a3e5b42',
      batchNumber: 'BATCH-005',
      breed: 'Cobb 500',
      arrivalDate: '2026-09-25',
      initialBirds: 500,
      costPerBird: '12.345'
    });
    expect(result.success).toBe(false);
  });
});
