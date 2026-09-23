import type { Sale } from '@prisma/client';
import type { z } from 'zod';
import type { createSaleWireSchema, updateSalePaymentWireSchema, updateSaleWireSchema } from './schema.js';

export type CreateSaleInput = z.infer<typeof createSaleWireSchema>;
export type UpdateSaleInput = z.infer<typeof updateSaleWireSchema>;
export type UpdateSalePaymentInput = z.infer<typeof updateSalePaymentWireSchema>;

export interface SaleListParams {
  from?: string;
  to?: string;
  batchId?: string;
  page: number;
  pageSize: number;
}

/** Sale wire shape — the Prisma row as-is (money fields are Decimal, serialized as strings). */
export type SaleResponse = Sale;