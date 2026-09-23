import { z } from 'zod';
import { createExpenseSchema, updateExpenseSchema } from '@poultry/validation';

/**
 * receiptObjectKey: the Expense model HAS the column (`receiptObjectKey String?`) but the
 * shared `createExpenseSchema` does NOT include it (packages/validation is locked for this
 * task — Task 25 wires the UI side). Per the brief, we accept it at the MODULE boundary by
 * extending the wire schema here, so the field is still validated (plain opaque string,
 * non-empty, bounded) before it ever reaches the service, and persisted to the model column.
 */
const receiptObjectKeySchema = z.string().min(1).max(1024);

export const createExpenseWireSchema = createExpenseSchema.extend({
  receiptObjectKey: receiptObjectKeySchema.optional(),
});

export const updateExpenseWireSchema = updateExpenseSchema.extend({
  receiptObjectKey: receiptObjectKeySchema.optional(),
});
