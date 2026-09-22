import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from '@poultry/validation';
import { createShedSchema, updateShedSchema } from './schema.js';
import * as shedsService from './service.js';

const farmParamsSchema = z.object({ farmId: uuidSchema });
const shedParamsSchema = z.object({ shedId: uuidSchema });

export const shedsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/farms/:farmId/sheds', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const result = await shedsService.list(farmId, request.user, query);
    return { data: result };
  });

  app.post('/farms/:farmId/sheds', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const input = createShedSchema.parse(request.body);
    const shed = await shedsService.create(farmId, request.user, input);
    return { data: shed };
  });

  app.get('/sheds/:shedId', { preHandler: app.authenticate }, async (request) => {
    const { shedId } = shedParamsSchema.parse(request.params);
    const shed = await shedsService.get(shedId, request.user);
    return { data: shed };
  });

  app.patch('/sheds/:shedId', { preHandler: app.authenticate }, async (request) => {
    const { shedId } = shedParamsSchema.parse(request.params);
    const input = updateShedSchema.parse(request.body);
    const shed = await shedsService.update(shedId, request.user, input);
    return { data: shed };
  });

  app.delete('/sheds/:shedId', { preHandler: app.authenticate }, async (request) => {
    const { shedId } = shedParamsSchema.parse(request.params);
    await shedsService.remove(shedId, request.user);
    return { data: { success: true } };
  });
};