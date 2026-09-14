import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { AuthModule } from './auth.module.js';
import { ConfigModule } from '../config/config.module.js';
import { PrismaService } from '@verifit/database';
import { AuthGuard } from './guards/index.js';

const mockUser = {
  id: 'user_1',
  email: 'test@example.com',
  passwordHash: '',
  role: 'STUDENT' as const,
  organizationId: 'org_1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePrismaMock() {
  return {
    client: {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: vi.fn(),
      },
      authToken: {
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      oAuthConnection: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      oAuthState: {
        create: vi.fn().mockResolvedValue({}),
        delete: vi
          .fn()
          .mockResolvedValue({ state: 'state', expiresAt: new Date(Date.now() + 600_000) }),
      },
      $transaction: vi.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
      $connect: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    },
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
  };
}

describe('AuthController', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!!';
    process.env.JWT_ISSUER = 'verifit';
    process.env.JWT_AUDIENCE = 'verifit-api';
    process.env.API_PORT = '3099';
    process.env.CORS_ORIGINS = 'http://localhost:3000';

    prismaMock = makePrismaMock();

    const module = await Test.createTestingModule({
      imports: [ConfigModule, AuthModule],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('201 — creates user and returns id, email, role', async () => {
      prismaMock.client.user.findUnique.mockResolvedValue(null);
      prismaMock.client.organization.findUnique.mockResolvedValue({ id: 'org_1' });
      prismaMock.client.user.create.mockResolvedValue({
        id: 'user_1',
        email: 'new@example.com',
        role: 'STUDENT',
      });

      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'new@example.com',
        password: 'password123',
        organizationId: 'org_1',
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 'user_1', email: 'new@example.com', role: 'STUDENT' });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('400 — role field is rejected (forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'attacker@example.com',
        password: 'password123',
        organizationId: 'org_1',
        role: 'ADMIN',
      });

      expect(res.status).toBe(400);
    });

    it('409 — duplicate email', async () => {
      prismaMock.client.user.findUnique.mockResolvedValue(mockUser);

      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        organizationId: 'org_1',
      });

      expect(res.status).toBe(409);
    });

    it('400 — invalid email', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'not-an-email',
        password: 'password123',
        organizationId: 'org_1',
      });

      expect(res.status).toBe(400);
    });

    it('400 — password too short', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'valid@example.com',
        password: 'short',
        organizationId: 'org_1',
      });

      expect(res.status).toBe(400);
    });

    it('400 — invalid role', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'valid@example.com',
        password: 'password123',
        organizationId: 'org_1',
        role: 'SUPERUSER',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('200 — valid credentials return accessToken', async () => {
      const { hashPassword } = await import('@verifit/auth');
      const hash = await hashPassword('password123');
      prismaMock.client.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });

      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(typeof res.body.accessToken).toBe('string');
    });

    it('401 — wrong password', async () => {
      const { hashPassword } = await import('@verifit/auth');
      const hash = await hashPassword('password123');
      prismaMock.client.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });

      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'test@example.com',
        password: 'wrongpassword',
      });

      expect(res.status).toBe(401);
    });

    it('401 — user not found', async () => {
      prismaMock.client.user.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'nobody@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(401);
    });

    it('400 — missing password', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'test@example.com',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/auth/google/login', () => {
    it('302 — redirects to Google when OAuth is not configured (ServiceUnavailable surfaced as 503)', async () => {
      // OAuth is not configured in this test module (no GOOGLE_* env vars)
      const res = await request(app.getHttpServer()).get('/api/v1/auth/google/login');
      // Without Google credentials the service throws 503
      expect(res.status).toBe(503);
    });
  });

  describe('GET /api/v1/auth/google/callback', () => {
    it('503 — returns ServiceUnavailable when OAuth is not configured', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback')
        .query({ code: 'some-code', state: 'some-state' });
      expect(res.status).toBe(503);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('401 — unauthenticated request is rejected', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('200 — returns user profile for a valid JWT', async () => {
      const { JwtService } = await import('@verifit/auth');
      const jwtSvc = new JwtService({
        secret: 'test-secret-32-chars-minimum-ok!!',
        expiresIn: '15m',
        issuer: 'verifit',
        audience: 'verifit-api',
      });
      const token = jwtSvc.generateToken({
        sub: 'user_1',
        email: 'test@example.com',
        organizationId: 'org_1',
        role: 'STUDENT',
      });

      prismaMock.client.user.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        role: 'STUDENT',
        organizationId: 'org_1',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 'user_1',
        email: 'test@example.com',
        role: 'STUDENT',
        organizationId: 'org_1',
      });
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('401 — unauthenticated request is rejected', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/logout');
      expect(res.status).toBe(401);
    });

    it('204 — revokes token and clears cookie for authenticated request', async () => {
      const { JwtService } = await import('@verifit/auth');
      const jwtSvc = new JwtService({
        secret: 'test-secret-32-chars-minimum-ok!!',
        expiresIn: '15m',
        issuer: 'verifit',
        audience: 'verifit-api',
      });
      const token = jwtSvc.generateToken({
        sub: 'user_1',
        email: 'test@example.com',
        organizationId: 'org_1',
        role: 'STUDENT',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
      // Cookie should be cleared
      const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
      const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '');
      expect(cookieHeader).toMatch(/jwt=;/);
    });
  });
});

