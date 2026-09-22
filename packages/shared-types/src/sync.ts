import type { SyncOperationStatus, SyncOperationType } from './enums.js';

export interface SyncOperationInput {
  operationId: string; // client UUID, idempotency key
  entity: string; // 'dailyRecord' | 'expense' | 'sale' | ...
  operationType: SyncOperationType;
  entityId?: string; // client-local UUID for CREATE
  payload: Record<string, unknown>;
  createdAt: string; // ISO
}

export interface SyncPushRequest {
  operations: SyncOperationInput[];
}

export interface SyncPushResult {
  operationId: string;
  status: SyncOperationStatus;
  entityId?: string;
  error?: { code: string; message: string };
}

export interface SyncChange<T = Record<string, unknown>> {
  entity: string;
  entityId: string;
  updatedAt: string;
  data: T;
}

export interface SyncPullResponse {
  changes: SyncChange[];
  nextCursor: string | null;
}
