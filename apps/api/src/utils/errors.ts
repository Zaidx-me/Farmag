import type { ApiErrorCode, ApiError as ApiErrorEnvelope } from '@poultry/shared-types';

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) { super(message); }
}

export const notFound = (msg = 'Resource not found') => new ApiError('RESOURCE_NOT_FOUND', msg, 404);
export const forbidden = (msg = 'Forbidden') => new ApiError('FORBIDDEN', msg, 403);
export const unauthorized = (msg = 'Unauthorized') => new ApiError('AUTH_UNAUTHORIZED', msg, 401);

export function errorToResponse(error: ApiError): ApiErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  };
}