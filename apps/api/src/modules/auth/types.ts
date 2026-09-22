import type { UserRole, UserStatus } from '@poultry/shared-types';

/** Wire-safe user shape — passwordHash is NEVER included. */
export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}