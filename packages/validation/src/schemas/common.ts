import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
export const isoDateSchema = z.string().datetime({ offset: true });
/** Money/measurement as decimal string, up to 2dp — never float. */
export const moneySchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a number with at most 2 decimal places');
export const decimalSchema = z.string().regex(/^\d+(\.\d+)?$/);
export const nonNegativeDecimalSchema = decimalSchema;
export const optionalDecimalSchema = decimalSchema.nullish();
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});
export const pidSchema = (name: string) => z.object({ [name]: uuidSchema });
export const dateRangeQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional()
});
