import { prisma } from '../../config/prisma.js';
import { notFound } from '../../utils/errors.js';
import type { UpdateMeInput } from './types.js';

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('User not found');
  return user;
}

export async function updateMe(userId: string, input: UpdateMeInput) {
  await getMe(userId);
  const user = await prisma.user.update({ where: { id: userId }, data: input });
  return user;
}