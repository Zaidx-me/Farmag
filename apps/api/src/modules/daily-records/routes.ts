import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dateSchema, paginationQuerySchema, uuidSchema } from '@poultry/validation';
import { createDailyRecordSchema, updateDailyRecordSchema } from './schema.js';
import * as dailyRecordsService from './service.js';

const batchParamsSchema = z.object({ batchId: uuidSchema });
const recordParamsSchema = z.object({ recordId: uuidSchema });

const listDailyRecordsQuerySchema = paginationQuerySchema.extend({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const dailyRecordsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/batches/:batchId/daily-records', { preHandler: app.authenticate }, async (request) => {
    const { batchId } = batchParamsSchema.parse(request.params);
    const query = listDailyRecordsQuerySchema.parse(request.query);
    const result = await dailyRecordsService.list(batchId, request.user, query);
    return { data: result };
  });

  app.post('/batches/:batchId/daily-records', { preHandler: app.authenticate }, async (request) => {
    const { batchId } = batchParamsSchema.parse(request.params);
    const input = createDailyRecordSchema.parse(request.body);
    const record = await dailyRecordsService.create(batchId, request.user, input);
    return { data: record };
  });

  app.get('/daily-records/:recordId', { preHandler: app.authenticate }, async (request) => {
    const { recordId } = recordParamsSchema.parse(request.params);
    const record = await dailyRecordsService.get(recordId, request.user);
    return { data: record };
  });

  app.patch('/daily-records/:recordId', { preHandler: app.authenticate }, async (request) => {
    const { recordId } = recordParamsSchema.parse(request.params);
    const input = updateDailyRecordSchema.parse(request.body);
    const record = await dailyRecordsService.update(recordId, request.user, input);
    return { data: record };
  });

  app.delete('/daily-records/:recordId', { preHandler: app.authenticate }, async (request) => {
    const { recordId } = recordParamsSchema.parse(request.params);
    await dailyRecordsService.remove(recordId, request.user);
    return { data: { success: true } };
  });
};