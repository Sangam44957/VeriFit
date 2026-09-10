import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
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
        delete: vi.fn(),
      },
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
