import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { buildFilesRoutes } from '../src/modules/files/routes.js';
import { sanitizeFileName } from '../src/modules/files/service.js';
import type { MinioClientLike } from '../src/modules/files/types.js';
import { registerAuth } from '../src/plugins/auth.js';
import { registerErrorHandler } from '../src/plugins/error-handler.js';

interface TestUser {
  token: string;
  userId: string;
}

async function createUser(app: ReturnType<typeof buildApp>, email: string): Promise<TestUser> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { fullName: 'Test User', email, password: 'Password123!' },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { data: { user: { id: string }; tokens: { accessToken: string } } };
  return { token: body.data.tokens.accessToken, userId: body.data.user.id };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

// Deterministic stub — presigned URL generation is pure local signing (no I/O), but the
// plan mandates DI-mock in tests: the MinIO container is DOWN and tests must be network-free.
const stubClient: MinioClientLike = {
  presignedPutObject: async (_bucket, objectKey) => `https://minio.local/put/${objectKey}`,
  presignedGetObject: async (_bucket, objectKey) => `https://minio.local/get/${objectKey}`,
};

function buildStubFilesApp() {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  registerAuth(app);
  void app.register(buildFilesRoutes(stubClient), { prefix: '/api/v1' });
  return app;
}

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
let farmAId = '';
let farmBId = '';
let ownerUserId = '';
let accountantUserId = '';
let workerUserId = '';
let userBId = '';
let userCId = '';

