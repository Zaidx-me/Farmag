import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';

describe('auth', () => {
  const app = buildApp();
  beforeAll(async () => { await app.ready(); await prisma.user.deleteMany({ where: { email: { endsWith: '@test.dev' } } }); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('registers, logs in, refreshes, and logs out', async () => {
    const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: {
      fullName: 'Test Owner', email: 't1@test.dev', password: 'Password123!' } });
    expect(reg.statusCode).toBe(200);
    expect(reg.json().data.user.email).toBe('t1@test.dev');

    const dup = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: {
      fullName: 'Duplicate Owner', email: 't1@test.dev', password: 'Password123!' } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('DUPLICATE_EMAIL');

    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {
      email: 't1@test.dev', password: 'Password123!' } });
    expect(login.statusCode).toBe(200);
    const { accessToken, refreshToken } = login.json().data.tokens;

    const me = await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: { authorization: `Bearer ${accessToken}` } });
    expect(me.statusCode).toBe(200);

    const badLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {
      email: 't1@test.dev', password: 'wrong' } });
    expect(badLogin.json().error.code).toBe('AUTH_INVALID_CREDENTIALS');

    const refresh = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });
    expect(refresh.statusCode).toBe(200);
    const newToken = refresh.json().data.tokens.refreshToken;
    expect(newToken).not.toBe(refreshToken); // rotated

    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', payload: { refreshToken: newToken } });
    expect(logout.statusCode).toBe(200);
    const reuse = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: newToken } });
    expect(reuse.json().error.code).toBe('TOKEN_INVALID'); // revoked
  });

  it('rejects requests without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me' });
    expect(res.statusCode).toBe(401);
  });
});