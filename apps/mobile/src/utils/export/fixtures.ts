/**
 * Export fixture rows (T39) — realistic camelCase rows for the four
 * exportable entities, deliberately including the RFC 4180 trouble cases:
 * embedded commas, double quotes, newlines, unicode, nulls, and numeric
 * values. The parity tests serialize these and assert the exact expected CSV.
 */

export const BATCH_FIXTURES: Record<string, unknown>[] = [
  {
    id: 'batch-1',
    farmId: 'farm-1',
    shedId: 'shed-1',
    batchNumber: 'B-001',
    breed: 'Broiler',
    supplier: 'HatchCo, Ltd.',
    arrivalDate: '2026-09-01',
    initialBirds: 500,
    initialAverageWeightKg: 0.045,
    costPerBird: 120.5,
    targetSaleDate: '2026-10-15',
    status: 'ACTIVE',
    notes: 'First batch — "trial" run',
    createdAt: '2026-09-01T06:00:00.000Z',
  },
  {
    id: 'batch-2',
    farmId: 'farm-1',
    shedId: 'shed-2',
    batchNumber: 'B-002',
    breed: 'Desi',
    supplier: null,
    arrivalDate: '2026-09-10',
    initialBirds: 300,
    initialAverageWeightKg: null,
    costPerBird: null,
    targetSaleDate: null,
    status: 'UPCOMING',
    notes: 'Line one\nLine two',
    createdAt: '2026-09-10T06:00:00.000Z',
  },
];

export const DAILY_RECORD_FIXTURES: Record<string, unknown>[] = [
  {
    id: 'daily-1',
    batchId: 'batch-1',
    recordDate: '2026-09-24',
    birdsAtStart: 500,
    mortality: 2,
    birdsRemaining: 498,
    feedConsumedKg: 45.5,
    waterConsumedLiters: 90,
    averageWeightKg: 0.82,
    temperatureC: 28.5,
    humidityPercent: 60,
    medicineNotes: null,
    vaccinationNotes: 'NDV, "LaSota" strain',
    notes: 'Healthy, appetite good',
    createdBy: 'user-1',
    createdAt: '2026-09-24T18:00:00.000Z',
  },
  {
    id: 'daily-2',
    batchId: 'batch-1',
    recordDate: '2026-09-25',
    birdsAtStart: 498,
    mortality: 0,
    birdsRemaining: 498,
    feedConsumedKg: null,
    waterConsumedLiters: null,
    averageWeightKg: null,
    temperatureC: null,
    humidityPercent: null,
    medicineNotes: null,
    vaccinationNotes: null,
    notes: null,
    createdBy: 'user-1',
    createdAt: '2026-09-25T18:00:00.000Z',
  },
];

export const EXPENSE_FIXTURES: Record<string, unknown>[] = [
  {
    id: 'expense-1',
    farmId: 'farm-1',
    batchId: 'batch-1',
    category: 'FEED',
    description: 'Broiler starter, 25kg bags',
    amount: 1250.5,
    expenseDate: '2026-09-20',
    supplier: 'AgroMart',
    paymentStatus: 'PAID',
    receiptObjectKey: null,
    notes: 'Bulk order — "discount" applied',
    createdBy: 'user-1',
    createdAt: '2026-09-20T10:00:00.000Z',
  },
  {
    id: 'expense-2',
    farmId: 'farm-1',
    batchId: null,
    category: 'UTILITIES',
    description: 'Electricity bill',
    amount: 3400,
    expenseDate: '2026-09-22',
    supplier: null,
    paymentStatus: 'UNPAID',
    receiptObjectKey: 'receipts/elec-2026-09.pdf',
    notes: null,
    createdBy: 'user-1',
    createdAt: '2026-09-22T10:00:00.000Z',
  },
];

export const SALE_FIXTURES: Record<string, unknown>[] = [
  {
    id: 'sale-1',
    farmId: 'farm-1',
    batchId: 'batch-1',
    buyer: 'Karachi Market, Wholesale',
    saleDate: '2026-09-24',
    birdsSold: 180,
    totalWeightKg: 180,
    ratePerKg: 12.5,
    totalAmount: 2250,
    amountReceived: 1000,
    outstandingAmount: 1250,
    paymentStatus: 'PARTIALLY_PAID',
    notes: 'Buyer said "will pay balance next week"',
    createdBy: 'user-1',
    createdAt: '2026-09-24T12:00:00.000Z',
  },
  {
    id: 'sale-2',
    farmId: 'farm-1',
    batchId: 'batch-1',
    buyer: 'Local Butcher',
    saleDate: '2026-09-25',
    birdsSold: 50,
    totalWeightKg: 52.5,
    ratePerKg: 13,
    totalAmount: 682.5,
    amountReceived: 682.5,
    outstandingAmount: 0,
    paymentStatus: 'PAID',
    notes: null,
    createdBy: 'user-1',
    createdAt: '2026-09-25T12:00:00.000Z',
  },
];

/** All fixtures keyed by export entity — drives the parity tests. */
export const EXPORT_FIXTURES: Record<
  'batches' | 'daily_records' | 'expenses' | 'sales',
  Record<string, unknown>[]
> = {
  batches: BATCH_FIXTURES,
  daily_records: DAILY_RECORD_FIXTURES,
  expenses: EXPENSE_FIXTURES,
  sales: SALE_FIXTURES,
};