import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient, resolveApiPath } from './api-client';

// `api-client` pulls in the auth store, which reaches for `expo-secure-store` (and
// therefore react-native). Stub it so this file stays import-safe in the node
// test environment. The empty store also keeps requests off the 401-refresh branch.
vi.mock('../store/auth-store', () => ({
  useAuthStore: { getState: () => ({}) },
}));

const ENV_KEY = 'EXPO_PUBLIC_API_URL';

/** Reload the module so the env var is read fresh, then hand back the resolved base URL. */
async function loadResolvedBaseUrl(): Promise<string | undefined> {
  vi.resetModules();
  const module: { API_BASE_URL?: string } = await import('./api-client');
  return module.API_BASE_URL;
}

describe('API base URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('falls back to the API default port when EXPO_PUBLIC_API_URL is unset', async () => {
    // Given
    vi.stubEnv(ENV_KEY, undefined);

    // When
    const baseUrl = await loadResolvedBaseUrl();

    // Then — 4000 is the API's real default (apps/api/src/config/env.ts)
    expect(baseUrl).toBe('http://localhost:4000');
  });

  it('uses EXPO_PUBLIC_API_URL verbatim when it is set', async () => {
    // Given
    vi.stubEnv(ENV_KEY, 'https://api.example.test:8080');

    // When
    const baseUrl = await loadResolvedBaseUrl();

    // Then
    expect(baseUrl).toBe('https://api.example.test:8080');
  });
});

describe('resolveApiPath', () => {
  it('prefixes the bare resource paths that call sites actually pass', () => {
    expect(resolveApiPath('/farms')).toBe('/api/v1/farms');
    expect(resolveApiPath('/batches/1')).toBe('/api/v1/batches/1');
    expect(resolveApiPath('/auth/login')).toBe('/api/v1/auth/login');
  });

  it('leaves an already-prefixed path untouched instead of double-prefixing', () => {
    expect(resolveApiPath('/api/v1/auth/login')).toBe('/api/v1/auth/login');
    expect(resolveApiPath('/api/v1')).toBe('/api/v1');
  });

  it('adds the separating slash when the caller omits the leading one', () => {
    expect(resolveApiPath('farms')).toBe('/api/v1/farms');
  });

  it('preserves the query string and does not mistake it for a prefix', () => {
    expect(resolveApiPath('/farms?page=1&pageSize=50')).toBe('/api/v1/farms?page=1&pageSize=50');
    expect(resolveApiPath('/api/v1/farms?page=1')).toBe('/api/v1/farms?page=1');
  });
});

describe('apiClient request URLs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The literal paths the feature query modules pass, so a regression at any real
  // call site is caught here rather than as an opaque 404 at runtime.
  const CALL_SITE_PATHS = [
    '/farms?page=1&pageSize=50',
    '/batches/1',
    '/batches/1/vaccinations',
    '/expenses/1',
    '/sales/1',
  ];

  it('requests each call-site path under /api/v1', async () => {
    for (const path of CALL_SITE_PATHS) {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await apiClient.get(path);

      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:4000/api/v1${path}`,
        expect.objectContaining({ method: 'GET' }),
      );
    }
  });

  it('does not double-prefix a path that already carries /api/v1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.post('/api/v1/auth/login', { email: 'owner@farm.test' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
