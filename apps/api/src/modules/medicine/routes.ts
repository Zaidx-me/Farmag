import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dateSchema, paginationQuerySchema, uuidSchema } from '@poultry/validation';
import { createMedicineItemSchema, medicinePurchaseSchema, medicineUseSchema, updateMedicineItemSchema } from './schema.js';
import * as medicineService from './service.js';

const farmParamsSchema = z.object({ farmId: uuidSchema });
const medicineParamsSchema = z.object({ medicineId: uuidSchema });

const listTransactionsQuerySchema = paginationQuerySchema.extend({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const medicineRoutes: FastifyPluginAsync = async (app) => {
  app.get('/farms/:farmId/medicines', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const result = await medicineService.list(farmId, request.user, query);
    return { data: result };
  });

  app.post('/farms/:farmId/medicines', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const input = createMedicineItemSchema.parse(request.body);
    const medicine = await medicineService.create(farmId, request.user, input);
    return { data: medicine };
  });

  app.patch('/medicines/:medicineId', { preHandler: app.authenticate }, async (request) => {
    const { medicineId } = medicineParamsSchema.parse(request.params);
    const input = updateMedicineItemSchema.parse(request.body);
    const medicine = await medicineService.update(medicineId, request.user, input);
    return { data: medicine };
  });

  app.post('/medicines/:medicineId/purchase', { preHandler: app.authenticate }, async (request) => {
    const { medicineId } = medicineParamsSchema.parse(request.params);
    const input = medicinePurchaseSchema.parse(request.body);
    const result = await medicineService.purchase(medicineId, request.user, input);
    return { data: result };
  });

  app.post('/medicines/:medicineId/use', { preHandler: app.authenticate }, async (request) => {
    const { medicineId } = medicineParamsSchema.parse(request.params);
    const input = medicineUseSchema.parse(request.body);
    const result = await medicineService.use(medicineId, request.user, input);
    return { data: result };
  });

  app.get('/medicines/:medicineId/transactions', { preHandler: app.authenticate }, async (request) => {
    const { medicineId } = medicineParamsSchema.parse(request.params);
    const query = listTransactionsQuerySchema.parse(request.query);
    const result = await medicineService.transactions(medicineId, request.user, query);
    return { data: result };
  });
};