import { describe, expect, it } from 'vitest';

import {
  buildCompletePayload,
  buildLocalVaccination,
  buildVaccinationPayload,
  resolveVaccinationOperationType,
} from './vaccination';

describe('vaccination helpers', () => {
  it('buildLocalVaccination maps values to the local row with UPCOMING + pending sync status', () => {
    const row = buildLocalVaccination({
      id: 'local-1',
      batchId: 'batch-1',
      values: {
        vaccineName: 'Newcastle',
        scheduledDate: '2026-10-01',
        dose: '0.5 ml',
        supplier: 'VetCo',
        notes: 'first dose',
      },
      createdBy: 'user-1',
      createdAt: '2026-09-24T00:00:00.000Z',
    });
    expect(row).toEqual({
      id: 'local-1',
      batchId: 'batch-1',
      vaccineName: 'Newcastle',
      scheduledDate: '2026-10-01',
      dose: '0.5 ml',
      supplier: 'VetCo',
      status: 'UPCOMING',
      notes: 'first dose',
      createdBy: 'user-1',
      createdAt: '2026-09-24T00:00:00.000Z',
      updatedAt: '2026-09-24T00:00:00.000Z',
      syncStatus: 'pending',
    });
  });

  it('buildLocalVaccination omits optional fields that are not provided', () => {
    const row = buildLocalVaccination({
      id: 'local-2',
      batchId: 'batch-1',
      values: { vaccineName: 'Gumboro', scheduledDate: '2026-10-05' },
      createdBy: 'user-1',
    });
    expect(row.dose).toBeUndefined();
    expect(row.supplier).toBeUndefined();
    expect(row.notes).toBeUndefined();
    expect(row.createdAt).toBeTruthy();
  });

  it('buildVaccinationPayload includes batchId and the values', () => {
    const payload = buildVaccinationPayload('batch-1', {
      vaccineName: 'Newcastle',
      scheduledDate: '2026-10-01',
      dose: '0.5 ml',
    });
    expect(payload).toEqual({
      batchId: 'batch-1',
      vaccineName: 'Newcastle',
      scheduledDate: '2026-10-01',
      dose: '0.5 ml',
    });
  });

  it('buildCompletePayload pins status COMPLETED with the completed date', () => {
    expect(buildCompletePayload('2026-09-24')).toEqual({
      completedDate: '2026-09-24',
      status: 'COMPLETED',
    });
  });

  it('resolveVaccinationOperationType picks CREATE for a new row and UPDATE for an existing one', () => {
    expect(resolveVaccinationOperationType(null)).toBe('CREATE');
    expect(resolveVaccinationOperationType({ id: 'vac-1' })).toBe('UPDATE');
  });
});