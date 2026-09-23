/**
 * Production wiring for the sync engine — binds the pure `runOnce`/`enqueueLocal`
 * logic to the real apiClient, the app SQLite database, and the auth store.
 */

import type { SqliteConnection } from '../database/db';
import { openDb } from '../database/db';
import { syncQueue } from '../database/sync-queue';
import { useAuthStore } from '../store/auth-store';
import { apiClient } from './api-client';
import { syncEngine, type EnqueueLocalInput, type SyncSummary } from './sync-engine';

let dbPromise: Promise<SqliteConnection> | null = null;

export function getDb(): Promise<SqliteConnection> {
  dbPromise ??= openDb();
  return dbPromise;
}

export async function syncNow(): Promise<SyncSummary> {
  const db = await getDb();
  return syncEngine.runOnce(apiClient, db, useAuthStore.getState());
}

export async function enqueueLocal(input: EnqueueLocalInput): Promise<void> {
  const db = await getDb();
  await syncEngine.enqueueLocal(db, input);
}

export async function syncCounts(): Promise<{ pending: number; failed: number }> {
  const db = await getDb();
  const pending = await syncQueue.listPending(db);
  return {
    pending: pending.length,
    failed: pending.filter((op) => op.lastError !== null).length,
  };
}