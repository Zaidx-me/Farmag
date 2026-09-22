import type { Medicine, MedicineTransaction } from '@prisma/client';
import type { z } from 'zod';
import type { createMedicineItemSchema, medicinePurchaseSchema, medicineUseSchema } from '@poultry/validation';

export type CreateMedicineItemInput = z.infer<typeof createMedicineItemSchema>;
export type UpdateMedicineItemInput = Partial<CreateMedicineItemInput>;
export type PurchaseMedicineInput = z.infer<typeof medicinePurchaseSchema>;
export type UseMedicineInput = z.infer<typeof medicineUseSchema>;

export interface ListParams {
  page: number;
  pageSize: number;
}

export interface TransactionListParams {
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

/** Medicine wire shape — the Prisma row as-is (currentStock is Decimal, serialized as string). */
export type MedicineResponse = Medicine;

/** Medicine transaction wire shape. */
export type MedicineTransactionResponse = MedicineTransaction;