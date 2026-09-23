import { createSaleSchema, updateSalePaymentSchema, updateSaleSchema } from '@poultry/validation';

/**
 * Wire schemas for the sales module. The shared schemas are already module-boundary
 * correct: `createSaleSchema` deliberately has NO totalAmount/outstandingAmount/
 * paymentStatus fields (server computes all three), and `updateSalePaymentSchema` is
 * exactly `{ amountReceived: moneySchema }`. Nothing to extend — re-export so the
 * module owns its boundary and the service types derive from these.
 */
export const createSaleWireSchema = createSaleSchema;
export const updateSaleWireSchema = updateSaleSchema;
export const updateSalePaymentWireSchema = updateSalePaymentSchema;