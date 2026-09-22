import Fastify from 'fastify';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerAuth } from './plugins/auth.js';

export function buildApp() {
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  app.decorate('prisma', prisma);
  registerErrorHandler(app);
  registerAuth(app);
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async () => {
    await app.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  });
  return app;
}