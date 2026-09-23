import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { uuidSchema } from '@poultry/validation';
import { createVaccinationSchema, updateVaccinationSchema } from './schema.js';
import * as vaccinationsService from './service.js';

const batchParamsSchema = z.object({ batchId: uuidSchema });
const vaccinationParamsSchema = z.object({ vaccinationId: uuidSchema });

export const vaccinationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/batches/:batchId/vaccinations', { preHandler: app.authenticate }, async (request) => {
    const { batchId } = batchParamsSchema.parse(request.params);
    const result = await vaccinationsService.list(batchId, request.user);
    return { data: result };
  });

  app.post('/batches/:batchId/vaccinations', { preHandler: app.authenticate }, async (request) => {
    const { batchId } = batchParamsSchema.parse(request.params);
    const input = createVaccinationSchema.parse(request.body);
    const vaccination = await vaccinationsService.create(batchId, request.user, input);
    return { data: vaccination };
  });

  app.patch('/vaccinations/:vaccinationId', { preHandler: app.authenticate }, async (request) => {
    const { vaccinationId } = vaccinationParamsSchema.parse(request.params);
    const input = updateVaccinationSchema.parse(request.body);
    const vaccination = await vaccinationsService.update(vaccinationId, request.user, input);
    return { data: vaccination };
  });

  app.delete('/vaccinations/:vaccinationId', { preHandler: app.authenticate }, async (request) => {
    const { vaccinationId } = vaccinationParamsSchema.parse(request.params);
    await vaccinationsService.remove(vaccinationId, request.user);
    return { data: { success: true } };
  });
};