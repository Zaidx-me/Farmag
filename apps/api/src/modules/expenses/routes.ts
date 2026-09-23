import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dateSchema, paginationQuerySchema, uuidSchema } from '@poultry/validation';
import { createExpenseWireSchema, updateExpenseWireSchema } from './schema.js';
import * as expensesService from './service.js';

const farmParamsSchema = z.object({ farmId: uuidSchema });
const expenseParamsSchema = z.object({ expenseId: uuidSchema });

const listExpensesQuerySchema = paginationQuerySchema.extend({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  category: createExpenseWireSchema.shape.category.optional(),
  batchId: uuidSchema.optional(),
});

export const expensesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/farms/:farmId/expenses', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const query = listExpensesQuerySchema.parse(request.query);
    const result = await expensesService.list(farmId, request.user, query);
    return { data: result };
  });

  app.post('/farms/:farmId/expenses', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const input = createExpenseWireSchema.parse(request.body);
    const expense = await expensesService.create(farmId, request.user, input);
    return { data: expense };
  });

  app.get('/expenses/:expenseId', { preHandler: app.authenticate }, async (request) => {
    const { expenseId } = expenseParamsSchema.parse(request.params);
    const expense = await expensesService.get(expenseId, request.user);
    return { data: expense };
  });

  app.patch('/expenses/:expenseId', { preHandler: app.authenticate }, async (request) => {
    const { expenseId } = expenseParamsSchema.parse(request.params);
    const input = updateExpenseWireSchema.parse(request.body);
    const expense = await expensesService.update(expenseId, request.user, input);
    return { data: expense };
  });

  app.delete('/expenses/:expenseId', { preHandler: app.authenticate }, async (request) => {
    const { expenseId } = expenseParamsSchema.parse(request.params);
    await expensesService.remove(expenseId, request.user);
    return { data: { success: true } };
  });
};
