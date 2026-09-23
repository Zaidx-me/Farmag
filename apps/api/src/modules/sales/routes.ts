import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dateSchema, paginationQuerySchema, uuidSchema } from '@poultry/validation';
import { createSaleWireSchema, updateSalePaymentWireSchema, updateSaleWireSchema } from './schema.js';
import * as salesService from './service.js';

const farmParamsSchema = z.object({ farmId: uuidSchema });
const saleParamsSchema = z.object({ saleId: uuidSchema });

const listSalesQuerySchema = paginationQuerySchema.extend({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  batchId: uuidSchema.optional(),
});

export const salesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/farms/:farmId/sales', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const query = listSalesQuerySchema.parse(request.query);
    const result = await salesService.list(farmId, request.user, query);
    return { data: result };
  });

  app.post('/farms/:farmId/sales', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const input = createSaleWireSchema.parse(request.body);
    const sale = await salesService.create(farmId, request.user, input);
    return { data: sale };
  });

  app.get('/sales/:saleId', { preHandler: app.authenticate }, async (request) => {
    const { saleId } = saleParamsSchema.parse(request.params);
    const sale = await salesService.get(saleId, request.user);
    return { data: sale };
  });

  app.patch('/sales/:saleId', { preHandler: app.authenticate }, async (request) => {
    const { saleId } = saleParamsSchema.parse(request.params);
    const input = updateSaleWireSchema.parse(request.body);
    const sale = await salesService.update(saleId, request.user, input);
    return { data: sale };
  });

  app.delete('/sales/:saleId', { preHandler: app.authenticate }, async (request) => {
    const { saleId } = saleParamsSchema.parse(request.params);
    await salesService.remove(saleId, request.user);
    return { data: { success: true } };
  });

  app.post('/sales/:saleId/payment', { preHandler: app.authenticate }, async (request) => {
    const { saleId } = saleParamsSchema.parse(request.params);
    const input = updateSalePaymentWireSchema.parse(request.body);
    const sale = await salesService.updatePayment(saleId, request.user, input);
    return { data: sale };
  });
};