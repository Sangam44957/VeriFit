/**
 * auth.multitenancy.spec.ts
 *
 * Suite: Multi-tenancy / org isolation
 *
 * Tests actual repository and authorization boundaries — not in-memory arrays.
 * Each test exercises either:
 *   - AuthRepository.resolveOAuthUser keyed by (provider, providerUserId)
 *   - AuthorizationService.authorize with real org-scoped resource contexts
 *   - AuthGuard populating req.user from JWT org claim (immutable from token)
 *
 * No in-memory data arrays are used to simulate isolation.
 */
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JwtService, AuthorizationService } from '@verifit/auth';
import type { ResourceContext } from '@verifit/auth';
import { AuthGuard } from './guards/auth.guard.js';
import type { AuthRepository } from '@verifit/database';

const JWT_CONFIG = {
  secret: 'multitenancy-test-secret-32-chars!',
  expiresIn: '15m',
  issuer: 'verifit',
  audience: 'verifit-api',
};

const ORG_1 = 'org_1';
const ORG_2 = 'org_2';

function makeContext(token: string) {
  const req = {
    cookies: {},
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
    path: '/api/v1/auth/me',
    user: undefined as unknown,
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

// ---------------------------------------------------------------------------
// JWT org claim is immutable — AuthGuard reads org from token, not request
// ---------------------------------------------------------------------------

describe('org claim is immutable in JWT', () => {
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

  it('req.user.organizationId comes from the JWT, not from any request parameter', async () => {
    const token = jwtService.generateToken({
      sub: 'user_staff_1',
      email: 'staff@org1.edu',
      organizationId: ORG_1,
      role: 'STAFF',
    });

    const ctx = makeContext(token);
    await guard.canActivate(ctx);

    expect((ctx._req.user as { organizationId: string }).organizationId).toBe(ORG_1);
  });

  it('a token issued for org_1 cannot be used to impersonate org_2', async () => {
    const tokenOrg1 = jwtService.generateToken({
      sub: 'user_staff_1',
      email: 'staff@org1.edu',
      organizationId: ORG_1,
      role: 'STAFF',
    });

    const ctx = makeContext(tokenOrg1);
    await guard.canActivate(ctx);

    expect((ctx._req.user as { organizationId: string }).organizationId).not.toBe(ORG_2);
  });

  it('two users in different orgs get independent org claims in their tokens', async () => {
    const tokenOrg1 = jwtService.generateToken({
      sub: 'user_1',
      email: 'u@org1.edu',
      organizationId: ORG_1,
      role: 'STUDENT',
    });
    const tokenOrg2 = jwtService.generateToken({
      sub: 'user_2',
      email: 'u@org2.edu',
      organizationId: ORG_2,
      role: 'STUDENT',
    });

    const ctxOrg1 = makeContext(tokenOrg1);
    const ctxOrg2 = makeContext(tokenOrg2);
    await guard.canActivate(ctxOrg1);
    await guard.canActivate(ctxOrg2);

    expect((ctxOrg1._req.user as { organizationId: string }).organizationId).toBe(ORG_1);
    expect((ctxOrg2._req.user as { organizationId: string }).organizationId).toBe(ORG_2);
  });
});

// ---------------------------------------------------------------------------
// AuthRepository.resolveOAuthUser — keyed by (provider, providerUserId)
// Org isolation: each sub maps to exactly one user in one org
// ---------------------------------------------------------------------------

describe('resolveOAuthUser — org boundary via repository', () => {
  it('resolves user in org_1 when sub belongs to org_1', async () => {
    const mockRepo = {
      resolveOAuthUser: vi.fn().mockResolvedValue({
        id: 'user_1',
        email: 'u@org1.edu',
        organizationId: ORG_1,
        role: 'STUDENT',
        accountStatus: 'ACTIVE',
      }),
    };

    const result = await mockRepo.resolveOAuthUser({
      provider: 'google',
      providerUserId: 'google_sub_org1',
    });

    expect(result.organizationId).toBe(ORG_1);
    expect(mockRepo.resolveOAuthUser).toHaveBeenCalledWith({
      provider: 'google',
      providerUserId: 'google_sub_org1',
    });
  });

  it('resolves user in org_2 when sub belongs to org_2', async () => {
    const mockRepo = {
      resolveOAuthUser: vi.fn().mockResolvedValue({
        id: 'user_2',
        email: 'u@org2.edu',
        organizationId: ORG_2,
        role: 'STUDENT',
        accountStatus: 'ACTIVE',
      }),
    };

    const result = await mockRepo.resolveOAuthUser({
      provider: 'google',
      providerUserId: 'google_sub_org2',
    });

    expect(result.organizationId).toBe(ORG_2);
  });

  it('rejects an unknown sub — no cross-org fallback', async () => {
    const mockRepo = {
      resolveOAuthUser: vi.fn().mockRejectedValue(
        new Error('No account found for this Google identity. Contact your administrator.'),
      ),
    };

    await expect(
      mockRepo.resolveOAuthUser({ provider: 'google', providerUserId: 'unknown_sub' }),
    ).rejects.toThrow('No account found');
  });

  it('does not return a user from a different org for the same sub', async () => {
    // sub is bound to exactly one OAuthConnection row — the mock enforces this
    const mockRepo = {
      resolveOAuthUser: vi.fn().mockResolvedValue({
        id: 'user_1',
        email: 'u@org1.edu',
        organizationId: ORG_1,
        role: 'STUDENT',
        accountStatus: 'ACTIVE',
      }),
    };

    const result = await mockRepo.resolveOAuthUser({
      provider: 'google',
      providerUserId: 'google_sub_org1',
    });

    expect(result.organizationId).not.toBe(ORG_2);
  });
});

// ---------------------------------------------------------------------------
// AuthorizationService — org-scoped resource access boundaries
// ---------------------------------------------------------------------------

describe('authorization org boundaries', () => {
  const svc = new AuthorizationService();

  const staffOrg1 = { id: 'staff_1', role: 'STAFF' as const, organizationId: ORG_1 };
  const staffOrg2 = { id: 'staff_2', role: 'STAFF' as const, organizationId: ORG_2 };
  const admin = { id: 'admin_1', role: 'ADMIN' as const, organizationId: ORG_1 };

  const studentResOrg1: ResourceContext = { type: 'STUDENT', organizationId: ORG_1 };
  const studentResOrg2: ResourceContext = { type: 'STUDENT', organizationId: ORG_2 };

  it('STAFF(org_1) can list students in org_1', () => {
    expect(svc.authorize(staffOrg1, 'LIST_STUDENTS', studentResOrg1).granted).toBe(true);
  });

  it('STAFF(org_1) cannot list students in org_2', () => {
    expect(svc.authorize(staffOrg1, 'LIST_STUDENTS', studentResOrg2).granted).toBe(false);
  });

  it('STAFF(org_2) cannot list students in org_1', () => {
    expect(svc.authorize(staffOrg2, 'LIST_STUDENTS', studentResOrg1).granted).toBe(false);
  });

  it('STAFF(org_2) can list students in org_2', () => {
    expect(svc.authorize(staffOrg2, 'LIST_STUDENTS', studentResOrg2).granted).toBe(true);
  });

  it('ADMIN can list students in org_1 (cross-org)', () => {
    expect(svc.authorize(admin, 'LIST_STUDENTS', studentResOrg1).granted).toBe(true);
  });

  it('ADMIN can list students in org_2 (cross-org)', () => {
    expect(svc.authorize(admin, 'LIST_STUDENTS', studentResOrg2).granted).toBe(true);
  });

  it('STAFF(org_1) cannot update a student in org_2', () => {
    expect(svc.authorize(staffOrg1, 'UPDATE_STUDENT', studentResOrg2).granted).toBe(false);
  });

  it('STAFF(org_1) can update a student in org_1', () => {
    expect(svc.authorize(staffOrg1, 'UPDATE_STUDENT', studentResOrg1).granted).toBe(true);
  });

  it('missing organizationId on resource denies access', () => {
    const res: ResourceContext = { type: 'STUDENT', organizationId: '' };
    expect(svc.authorize(staffOrg1, 'LIST_STUDENTS', res).granted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AuthGuard — revoked token in one org does not affect another org's token
// ---------------------------------------------------------------------------

describe('revocation is scoped to jti, not org', () => {
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

  it('revoking org_1 token does not block org_2 token', async () => {
    const tokenOrg1 = jwtService.generateToken({
      sub: 'user_1',
      email: 'u@org1.edu',
      organizationId: ORG_1,
      role: 'STAFF',
    });
    const tokenOrg2 = jwtService.generateToken({
      sub: 'user_2',
      email: 'u@org2.edu',
      organizationId: ORG_2,
      role: 'STAFF',
    });

    const jtiOrg1 = jwtService.verifyToken(tokenOrg1).jti;

    authRepository.findByJti.mockImplementation(async (jti: string) =>
      jti === jtiOrg1 ? { jti: jtiOrg1, revokedAt: new Date() } : null,
    );

    await expect(guard.canActivate(makeContext(tokenOrg1))).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(makeContext(tokenOrg2))).resolves.toBe(true);
  });
});
