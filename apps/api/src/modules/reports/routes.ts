import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dateSchema, uuidSchema } from '@poultry/validation';
import * as reportsService from './service.js';

/**
 * REPORTS ROUTES — read-only analytics. farmId is REQUIRED on every endpoint (400 when
 * missing/invalid — zod parse). batchId is required for the per-batch series
 * (growth/mortality/feed) and optional for medicine/vaccination/sales. from/to are
 * optional YYYY-MM-DD window bounds. Routes use `{ preHandler: app.authenticate }` ONLY —
 * the OWNER/MANAGER/ACCOUNTANT role gate lives in the service (WORKER → 403).
 */
const dashboardQuerySchema = z.object({ farmId: uuidSchema });
const reportQuerySchema = z.object({
  farmId: uuidSchema,
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});
const seriesQuerySchema = reportQuerySchema.extend({ batchId: uuidSchema });
const optionalBatchQuerySchema = reportQuerySchema.extend({ batchId: uuidSchema.optional() });

export const reportsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dashboard', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = dashboardQuerySchema.parse(request.query);
    const result = await reportsService.dashboard(farmId, request.user);
    return { data: result };
  });

  app.get('/reports/growth', { preHandler: app.authenticate }, async (request) => {
    const query = seriesQuerySchema.parse(request.query);
    const result = await reportsService.growth(query.farmId, request.user, query);
    return { data: result };
  });

  app.get('/reports/mortality', { preHandler: app.authenticate }, async (request) => {
    const query = seriesQuerySchema.parse(request.query);
    const result = await reportsService.mortality(query.farmId, request.user, query);
    return { data: result };
  });

  app.get('/reports/feed', { preHandler: app.authenticate }, async (request) => {
    const query = seriesQuerySchema.parse(request.query);
    const result = await reportsService.feed(query.farmId, request.user, query);
    return { data: result };
  });

  app.get('/reports/medicine', { preHandler: app.authenticate }, async (request) => {
    const query = optionalBatchQuerySchema.parse(request.query);
    const result = await reportsService.medicine(query.farmId, request.user, query);
    return { data: result };
  });

  app.get('/reports/vaccination', { preHandler: app.authenticate }, async (request) => {
    const query = optionalBatchQuerySchema.parse(request.query);
    const result = await reportsService.vaccination(query.farmId, request.user, query);
    return { data: result };
  });

  app.get('/reports/expenses', { preHandler: app.authenticate }, async (request) => {
    const query = reportQuerySchema.parse(request.query);
    const result = await reportsService.expenses(query.farmId, request.user, query);
    return { data: result };
  });

  app.get('/reports/sales', { preHandler: app.authenticate }, async (request) => {
    const query = optionalBatchQuerySchema.parse(request.query);
    const result = await reportsService.sales(query.farmId, request.user, query);
    return { data: result };
  });

  app.get('/reports/profit-loss', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = dashboardQuerySchema.parse(request.query);
    const result = await reportsService.profitLoss(farmId, request.user);
    return { data: result };
  });

  app.get('/reports/batch-comparison', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = dashboardQuerySchema.parse(request.query);
    const result = await reportsService.batchComparison(farmId, request.user);
    return { data: result };
  });
};