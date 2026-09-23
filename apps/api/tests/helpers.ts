import { Prisma } from '@prisma/client';
import { expect } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Shared test helpers for the API integration suites (Task 26).
 *
 * Conventions copied from apps/api/tests/expenses.test.ts:
 * - register returns tokens directly (POST /api/v1/auth/register → data.tokens.accessToken)
 * - dateInDays / expectDecimal match the service's UTC-midnight @db.Date storage and
 *   Prisma.Decimal normalization.
 *
 * All helpers are typed; zero `any`.
 */

export interface TestUser {
  token: string;
  userId: string;
  role: string;
}

export interface FarmResult {
  farmId: string;
}

export interface ShedResult {
  shedId: string;
}

export interface BatchResult {
  batchId: string;
}

export interface FarmMemberInput {
  userId: string;
  role: 'OWNER' | 'MANAGER' | 'WORKER' | 'ACCOUNTANT';
}

export interface CreateBatchOverrides {
  batchNumber?: string;
  breed?: string;
  arrivalDate?: string;
  initialBirds?: number;
}

/** Batch numbers are unique per farm (Batch @@unique([farmId, batchNumber])) — counter keeps them unique within a run. */
let batchCounter = 0;

export async function createUser(
  app: FastifyInstance,
  email: string,
  password = 'Password123!'
): Promise<TestUser> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { fullName: 'Test User', email, password },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as {
    data: { user: { id: string; role: string }; tokens: { accessToken: string } };
  };
  return { token: body.data.tokens.accessToken, userId: body.data.user.id, role: body.data.user.role };
}

export const authHeader = (token: string) => ({ authorization: `Bearer ${token}` });

export async function createFarm(
  app: FastifyInstance,
  token: string,
  name = 'Test Farm'
): Promise<FarmResult> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/farms',
    headers: authHeader(token),
    payload: { name, location: 'Lahore' },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { data: { id: string } };
  return { farmId: body.data.id };
}

export async function createShed(
  app: FastifyInstance,
  token: string,
  farmId: string,
  name = 'Broiler Shed'
): Promise<ShedResult> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/farms/${farmId}/sheds`,
    headers: authHeader(token),
    payload: { name, capacity: 8000 },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { data: { id: string } };
  return { shedId: body.data.id };
}

export async function createBatch(
  app: FastifyInstance,
  token: string,
  farmId: string,
  shedId: string,
  overrides: CreateBatchOverrides = {}
): Promise<BatchResult> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/farms/${farmId}/batches`,
    headers: authHeader(token),
    payload: {
      shedId,
      batchNumber: overrides.batchNumber ?? `BATCH-${Date.now()}-${batchCounter++}`,
      breed: overrides.breed ?? 'Ross 308',
      arrivalDate: overrides.arrivalDate ?? dateInDays(0),
      initialBirds: overrides.initialBirds ?? 1000,
    },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { data: { id: string } };
  return { batchId: body.data.id };
}

export async function addFarmMembers(
  app: FastifyInstance,
  token: string,
  farmId: string,
  members: FarmMemberInput[]
): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/farms/${farmId}/members`,
    headers: authHeader(token),
    payload: { members },
  });
  expect(res.statusCode).toBe(200);
}

/** UTC date string N days from now (YYYY-MM-DD) — matches the service's UTC-midnight @db.Date storage. */
export const dateInDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Prisma Decimal serializes as its normalized string ('1500.5', not '1500.50') — compare numerically. */
export const expectDecimal = (actual: string, expected: string) => {
  expect(new Prisma.Decimal(actual).equals(new Prisma.Decimal(expected))).toBe(true);
};