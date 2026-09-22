import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ApiError, errorToResponse } from '../utils/errors.js';

function isZodError(error: unknown): error is ZodError {
  return (
    error instanceof ZodError ||
    (typeof error === 'object' && error !== null && 'issues' in error && Array.isArray(error.issues))
  );
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send(errorToResponse(error));
    }
    if (isZodError(error)) {
      const details = error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details },
      });
    }
    request.log.error(error);
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
}