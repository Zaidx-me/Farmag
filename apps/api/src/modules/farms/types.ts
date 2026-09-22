import type { Farm } from '@prisma/client';
import type { UserRole } from '@poultry/shared-types';
import type { z } from 'zod';
import type { addFarmMemberSchema, createFarmSchema, updateFarmSchema } from '@poultry/validation';

export type CreateFarmInput = z.infer<typeof createFarmSchema>;
export type UpdateFarmInput = z.infer<typeof updateFarmSchema>;
export type AddFarmMemberInput = z.infer<typeof addFarmMemberSchema>;

/** Farm wire shape — carries the caller's effective role in the farm. */
export interface FarmResponse extends Farm {
  role: UserRole;
}

export interface MemberResponse {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}