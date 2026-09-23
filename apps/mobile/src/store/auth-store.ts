import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UserRole, UserStatus } from '@poultry/shared-types';

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

/** Async SecureStore adapter — zustand persist supports promise-based storage. */
const secureStorage = {
  getItem: (name: string): Promise<string | null> => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string): Promise<void> => SecureStore.setItemAsync(name, value),
  removeItem: (name: string): Promise<void> => SecureStore.deleteItemAsync(name),
};

export const AUTH_STORAGE_KEY = 'poultry-auth';

export const useAuthStore = create<AuthState>()(
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
      storage: createJSONStorage(() => secureStorage),
      // Only tokens + user are persisted; `status` is derived on rehydrate.
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.status =
          state.accessToken && state.refreshToken ? 'authenticated' : 'unauthenticated';
      },
    }
  )
);