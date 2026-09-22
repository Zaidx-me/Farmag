import type { Farm } from '@prisma/client';
import type { UserRole } from '@poultry/shared-types';
import { prisma } from '../config/prisma.js';
import { forbidden, notFound } from './errors.js';

export interface FarmAccess {
  farm: Farm;
  role: UserRole;
}

/**
 * Resolves the caller's EFFECTIVE role for a farm: 'OWNER' when the caller
 * owns the farm, otherwise the FarmMember role. Absent farm and absent
 * membership both throw notFound() — no existence leak.
 */
export async function isFarmAccessible(farmId: string, userId: string): Promise<FarmAccess> {
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    include: { members: { where: { userId }, select: { role: true } } },
  });
  if (!farm) throw notFound('Farm not found');
  const role = farm.ownerId === userId ? 'OWNER' : farm.members[0]?.role;
  if (!role) throw notFound('Farm not found');
  return { farm, role: role as UserRole };
}

/** Role guard for farm-scoped operations. Throws forbidden() when the caller's role is not allowed. */
export function requireRole(role: UserRole, allowed: UserRole[]): void {
  if (!allowed.includes(role)) throw forbidden();
}