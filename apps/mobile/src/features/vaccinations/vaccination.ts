/**
 * Vaccination logic — pure helpers for the vaccination screens (T35). Mirrors the
 * API's vaccination service: status is pinned server-side (UPCOMING on create,
 * COMPLETED when completedDate is set); the local row keeps the same shape so the
 * optimistic UI matches what the server will eventually return.
 */

export interface VaccinationValues {
  vaccineName: string;
  scheduledDate: string;
  dose?: string;
  supplier?: string;
  notes?: string;
}

/** Local `vaccinations` row (camelCase — repositories map to snake_case). */
export interface VaccinationRow {
  id: string;
  batchId: string;
  vaccineName: string;
  scheduledDate: string;
  dose?: string;
  supplier?: string;
  status: 'UPCOMING';
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending';
}

export function buildLocalVaccination(params: {
  id: string;
  batchId: string;
  values: VaccinationValues;
  createdBy: string;
  createdAt?: string;
}): VaccinationRow {
  const { id, batchId, values, createdBy, createdAt = new Date().toISOString() } = params;
  const row: VaccinationRow = {
    id,
    batchId,
    vaccineName: values.vaccineName,
    scheduledDate: values.scheduledDate,
    status: 'UPCOMING',
    createdBy,
    createdAt,
    updatedAt: createdAt,
    syncStatus: 'pending',
  };
  if (values.dose !== undefined) row.dose = values.dose;
  if (values.supplier !== undefined) row.supplier = values.supplier;
  if (values.notes !== undefined) row.notes = values.notes;
  return row;
}

/** Wire payload for the sync push — createVaccinationSchema fields + batchId. */
export function buildVaccinationPayload(
  batchId: string,
  values: VaccinationValues,
): Record<string, unknown> {
  return { batchId, ...values };
}

/** Wire payload for mark-complete — updateVaccinationSchema fields. */
export function buildCompletePayload(completedDate: string): Record<string, unknown> {
  return { completedDate, status: 'COMPLETED' };
}

export type VaccinationOperation = 'CREATE' | 'UPDATE';

/** CREATE when no local row exists, UPDATE otherwise (mark-complete path). */
export function resolveVaccinationOperationType(existing: { id: string } | null): VaccinationOperation {
  return existing === null ? 'CREATE' : 'UPDATE';
}