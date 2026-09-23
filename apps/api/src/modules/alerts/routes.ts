import type { FastifyPluginAsync } from 'fastify';
import { alertParamsSchema, listAlertsQuerySchema } from './schema.js';
import * as alertsService from './service.js';

/**
 * Alerts are user-owned (userId = user.id) — `{ preHandler: app.authenticate }` ONLY,
 * no `app.authorize` (no farm-role checks on read endpoints). Manual zod .parse().
 */
export const alertsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/alerts', { preHandler: app.authenticate }, async (request) => {
    const query = listAlertsQuerySchema.parse(request.query);
    const result = await alertsService.list(request.user, query);
    return { data: result };
  });

  app.patch('/alerts/:alertId/read', { preHandler: app.authenticate }, async (request) => {
    const { alertId } = alertParamsSchema.parse(request.params);
    const alert = await alertsService.markRead(alertId, request.user);
    return { data: alert };
  });

  app.post('/alerts/read-all', { preHandler: app.authenticate }, async (request) => {
    const result = await alertsService.markAllRead(request.user);
    return { data: result };
  });
};