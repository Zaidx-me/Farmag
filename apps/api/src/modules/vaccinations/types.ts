import type { Vaccination } from '@prisma/client';
import type { z } from 'zod';
import type { createVaccinationSchema, updateVaccinationSchema } from '@poultry/validation';

export type CreateVaccinationInput = z.infer<typeof createVaccinationSchema>;
export type UpdateVaccinationInput = z.infer<typeof updateVaccinationSchema>;

/** Vaccination wire shape — the Prisma row as-is (dose is Decimal, serialized as string). */
export type VaccinationResponse = Vaccination;