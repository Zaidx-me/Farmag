/**
 * Task 35 manual-QA evidence: offline-first enqueue for the feed / health /
 * vaccination screens. Simulates the exact action wiring (recordMove / add /
 * markComplete) against the in-memory sqlite shim — a feed CONSUMPTION that
 * crosses the low-stock threshold, a medicine USAGE, and vaccination
 * CREATE + UPDATE — and asserts each lands as a pending `sync_operations` row
 * (the durable outbox the sync engine drains when the device is back online).
 */

import { describe, expect, it } from 'vitest';

import type { SqliteConnection } from '../database/db';
import { migrate } from '../database/migrations';
import { repositories } from '../database/repositories';
import { syncQueue } from '../database/sync-queue';
import { createInMemorySqlite } from '../database/test-shim';
import {
  applyStockMove,
  buildFeedTransactionPayload,
  buildFeedTransactionRow,
  isLowStock,
  type FeedConsumeValues,
} from '../features/feed/stock';
import {
  applyMedicineStockMove,
  buildMedicineTransactionPayload,
  buildMedicineTransactionRow,
  type MedicineUseValues,
} from '../features/health/stock';
import {
  buildCompletePayload,
  buildLocalVaccination,
  buildVaccinationPayload,
  type VaccinationValues,
} from '../features/vaccinations/vaccination';
import { syncEngine } from './sync-engine';

async function migratedDb(): Promise<SqliteConnection> {
  const db = createInMemorySqlite();
  await migrate(db);
  return db;
}

describe('Task 35 offline enqueue (manual QA)', () => {
  it('feed CONSUMPTION crossing the low-stock threshold enqueues a pending feedTransaction', async () => {
    const db = await migratedDb();
    const feedItem = {
      id: 'feed-1',
      farmId: 'farm-1',
      name: 'Broiler Starter',
      type: 'STARTER',
      unit: 'kg',
      currentStock: '50',
      lowStockThreshold: '20',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };

    // The consume that crosses the threshold: 50 - 40 = 10 <= 20.
    const values: FeedConsumeValues = { quantity: '40', batchId: 'batch-1' };
    const newStock = applyStockMove(feedItem.currentStock, values.quantity, 'CONSUMPTION');
    expect(newStock).toBe('10');
    expect(isLowStock(newStock, feedItem.lowStockThreshold)).toBe(true); // LOW_FEED parity

    // Optimistic local write (what the feed action does before enqueueing).
    const id = 'txn-feed-1';
    const row = buildFeedTransactionRow({
      id,
      feedItemId: feedItem.id,
      type: 'CONSUMPTION',
      values,
      createdBy: 'user-1',
    });
    await repositories.upsertRecord(db, 'feed_transactions', row);
    await repositories.upsertRecord(db, 'feed_items', {
      ...feedItem,
      currentStock: newStock,
      updatedAt: new Date().toISOString(),
    });

    // Offline enqueue (the durable outbox row).
    await syncEngine.enqueueLocal(db, {
      entity: 'feedTransaction',
      entityId: id,
      payload: buildFeedTransactionPayload(feedItem.id, 'CONSUMPTION', values),
      operationType: 'CREATE',
    });

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      entity: 'feedTransaction',
      entityId: id,
      operationType: 'CREATE',
      status: 'pending',
      retryCount: 0,
      lastError: null,
    });
    expect(JSON.parse(pending[0].payload)).toMatchObject({
      feedItemId: 'feed-1',
      type: 'CONSUMPTION',
      quantity: '40',
      batchId: 'batch-1',
    });

    // Optimistic local state is visible immediately (offline-first UX).
    const localFeed = await repositories.getRecord(db, 'feed_items', feedItem.id);
    expect(localFeed?.currentStock).toBe('10');
  });

  it('medicine USAGE enqueues a pending medicineTransaction', async () => {
    const db = await migratedDb();
    const medicine = {
      id: 'med-1',
      farmId: 'farm-1',
      name: 'Amoxicillin',
      unit: 'bottle',
      currentStock: '5',
      lowStockThreshold: '2',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };

    const values: MedicineUseValues = { quantity: '1', batchId: 'batch-1' };
    const newStock = applyMedicineStockMove(medicine.currentStock, values.quantity, 'USAGE');
    expect(newStock).toBe('4');

    const id = 'txn-med-1';
    const row = buildMedicineTransactionRow({
      id,
      medicineId: medicine.id,
      type: 'USAGE',
      values,
      createdBy: 'user-1',
    });
    await repositories.upsertRecord(db, 'medicine_transactions', row);
    await repositories.upsertRecord(db, 'medicines', {
      ...medicine,
      currentStock: newStock,
      updatedAt: new Date().toISOString(),
    });
    await syncEngine.enqueueLocal(db, {
      entity: 'medicineTransaction',
      entityId: id,
      payload: buildMedicineTransactionPayload(medicine.id, 'USAGE', values),
      operationType: 'CREATE',
    });

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      entity: 'medicineTransaction',
      entityId: id,
      operationType: 'CREATE',
      status: 'pending',
    });
    expect(JSON.parse(pending[0].payload)).toMatchObject({
      medicineId: 'med-1',
      type: 'USAGE',
      quantity: '1',
      batchId: 'batch-1',
    });
  });

  it('vaccination add (CREATE) and mark-complete (UPDATE) enqueue pending ops', async () => {
    const db = await migratedDb();
    const values: VaccinationValues = { vaccineName: 'Newcastle', scheduledDate: '2026-10-01' };
    const id = 'vac-1';

    // Add (CREATE path).
    const row = buildLocalVaccination({ id, batchId: 'batch-1', values, createdBy: 'user-1' });
    await repositories.upsertRecord(db, 'vaccinations', row);
    await syncEngine.enqueueLocal(db, {
      entity: 'vaccination',
      entityId: id,
      payload: buildVaccinationPayload('batch-1', values),
      operationType: 'CREATE',
    });

    // Mark complete (UPDATE path).
    await repositories.upsertRecord(db, 'vaccinations', {
      ...row,
      completedDate: '2026-09-24',
      status: 'COMPLETED',
      updatedAt: new Date().toISOString(),
    });
    await syncEngine.enqueueLocal(db, {
      entity: 'vaccination',
      entityId: id,
      payload: buildCompletePayload('2026-09-24'),
      operationType: 'UPDATE',
    });

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(2);
    expect(pending.map((op) => op.operationType).sort()).toEqual(['CREATE', 'UPDATE']);
    expect(pending.every((op) => op.entity === 'vaccination' && op.status === 'pending')).toBe(true);
    expect(JSON.parse(pending[0].payload)).toMatchObject({
      batchId: 'batch-1',
      vaccineName: 'Newcastle',
      scheduledDate: '2026-10-01',
    });
  });
});