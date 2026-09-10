import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, it, expect, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import type { JwtService, OAuthService } from '@verifit/auth';
import type { PrismaService, AuthRepository } from '@verifit/database';
import type { AuditService } from '../audit/audit.service.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<{ accountStatus: string }> = {}) {
  return {
    id: 'user_1',
    email: 'student@example.com',
    organizationId: 'org_1',
    role: 'STUDENT',
    accountStatus: 'ACTIVE',
    ...overrides,
  };
}

function makeJwtService(jti = 'jti_abc') {
  return {
    generateToken: vi.fn().mockReturnValue('signed.jwt.token'),
    createTokenRecordMetadata: vi.fn().mockReturnValue({
      jti,
      expiresAt: new Date(Date.now() + 900_000),
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    }),
    decodeUnverifiedClaims: vi.fn().mockReturnValue({ jti }),
    verifyToken: vi.fn(),
  } as unknown as JwtService;
}

function makeAuthRepository() {
  return {
    createToken: vi.fn().mockResolvedValue({}),
    revoke: vi.fn().mockResolvedValue({}),
    findByJti: vi.fn().mockResolvedValue(null),
    resolveOAuthUser: vi.fn(),
  } as unknown as AuthRepository;
}

function makeOAuthService(resolvedUser: ReturnType<typeof makeUser>) {
  return {
    generateAuthorizationUrl: vi.fn().mockReturnValue({ authorizationUrl: 'https://accounts.google.com/o/oauth2/auth?...' }),
    handleCallback: vi.fn().mockImplementation(
      async (_code: string, _state: string, resolver: (sub: string, email: string) => Promise<unknown>) => {
        const user = await resolver('google_sub_123', resolvedUser.email);
        return { accessToken: 'signed.jwt.token', user };
      },
    ),
  } as unknown as OAuthService;
}

function makePrismaService() {
  return {
    client: {
      $transaction: vi.fn().mockResolvedValue([{}, {}]),
      authToken: { create: vi.fn().mockResolvedValue({}) },
      user: { update: vi.fn().mockResolvedValue({}) },
    },
  } as unknown as PrismaService;
}

function makeAuditService() {
  return { log: vi.fn() } as unknown as AuditService;
}

function makeService(
  overrides: {
    oauthService?: OAuthService | null;
    authRepository?: AuthRepository;
    prisma?: PrismaService;
    jwtService?: JwtService;
    auditService?: AuditService;
  } = {},
) {
  const user = makeUser();
  const authRepository = overrides.authRepository ?? makeAuthRepository();
  const oauthService = overrides.oauthService !== undefined
    ? overrides.oauthService
    : makeOAuthService(user);
  const prisma = overrides.prisma ?? makePrismaService();
  const jwtService = overrides.jwtService ?? makeJwtService();
  const auditService = overrides.auditService ?? makeAuditService();

  const service = new AuthService(
    prisma,
    jwtService,
    authRepository,
    oauthService,
    auditService,
  );

  return { service, user, authRepository, oauthService, prisma, jwtService, auditService };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  describe('initiateLogin', () => {
    it('throws ServiceUnavailableException when OAuth is not configured', () => {
      const { service } = makeService({ oauthService: null });
      expect(() => service.initiateLogin()).toThrow(ServiceUnavailableException);
    });

    it('returns authorizationUrl when OAuth is configured', () => {
      const { service } = makeService();
      const result = service.initiateLogin();
      expect(result.authorizationUrl).toContain('accounts.google.com');
    });
  });

  describe('handleOAuthCallback', () => {
    it('resolves existing user and returns accessToken + user', async () => {
      const user = makeUser();
      const authRepository = makeAuthRepository();
      (authRepository.resolveOAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      const { service } = makeService({ authRepository, oauthService: makeOAuthService(user) });

      const result = await service.handleOAuthCallback('code', 'state', {
        ipAddress: '1.2.3.4',
        userAgent: 'ua',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.id).toBe('user_1');
    });

    it('wraps AuthToken.create and User.update in a single transaction', async () => {
      const user = makeUser();
      const authRepository = makeAuthRepository();
      (authRepository.resolveOAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      const prisma = makePrismaService();
      const { service } = makeService({ authRepository, prisma, oauthService: makeOAuthService(user) });

      await service.handleOAuthCallback('code', 'state');

      expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    });

    it('emits an oauth_login audit event on success', async () => {
      const user = makeUser();
      const authRepository = makeAuthRepository();
      (authRepository.resolveOAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      const auditService = makeAuditService();
      const { service } = makeService({ authRepository, auditService, oauthService: makeOAuthService(user) });

      await service.handleOAuthCallback('code', 'state', { ipAddress: '1.2.3.4' });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'oauth_login', userId: 'user_1' }),
      );
    });

    it('denies unknown user (no OAuthConnection) with ForbiddenException', async () => {
      const authRepository = makeAuthRepository();
      (authRepository.resolveOAuthUser as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('No account found for this Google identity. Contact your administrator.'),
      );
      // OAuthService resolver will call resolveOAuthUser which throws
      const oauthService = {
        handleCallback: vi.fn().mockImplementation(
          async (_c: string, _s: string, resolver: (sub: string, email: string) => Promise<unknown>) => {
            await resolver('unknown_sub', 'nobody@example.com');
          },
        ),
      } as unknown as OAuthService;

      const { service } = makeService({ authRepository, oauthService });

      await expect(service.handleOAuthCallback('code', 'state')).rejects.toThrow(
        'No account found for this Google identity',
      );
    });

    it('denies LOCKED account with ForbiddenException', async () => {
      const lockedUser = makeUser({ accountStatus: 'LOCKED' });
      const authRepository = makeAuthRepository();
      (authRepository.resolveOAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue(lockedUser);
      const oauthService = makeOAuthService(lockedUser);

      const { service } = makeService({ authRepository, oauthService });

      await expect(service.handleOAuthCallback('code', 'state')).rejects.toThrow(ForbiddenException);
    });

    it('throws ServiceUnavailableException when OAuth is not configured', async () => {
      const { service } = makeService({ oauthService: null });
      await expect(service.handleOAuthCallback('code', 'state')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the token by jti', async () => {
      const authRepository = makeAuthRepository();
      const { service } = makeService({ authRepository });

      await service.logout('jti_abc', 'user_1');

      expect(authRepository.revoke).toHaveBeenCalledWith('jti_abc');
    });

    it('emits a logout audit event', async () => {
      const auditService = makeAuditService();
      const { service } = makeService({ auditService });

      await service.logout('jti_abc', 'user_1', { ipAddress: '1.2.3.4' });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'logout', userId: 'user_1' }),
      );
    });
  });

  describe('getMe', () => {
    it('throws NotFoundException when user does not exist', async () => {
      const prisma = makePrismaService();
      (prisma.client as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }).user = {
        findUnique: vi.fn().mockResolvedValue(null),
      };
      const { service } = makeService({ prisma });

      await expect(service.getMe('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('decodeJti', () => {
    it('returns the jti from an unverified token', () => {
      const jwtService = makeJwtService('my_jti');
      const { service } = makeService({ jwtService });

      expect(service.decodeJti('any.token')).toBe('my_jti');
    });
  });
});
