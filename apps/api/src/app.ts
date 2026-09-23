import Fastify from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { authRoutes } from './modules/auth/routes.js';
import { batchesRoutes } from './modules/batches/routes.js';
import { dailyRecordsRoutes } from './modules/daily-records/routes.js';
import { expensesRoutes } from './modules/expenses/routes.js';
import { farmsRoutes } from './modules/farms/routes.js';
import { feedRoutes } from './modules/feed/routes.js';
import { medicineRoutes } from './modules/medicine/routes.js';
import { shedsRoutes } from './modules/sheds/routes.js';
import { usersRoutes } from './modules/users/routes.js';
import { vaccinationsRoutes } from './modules/vaccinations/routes.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerAuth } from './plugins/auth.js';

export function buildApp() {
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  app.decorate('prisma', prisma);
  registerErrorHandler(app);
  registerAuth(app);
  void app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: 60_000,
    errorResponseBuilder: (request, context) => ({
      error: { code: 'RATE_LIMITED', message: `Rate limit exceeded, retry after ${context.after}` },
    }),
  });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async () => {
    await app.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  });
  void app.register(authRoutes, { prefix: '/api/v1/auth' });
  void app.register(usersRoutes, { prefix: '/api/v1/users' });
  void app.register(farmsRoutes, { prefix: '/api/v1/farms' });
  void app.register(shedsRoutes, { prefix: '/api/v1' });
  void app.register(batchesRoutes, { prefix: '/api/v1' });
  void app.register(dailyRecordsRoutes, { prefix: '/api/v1' });
  void app.register(feedRoutes, { prefix: '/api/v1' });
  void app.register(medicineRoutes, { prefix: '/api/v1' });
  void app.register(vaccinationsRoutes, { prefix: '/api/v1' });
  void app.register(expensesRoutes, { prefix: '/api/v1' });
  return app;
}