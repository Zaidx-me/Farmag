import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import type { UserRole, UserStatus } from '@poultry/shared-types';

import { resolveAuthStorage } from './auth-storage';

/** Wire-safe user shape — mirrors the API's AuthUser (passwordHash never leaves the server). */
export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  status: AuthStatus;
  setTokens: (tokens: TokenPair) => void;
  setUser: (user: AuthUser) => void;
  signOut: () => void;
}

export const AUTH_STORAGE_KEY = 'poultry-auth';

/**
 * A session counts as authenticated only when both tokens survived hydration. A failed
 * read proves nothing, so it resolves to 'unauthenticated' — never to a permanent
 * 'restoring', which renders a spinner with no way out.
 */
function hydratedStatus(
  state: Pick<AuthState, 'accessToken' | 'refreshToken'>,
  error: unknown
): AuthStatus {
  if (error || !state.accessToken || !state.refreshToken) return 'unauthenticated';
  return 'authenticated';
}

export function createAuthStore(storage: StateStorage) {
  // The rehydrate callback runs on a later microtask, by which time `store` is bound.
  const store = create<AuthState>()(
    persist(
      (set) => ({
        user: null,
        accessToken: null,
        refreshToken: null,
        status: 'restoring',
        setTokens: (tokens) =>
          set({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            status: 'authenticated',
          }),
        setUser: (user) => set({ user }),
        signOut: () =>
          set({ user: null, accessToken: null, refreshToken: null, status: 'unauthenticated' }),
      }),
      {
        name: AUTH_STORAGE_KEY,
        storage: createJSONStorage(() => storage),
        // Only tokens + user are persisted; `status` is derived on rehydrate.
        partialize: (state) => ({
          user: state.user,
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
        }),
        // `state` is absent when hydration errored, so read the live state instead.
        onRehydrateStorage: () => (_state, error) => {
          store.setState({ status: hydratedStatus(store.getState(), error) });
        },
      }
    )
  );

  return store;
}

export const useAuthStore = createAuthStore(resolveAuthStorage());
