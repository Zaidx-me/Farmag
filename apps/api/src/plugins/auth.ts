import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '@poultry/shared-types';
import { env } from '../config/env.js';
import { ApiError, unauthorized } from '../utils/errors.js';

export interface AuthUser {
  id: string;
  role: UserRole;
  email: string;
}

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  email: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  role: UserRole;
  email: string;
  type: 'refresh';
}

const isExpiredTokenError = (err: unknown): boolean =>
  err instanceof Error && 'code' in err && err.code === 'FAST_JWT_EXPIRED';

export function registerAuth(app: FastifyInstance): void {
  void app.register(fastifyJwt, { secret: env.JWT_ACCESS_SECRET });

  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized('Missing or malformed Authorization header');
    }
    const token = header.slice('Bearer '.length);
    try {
      const payload = app.jwt.verify<AccessTokenPayload>(token);
      request.user = { id: payload.sub, role: payload.role, email: payload.email };
    } catch (err) {
      if (isExpiredTokenError(err)) {
        throw new ApiError('TOKEN_EXPIRED', 'Token expired', 401);
      }
      throw new ApiError('TOKEN_INVALID', 'Invalid token', 401);
    }
  };

  const authorize = (...roles: UserRole[]) =>
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await authenticate(request, reply);
      if (!roles.includes(request.user.role)) {
        throw new ApiError('FORBIDDEN', 'Forbidden', 403);
      }
    };

  const signAccessToken = (user: AuthUser): string =>
    app.jwt.sign(
      { sub: user.id, role: user.role, email: user.email, type: 'access' },
      { expiresIn: '15m' }
    );

  const verifyRefresh = (token: string): RefreshTokenPayload =>
    app.jwt.verify<RefreshTokenPayload>(token, { key: env.JWT_REFRESH_SECRET });

  app.decorate('authenticate', authenticate);
  app.decorate('authorize', authorize);
  app.decorate('signAccessToken', signAccessToken);
  app.decorate('verifyRefresh', verifyRefresh);
}