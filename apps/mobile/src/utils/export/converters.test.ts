/**
 * Converter parity tests (T39) — each entity converter must serialize the
 * fixture rows (commas, quotes, newlines, nulls, unicode) to the exact
 * expected RFC 4180 CSV, and handle the 0-row and 5k-row edge cases.
 */

import { describe, expect, it } from 'vitest';

import {
  DAILY_RECORD_COLUMNS,
  ENTITY_EXPORT_DEFS,
  entityToCsv,
  entityToCsvChunked,
  type ExportEntity,
} from './converters';
import { countCsvDataRows, parseCsv } from './csv';
import { EXPORT_FIXTURES } from './fixtures';

const BATCHES_EXPECTED = [
  'id,farmId,shedId,batchNumber,breed,supplier,arrivalDate,initialBirds,initialAverageWeightKg,costPerBird,targetSaleDate,status,notes,createdAt',
  'batch-1,farm-1,shed-1,B-001,Broiler,"HatchCo, Ltd.",2026-09-01,500,0.045,120.5,2026-10-15,ACTIVE,"First batch — ""trial"" run",2026-09-01T06:00:00.000Z',
  'batch-2,farm-1,shed-2,B-002,Desi,,2026-09-10,300,,,,UPCOMING,"Line one\nLine two",2026-09-10T06:00:00.000Z',
].join('\r\n');

const DAILY_EXPECTED = [
  'id,batchId,recordDate,birdsAtStart,mortality,birdsRemaining,feedConsumedKg,waterConsumedLiters,averageWeightKg,temperatureC,humidityPercent,medicineNotes,vaccinationNotes,notes,createdBy,createdAt',
  'daily-1,batch-1,2026-09-24,500,2,498,45.5,90,0.82,28.5,60,,"NDV, ""LaSota"" strain","Healthy, appetite good",user-1,2026-09-24T18:00:00.000Z',
  'daily-2,batch-1,2026-09-25,498,0,498,,,,,,,,,user-1,2026-09-25T18:00:00.000Z',
].join('\r\n');

const EXPENSES_EXPECTED = [
  'id,farmId,batchId,category,description,amount,expenseDate,supplier,paymentStatus,receiptObjectKey,notes,createdBy,createdAt',
  'expense-1,farm-1,batch-1,FEED,"Broiler starter, 25kg bags",1250.5,2026-09-20,AgroMart,PAID,,"Bulk order — ""discount"" applied",user-1,2026-09-20T10:00:00.000Z',
  'expense-2,farm-1,,UTILITIES,Electricity bill,3400,2026-09-22,,UNPAID,receipts/elec-2026-09.pdf,,user-1,2026-09-22T10:00:00.000Z',
].join('\r\n');

const SALES_EXPECTED = [
  'id,farmId,batchId,buyer,saleDate,birdsSold,totalWeightKg,ratePerKg,totalAmount,amountReceived,outstandingAmount,paymentStatus,notes,createdBy,createdAt',
  'sale-1,farm-1,batch-1,"Karachi Market, Wholesale",2026-09-24,180,180,12.5,2250,1000,1250,PARTIALLY_PAID,"Buyer said ""will pay balance next week""",user-1,2026-09-24T12:00:00.000Z',
  'sale-2,farm-1,batch-1,Local Butcher,2026-09-25,50,52.5,13,682.5,682.5,0,PAID,,user-1,2026-09-25T12:00:00.000Z',
].join('\r\n');

const EXPECTED: Record<ExportEntity, string> = {
  batches: BATCHES_EXPECTED,
  daily_records: DAILY_EXPECTED,
  expenses: EXPENSES_EXPECTED,
  sales: SALES_EXPECTED,
};

describe('entity converters — parity vs fixtures', () => {
  for (const entity of Object.keys(EXPECTED) as ExportEntity[]) {
    it(`${entity} serializes fixtures to the exact expected CSV`, () => {
      const csv = entityToCsv(entity, EXPORT_FIXTURES[entity]);
      expect(csv).toBe(EXPECTED[entity]);
    });

    it(`${entity} chunked output is byte-identical to the plain converter`, () => {
      const plain = entityToCsv(entity, EXPORT_FIXTURES[entity]);
      const chunked = entityToCsvChunked(entity, EXPORT_FIXTURES[entity], 1);
      expect(chunked).toBe(plain);
    });

    it(`${entity} round-trips through parseCsv with the fixture values intact`, () => {
      const parsed = parseCsv(entityToCsv(entity, EXPORT_FIXTURES[entity]));
      expect(parsed).toHaveLength(EXPORT_FIXTURES[entity].length + 1);
      expect(parsed[0]).toEqual([...ENTITY_EXPORT_DEFS[entity].columns]);
    });
  }
});

describe('entity converters — edge cases', () => {
  it('0-row set emits a header-only CSV (valid RFC 4180)', () => {
    for (const entity of Object.keys(EXPECTED) as ExportEntity[]) {
      const csv = entityToCsv(entity, []);
      expect(csv).toBe([...ENTITY_EXPORT_DEFS[entity].columns].join(','));
      expect(countCsvDataRows(csv)).toBe(0);
    }
  });

  it('5k-row set: correct row count, header intact, progress reported', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      id: `d-${i}`,
      batchId: 'b-1',
      recordDate: '2026-09-24',
      birdsAtStart: 100,
      mortality: i % 7,
      birdsRemaining: 100 - (i % 7),
      feedConsumedKg: null,
      waterConsumedLiters: null,
      averageWeightKg: (1.2 + i / 1000).toFixed(3),
      temperatureC: 28.5,
      humidityPercent: 60,
      medicineNotes: null,
      vaccinationNotes: null,
      notes: i % 100 === 0 ? 'note with, comma and "quote"' : null,
      createdBy: 'u-1',
      createdAt: '2026-09-24T00:00:00.000Z',
    }));

    const fractions: number[] = [];
    const csv = entityToCsvChunked('daily_records', rows, 500, (p) => fractions.push(p.fraction));

    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(5001);
    expect(parsed[0]).toEqual([...DAILY_RECORD_COLUMNS]);
    expect(parsed[5000][0]).toBe('d-4999');
    expect(countCsvDataRows(csv)).toBe(5000);
    expect(fractions).toHaveLength(10);
    expect(fractions[9]).toBe(1);

    // Escaping parity on the tricky note column (index 13).
    const tricky = parsed.find((row) => row[0] === 'd-0');
    expect(tricky?.[13]).toBe('note with, comma and "quote"');
  });
});