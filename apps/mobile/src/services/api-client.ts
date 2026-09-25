import type { ApiErrorCode } from '@poultry/shared-types';

import { useAuthStore } from '../store/auth-store';
import type { AuthUser, TokenPair } from '../store/auth-store';

/**
 * Resolved API base URL. The fallback must stay in sync with the API's default
 * `PORT` (4000, see apps/api/src/config/env.ts) or an env-less dev run is dead.
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Every route is mounted behind this prefix (see apps/api/src/app.ts). */
export const API_PREFIX = '/api/v1';

/**
 * Call sites pass resource paths (`/farms`), but the API serves them under `/api/v1`.
 * Accepting both forms keeps call sites prefix-free and makes double-prefixing impossible.
 */
export function resolveApiPath(path: string): string {
  if (path === API_PREFIX || path.startsWith(`${API_PREFIX}/`) || path.startsWith(`${API_PREFIX}?`)) {
    return path;
  }
  return `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Normalized API error — thrown for every non-2xx response. */
export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly message: string;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.message = message;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Attach `Authorization: Bearer <accessToken>` and refresh on 401. Defaults to true. */
  auth?: boolean;
}

interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorEnvelope {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

interface RefreshEnvelope {
  data: { user: AuthUser; tokens: TokenPair };
}

function isEnvelope(value: unknown): value is { data: unknown } {
  return typeof value === 'object' && value !== null && 'data' in value;
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { error?: unknown };
  if (typeof candidate.error !== 'object' || candidate.error === null) return false;
  const err = candidate.error as { code?: unknown; message?: unknown };
  return typeof err.code === 'string' && typeof err.message === 'string';
}

async function parseErrorEnvelope(response: Response): Promise<ApiErrorEnvelope> {
  const raw: unknown = await response.json().catch(() => null);
  if (isErrorEnvelope(raw)) return raw;
  return {
    error: { code: 'INTERNAL_ERROR', message: `Request failed with status ${response.status}` },
  };
}

/** POST /api/v1/auth/refresh — rotates the token pair and returns the fresh user. */
async function refreshSession(): Promise<{ user: AuthUser; tokens: TokenPair }> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) throw new ApiClientError('TOKEN_INVALID', 'No refresh token available');

  const response = await fetch(`${API_BASE_URL}${resolveApiPath('/auth/refresh')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    const envelope = await parseErrorEnvelope(response);
    throw new ApiClientError(envelope.error.code, envelope.error.message);
  }

  const raw: unknown = await response.json();
  if (!isEnvelope(raw)) {
    throw new ApiClientError('INTERNAL_ERROR', 'Malformed refresh response');
  }
  return (raw as RefreshEnvelope).data;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const { accessToken, refreshToken, setTokens, setUser, signOut } = useAuthStore.getState();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const doFetch = async (token?: string): Promise<Response> => {
    const requestHeaders = { ...headers };
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE_URL}${resolveApiPath(path)}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response = await doFetch(accessToken ?? undefined);

  // 401 → attempt a single token refresh, then retry the original request.
  if (response.status === 401 && auth && refreshToken) {
    try {
      const { user, tokens } = await refreshSession();
      setTokens(tokens);
      setUser(user);
      response = await doFetch(tokens.accessToken);
    } catch (error) {
      signOut();
      throw error;
    }
  }

  if (!response.ok) {
    const envelope = await parseErrorEnvelope(response);
    throw new ApiClientError(envelope.error.code, envelope.error.message);
  }

  const raw: unknown = await response.json();
  if (!isEnvelope(raw)) {
    throw new ApiClientError('INTERNAL_ERROR', 'Malformed response envelope');
  }
  return (raw as ApiEnvelope<T>).data;
}

export const apiClient = {
  request,
  get: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  del: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: 'DELETE' }),
};