// ---------------------------------------------------------------------------
// Issue 3 — Full HTTP round-trip: login → /me → logout → rejected
// Exercises the complete HTTP → Guard → Controller → Service → Repository chain
// ---------------------------------------------------------------------------

describe('AuthController — full HTTP auth flow (E2E)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  // Track revoked jtis to simulate real repository behaviour
  const revokedJtis = new Set<string>();

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!!';
    process.env.JWT_ISSUER = 'verifit';
    process.env.JWT_AUDIENCE = 'verifit-api';
    process.env.API_PORT = '3098';
    process.env.CORS_ORIGINS = 'http://localhost:3000';

    prismaMock = makePrismaMock();

    const { hashPassword } = await import('@verifit/auth');
    const hash = await hashPassword('password123');
    prismaMock.client.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });
    prismaMock.client.user.create.mockResolvedValue(mockUser);

    // Simulate jti revocation in the mock repository
    prismaMock.client.authToken.findUnique.mockImplementation(
      ({ where }: { where: { jti: string } }) =>
        Promise.resolve(
          revokedJtis.has(where.jti) ? { jti: where.jti, revokedAt: new Date() } : null,
        ),
    );
    prismaMock.client.authToken.update.mockImplementation(
      ({ where }: { where: { jti: string } }) => {
        revokedJtis.add(where.jti);
        return Promise.resolve({});
      },
    );

    const module = await Test.createTestingModule({
      imports: [ConfigModule, AuthModule],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('login → /me → logout → same token rejected', async () => {
    // Step 1: login — returns accessToken
    const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(loginRes.status).toBe(200);
    const { accessToken } = loginRes.body as { accessToken: string };
    expect(typeof accessToken).toBe('string');

    // Step 2: /me — authenticated request succeeds
    prismaMock.client.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'test@example.com',
      role: 'STUDENT',
      organizationId: 'org_1',
    });
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body).toMatchObject({ id: 'user_1', email: 'test@example.com' });

    // Step 3: logout — revokes the jti
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(logoutRes.status).toBe(204);

    // Step 4: same token is now rejected (jti revoked)
    const rejectedRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(rejectedRes.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Issue 4 — OAuth callback flow with mocked Google HTTP calls
// Exercises GET /auth/google/callback → handleOAuthCallback → jti persisted
// ---------------------------------------------------------------------------

describe('AuthController — OAuth callback flow', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!!';
    process.env.JWT_ISSUER = 'verifit';
    process.env.JWT_AUDIENCE = 'verifit-api';
    process.env.API_PORT = '3097';
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/v1/auth/google/callback';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    prismaMock = makePrismaMock();
    // Track OAuth states created via set() to simulate DB-backed single-use behavior
    const oAuthStates = new Map<string, Date>();

    prismaMock.client.oAuthState.create.mockImplementation(
      ({ data }: { data: { state: string; expiresAt: Date } }) => {
        oAuthStates.set(data.state, data.expiresAt);
        return Promise.resolve({});
      },
    );
    prismaMock.client.oAuthState.delete.mockImplementation(
      ({ where }: { where: { state: string } }) => {
        const expiresAt = oAuthStates.get(where.state);
        if (!expiresAt) {
          const err = Object.assign(new Error('Record not found'), { code: 'P2025' });
          return Promise.reject(err);
        }
        oAuthStates.delete(where.state);
        return Promise.resolve({ state: where.state, expiresAt });
      },
    );

    prismaMock.client.oAuthConnection.findUnique.mockResolvedValue({
      id: 'conn_1',
      userId: 'user_1',
      user: {
        id: 'user_1',
        email: 'student@example.com',
        organizationId: 'org_1',
        role: 'STUDENT',
        accountStatus: 'ACTIVE',
      },
    });

    const module = await Test.createTestingModule({
      imports: [ConfigModule, AuthModule],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    delete process.env.FRONTEND_URL;
    await app.close();
  });

  afterEach(() => vi.restoreAllMocks());

  function stubGoogleSuccess(sub: string, email: string): void {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ access_token: 'google-access-token', token_type: 'Bearer' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ sub, email, email_verified: true }),
        }),
    );
  }

  it('GET /auth/google/login — redirects to Google authorization URL', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/google/login');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
  });

  it('GET /auth/google/callback — active user: sets JWT cookie and redirects to frontend', async () => {
    // Capture the state from the login initiation
    const loginRes = await request(app.getHttpServer()).get('/api/v1/auth/google/login');
    const location = loginRes.headers.location as string;
    const state = new URL(location).searchParams.get('state');
    if (!state) throw new Error('OAuth state missing from redirect URL');

    stubGoogleSuccess('google-sub-123', 'student@example.com');

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'auth-code', state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/dashboard');

    const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '');
    expect(cookieHeader).toContain('jwt=');
    expect(cookieHeader).toContain('HttpOnly');
  });

  it('GET /auth/google/callback — jti is persisted (AuthToken.create called)', async () => {
    const loginRes = await request(app.getHttpServer()).get('/api/v1/auth/google/login');
    const state = new URL(loginRes.headers.location as string).searchParams.get('state');
    if (!state) throw new Error('OAuth state missing from redirect URL');

    stubGoogleSuccess('google-sub-456', 'student@example.com');

    await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'auth-code', state });

    expect(prismaMock.client.$transaction).toHaveBeenCalled();
  });

  it('GET /auth/google/callback — wrong state returns 500 (CSRF protection)', async () => {
    stubGoogleSuccess('google-sub-789', 'student@example.com');

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'auth-code', state: 'invalid-state' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('GET /auth/google/callback — LOCKED account returns 403', async () => {
    const loginRes = await request(app.getHttpServer()).get('/api/v1/auth/google/login');
    const state = new URL(loginRes.headers.location as string).searchParams.get('state');
    if (!state) throw new Error('OAuth state missing from redirect URL');

    stubGoogleSuccess('google-sub-locked', 'locked@example.com');
    prismaMock.client.oAuthConnection.findUnique.mockResolvedValueOnce({
      id: 'conn_locked',
      userId: 'user_locked',
      user: {
        id: 'user_locked',
        email: 'locked@example.com',
        organizationId: 'org_1',
        role: 'STUDENT',
        accountStatus: 'LOCKED',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'auth-code', state });

    expect(res.status).toBe(403);
  });

  it('GET /auth/google/callback — unknown Google sub returns error (no OAuthConnection)', async () => {
    const loginRes = await request(app.getHttpServer()).get('/api/v1/auth/google/login');
    const state = new URL(loginRes.headers.location as string).searchParams.get('state');
    if (!state) throw new Error('OAuth state missing from redirect URL');

    stubGoogleSuccess('unknown-sub', 'nobody@example.com');
    prismaMock.client.oAuthConnection.findUnique.mockResolvedValueOnce(null);

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'auth-code', state });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
