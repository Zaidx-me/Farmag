import { describe, expect, it } from 'vitest';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema
} from './auth.js';

describe('auth schemas', () => {
  it('accepts a valid register payload', () => {
    const result = registerSchema.safeParse({
      fullName: 'John Farmer',
      email: 'john@example.com',
      phone: '+923001234567',
      password: 'securepass123'
    });
    expect(result.success).toBe(true);
  });
  it('rejects a short password on register', () => {
    const result = registerSchema.safeParse({
      fullName: 'John Farmer',
      email: 'john@example.com',
      password: 'short'
    });
    expect(result.success).toBe(false);
  });
  it('rejects an invalid email on register', () => {
    const result = registerSchema.safeParse({
      fullName: 'John Farmer',
      email: 'not-an-email',
      password: 'securepass123'
    });
    expect(result.success).toBe(false);
  });
  it('rejects reset password with a short token', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'short-token',
      password: 'securepass123'
    });
    expect(result.success).toBe(false);
  });
  it('accepts a valid login payload', () => {
    expect(loginSchema.safeParse({ email: 'john@example.com', password: 'secret' }).success).toBe(true);
  });
  it('accepts refresh with a long token and rejects a short one', () => {
    expect(refreshSchema.safeParse({ refreshToken: 'a'.repeat(20) }).success).toBe(true);
    expect(refreshSchema.safeParse({ refreshToken: 'short' }).success).toBe(false);
  });
  it('rejects invalid email on forgot password', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
  it('allows null phone on update profile', () => {
    expect(updateProfileSchema.safeParse({ phone: null }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ phone: '12' }).success).toBe(false);
  });
});
