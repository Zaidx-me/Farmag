import type { Batch, DailyRecord, Sale } from '@prisma/client';
import type { z } from 'zod';
import type { createBatchSchema, updateBatchSchema } from '@poultry/validation';
import type { BatchSummary } from './calculations.js';

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;

/** Batch wire shape: the batch plus its computed summary and last-7 daily records. */
export interface BatchResponse extends Batch {
  summary: BatchSummary;
  last7DailyRecords: DailyRecord[];
  sales: Sale[];
}