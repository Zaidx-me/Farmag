/**
 * Task 39 edge-case QA — E2E-03 (deep offline + conflict + reconciliation),
 * E2E-04 (offline full loop), and the 5k-record big-data scenario. Simulates
 * the real sync engine against the in-memory sqlite shim with a mocked
 * apiClient (same conventions as sync-engine.test.ts / the T35/T36 offline
 * suites) and asserts the durable-queue invariants plus the server record.
 */

import { describe, expect, it, vi } from 'vitest';

import type { SqliteConnection } from '../database/db';
import { migrate } from '../database/migrations';
import { repositories } from '../database/repositories';
import { syncQueue } from '../database/sync-queue';
import { createInMemorySqlite } from '../database/test-shim';
import { entityToCsvChunked } from '../utils/export/converters';
import { countCsvDataRows, parseCsv } from '../utils/export/csv';
import { syncEngine, type SyncAuthStore } from './sync-engine';

function makeAuthStore(overrides: Partial<SyncAuthStore> = {}): SyncAuthStore {
  return { accessToken: 'access-token', refreshToken: 'refresh-token', ...overrides };
}

function makeApi() {
  return { post: vi.fn(), get: vi.fn() };
}

async function migratedDb(): Promise<SqliteConnection> {
  const db = createInMemorySqlite();
  await migrate(db);
  return db;
}

describe('E2E-03 — deep offline, conflict, reconciliation', () => {
  it('changes across 4 entities queue offline; a CONFLICT marks failed; retry reconciles and drains', async () => {
    const db = await migratedDb();
    const api = makeApi();

    // Deep offline: the device is offline and the user works across every
    // exportable entity — batch, daily record, expense, sale.
    await syncEngine.enqueueLocal(db, {
      entity: 'batch',
      entityId: 'b-1',
      payload: { batchNumber: 'B-001', breed: 'Broiler', arrivalDate: '2026-09-01', initialBirds: 500 },
    });
    await syncEngine.enqueueLocal(db, {
      entity: 'dailyRecord',
      entityId: 'd-1',
      payload: { batchId: 'b-1', recordDate: '2026-09-24', birdsAtStart: 500, mortality: 2, birdsRemaining: 498 },
    });
    await syncEngine.enqueueLocal(db, {
      entity: 'expense',
      entityId: 'e-1',
      payload: { farmId: 'f-1', category: 'FEED', description: 'Starter feed', amount: '1250.50', expenseDate: '2026-09-20' },
    });
    await syncEngine.enqueueLocal(db, {
      entity: 'sale',
      entityId: 's-1',
      payload: { farmId: 'f-1', batchId: 'b-1', buyer: 'Market', saleDate: '2026-09-24', birdsSold: 180, totalWeightKg: '180', ratePerKg: '12.50' },
    });

    // Queue invariants while offline: all 4 pending, clean, deterministic order.
    const offline = await syncQueue.listPending(db);
    expect(offline).toHaveLength(4);
    expect(new Set(offline.map((op) => op.entity))).toEqual(
      new Set(['batch', 'dailyRecord', 'expense', 'sale']),
    );
    expect(offline.every((op) => op.status === 'pending' && op.retryCount === 0 && op.lastError === null)).toBe(true);
    // listPending is deterministic: a second read returns the same order.
    const reread = await syncQueue.listPending(db);
    expect(reread.map((op) => op.operationId)).toEqual(offline.map((op) => op.operationId));

    // Back online: the server accepts 3 and rejects the sale with a CONFLICT.
    // (Results are keyed by operationId, so order is irrelevant to the engine.)
    const saleOp = offline.find((op) => op.entity === 'sale');
    const otherOps = offline.filter((op) => op.entity !== 'sale');
    expect(saleOp).toBeDefined();
    api.post.mockResolvedValueOnce([
      ...otherOps.map((op) => ({
        operationId: op.operationId,
        status: 'SYNCED',
        entityId: `server-${op.entity}`,
      })),
      {
        operationId: saleOp!.operationId,
        status: 'FAILED',
        error: { code: 'CONFLICT', message: 'sale already exists' },
      },
    ]);
    api.get.mockResolvedValue({ changes: [], nextCursor: null });

    const first = await syncEngine.runOnce(api, db, makeAuthStore());
    expect(first).toEqual({ pushed: 3, pulled: 0, failed: 1 });

    // Conflict invariant: the failed op stays pending with retryCount + lastError.
    const afterConflict = await syncQueue.listPending(db);
    expect(afterConflict).toHaveLength(1);
    expect(afterConflict[0].entity).toBe('sale');
    expect(afterConflict[0].retryCount).toBe(1);
    expect(afterConflict[0].lastError).toBe('sale already exists');

    // Reconciliation: the user resolves the conflict and re-pushes; the server
    // accepts this time.
    api.post.mockResolvedValueOnce([
      { operationId: afterConflict[0].operationId, status: 'SYNCED', entityId: 'server-s-1' },
    ]);
    const second = await syncEngine.runOnce(api, db, makeAuthStore());
    expect(second).toEqual({ pushed: 1, pulled: 0, failed: 0 });

    // Queue drained; the server mapping is recorded for the reconciled op.
    expect(await syncQueue.listPending(db)).toHaveLength(0);
    const mapping = await db.getFirstAsync<{ value: string }>('SELECT * FROM meta WHERE key = ?', [
      `server:${afterConflict[0].operationId}`,
    ]);
    expect(mapping?.value).toBe('server-s-1');
  });
});

