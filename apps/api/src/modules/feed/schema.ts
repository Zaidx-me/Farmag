import { createFeedItemSchema } from '@poultry/validation';

export { createFeedItemSchema, feedConsumeSchema, feedPurchaseSchema } from '@poultry/validation';

/**
 * Update schema: any subset of the create fields. NOTE: `currentStock` is part of the
 * partial shape but the service STRIPS it — stock changes ONLY via purchase/consume.
 */
export const updateFeedItemSchema = createFeedItemSchema.partial();