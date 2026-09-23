import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { minioClient } from '../../config/minio.js';
import { presignUploadSchema } from './schema.js';
import { createFilesService } from './service.js';
import type { MinioClientLike } from './types.js';

const wildcardParamsSchema = z.object({ '*': z.string() });

/**
 * Files routes — registered under `/api/v1` (full paths `/api/v1/files/presign` and
 * `/api/v1/files/*`). Both are authenticate-only at the route level; farm authorization
 * is enforced inside the service (isFarmAccessible + requireRole when farmId is present).
 *
 * GET uses the Fastify wildcard `*` instead of the plan's literal `:objectKey` because a
 * `:objectKey` param cannot match slashes — objectKeys embed the farmId prefix and a UUID
 * suffix (`<farmId>/<uuid>-<name>`), so the full captured path arrives at
 * `request.params['*']` and the first segment is parsed as the farmId.
 */
export function buildFilesRoutes(client: MinioClientLike = minioClient): FastifyPluginAsync {
  const filesService = createFilesService(client);
  return async (app) => {
    app.post('/files/presign', { preHandler: app.authenticate }, async (request) => {
      const input = presignUploadSchema.parse(request.body);
      const result = await filesService.presignUpload(input, request.user.id);
      return { data: result };
    });

    app.get('/files/*', { preHandler: app.authenticate }, async (request) => {
      const { '*': objectKey } = wildcardParamsSchema.parse(request.params);
      const result = await filesService.presignDownload(objectKey, request.user.id);
      return { data: result };
    });
  };
}

export const filesRoutes: FastifyPluginAsync = buildFilesRoutes();