describe('E2E-04 — offline full loop', () => {
  it('enqueue offline → sync online → pull server changes → local state matches', async () => {
    const db = await migratedDb();
    const api = makeApi();

    // Offline: a daily record is created locally and queued.
    await syncEngine.enqueueLocal(db, {
      entity: 'dailyRecord',
      entityId: 'd-local-1',
      payload: { batchId: 'b-1', recordDate: '2026-09-24', birdsAtStart: 100, mortality: 2, birdsRemaining: 98 },
    });
    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);

    // Online: the push succeeds and the pull returns server-side changes
    // (a batch and a sale) plus a next cursor.
    api.post.mockResolvedValueOnce([
      { operationId: pending[0].operationId, status: 'SYNCED', entityId: 'server-d-1' },
    ]);
    api.get.mockResolvedValue({
      changes: [
        {
          entity: 'batch',
          entityId: 'b-1',
          updatedAt: '2026-09-24T00:00:00.000Z',
          data: {
            id: 'b-1',
            farmId: 'f-1',
            shedId: 's-1',
            batchNumber: 'B-001',
            breed: 'Broiler',
            arrivalDate: '2026-09-01',
            initialBirds: 100,
            status: 'ACTIVE',
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        },
        {
          entity: 'sale',
          entityId: 's-1',
          updatedAt: '2026-09-24T12:00:00.000Z',
          data: {
            id: 's-1',
            farmId: 'f-1',
            batchId: 'b-1',
            buyer: 'Market',
            saleDate: '2026-09-24',
            birdsSold: 50,
            totalWeightKg: 50,
            ratePerKg: 12,
            totalAmount: 600,
            amountReceived: 600,
            outstandingAmount: 0,
            paymentStatus: 'PAID',
            createdBy: 'u-1',
            createdAt: '2026-09-24T12:00:00.000Z',
          },
        },
      ],
      nextCursor: '2026-09-25T00:00:00.000Z',
    });

    const summary = await syncEngine.runOnce(api, db, makeAuthStore());
    expect(summary).toEqual({ pushed: 1, pulled: 2, failed: 0 });

    // Queue drained.
    expect(await syncQueue.listPending(db)).toHaveLength(0);

    // Local state matches the server: pulled rows upserted, cursor advanced.
    const batch = await repositories.getRecord(db, 'batches', 'b-1');
    expect(batch?.batchNumber).toBe('B-001');
    const sale = await repositories.getRecord(db, 'sales', 's-1');
    expect(sale?.totalAmount).toBe(600);
    const cursor = await db.getFirstAsync<{ value: string }>('SELECT * FROM meta WHERE key = ?', [
      '_syncCursor',
    ]);
    expect(cursor?.value).toBe('2026-09-25T00:00:00.000Z');
  });
});

describe('E2E big-data — 5k records', () => {
  it('5k pending ops push in 100-op chunks; all synced; queue drained; server received all 5000', async () => {
    const db = await migratedDb();
    const api = makeApi();
    const received: string[] = [];

    // Enqueue 5000 daily-record ops while offline.
    for (let i = 0; i < 5000; i++) {
      await syncEngine.enqueueLocal(db, {
        entity: 'dailyRecord',
        entityId: `d-${i}`,
        payload: { batchId: 'b-1', recordDate: '2026-09-24', birdsAtStart: 100, mortality: 0, birdsRemaining: 100 },
      });
    }

    // Queue invariant: 5000 pending, all unique entityIds present.
    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(5000);
    expect(new Set(pending.map((op) => op.entityId)).size).toBe(5000);

    // Server accepts everything; record every received operationId.
    api.post.mockImplementation(async (_path: string, body: unknown) => {
      const operations = (body as { operations: { operationId: string }[] }).operations;
      for (const op of operations) received.push(op.operationId);
      return operations.map((op) => ({
        operationId: op.operationId,
        status: 'SYNCED',
        entityId: `server-${op.operationId}`,
      }));
    });
    api.get.mockResolvedValue({ changes: [], nextCursor: null });

    const summary = await syncEngine.runOnce(api, db, makeAuthStore());

    // 5000 pushed in 50 chunks of 100 (PUSH_CHUNK_SIZE); server saw all 5000.
    expect(summary).toEqual({ pushed: 5000, pulled: 0, failed: 0 });
    expect(api.post).toHaveBeenCalledTimes(50);
    expect(received).toHaveLength(5000);
    expect(new Set(received).size).toBe(5000);

    // Queue drained — nothing left to push.
    expect(await syncQueue.listPending(db)).toHaveLength(0);
  }, 30_000);

  it('5k-row CSV export: valid RFC 4180, correct row count, chunked progress', async () => {
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
    expect(parsed[0][0]).toBe('id');
    expect(parsed[5000][0]).toBe('d-4999');
    expect(countCsvDataRows(csv)).toBe(5000);

    // Progress: 10 chunks, monotonic 0.1 → 1.
    expect(fractions).toHaveLength(10);
    expect(fractions[0]).toBe(0.1);
    expect(fractions[9]).toBe(1);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeGreaterThan(fractions[i - 1]);
    }

    // Escaping parity: the comma/quote note round-trips on row d-0.
    const tricky = parsed.find((row) => row[0] === 'd-0');
    expect(tricky?.[13]).toBe('note with, comma and "quote"');
  });
});