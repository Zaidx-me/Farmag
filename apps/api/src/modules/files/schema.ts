import { z } from 'zod';
import { uuidSchema } from '@poultry/validation';

export const presignUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  farmId: uuidSchema.optional(),
});

export type PresignUploadBody = z.infer<typeof presignUploadSchema>;