export interface ApiSuccess<T> { data: T; meta?: Record<string, unknown>; }
export type ApiErrorCode =
  | 'AUTH_INVALID_CREDENTIALS' | 'AUTH_UNAUTHORIZED' | 'FORBIDDEN' | 'RESOURCE_NOT_FOUND'
  | 'VALIDATION_ERROR' | 'BATCH_BIRD_COUNT_INVALID' | 'STOCK_INSUFFICIENT' | 'PAYMENT_EXCEEDS_TOTAL'
  | 'SYNC_CONFLICT' | 'INTERNAL_ERROR' | 'DUPLICATE_EMAIL' | 'RATE_LIMITED'
  | 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'DUPLICATE_DAILY_RECORD' | 'FARM_HAS_DEPENDENCIES'
  | 'SHED_HAS_DEPENDENCIES' | 'RESET_TOKEN_INVALID' | 'EMAIL_NOT_FOUND' | 'ENTITY_NOT_SYNCABLE';
export interface ApiError { error: { code: ApiErrorCode; message: string; details?: unknown }; }
export interface PaginationMeta { page: number; pageSize: number; total: number; totalPages: number; }
export { };
