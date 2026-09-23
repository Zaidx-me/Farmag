import type { FastifyPluginAsync } from 'fastify';
import { pullQuerySchema, pushSchema } from './schema.js';
import * as syncService from './service.js';

/**
 * Sync routes — registered under `/api/v1` (full paths `/api/v1/sync/push|pull`).
 * Both are user-level (authenticate ONLY): farm access is enforced by the underlying
 * owning services (push) and the accessible-farms query (pull). Manual zod .parse().
 */
export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.post('/sync/push', { preHandler: app.authenticate }, async (request) => {
    const { operations } = pushSchema.parse(request.body);
    const results = await syncService.push(request.user, { operations });
    return { data: { results } };
  });

  app.get('/sync/pull', { preHandler: app.authenticate }, async (request) => {
    const query = pullQuerySchema.parse(request.query);
    const result = await syncService.pull(request.user, query);
    return { data: result };
  });
};