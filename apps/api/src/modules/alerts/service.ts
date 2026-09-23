import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { notFound } from '../../utils/errors.js';
import { paginate } from '../../utils/pagination.js';
import { alertGenerator } from './generator.js';
import type { AlertListParams } from './types.js';

/**
 * Lazy evaluate (plan Step 1): find every farm the user has access to (owner OR member)
 * and fire `alertGenerator.evaluate(farmId)` for each — fire-and-forget, never awaited.
 * The generator never throws (whole body try/catch), but this is belt-and-braces so a
 * future regression can never break the alerts read path.
 */
async function lazyEvaluate(userId: string): Promise<void> {
  try {
    const farms = await prisma.farm.findMany({
      where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      select: { id: true },
    });
    for (const farm of farms) {
      void alertGenerator.evaluate(farm.id);
    }
  } catch {
    // no-op — alert evaluation must never break the read path.
  }
}

/**
 * Alerts are PERSONAL (userId-scoped) — no farm-role checks on read endpoints. The
 * lazy-refresh ordering is evaluate-first-then-return so just-created alerts appear.
 */
export async function list(user: { id: string }, params: AlertListParams) {
  await lazyEvaluate(user.id);
  const { unread, type, page, pageSize } = params;
  const where: Prisma.AlertWhereInput = {
    userId: user.id,
    ...(unread !== undefined ? { isRead: !unread } : {}),
    ...(type !== undefined ? { type } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.alert.count({ where }),
  ]);
  return { items, meta: paginate({ page, pageSize, total }) };
}

export async function markRead(alertId: string, user: { id: string }) {
  await lazyEvaluate(user.id);
  // Only the owner's own alerts are reachable — a foreign id is indistinguishable from
  // absent (404, never 403 — no existence leak).
  const alert = await prisma.alert.findFirst({ where: { id: alertId, userId: user.id } });
  if (!alert) throw notFound('Alert not found');
  return prisma.alert.update({
    where: { id: alertId },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markAllRead(user: { id: string }) {
  await lazyEvaluate(user.id);
  const result = await prisma.alert.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { count: result.count };
}