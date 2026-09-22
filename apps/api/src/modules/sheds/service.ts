import { prisma } from '../../config/prisma.js';
import { ApiError, notFound } from '../../utils/errors.js';
import { isFarmAccessible, requireRole } from '../../utils/farm-access.js';
import { paginate } from '../../utils/pagination.js';
import type { CreateShedInput, ShedResponse, UpdateShedInput } from './types.js';

export interface ListParams {
  page: number;
  pageSize: number;
}

export async function list(farmId: string, user: { id: string }, { page, pageSize }: ListParams) {
  await isFarmAccessible(farmId, user.id);
  const [items, total] = await Promise.all([
    prisma.shed.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.shed.count({ where: { farmId } }),
  ]);
  return { items, meta: paginate({ page, pageSize, total }) };
}

export async function get(shedId: string, user: { id: string }): Promise<ShedResponse> {
  const shed = await prisma.shed.findUnique({ where: { id: shedId } });
  if (!shed) throw notFound('Shed not found');
  await isFarmAccessible(shed.farmId, user.id);
  return shed;
}

export async function create(farmId: string, user: { id: string }, input: CreateShedInput) {
  const { role } = await isFarmAccessible(farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  return prisma.shed.create({ data: { ...input, farmId } });
}

export async function update(shedId: string, user: { id: string }, input: UpdateShedInput) {
  const shed = await prisma.shed.findUnique({ where: { id: shedId } });
  if (!shed) throw notFound('Shed not found');
  const { role } = await isFarmAccessible(shed.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  // Defensive: never allow moving a shed to another farm via update.
  const { farmId: _farmId, ...data } = { ...input, farmId: undefined };
  return prisma.shed.update({ where: { id: shedId }, data });
}

export async function remove(shedId: string, user: { id: string }): Promise<void> {
  const shed = await prisma.shed.findUnique({ where: { id: shedId } });
  if (!shed) throw notFound('Shed not found');
  const { role } = await isFarmAccessible(shed.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  const batchCount = await prisma.batch.count({ where: { shedId } });
  if (batchCount > 0) {
    throw new ApiError('SHED_HAS_DEPENDENCIES', 'Shed has batches', 409);
  }
  await prisma.shed.delete({ where: { id: shedId } });
}