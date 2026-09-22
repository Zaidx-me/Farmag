import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from '@poultry/validation';
import { addFarmMemberSchema, createFarmSchema, updateFarmSchema } from './schema.js';
import * as farmsService from './service.js';

const farmParamsSchema = z.object({ farmId: uuidSchema });

export const farmsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: app.authenticate }, async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const result = await farmsService.list(request.user.id, query);
    return { data: result };
  });

  app.post('/', { preHandler: app.authenticate }, async (request) => {
    const input = createFarmSchema.parse(request.body);
    const farm = await farmsService.create(request.user.id, input);
    return { data: farm };
  });

  app.get('/:farmId', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const farm = await farmsService.get(farmId, request.user);
    return { data: farm };
  });

  app.patch('/:farmId', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const input = updateFarmSchema.parse(request.body);
    const farm = await farmsService.update(farmId, request.user, input);
    return { data: farm };
  });

  app.delete('/:farmId', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    await farmsService.remove(farmId, request.user);
    return { data: { success: true } };
  });

  app.get('/:farmId/members', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const items = await farmsService.listMembers(farmId, request.user);
    return { data: { items } };
  });

  app.post('/:farmId/members', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const { members } = addFarmMemberSchema.parse(request.body);
    const result = await farmsService.addMembers(farmId, request.user, members);
    return { data: { success: true, added: result.added } };
  });
};