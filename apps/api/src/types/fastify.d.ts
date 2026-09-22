import type { PrismaClient } from '@prisma/client';
import type { UserRole } from '@poultry/shared-types';
import type { preHandlerHookHandler } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { id: string; role: UserRole; email: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: preHandlerHookHandler;
    authorize: (...roles: UserRole[]) => preHandlerHookHandler;
    signAccessToken: (user: { id: string; role: UserRole; email: string }) => string;
    verifyRefresh: (token: string) => { sub: string; role: UserRole; email: string; type: 'refresh' };
  }
}