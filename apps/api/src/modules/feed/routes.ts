import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dateSchema, paginationQuerySchema, uuidSchema } from '@poultry/validation';
import { createFeedItemSchema, feedConsumeSchema, feedPurchaseSchema, updateFeedItemSchema } from './schema.js';
import * as feedService from './service.js';

const farmParamsSchema = z.object({ farmId: uuidSchema });
const feedItemParamsSchema = z.object({ feedItemId: uuidSchema });

const listTransactionsQuerySchema = paginationQuerySchema.extend({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const feedRoutes: FastifyPluginAsync = async (app) => {
  app.get('/farms/:farmId/feed', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const result = await feedService.list(farmId, request.user, query);
    return { data: result };
  });

  app.post('/farms/:farmId/feed', { preHandler: app.authenticate }, async (request) => {
    const { farmId } = farmParamsSchema.parse(request.params);
    const input = createFeedItemSchema.parse(request.body);
    const feedItem = await feedService.create(farmId, request.user, input);
    return { data: feedItem };
  });

  app.patch('/feed/:feedItemId', { preHandler: app.authenticate }, async (request) => {
    const { feedItemId } = feedItemParamsSchema.parse(request.params);
    const input = updateFeedItemSchema.parse(request.body);
    const feedItem = await feedService.update(feedItemId, request.user, input);
    return { data: feedItem };
  });

  app.post('/feed/:feedItemId/purchase', { preHandler: app.authenticate }, async (request) => {
    const { feedItemId } = feedItemParamsSchema.parse(request.params);
    const input = feedPurchaseSchema.parse(request.body);
    const result = await feedService.purchase(feedItemId, request.user, input);
    return { data: result };
  });

  app.post('/feed/:feedItemId/consume', { preHandler: app.authenticate }, async (request) => {
    const { feedItemId } = feedItemParamsSchema.parse(request.params);
    const input = feedConsumeSchema.parse(request.body);
    const result = await feedService.consume(feedItemId, request.user, input);
    return { data: result };
  });

  app.get('/feed/:feedItemId/transactions', { preHandler: app.authenticate }, async (request) => {
    const { feedItemId } = feedItemParamsSchema.parse(request.params);
    const query = listTransactionsQuerySchema.parse(request.query);
    const result = await feedService.transactions(feedItemId, request.user, query);
    return { data: result };
  });
};