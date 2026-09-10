import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import jwt from 'jsonwebtoken';
import { JwtService } from '@verifit/auth';
import type { AuthenticatedUser } from '@verifit/auth';
import type { AuthRepository } from '@verifit/database';

// Stub: no token records exist — nothing is revoked.
const stubAuthRepository = {
  findByJti: async () => null,
} as unknown as AuthRepository;

const reflector = new Reflector();

const jwtConfig = {
  secret: 'test-secret-32-chars-minimum-ok!!',
  expiresIn: '15m',
  issuer: 'verifit',
  audience: 'verifit-api',
};

const subject = {
  sub: 'user-123',
  email: 'test@example.com',
  organizationId: 'org-456',
  role: 'STUDENT' as const,
};

function makeContext(
  req: Partial<{
    cookies: Record<string, string>;
    headers: Record<string, string>;
    method: string;
    path: string;
  }>,
  isPublic = false,
) {
  const handler = {};
  const cls = {};
  if (isPublic) {
    Reflect.defineMetadata('is_public', true, handler);
  }
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ cookies: {}, headers: {}, method: 'GET', path: '/test', ...req }),
    }),
  } as unknown as ExecutionContext;
}

let svc: JwtService;
let guard: AuthGuard;

beforeEach(() => {
  svc = new JwtService(jwtConfig);
  guard = new AuthGuard(svc, stubAuthRepository, reflector);
});

describe('AuthGuard — @Public() bypass', () => {
  it('allows request with no token when handler is marked @Public()', async () => {
    expect(await guard.canActivate(makeContext({}, true))).toBe(true);
  });
});

describe('AuthGuard — happy path', () => {
  it('allows valid JWT from cookie', async () => {
    const token = svc.generateToken(subject);
    expect(await guard.canActivate(makeContext({ cookies: { jwt: token } }))).toBe(true);
  });

  it('allows valid JWT from Authorization header', async () => {
    const token = svc.generateToken(subject);
    expect(
      await guard.canActivate(makeContext({ headers: { authorization: `Bearer ${token}` } })),
    ).toBe(true);
  });

  it('attaches strongly typed AuthenticatedUser to req.user', async () => {
    const token = svc.generateToken(subject);
    const req = { cookies: { jwt: token }, headers: {}, method: 'GET', path: '/test' };
    const ctx = makeContext({ cookies: { jwt: token } });
    // Override getRequest to return our tracked req object
    (ctx as unknown as { switchToHttp: () => unknown }).switchToHttp = () => ({
      getRequest: () => req,
    });
    await guard.canActivate(ctx);
    const user = req as unknown as { user: AuthenticatedUser };
    expect(user.user.id).toBe(subject.sub);
    expect(user.user.email).toBe(subject.email);
    expect(user.user.organizationId).toBe(subject.organizationId);
    expect(user.user.role).toBe(subject.role);
    // accountStatus must NOT exist on the principal
    expect('accountStatus' in user.user).toBe(false);
  });
});

describe('AuthGuard — conflicting credentials', () => {
  it('rejects when both cookie and Authorization header are present', async () => {
    const token = svc.generateToken(subject);
    const ctx = makeContext({
      cookies: { jwt: token },
      headers: { authorization: `Bearer ${token}` },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects conflicting identities (cookie=UserA, header=UserB)', async () => {
    const tokenA = svc.generateToken(subject);
    const tokenB = svc.generateToken({ ...subject, sub: 'user-999' });
    const ctx = makeContext({
      cookies: { jwt: tokenA },
      headers: { authorization: `Bearer ${tokenB}` },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthGuard — missing / malformed token', () => {
  it('rejects missing token', async () => {
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects empty Bearer value', async () => {
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer ' } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects Bearer with only whitespace', async () => {
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer    ' } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects non-Bearer scheme (Basic)', async () => {
    const token = svc.generateToken(subject);
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: `Basic ${token}` } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects malformed JWT (not three parts)', async () => {
    await expect(
      guard.canActivate(makeContext({ cookies: { jwt: 'not.a.jwt.at.all' } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects completely invalid string', async () => {
    await expect(guard.canActivate(makeContext({ cookies: { jwt: 'garbage' } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('AuthGuard — invalid / expired token', () => {
  it('rejects tampered signature', async () => {
    const token = svc.generateToken(subject);
    const tampered = token.slice(0, -4) + 'xxxx';
    await expect(guard.canActivate(makeContext({ cookies: { jwt: tampered } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects expired token', async () => {
    const shortSvc = new JwtService({ ...jwtConfig, expiresIn: '1ms' });
    const token = shortSvc.generateToken(subject);
    await new Promise((r) => setTimeout(r, 20));
    await expect(guard.canActivate(makeContext({ cookies: { jwt: token } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects token signed with wrong secret', async () => {
    const otherSvc = new JwtService({ ...jwtConfig, secret: 'completely-different-secret!!' });
    const token = otherSvc.generateToken(subject);
    await expect(guard.canActivate(makeContext({ cookies: { jwt: token } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects token with wrong issuer', async () => {
    const otherSvc = new JwtService({ ...jwtConfig, issuer: 'attacker' });
    const token = otherSvc.generateToken(subject);
    await expect(guard.canActivate(makeContext({ cookies: { jwt: token } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects token with wrong audience', async () => {
    const otherSvc = new JwtService({ ...jwtConfig, audience: 'wrong-audience' });
    const token = otherSvc.generateToken(subject);
    await expect(guard.canActivate(makeContext({ cookies: { jwt: token } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('AuthGuard — missing required claims', () => {
  // Craft tokens with missing claims using jsonwebtoken directly — JwtService
  // enforces the full payload so we bypass it here intentionally.
  it('rejects payload without sub', async () => {
    const token = jwt.sign(
      {
        jti: 'x',
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience,
        email: 'x@x.com',
        organizationId: 'org-1',
        role: 'STUDENT',
      },
      jwtConfig.secret,
      { algorithm: 'HS256', expiresIn: '15m' } as jwt.SignOptions,
    );
    await expect(guard.canActivate(makeContext({ cookies: { jwt: token } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects payload without organizationId', async () => {
    const token = jwt.sign(
      {
        sub: 'u1',
        jti: 'x',
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience,
        email: 'x@x.com',
        role: 'STUDENT',
      },
      jwtConfig.secret,
      { algorithm: 'HS256', expiresIn: '15m' } as jwt.SignOptions,
    );
    await expect(guard.canActivate(makeContext({ cookies: { jwt: token } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects payload without role', async () => {
    const token = jwt.sign(
      {
        sub: 'u1',
        jti: 'x',
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience,
        email: 'x@x.com',
        organizationId: 'org-1',
      },
      jwtConfig.secret,
      { algorithm: 'HS256', expiresIn: '15m' } as jwt.SignOptions,
    );
    await expect(guard.canActivate(makeContext({ cookies: { jwt: token } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
