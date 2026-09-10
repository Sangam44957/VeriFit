import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import { JwtService, signJwt } from '@verifit/auth';
import type { AuthenticatedUser } from '@verifit/auth';

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
) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ cookies: {}, headers: {}, method: 'GET', path: '/test', ...req }),
    }),
  } as unknown as ExecutionContext;
}

let svc: JwtService;
let guard: AuthGuard;

beforeEach(() => {
  svc = new JwtService(jwtConfig);
  guard = new AuthGuard(svc);
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
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
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
  // Use signJwt from @verifit/auth to craft tokens with missing claims.
  // These tokens have valid signatures but incomplete payloads.
  it('rejects payload without sub', async () => {
    const token = signJwt(
      {
        jti: 'x',
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience,
        email: 'x@x.com',
        organizationId: 'org-1',
        role: 'STUDENT',
      },
      jwtConfig.secret,
      '15m',
    );
    await expect(guard.canActivate(makeContext({ cookies: { jwt: token } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects payload without organizationId', async () => {
    const token = signJwt(
      {
        sub: 'u1',
        jti: 'x',
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience,
        email: 'x@x.com',
        role: 'STUDENT',
      },
      jwtConfig.secret,
      '15m',
    );
    await expect(guard.canActivate(makeContext({ cookies: { jwt: token } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects payload without role', async () => {
    const token = signJwt(
      {
        sub: 'u1',
        jti: 'x',
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience,
        email: 'x@x.com',
        organizationId: 'org-1',
      },
      jwtConfig.secret,
      '15m',
    );
    await expect(guard.canActivate(makeContext({ cookies: { jwt: token } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
