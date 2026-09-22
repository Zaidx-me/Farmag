import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BatchStatus } from '@poultry/shared-types';
import { paginationQuerySchema, uuidSchema } from '@poultry/validation';
import { closeBatchSchema, createBatchSchema, updateBatchSchema } from './schema.js';
import * as batchesService from './service.js';

const farmParamsSchema = z.object({ farmId: uuidSchema });
const batchParamsSchema = z.object({ batchId: uuidSchema });

const batchStatusValues = [
  BatchStatus.Upcoming,
  BatchStatus.Active,
  BatchStatus.Sold,
  BatchStatus.Closed,
] as const;

const listBatchesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(batchStatusValues).optional(),
});

export const batchesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/farms/:farmId/batches', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const query = listBatchesQuerySchema.parse(request.query);
    const result = await batchesService.list(farmId, request.user, query);
    return { data: result };
  });

  app.post('/farms/:farmId/batches', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const input = createBatchSchema.parse(request.body);
    const batch = await batchesService.create(farmId, request.user, input);
    return { data: batch };
  });

  app.get('/batches/:batchId', { preHandler: app.authenticate }, async (request) => {
    const { batchId } = batchParamsSchema.parse(request.params);
    const batch = await batchesService.get(batchId, request.user);
    return { data: batch };
  });

  app.patch('/batches/:batchId', { preHandler: app.authenticate }, async (request) => {
    const { batchId } = batchParamsSchema.parse(request.params);
    const input = updateBatchSchema.parse(request.body);
    const batch = await batchesService.update(batchId, request.user, input);
    return { data: batch };
  });

  app.post('/batches/:batchId/close', { preHandler: app.authenticate }, async (request) => {
    const { batchId } = batchParamsSchema.parse(request.params);
    const { reason } = closeBatchSchema.parse(request.body ?? {});
    const batch = await batchesService.close(batchId, request.user, reason);
    return { data: batch };
  });

  app.post('/batches/:batchId/open', { preHandler: app.authenticate }, async (request) => {
    const { batchId } = batchParamsSchema.parse(request.params);
    const batch = await batchesService.open(batchId, request.user);
    return { data: batch };
  });
};