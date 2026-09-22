import type { DailyRecord } from '@prisma/client';
import type { z } from 'zod';
import type { createDailyRecordSchema, updateDailyRecordSchema } from '@poultry/validation';

export type CreateDailyRecordInput = z.infer<typeof createDailyRecordSchema>;
export type UpdateDailyRecordInput = z.infer<typeof updateDailyRecordSchema>;

export interface ListParams {
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

/** Wire shape of a daily record — the Prisma row as-is (birdsRemaining is server-computed). */
export type DailyRecordResponse = DailyRecord;