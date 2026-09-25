import { afterAll, describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';

import { AUTH_STORAGE_KEY, createAuthStore, useAuthStore, type AuthUser } from './auth-store';

// The module-level store is built while this file is imported, so its diagnostics have
// to be muted here rather than in a hook. Muted only — the adapter is still exercised.
const mutedWarn = vi.hoisted(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));

afterAll(() => {
  mutedWarn.mockRestore();
});

// The app's root route spins forever when hydration cannot read storage. On web
// `expo-secure-store` resolves to `export default {}`, so every keychain call
// throws — modelled here without loading the real module, whose native build
// transitively imports Flow-source `react-native`.
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => {
    throw new Error('SecureStore.getItemAsync is not a function');
  },
  setItemAsync: async () => {
    throw new Error('SecureStore.setItemAsync is not a function');
  },
  deleteItemAsync: async () => {
    throw new Error('SecureStore.deleteItemAsync is not a function');
  },
}));

const user: AuthUser = {
  id: 'usr-1',
  fullName: 'Ayesha Khan',
  email: 'ayesha@poultry.test',
  phone: null,
  role: 'OWNER',
  status: 'ACTIVE',
  createdAt: '2026-01-04T09:15:00.000Z',
};

/**
 * A storage whose reads always fail — the shape of the web defect, where the keychain
 * API does not exist. Writes succeed but go nowhere, so nothing rejects afterwards.
 */
function unreadableStorage(): StateStorage {
  return {
    getItem: () => Promise.reject(new Error('storage read failed')),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  };
}

function storagePersisting(state: Record<string, unknown>): StateStorage {
  return {
    getItem: (name) => {
      expect(name).toBe(AUTH_STORAGE_KEY);
      return Promise.resolve(JSON.stringify({ state, version: 0 }));
    },
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  };
}

function storageWithoutPersistedSession(): StateStorage {
  return {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  };
}

describe('createAuthStore', () => {
  it('leaves the status restoring until hydration has had a chance to run', () => {
    // Given / When
    const store = createAuthStore(storageWithoutPersistedSession());

    // Then — hydration is asynchronous, so the gate is still shut on this tick
    expect(store.getState().status).toBe('restoring');
  });

  it('settles to unauthenticated when hydration cannot read storage', async () => {
    // Given — the exact web failure: the storage read rejects
    const store = createAuthStore(unreadableStorage());

    // When / Then — the spinner is what a status stuck on 'restoring' renders
    await vi.waitFor(() => {
      expect(store.getState().status).toBe('unauthenticated');
    });
  });

  it('hydrates to authenticated when both tokens were persisted', async () => {
    // Given
    const store = createAuthStore(
      storagePersisting({ user, accessToken: 'access-1', refreshToken: 'refresh-1' })
    );

    // When / Then
    await vi.waitFor(() => {
      expect(store.getState().status).toBe('authenticated');
    });
    expect(store.getState().accessToken).toBe('access-1');
    expect(store.getState().user).toEqual(user);
  });

  it('hydrates to unauthenticated when the persisted session has no tokens', async () => {
    // Given — a half-written session: a user profile but no tokens
    const store = createAuthStore(storagePersisting({ user, accessToken: null, refreshToken: null }));

    // When / Then
    await vi.waitFor(() => {
      expect(store.getState().status).toBe('unauthenticated');
    });
  });

  it('hydrates to unauthenticated when only the access token was persisted', async () => {
    // Given
    const store = createAuthStore(
      storagePersisting({ user, accessToken: 'access-1', refreshToken: null })
    );

    // When / Then
    await vi.waitFor(() => {
      expect(store.getState().status).toBe('unauthenticated');
    });
  });
});

describe('useAuthStore', () => {
  it('never stays restoring when the keychain read fails on the shared storage', async () => {
    // When / Then — the singleton every screen imports must leave the loading gate
    await vi.waitFor(() => {
      expect(useAuthStore.getState().status).toBe('unauthenticated');
    });
  });
});
