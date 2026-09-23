import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // MinIO (docker-compose defaults — local dev; existing .env keeps booting without these).
  MINIO_ENDPOINT: z.string().min(1).default('localhost'),
  MINIO_PORT: z.coerce.number().int().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1).default('poultry'),
  MINIO_SECRET_KEY: z.string().min(1).default('poultry_minio_secret'),
  MINIO_BUCKET: z.string().min(1).default('poultry'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const invalidKeys = parsed.error.issues.map((issue) => issue.path.join('.'));
  throw new Error(
    `Invalid environment configuration. Missing or invalid variables: ${invalidKeys.join(', ')}`
  );
}

export const env = parsed.data;