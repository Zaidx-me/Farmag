/**
 * Task 36 manual-QA evidence: offline-first enqueue for the finance screens.
 * Simulates the exact action wiring (expense add / sale add / sale payment
 * update) against the in-memory sqlite shim and asserts each lands as a pending
 * `sync_operations` row (the durable outbox the sync engine drains when the
 * device is back online).
 */

import { describe, expect, it } from 'vitest';

import type { SqliteConnection } from '../database/db';
import { migrate } from '../database/migrations';
import { repositories } from '../database/repositories';
import { syncQueue } from '../database/sync-queue';
import { createInMemorySqlite } from '../database/test-shim';
import {
  buildExpensePayload,
  buildLocalExpense,
  type ExpenseValues,
} from '../features/expenses/expense';
import {
  buildLocalSale,
  buildPaymentPayload,
  buildSalePayload,
  computeSaleTotals,
  type SaleValues,
} from '../features/sales/sale';
import { syncEngine } from './sync-engine';

async function migratedDb(): Promise<SqliteConnection> {
  const db = createInMemorySqlite();
  await migrate(db);
  return db;
}

describe('Task 36 offline enqueue (manual QA)', () => {
  it('expense add enqueues a pending expense CREATE', async () => {
    const db = await migratedDb();
    const values: ExpenseValues = {
      category: 'FEED',
      description: 'Broiler starter feed',
      amount: '1250.50',
      expenseDate: '2026-09-24',
      paymentStatus: 'PAID',
    };
    const id = 'exp-1';
    const row = buildLocalExpense({ id, farmId: 'farm-1', values, createdBy: 'user-1' });
    await repositories.upsertRecord(db, 'expenses', row);
    await syncEngine.enqueueLocal(db, {
      entity: 'expense',
      entityId: id,
      payload: buildExpensePayload('farm-1', values),
      operationType: 'CREATE',
    });

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      entity: 'expense',
      entityId: id,
      operationType: 'CREATE',
      status: 'pending',
      retryCount: 0,
      lastError: null,
    });
    expect(JSON.parse(pending[0].payload)).toMatchObject({
      farmId: 'farm-1',
      category: 'FEED',
      description: 'Broiler starter feed',
      amount: '1250.50',
      expenseDate: '2026-09-24',
      paymentStatus: 'PAID',
    });

    const local = await repositories.getRecord(db, 'expenses', id);
    expect(local?.amount).toBe('1250.50');
  });

  it('sale add enqueues a pending sale CREATE with server-computed totals', async () => {
    const db = await migratedDb();
    const values: SaleValues = {
      batchId: 'batch-1',
      buyer: 'Karachi Market',
      saleDate: '2026-09-24',
      birdsSold: '180',
      totalWeightKg: '180',
      ratePerKg: '12.50',
      amountReceived: '1000',
    };
    const id = 'sale-1';
    const row = buildLocalSale({ id, farmId: 'farm-1', values, createdBy: 'user-1' });
    await repositories.upsertRecord(db, 'sales', row);
    await syncEngine.enqueueLocal(db, {
      entity: 'sale',
      entityId: id,
      payload: buildSalePayload('farm-1', values),
      operationType: 'CREATE',
    });

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      entity: 'sale',
      entityId: id,
      operationType: 'CREATE',
      status: 'pending',
    });
    expect(JSON.parse(pending[0].payload)).toMatchObject({
      farmId: 'farm-1',
      batchId: 'batch-1',
      buyer: 'Karachi Market',
      birdsSold: 180,
      totalWeightKg: '180',
      ratePerKg: '12.50',
      amountReceived: '1000',
    });

    const local = await repositories.getRecord(db, 'sales', id);
    expect(local?.totalAmount).toBe('2250');
    expect(local?.outstandingAmount).toBe('1250');
    expect(local?.paymentStatus).toBe('PARTIALLY_PAID');
  });

  it('sale payment update recomputes totals and enqueues a pending sale UPDATE', async () => {
    const db = await migratedDb();
    const values: SaleValues = {
      batchId: 'batch-1',
      buyer: 'Karachi Market',
      saleDate: '2026-09-24',
      birdsSold: '180',
      totalWeightKg: '180',
      ratePerKg: '12.50',
      amountReceived: '1000',
    };
    const id = 'sale-1';
    const row = buildLocalSale({ id, farmId: 'farm-1', values, createdBy: 'user-1' });
    await repositories.upsertRecord(db, 'sales', row);

    const { totalAmount, outstandingAmount, paymentStatus } = computeSaleTotals(
      row.totalWeightKg,
      row.ratePerKg,
      '2250',
    );
    await repositories.upsertRecord(db, 'sales', {
      ...row,
      amountReceived: '2250',
      outstandingAmount,
      paymentStatus,
      updatedAt: new Date().toISOString(),
    });
    await syncEngine.enqueueLocal(db, {
      entity: 'sale',
      entityId: id,
      payload: buildPaymentPayload('2250'),
      operationType: 'UPDATE',
    });

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      entity: 'sale',
      entityId: id,
      operationType: 'UPDATE',
      status: 'pending',
    });
    expect(JSON.parse(pending[0].payload)).toEqual({ amountReceived: '2250' });

    const local = await repositories.getRecord(db, 'sales', id);
    expect(local?.totalAmount).toBe(totalAmount);
    expect(local?.outstandingAmount).toBe('0');
    expect(local?.paymentStatus).toBe('PAID');
  });
});