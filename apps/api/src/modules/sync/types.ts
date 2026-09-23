import type { SyncOperationInput } from '@poultry/shared-types';

export interface PushParams {
  operations: SyncOperationInput[];
}

export interface PullParams {
  cursor?: string;
  limit: number;
}