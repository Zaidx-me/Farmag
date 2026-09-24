import { z } from 'zod';

import { dateSchema, decimalSchema } from '@poultry/validation';

/**
 * Daily-entry form schema. Numeric fields arrive as strings from TextInputs;
 * empty strings mean "not provided" and are normalized away on save. The
 * mortality guard (mortality ≤ birdsAtStart) is enforced here AND surfaced
 * inline by the form (watch-based) so save is blocked before any write.
 */
const optionalDecimal = z.union([decimalSchema, z.literal('')]).optional();

export const dailyEntrySchema = z
  .object({
    recordDate: dateSchema,
    birdsAtStart: z.coerce.number().int().min(0),
    mortality: z.coerce.number().int().min(0),
    feedConsumedKg: optionalDecimal,
    averageWeightKg: optionalDecimal,
    humidityPercent: optionalDecimal,
    notes: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mortality > data.birdsAtStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mortality'],
        message: 'Mortality cannot exceed birds at start',
      });
    }
  });

export type DailyEntryInput = z.infer<typeof dailyEntrySchema>;

/** Normalized values — empty decimal strings dropped, decimals kept as strings. */
export interface DailyEntryValues {
  recordDate: string;
  birdsAtStart: number;
  mortality: number;
  feedConsumedKg?: string;
  averageWeightKg?: string;
  humidityPercent?: string;
  notes?: string;
}

export function normalizeDailyEntry(input: DailyEntryInput): DailyEntryValues {
  const values: DailyEntryValues = {
    recordDate: input.recordDate,
    birdsAtStart: input.birdsAtStart,
    mortality: input.mortality,
  };
  if (input.feedConsumedKg !== undefined && input.feedConsumedKg !== '') {
    values.feedConsumedKg = input.feedConsumedKg;
  }
  if (input.averageWeightKg !== undefined && input.averageWeightKg !== '') {
    values.averageWeightKg = input.averageWeightKg;
  }
  if (input.humidityPercent !== undefined && input.humidityPercent !== '') {
    values.humidityPercent = input.humidityPercent;
  }
  if (input.notes !== undefined && input.notes !== '') {
    values.notes = input.notes;
  }
  return values;
}