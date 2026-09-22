import argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import type { User } from '@prisma/client';
import type { UserRole } from '@poultry/shared-types';
import { UserStatus } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js'; // shared PrismaClient singleton
import { ApiError } from '../../utils/errors.js';
import type { AuthUser, TokenPair } from './types.js';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SignAccessToken = (user: { id: string; role: UserRole; email: string }) => string;
export type SignResetToken = (payload: { sub: string; type: 'reset' }) => string;
export type VerifyResetToken = (token: string) => unknown;

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role as UserRole,
    status: user.status as UserStatus,
    createdAt: user.createdAt,
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function register(input: { fullName: string; email: string; phone?: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw new ApiError('DUPLICATE_EMAIL', 'An account with this email already exists', 409);
  const passwordHash = await argon2.hash(input.password);
  const user = await prisma.user.create({
    data: { fullName: input.fullName, email: input.email.toLowerCase(), phone: input.phone, passwordHash }
  });
  return user;
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new ApiError('AUTH_INVALID_CREDENTIALS', 'Invalid email or password', 401);
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) throw new ApiError('AUTH_INVALID_CREDENTIALS', 'Invalid email or password', 401);
  return user;
}

export async function issueTokenPair(
  user: AuthUser,
  signAccessToken: SignAccessToken
): Promise<TokenPair> {
  const accessToken = signAccessToken(user);
  const refreshToken = randomBytes(32).toString('hex');
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export async function refresh(
  refreshToken: string,
  signAccessToken: SignAccessToken
): Promise<{ user: User; tokens: TokenPair }> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: true },
  });
  if (!stored || stored.revokedAt !== null || stored.expiresAt.getTime() < Date.now()) {
    throw new ApiError('TOKEN_INVALID', 'Invalid refresh token', 401);
  }
  if (!stored.user || stored.user.status !== UserStatus.Active) {
    throw new ApiError('AUTH_UNAUTHORIZED', 'User is not active', 401);
  }

  const newOpaque = randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
  const [, , freshUser] = await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: now } }),
    prisma.refreshToken.create({
      data: { userId: stored.userId, tokenHash: hashToken(newOpaque), expiresAt },
    }),
    prisma.user.findUnique({ where: { id: stored.userId } }),
  ]);
  if (!freshUser) {
    throw new ApiError('AUTH_UNAUTHORIZED', 'User is not active', 401);
  }

  const accessToken = signAccessToken(toAuthUser(freshUser));
  return {
    user: freshUser,
    tokens: { accessToken, refreshToken: newOpaque, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  };
}

export async function logout(refreshToken: string): Promise<void> {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (stored && stored.revokedAt === null) {
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  }
}

export async function forgotPassword(
  email: string,
  signReset: SignResetToken
): Promise<{ message: string; devResetToken?: string }> {
  const message = 'If an email exists, a reset link was sent';
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return { message };
  const devResetToken = signReset({ sub: user.id, type: 'reset' });
  if (process.env.NODE_ENV !== 'production') return { message, devResetToken };
  return { message };
}

export async function resetPassword(
  token: string,
  password: string,
  verifyReset: VerifyResetToken
): Promise<void> {
  let decoded: unknown;
  try {
    decoded = verifyReset(token);
  } catch {
    throw new ApiError('TOKEN_INVALID', 'Invalid or expired reset token', 401);
  }
  if (typeof decoded !== 'object' || decoded === null) {
    throw new ApiError('TOKEN_INVALID', 'Invalid or expired reset token', 401);
  }
  const { sub, type } = decoded as { sub?: unknown; type?: unknown };
  if (type !== 'reset' || typeof sub !== 'string' || sub.length === 0) {
    throw new ApiError('TOKEN_INVALID', 'Invalid or expired reset token', 401);
  }
  const user = await prisma.user.findUnique({ where: { id: sub } });
  if (!user) throw new ApiError('TOKEN_INVALID', 'Invalid or expired reset token', 401);
  const passwordHash = await argon2.hash(password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
}