describe('files', () => {
  const app = buildApp();
  const stubApp = buildStubFilesApp();

  beforeAll(async () => {
    await app.ready();
    await stubApp.ready();
  });

  afterAll(async () => {
    // Self-clean ONLY our own rows by id: farms first (ownerId FK), then the users.
    await prisma.farm.deleteMany({ where: { id: { in: [farmAId, farmBId].filter(Boolean) } } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, accountantUserId, workerUserId, userBId, userCId].filter(Boolean) } },
    });
    await app.close();
    await stubApp.close();
    await prisma.$disconnect();
  });

  it('presigns PUT URLs, enforces ownership/roles, and sanitizes filenames', async () => {
    // 5 register calls; all emails @test.dev unique.
    const owner = await createUser(app, 'files-owner@test.dev');
    const accountant = await createUser(app, 'files-accountant@test.dev');
    const worker = await createUser(app, 'files-worker@test.dev');
    const userB = await createUser(app, 'files-userb@test.dev');
    const userC = await createUser(app, 'files-userc@test.dev');
    ownerUserId = owner.userId;
    accountantUserId = accountant.userId;
    workerUserId = worker.userId;
    userBId = userB.userId;
    userCId = userC.userId;

    // Farm A owned by OWNER; accountant + worker added as members.
    const farmA = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(owner.token),
      payload: { name: 'Files Farm A', location: 'Lahore' },
    });
    expect(farmA.statusCode).toBe(200);
    farmAId = (farmA.json() as { data: { id: string } }).data.id;

    const addMembers = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/members`,
      headers: auth(owner.token),
      payload: {
        members: [
          { userId: accountant.userId, role: 'ACCOUNTANT' },
          { userId: worker.userId, role: 'WORKER' },
        ],
      },
    });
    expect(addMembers.statusCode).toBe(200);

    // Farm B owned by userB — member of farm B only, so a NON-MEMBER of farm A.
    const farmB = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(userB.token),
      payload: { name: 'Files Farm B', location: 'Karachi' },
    });
    expect(farmB.statusCode).toBe(200);
    farmBId = (farmB.json() as { data: { id: string } }).data.id;

    // 1. Presign returns PUT URL (owner + farmId): objectKey prefixed with farmId,
    //    uploadUrl from the stub, method PUT.
    const presign = await stubApp.inject({
      method: 'POST',
      url: '/api/v1/files/presign',
      headers: auth(owner.token),
      payload: { fileName: 'receipt.pdf', contentType: 'application/pdf', farmId: farmAId },
    });
    expect(presign.statusCode).toBe(200);
    const presignBody = presign.json() as { data: { objectKey: string; uploadUrl: string; method: string } };
    expect(presignBody.data.objectKey.startsWith(`${farmAId}/`)).toBe(true);
    expect(presignBody.data.objectKey.endsWith('-receipt.pdf')).toBe(true);
    expect(presignBody.data.method).toBe('PUT');
    expect(presignBody.data.uploadUrl).toBe(`https://minio.local/put/${presignBody.data.objectKey}`);
    const ownerObjectKey = presignBody.data.objectKey;

    // 2. GET presign requires ownership: owner → 200; non-member userB → 404;
    //    no-farm-access userC → 404.
    const ownerGet = await stubApp.inject({
      method: 'GET',
      url: `/api/v1/files/${ownerObjectKey}`,
      headers: auth(owner.token),
    });
    expect(ownerGet.statusCode).toBe(200);
    expect((ownerGet.json() as { data: { downloadUrl: string } }).data.downloadUrl).toBe(
      `https://minio.local/get/${ownerObjectKey}`
    );

    const userBGet = await stubApp.inject({
      method: 'GET',
      url: `/api/v1/files/${ownerObjectKey}`,
      headers: auth(userB.token),
    });
    expect(userBGet.statusCode).toBe(404);

    const userCGet = await stubApp.inject({
      method: 'GET',
      url: `/api/v1/files/${ownerObjectKey}`,
      headers: auth(userC.token),
    });
    expect(userCGet.statusCode).toBe(404);

    // 3. Malformed objectKey → 400 VALIDATION_ERROR (not-a-uuid first segment; empty key).
    const malformed = await stubApp.inject({
      method: 'GET',
      url: '/api/v1/files/not-a-uuid/x.pdf',
      headers: auth(owner.token),
    });
    expect(malformed.statusCode).toBe(400);
    expect((malformed.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    const emptyKey = await stubApp.inject({
      method: 'GET',
      url: '/api/v1/files/',
      headers: auth(owner.token),
    });
    expect(emptyKey.statusCode).toBe(400);

    // 4. Cross-farm objectKey → 404: owner of farm A requests farm B's prefix.
    const crossFarm = await stubApp.inject({
      method: 'GET',
      url: `/api/v1/files/${farmBId}/some-file.pdf`,
      headers: auth(owner.token),
    });
    expect(crossFarm.statusCode).toBe(404);

    // 5. Roles (finance matrix): WORKER presign w/ farmId → 403; ACCOUNTANT → 200.
    const workerPresign = await stubApp.inject({
      method: 'POST',
      url: '/api/v1/files/presign',
      headers: auth(worker.token),
      payload: { fileName: 'r.pdf', contentType: 'application/pdf', farmId: farmAId },
    });
    expect(workerPresign.statusCode).toBe(403);
    expect((workerPresign.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    const accountantPresign = await stubApp.inject({
      method: 'POST',
      url: '/api/v1/files/presign',
      headers: auth(accountant.token),
      payload: { fileName: 'r.pdf', contentType: 'application/pdf', farmId: farmAId },
    });
    expect(accountantPresign.statusCode).toBe(200);

    // 6. Misc path: presign WITHOUT farmId → misc/ prefix; GET open to ANY authenticated
    //    user (no ownership binding — documented openness).
    const miscPresign = await stubApp.inject({
      method: 'POST',
      url: '/api/v1/files/presign',
      headers: auth(worker.token),
      payload: { fileName: 'photo.png', contentType: 'image/png' },
    });
    expect(miscPresign.statusCode).toBe(200);
    const miscKey = (miscPresign.json() as { data: { objectKey: string } }).data.objectKey;
    expect(miscKey.startsWith('misc/')).toBe(true);

    const miscGet = await stubApp.inject({
      method: 'GET',
      url: `/api/v1/files/${miscKey}`,
      headers: auth(worker.token),
    });
    expect(miscGet.statusCode).toBe(200);

    const miscGetOther = await stubApp.inject({
      method: 'GET',
      url: `/api/v1/files/${miscKey}`,
      headers: auth(userC.token),
    });
    expect(miscGetOther.statusCode).toBe(200);

    // 7. Sanitization via objectKey output: traversal attempts collapse to a safe basename.
    const traversalPresign = await stubApp.inject({
      method: 'POST',
      url: '/api/v1/files/presign',
      headers: auth(owner.token),
      payload: { fileName: '../../etc/passwd', contentType: 'text/plain', farmId: farmAId },
    });
    expect(traversalPresign.statusCode).toBe(200);
    const traversalKey = (traversalPresign.json() as { data: { objectKey: string } }).data.objectKey;
    expect(traversalKey.endsWith('-passwd')).toBe(true);
    expect(traversalKey.includes('..')).toBe(false);
  });

  it('sanitizeFileName collapses traversal and overlong names to a safe basename', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('a/b')).toBe('b');
    expect(sanitizeFileName('\\windows\\x')).toBe('x');
    expect(sanitizeFileName('x'.repeat(300))).toHaveLength(255);
    expect(sanitizeFileName('..')).toBe('file');
  });
});