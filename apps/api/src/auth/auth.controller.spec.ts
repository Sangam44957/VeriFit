import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { AuthModule } from './auth.module.js';
import { ConfigModule } from '../config/config.module.js';
import { PrismaService } from '@verifit/database';

const mockUser = {
  id: 'user_1',
  email: 'test@example.com',
  passwordHash: '',
  role: 'STAFF' as const,
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
    process.env.JWT_SECRET = 'test-secret';
    process.env.API_PORT = '3099';
    process.env.CORS_ORIGINS = 'http://localhost:3000';

    prismaMock = makePrismaMock();

    const module = await Test.createTestingModule({
      imports: [ConfigModule, AuthModule],
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
      prismaMock.client.user.create.mockResolvedValue({
        id: 'user_1',
        email: 'new@example.com',
        role: 'STAFF',
      });

      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'new@example.com',
        password: 'password123',
        organizationId: 'org_1',
        role: 'STAFF',
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 'user_1', email: 'new@example.com', role: 'STAFF' });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('409 — duplicate email', async () => {
      prismaMock.client.user.findUnique.mockResolvedValue(mockUser);

      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        organizationId: 'org_1',
        role: 'STAFF',
      });

      expect(res.status).toBe(409);
    });

    it('400 — invalid email', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'not-an-email',
        password: 'password123',
        organizationId: 'org_1',
        role: 'STAFF',
      });

      expect(res.status).toBe(400);
    });

    it('400 — password too short', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'valid@example.com',
        password: 'short',
        organizationId: 'org_1',
        role: 'STAFF',
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
});
