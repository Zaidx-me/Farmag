import { createMedicineItemSchema } from '@poultry/validation';

export { createMedicineItemSchema, medicinePurchaseSchema, medicineUseSchema } from '@poultry/validation';

/**
 * Update schema: any subset of the create fields. NOTE: `currentStock` is part of the
 * partial shape but the service STRIPS it — stock changes ONLY via purchase/use.
 */
export const updateMedicineItemSchema = createMedicineItemSchema.partial();