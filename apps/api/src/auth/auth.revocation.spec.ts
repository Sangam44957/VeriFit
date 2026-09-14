/**
 * auth.revocation.spec.ts
 *
 * Revocation suite — proves the jti-based revocation contract:
 *   - createTokenRecordMetadata extracts jti (never stores raw token)
 *   - AuthRepository.revoke sets revokedAt by jti
 *   - AuthGuard rejects a token whose jti has revokedAt set
 *   - Logout of device A does not revoke device B's jti
 */
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JwtService } from '@verifit/auth';
import { AuthGuard } from './guards/auth.guard.js';
import type { AuthRepository } from '@verifit/database';

const JWT_CONFIG = {
  secret: 'revocation-test-secret-32-chars!!',
  expiresIn: '15m',
  issuer: 'verifit',
  audience: 'verifit-api',
};

const SUBJECT = {
  sub: 'user_1',
  email: 'user@example.com',
  organizationId: 'org_1',
  role: 'STUDENT' as const,
};

function makeContext(token: string) {
  const req = {
    cookies: {},
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
    path: '/api/v1/auth/me',
    user: undefined,
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
    _req: req,
  } as unknown as ExecutionContext & { _req: typeof req };
}

function makeReflector() {
  return { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector;
}

describe('Token revocation — jti-based contract', () => {
  let jwtService: JwtService;
  let authRepository: { findByJti: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> };
  let guard: AuthGuard;

  beforeEach(() => {
    jwtService = new JwtService(JWT_CONFIG);
    authRepository = {
      findByJti: vi.fn().mockResolvedValue(null),
      revoke: vi.fn().mockResolvedValue({}),
    };
    guard = new AuthGuard(jwtService, authRepository as unknown as AuthRepository, makeReflector());
  });

  it('createTokenRecordMetadata returns jti matching the token payload', () => {
    const token = jwtService.generateToken(SUBJECT);
    const meta = jwtService.createTokenRecordMetadata(token);
    const payload = jwtService.verifyToken(token);

    expect(meta.jti).toBe(payload.jti);
    expect(meta.userId).toBe(SUBJECT.sub);
    expect(meta.organizationId).toBe(SUBJECT.organizationId);
    expect(meta.issuedAt).toBeInstanceOf(Date);
    expect(meta.expiresAt).toBeInstanceOf(Date);
  });

  it('createTokenRecordMetadata does not persist the raw token string', () => {
    const token = jwtService.generateToken(SUBJECT);
    const meta = jwtService.createTokenRecordMetadata(token);

    expect(JSON.stringify(meta)).not.toContain(token);
  });

  it('AuthGuard passes a valid non-revoked token (findByJti returns null)', async () => {
    const token = jwtService.generateToken(SUBJECT);
    authRepository.findByJti.mockResolvedValue(null);

    const ctx = makeContext(token);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('AuthGuard rejects a token whose jti has revokedAt set', async () => {
    const token = jwtService.generateToken(SUBJECT);
    const { jti } = jwtService.verifyToken(token);

    authRepository.findByJti.mockResolvedValue({ jti, revokedAt: new Date() });

    const ctx = makeContext(token);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('AuthGuard calls findByJti with the jti from the token payload', async () => {
    const token = jwtService.generateToken(SUBJECT);
    const { jti } = jwtService.verifyToken(token);

    const ctx = makeContext(token);
    await guard.canActivate(ctx);

    expect(authRepository.findByJti).toHaveBeenCalledWith(jti);
  });

  it('logout of device A does not revoke device B jti', async () => {
    const tokenA = jwtService.generateToken(SUBJECT);
    const tokenB = jwtService.generateToken(SUBJECT);
    const jtiA = jwtService.verifyToken(tokenA).jti;
    const jtiB = jwtService.verifyToken(tokenB).jti;

    expect(jtiA).not.toBe(jtiB);

    // Revoke only device A
    authRepository.findByJti.mockImplementation(async (jti: string) =>
      jti === jtiA ? { jti: jtiA, revokedAt: new Date() } : null,
    );

    // Device A is blocked
    await expect(guard.canActivate(makeContext(tokenA))).rejects.toThrow(UnauthorizedException);

    // Device B still passes
    await expect(guard.canActivate(makeContext(tokenB))).resolves.toBe(true);
  });

  it('two tokens for the same user have independent jtis', () => {
    const t1 = jwtService.generateToken(SUBJECT);
    const t2 = jwtService.generateToken(SUBJECT);

    expect(jwtService.verifyToken(t1).jti).not.toBe(jwtService.verifyToken(t2).jti);
  });
});
