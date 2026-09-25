import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Native builds need no CORS; the Expo web build is cross-origin against the API.
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006'),
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

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);