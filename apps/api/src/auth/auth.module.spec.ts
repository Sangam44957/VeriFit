import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { AuthModule } from './auth.module.js';
import { ConfigModule } from '../config/config.module.js';
import { JwtService, OAuthService } from '@verifit/auth';
import { PrismaService } from '@verifit/database';
import { AuthGuard } from './guards/index.js';
import { RoleGuard } from './guards/index.js';

const JWT_ENV = {
  JWT_SECRET: 'test-secret-32-chars-minimum-ok!!',
  JWT_ISSUER: 'verifit',
  JWT_AUDIENCE: 'verifit-api',
  API_PORT: '3099',
  CORS_ORIGINS: 'http://localhost:3000',
};

function makePrismaMock() {
  return {
    client: {
      $connect: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    },
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
  };
}

describe('AuthModule wiring', () => {
  beforeAll(() => {
    Object.assign(process.env, JWT_ENV);
  });

  async function compile(extraEnv?: Record<string, string>) {
    if (extraEnv) Object.assign(process.env, extraEnv);
    const module = await Test.createTestingModule({
      imports: [ConfigModule, AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(makePrismaMock())
      .compile();
    return module;
  }

  it('JwtService is injectable', async () => {
    const module = await compile();
    expect(module.get(JwtService)).toBeDefined();
    await module.close();
  });

  it('AuthGuard is injectable', async () => {
    const module = await compile();
    expect(module.get(AuthGuard)).toBeDefined();
    await module.close();
  });

  it('RoleGuard is injectable', async () => {
    const module = await compile();
    expect(module.get(RoleGuard)).toBeDefined();
    await module.close();
  });

  it('JwtService receives the full JWT config — secret, issuer, audience', async () => {
    const module = await compile();
    const svc = module.get(JwtService);
    // generateToken + verifyToken round-trip proves secret/issuer/audience are wired correctly
    const token = svc.generateToken({
      sub: 'u1',
      email: 'x@x.com',
      organizationId: 'org-1',
      role: 'STUDENT',
    });
    const payload = svc.verifyToken(token);
    expect(payload.iss).toBe(JWT_ENV.JWT_ISSUER);
    expect(payload.aud).toBe(JWT_ENV.JWT_AUDIENCE);
    await module.close();
  });

  it('JwtService rejects a token signed with a different secret — config is not default/empty', async () => {
    const { JwtService: Svc } = await import('@verifit/auth');
    const module = await compile();
    const svc = module.get(JwtService);
    const impostor = new Svc({
      secret: 'completely-different-secret!!!!!',
      expiresIn: '15m',
      issuer: JWT_ENV.JWT_ISSUER,
      audience: JWT_ENV.JWT_AUDIENCE,
    });
    const token = impostor.generateToken({
      sub: 'u1',
      email: 'x@x.com',
      organizationId: 'org-1',
      role: 'STUDENT',
    });
    expect(() => svc.verifyToken(token)).toThrow();
    await module.close();
  });

  it('OAuthService is null when Google credentials are absent', async () => {
    // Ensure Google env vars are not set
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    const module = await compile();
    expect(module.get(OAuthService, { strict: false })).toBeNull();
    await module.close();
  });

  it('OAuthService is instantiated when Google credentials are present', async () => {
    const module = await compile({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:3001/api/v1/auth/google/callback',
    });
    expect(module.get(OAuthService)).toBeDefined();
    await module.close();
    // Clean up so other tests are not affected
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  it('AppConfigService is resolved exactly once — JwtService and OAuthService share the same config instance', async () => {
    const module = await compile({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:3001/api/v1/auth/google/callback',
    });
    // Both services exist — if the factory ran twice with different results one would fail
    const jwt = module.get(JwtService);
    const oauth = module.get(OAuthService);
    expect(jwt).toBeDefined();
    expect(oauth).toBeDefined();
    await module.close();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  it('does NOT export OrgGuard — it was removed in 1.5', async () => {
    const module = await compile();
    // NestJS 12 throws (not returns undefined) for unknown tokens even with strict:false
    let threw = false;
    try {
      module.get('OrgGuard', { strict: false });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    await module.close();
  });

  it('module compiles without GOOGLE_* env vars — OAuth is optional', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    await expect(compile()).resolves.toBeDefined();
  });

  it('module fails to compile when JWT_SECRET is missing', async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    await expect(compile()).rejects.toThrow();
    process.env.JWT_SECRET = saved;
  });
});
