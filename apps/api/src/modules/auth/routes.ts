import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';
import { audit } from '../../utils/audit.js';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from './schema.js';
import * as authService from './service.js';
import { toAuthUser } from './service.js';

const sensitiveRateLimit = { config: { rateLimit: { max: 10, timeWindow: 60_000 } } };

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', sensitiveRateLimit, async (request) => {
    const input = registerSchema.parse(request.body);
    const user = await authService.register(input);
    const authUser = toAuthUser(user);
    const tokens = await authService.issueTokenPair(authUser, app.signAccessToken);
    return { data: { user: authUser, tokens } };
  });

  app.post('/login', sensitiveRateLimit, async (request) => {
    const { email, password } = loginSchema.parse(request.body);
    let user;
    try {
      user = await authService.login(email, password);
    } catch (err) {
      audit({ action: 'auth.login.failed', details: { email: email.toLowerCase() } });
      throw err;
    }
    audit({ action: 'auth.login.success', actorId: user.id });
    const authUser = toAuthUser(user);
    const tokens = await authService.issueTokenPair(authUser, app.signAccessToken);
    return { data: { user: authUser, tokens } };
  });

  app.post('/refresh', async (request) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    const { user, tokens } = await authService.refresh(refreshToken, app.signAccessToken);
    return { data: { user: toAuthUser(user), tokens } };
  });

  app.post('/logout', async (request) => {
    const { refreshToken } = logoutSchema.parse(request.body);
    await authService.logout(refreshToken);
    return { data: { success: true } };
  });

  app.post('/forgot-password', sensitiveRateLimit, async (request) => {
    const { email } = forgotPasswordSchema.parse(request.body);
    const result = await authService.forgotPassword(email, (payload) =>
      app.jwt.sign(payload, { key: env.JWT_REFRESH_SECRET, expiresIn: '1h' })
    );
    return { data: result };
  });

  app.post('/reset-password', async (request) => {
    const { token, password } = resetPasswordSchema.parse(request.body);
    await authService.resetPassword(token, password, (t) =>
      app.jwt.verify(t, { key: env.JWT_REFRESH_SECRET })
    );
    return { data: { success: true } };
  });
};