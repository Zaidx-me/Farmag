/**
 * RFC 4180 parity tests (T39) — escaping rules, CRLF line endings, chunked
 * generation equivalence, round-trip parsing, and the 5k-row big-data path.
 */

import { describe, expect, it } from 'vitest';

import {
  countCsvDataRows,
  escapeCsvCell,
  parseCsv,
  toCsv,
  toCsvChunked,
} from './csv';

describe('escapeCsvCell (RFC 4180)', () => {
  it('leaves plain values unquoted', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(12.5)).toBe('12.5');
    expect(escapeCsvCell(true)).toBe('true');
  });

  it('renders null and undefined as empty fields', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('quotes fields containing commas', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
  });

  it('quotes fields containing double quotes and doubles them', () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes fields containing newlines (LF and CRLF)', () => {
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('quotes fields containing carriage returns', () => {
    expect(escapeCsvCell('a\rb')).toBe('"a\rb"');
  });
});

describe('toCsv (RFC 4180)', () => {
  it('emits a header-only CSV for an empty row set', () => {
    const csv = toCsv([], ['id', 'name']);
    expect(csv).toBe('id,name');
    expect(countCsvDataRows(csv)).toBe(0);
  });

  it('joins header and rows with CRLF', () => {
    const csv = toCsv([{ id: '1', name: 'a' }], ['id', 'name']);
    expect(csv).toBe('id,name\r\n1,a');
  });

  it('escapes every cell including the header', () => {
    const csv = toCsv([{ 'a,b': 'x"y' }], ['a,b']);
    expect(csv).toBe('"a,b"\r\n"x""y"');
  });

  it('round-trips through parseCsv', () => {
    const rows = [
      { id: '1', note: 'has, comma and "quote" and\nnewline' },
      { id: '2', note: 'plain' },
    ];
    const csv = toCsv(rows, ['id', 'note']);
    expect(parseCsv(csv)).toEqual([
      ['id', 'note'],
      ['1', 'has, comma and "quote" and\nnewline'],
      ['2', 'plain'],
    ]);
  });
});

describe('toCsvChunked (big-set path)', () => {
  it('produces byte-identical output to toCsv', () => {
    const rows = Array.from({ length: 1234 }, (_, i) => ({
      id: `r-${i}`,
      value: i % 10 === 0 ? 'comma, and "quote"' : `v-${i}`,
    }));
    const plain = toCsv(rows, ['id', 'value']);
    const chunked = toCsvChunked(rows, ['id', 'value'], 100);
    expect(chunked).toBe(plain);
  });

  it('reports monotonic progress from 0.1 to 1 across chunks', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `r-${i}` }));
    const fractions: number[] = [];
    const csv = toCsvChunked(rows, ['id'], 100, (p) => fractions.push(p.fraction));

    expect(fractions).toHaveLength(10);
    expect(fractions[0]).toBe(0.1);
    expect(fractions[9]).toBe(1);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeGreaterThan(fractions[i - 1]);
    }
    expect(countCsvDataRows(csv)).toBe(1000);
  });

  it('reports a single 1.0 progress for a set smaller than one chunk', () => {
    const fractions: number[] = [];
    toCsvChunked([{ id: '1' }], ['id'], 500, (p) => fractions.push(p.fraction));
    expect(fractions).toEqual([1]);
  });

  it('emits a header-only CSV for an empty set with no progress callbacks', () => {
    const fractions: number[] = [];
    const csv = toCsvChunked([], ['id'], 500, (p) => fractions.push(p.fraction));
    expect(csv).toBe('id');
    expect(fractions).toEqual([]);
  });
});

describe('5k-row big-data export', () => {
  it('serializes 5000 rows into valid RFC 4180 with correct counts', () => {
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
    const csv = toCsvChunked(rows, ['id', 'batchId', 'recordDate', 'birdsAtStart', 'mortality', 'birdsRemaining', 'feedConsumedKg', 'waterConsumedLiters', 'averageWeightKg', 'temperatureC', 'humidityPercent', 'medicineNotes', 'vaccinationNotes', 'notes', 'createdBy', 'createdAt'], 500, (p) => fractions.push(p.fraction));

    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(5001); // header + 5000 rows
    expect(parsed[0][0]).toBe('id');
    expect(parsed[5000][0]).toBe('d-4999');
    expect(countCsvDataRows(csv)).toBe(5000);

    // Progress: 10 chunks, monotonic 0.1 → 1.
    expect(fractions).toHaveLength(10);
    expect(fractions[0]).toBe(0.1);
    expect(fractions[9]).toBe(1);

    // Escaping parity: the comma/quote note round-trips on row d-0.
    const tricky = parsed.find((row) => row[0] === 'd-0');
    expect(tricky?.[13]).toBe('note with, comma and "quote"');
  });
});