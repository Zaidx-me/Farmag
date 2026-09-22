import { describe, expect, it } from 'vitest';
import { createDailyRecordSchema } from './daily-record.js';
import { createVaccinationSchema } from './vaccination.js';

describe('daily-record schemas', () => {
  it('accepts a valid create payload', () => {
    const result = createDailyRecordSchema.safeParse({
      recordDate: '2026-09-22',
      birdsAtStart: 1000,
      mortality: 5,
      feedConsumedKg: '120.50',
      waterConsumedLiters: '250.75',
      averageWeightKg: '1.85',
      temperatureC: '24.5',
      humidityPercent: '65.2',
      medicineNotes: 'Vitamin supplements added',
      vaccinationNotes: 'ND vaccine on schedule',
      notes: 'Normal day'
    });
    expect(result.success).toBe(true);
  });

  it('rejects mortality: -1', () => {
    const result = createDailyRecordSchema.safeParse({
      recordDate: '2026-09-22',
      birdsAtStart: 1000,
      mortality: -1
    });
    expect(result.success).toBe(false);
  });

  it('allows mortality: 1000 structurally (business rule is server-side)', () => {
    const result = createDailyRecordSchema.safeParse({
      recordDate: '2026-09-22',
      birdsAtStart: 1000,
      mortality: 1000
    });
    expect(result.success).toBe(true);
  });

  it('keeps humidityPercent 101 as a plain decimal (range check is server-side)', () => {
    const result = createDailyRecordSchema.safeParse({
      recordDate: '2026-09-22',
      birdsAtStart: 1000,
      mortality: 0,
      humidityPercent: '101'
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-numeric feedConsumedKg', () => {
    const result = createDailyRecordSchema.safeParse({
      recordDate: '2026-09-22',
      birdsAtStart: 1000,
      mortality: 0,
      feedConsumedKg: 'abc'
    });
    expect(result.success).toBe(false);
  });

  it('coerces birdsAtStart from a numeric string', () => {
    const result = createDailyRecordSchema.safeParse({
      recordDate: '2026-09-22',
      birdsAtStart: '1000',
      mortality: 0
    });
    expect(result.success).toBe(true);
  });
});

describe('vaccination schemas', () => {
  it('rejects create payload missing scheduledDate', () => {
    const result = createVaccinationSchema.safeParse({
      vaccineName: 'ND Vaccine'
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid create payload', () => {
    const result = createVaccinationSchema.safeParse({
      vaccineName: 'ND Vaccine',
      scheduledDate: '2026-09-25',
      dose: '0.5',
      supplier: 'Local Vet',
      notes: 'First round'
    });
    expect(result.success).toBe(true);
  });
});
