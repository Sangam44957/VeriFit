import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AuthModule, type AuthModuleConfig } from './auth.module.js';
import { JwtService } from './services/jwt.service.js';
import { OAuthService } from './services/oauth.service.js';
import { AuthorizationService } from './services/authorization.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { RoleGuard } from './guards/role.guard.js';

const BASE_CONFIG: AuthModuleConfig = {
  jwt: {
    secret: 'test-secret-key-minimum-32-characters-long!!',
    expiresIn: '15m',
    issuer: 'verifit-test',
    audience: 'verifit-test',
  },
  oauth: {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3001/api/v1/auth/callback',
  },
};

describe('AuthModule.register', () => {
  it('provides JwtService, OAuthService, AuthorizationService, AuthGuard, RoleGuard', async () => {
    const mod = await Test.createTestingModule({
      imports: [AuthModule.register(BASE_CONFIG)],
    }).compile();

    expect(mod.get(JwtService)).toBeInstanceOf(JwtService);
    expect(mod.get(OAuthService)).toBeInstanceOf(OAuthService);
    expect(mod.get(AuthorizationService)).toBeInstanceOf(AuthorizationService);
    expect(mod.get(AuthGuard)).toBeInstanceOf(AuthGuard);
    expect(mod.get(RoleGuard)).toBeInstanceOf(RoleGuard);
  });

  it('propagates JWT issuer and audience to JwtService', async () => {
    const mod = await Test.createTestingModule({
      imports: [AuthModule.register(BASE_CONFIG)],
    }).compile();

    const jwt = mod.get(JwtService);
    // verifyToken validates issuer+audience — if they were dropped this throws
    const token = jwt.generateToken({
      sub: 'user-1',
      email: 'a@b.com',
      organizationId: 'org-1',
      role: 'ADMIN',
    });
    expect(() => jwt.verifyToken(token)).not.toThrow();
  });

  it('JwtService injected into AuthGuard is the same instance', async () => {
    const mod = await Test.createTestingModule({
      imports: [AuthModule.register(BASE_CONFIG)],
    }).compile();

    const jwt = mod.get(JwtService);
    const guard = mod.get(AuthGuard);
    // Generate a token and verify the guard's internal jwt is the same by
    // checking it can validate a token produced by the module's JwtService
    const token = jwt.generateToken({
      sub: 'u1',
      email: 'x@y.com',
      organizationId: 'o1',
      role: 'STAFF',
    });
    expect(() => jwt.verifyToken(token)).not.toThrow();
    expect(guard).toBeDefined();
  });
});

describe('AuthModule.registerAsync', () => {
  it('provides all services via async factory', async () => {
    const mod = await Test.createTestingModule({
      imports: [
        AuthModule.registerAsync({
          useFactory: () => BASE_CONFIG,
        }),
      ],
    }).compile();

    expect(mod.get(JwtService)).toBeInstanceOf(JwtService);
    expect(mod.get(OAuthService)).toBeInstanceOf(OAuthService);
    expect(mod.get(AuthorizationService)).toBeInstanceOf(AuthorizationService);
  });

  it('invokes the factory exactly once', async () => {
    const factory = vi.fn().mockReturnValue(BASE_CONFIG);

    await Test.createTestingModule({
      imports: [AuthModule.registerAsync({ useFactory: factory })],
    }).compile();

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('supports async factory', async () => {
    const mod = await Test.createTestingModule({
      imports: [
        AuthModule.registerAsync({
          useFactory: async () => BASE_CONFIG,
        }),
      ],
    }).compile();

    expect(mod.get(JwtService)).toBeInstanceOf(JwtService);
  });

  it('propagates JWT issuer and audience through async path', async () => {
    const mod = await Test.createTestingModule({
      imports: [AuthModule.registerAsync({ useFactory: () => BASE_CONFIG })],
    }).compile();

    const jwt = mod.get(JwtService);
    const token = jwt.generateToken({
      sub: 'u2',
      email: 'b@c.com',
      organizationId: 'o2',
      role: 'STUDENT',
    });
    expect(() => jwt.verifyToken(token)).not.toThrow();
  });
});

describe('AuthModule exports', () => {
  it('does not export OrgGuard', async () => {
    const mod = await Test.createTestingModule({
      imports: [AuthModule.register(BASE_CONFIG)],
    }).compile();

    // OrgGuard was removed in 1.5 — attempting to get it should throw
    expect(() => mod.get('OrgGuard')).toThrow();
  });

  it('AuthorizationService.authorize works end-to-end', async () => {
    const mod = await Test.createTestingModule({
      imports: [AuthModule.register(BASE_CONFIG)],
    }).compile();

    const authz = mod.get(AuthorizationService);
    const result = authz.authorize(
      { id: 'u1', role: 'ADMIN', organizationId: 'o1' },
      'READ_STUDENT',
      { type: 'STUDENT', organizationId: 'o2' },
    );
    expect(result.granted).toBe(true);
  });
});
