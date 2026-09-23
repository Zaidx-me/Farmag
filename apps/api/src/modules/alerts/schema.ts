import { z } from 'zod';
import { AlertType } from '@poultry/shared-types';
import { paginationQuerySchema } from '@poultry/validation';

const alertTypeValues = Object.values(AlertType) as [string, ...string[]];

/**
 * Wire query schema for GET /api/v1/alerts. `unread` arrives as a query string
 * ('true'/'false') and is coerced to a boolean; `type` is restricted to the known
 * AlertType values. Manual zod .parse() in the route (module-boundary pattern).
 */
export const listAlertsQuerySchema = paginationQuerySchema.extend({
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  type: z.enum(alertTypeValues).optional(),
});

export const alertParamsSchema = z.object({ alertId: z.string().uuid() });