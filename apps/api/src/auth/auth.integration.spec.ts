/**
 * auth.integration.spec.ts
 *
 * Full JWT round-trip integration test:
 *   generate → verify (guard passes) → revoke → reject (guard blocks)
 *
 * Uses a real JwtService and AuthGuard wired together with a mock
 * AuthRepository — no HTTP server required.
 */
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JwtService } from '@verifit/auth';
import { AuthGuard } from './guards/auth.guard.js';
import type { AuthRepository } from '@verifit/database';

const JWT_CONFIG = {
  secret: 'integration-test-secret-32-chars!!',
  expiresIn: '15m',
  issuer: 'verifit',
  audience: 'verifit-api',
};

function makeRequest(token: string) {
  return {
    cookies: {},
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
    path: '/api/v1/auth/me',
    user: undefined,
  };
}

function makeContext(token: string) {
  const req = makeRequest(token);
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
    _req: req,
  } as unknown as ExecutionContext & { _req: ReturnType<typeof makeRequest> };
}

function makeReflector(isPublic = false) {
  return { getAllAndOverride: vi.fn().mockReturnValue(isPublic) } as unknown as Reflector;
}

describe('JWT round-trip integration', () => {
  let jwtService: JwtService;
  let authRepository: { findByJti: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> };
  let guard: AuthGuard;

  beforeEach(() => {
    jwtService = new JwtService(JWT_CONFIG);
    authRepository = {
      findByJti: vi.fn().mockResolvedValue(null), // not revoked by default
      revoke: vi.fn().mockResolvedValue({}),
    };
    guard = new AuthGuard(jwtService, authRepository as unknown as AuthRepository, makeReflector());
  });

  it('generate — produces a verifiable JWT with a jti claim', () => {
    const token = jwtService.generateToken({
      sub: 'user_1',
      email: 'u@example.com',
      organizationId: 'org_1',
      role: 'STUDENT',
    });

    const claims = jwtService.decodeUnverifiedClaims(token);
    expect(typeof claims?.jti).toBe('string');
    expect(claims?.jti?.length).toBeGreaterThan(0);
  });

  it('verify — AuthGuard passes a valid, non-revoked token and populates req.user', async () => {
    const token = jwtService.generateToken({
      sub: 'user_1',
      email: 'u@example.com',
      organizationId: 'org_1',
      role: 'STUDENT',
    });

    const ctx = makeContext(token);
    const allowed = await guard.canActivate(ctx);

    expect(allowed).toBe(true);
    expect(ctx._req.user).toMatchObject({ id: 'user_1', email: 'u@example.com' });
  });

  it('revoke → reject — AuthGuard blocks a token whose jti is revoked', async () => {
    const token = jwtService.generateToken({
      sub: 'user_1',
      email: 'u@example.com',
      organizationId: 'org_1',
      role: 'STUDENT',
    });

    const claims = jwtService.decodeUnverifiedClaims(token);
    if (!claims?.jti) throw new Error('Expected jti in token claims');
    const jti = claims.jti;

    // Simulate revocation: repository now returns a record with revokedAt set
    authRepository.findByJti.mockResolvedValue({ jti, revokedAt: new Date() });

    const ctx = makeContext(token);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('reject — AuthGuard blocks a tampered / invalid token', async () => {
    const ctx = makeContext('header.payload.badsignature');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('reject — AuthGuard blocks an expired token', async () => {
    const expiredJwt = new JwtService({ ...JWT_CONFIG, expiresIn: '0s' });
    const token = expiredJwt.generateToken({
      sub: 'user_1',
      email: 'u@example.com',
      organizationId: 'org_1',
      role: 'STUDENT',
    });

    // Small delay to ensure expiry
    await new Promise((r) => setTimeout(r, 10));

    const ctx = makeContext(token);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
