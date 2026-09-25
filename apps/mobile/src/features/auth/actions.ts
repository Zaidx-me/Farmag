import { useCallback, useState } from 'react';

import { ApiClientError, apiClient } from '@/src/services/api-client';
import { useAuthStore, type AuthUser, type TokenPair } from '@/src/store/auth-store';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginActionResult {
  /** Authenticates and seeds the session. On failure the store is left untouched. */
  login: (credentials: LoginCredentials) => Promise<boolean>;
  isSubmitting: boolean;
  error: string | null;
}

/** Unwrapped `data` payload of POST /api/v1/auth/login. */
interface LoginResponse {
  user: AuthUser;
  tokens: TokenPair;
}

/** Copy for the codes a user can act on; anything else falls back to the server message. */
function loginErrorMessage(caught: unknown): string {
  if (!(caught instanceof ApiClientError)) {
    return caught instanceof Error ? caught.message : 'Failed to sign in';
  }
  switch (caught.code) {
    case 'AUTH_INVALID_CREDENTIALS':
      return 'Invalid email or password';
    case 'RATE_LIMITED':
      return 'Too many attempts. Please wait and try again.';
    case 'VALIDATION_ERROR':
      return 'Please check your email and password.';
    default:
      return caught.message;
  }
}

/**
 * Login wiring: posts the credentials, then seeds tokens + user. `setTokens` flips
 * the store to 'authenticated', and the `(auth)` layout redirects out of /login on
 * that transition — the screen never navigates itself.
 */
export function useLoginAction(): LoginActionResult {
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(
    async ({ email, password }: LoginCredentials): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);
      try {
        // `auth: false` keeps the 401 refresh/sign-out path out of the login handshake.
        const data = await apiClient.post<LoginResponse>(
          '/api/v1/auth/login',
          { email, password },
          { auth: false }
        );
        setTokens(data.tokens);
        setUser(data.user);
        return true;
      } catch (caught) {
        setError(loginErrorMessage(caught));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [setTokens, setUser]
  );

  return { login, isSubmitting, error };
}
