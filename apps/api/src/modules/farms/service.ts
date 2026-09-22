import type { UserRole } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/errors.js';
import { isFarmAccessible, requireRole } from '../../utils/farm-access.js';
import { paginate } from '../../utils/pagination.js';
import type { AddFarmMemberInput, CreateFarmInput, FarmResponse, MemberResponse, UpdateFarmInput } from './types.js';

export interface ListParams {
  page: number;
  pageSize: number;
}

export async function list(userId: string, { page, pageSize }: ListParams) {
  const [owned, memberships] = await Promise.all([
    prisma.farm.findMany({ where: { ownerId: userId } }),
    prisma.farmMember.findMany({ where: { userId }, include: { farm: true } }),
  ]);

  // Merge by id — owned farms win over memberships; each item carries the caller's effective role.
  const byId = new Map<string, FarmResponse>();
  for (const farm of owned) byId.set(farm.id, { ...farm, role: 'OWNER' });
  for (const membership of memberships) {
    if (!byId.has(membership.farmId)) {
      byId.set(membership.farmId, { ...membership.farm, role: membership.role as UserRole });
    }
  }

  const items = [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), meta: paginate({ page, pageSize, total }) };
}

export async function get(farmId: string, user: { id: string }): Promise<FarmResponse> {
  const { farm, role } = await isFarmAccessible(farmId, user.id);
  return { ...farm, role };
}

export async function create(ownerId: string, input: CreateFarmInput) {
  return prisma.farm.create({ data: { ...input, ownerId } });
}

export async function update(farmId: string, user: { id: string }, input: UpdateFarmInput) {
  const { role } = await isFarmAccessible(farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  return prisma.farm.update({ where: { id: farmId }, data: input });
}

export async function remove(farmId: string, user: { id: string }): Promise<void> {
  const { role } = await isFarmAccessible(farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  const [shedCount, batchCount] = await Promise.all([
    prisma.shed.count({ where: { farmId } }),
    prisma.batch.count({ where: { farmId } }),
  ]);
  if (shedCount > 0 || batchCount > 0) {
    throw new ApiError('FARM_HAS_DEPENDENCIES', 'Farm has sheds or batches', 409);
  }
  await prisma.farm.delete({ where: { id: farmId } });
}

export async function listMembers(farmId: string, user: { id: string }): Promise<MemberResponse[]> {
  const { role } = await isFarmAccessible(farmId, user.id);
  requireRole(role, ['OWNER']);
  const members = await prisma.farmMember.findMany({
    where: { farmId },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  return members.map((m) => ({
    id: m.user.id,
    fullName: m.user.fullName,
    email: m.user.email,
    role: m.role as UserRole,
  }));
}

export async function addMembers(
  farmId: string,
  user: { id: string },
  members: AddFarmMemberInput['members']
): Promise<{ added: number }> {
  const { role } = await isFarmAccessible(farmId, user.id);
  requireRole(role, ['OWNER']);
  const userIds = members.map((m) => m.userId);
  const found = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } });
  const foundIds = new Set(found.map((u) => u.id));
  const missing = userIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new ApiError('VALIDATION_ERROR', 'Unknown user(s)', 400, { userIds: missing });
  }
  const result = await prisma.farmMember.createMany({
    data: members.map((m) => ({ farmId, userId: m.userId, role: m.role })),
    skipDuplicates: true,
  });
  return { added: result.count };
}