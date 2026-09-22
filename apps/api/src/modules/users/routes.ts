import type { FastifyPluginAsync } from 'fastify';
import { toAuthUser } from '../auth/service.js';
import { updateProfileSchema } from './schema.js';
import * as userService from './service.js';

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    const user = await userService.getMe(request.user.id);
    return { data: toAuthUser(user) };
  });

  app.patch('/me', { preHandler: app.authenticate }, async (request) => {
    const input = updateProfileSchema.parse(request.body);
    const user = await userService.updateMe(request.user.id, input);
    return { data: toAuthUser(user) };
  });
};