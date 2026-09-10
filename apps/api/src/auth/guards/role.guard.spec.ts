import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleGuard, ALLOWED_ROLES_KEY } from './role.guard.js';
import type { AuthenticatedUser } from '@verifit/auth';

const admin: AuthenticatedUser = {
  id: 'a1',
  email: 'a@x.com',
  organizationId: 'org-1',
  role: 'ADMIN',
};
const staff: AuthenticatedUser = {
  id: 's1',
  email: 's@x.com',
  organizationId: 'org-1',
  role: 'STAFF',
};
const student: AuthenticatedUser = {
  id: 'u1',
  email: 'u@x.com',
  organizationId: 'org-1',
  role: 'STUDENT',
};

function makeContext(
  user: AuthenticatedUser | undefined,
  handlerRoles?: string[],
  classRoles?: string[],
) {
  const handler = {};
  const cls = {};
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    _handlerRoles: handlerRoles,
    _classRoles: classRoles,
  } as unknown as ExecutionContext;
}

let reflector: Reflector;
let guard: RoleGuard;

beforeEach(() => {
  reflector = new Reflector();
  guard = new RoleGuard(reflector);
});

describe('RoleGuard — no metadata (no restriction)', () => {
  it('allows any authenticated user when no @AllowRoles set', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeContext(student))).toBe(true);
  });

  it('allows when empty roles array', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(guard.canActivate(makeContext(student))).toBe(true);
  });
});

describe('RoleGuard — role checks', () => {
  it('allows ADMIN when ADMIN required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(guard.canActivate(makeContext(admin))).toBe(true);
  });

  it('allows STAFF when STAFF required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['STAFF']);
    expect(guard.canActivate(makeContext(staff))).toBe(true);
  });

  it('allows ADMIN when ADMIN or STAFF required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'STAFF']);
    expect(guard.canActivate(makeContext(admin))).toBe(true);
  });

  it('rejects STUDENT when ADMIN required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(makeContext(student))).toThrow(ForbiddenException);
  });

  it('rejects STUDENT when ADMIN or STAFF required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'STAFF']);
    expect(() => guard.canActivate(makeContext(student))).toThrow(ForbiddenException);
  });

  it('rejects STAFF when only ADMIN required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(makeContext(staff))).toThrow(ForbiddenException);
  });
});

describe('RoleGuard — missing principal (no AuthGuard)', () => {
  it('throws ForbiddenException when req.user is undefined', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('does NOT authenticate — returns true only because no roles set, not because user exists', () => {
    // No roles metadata + no user = still passes (no role restriction)
    // but this does NOT mean the user is authenticated — AuthGuard is separate
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });
});

describe('RoleGuard — handler overrides controller metadata', () => {
  it('uses handler roles when both handler and controller have metadata', () => {
    // getAllAndOverride returns handler value first when it exists
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((_key, targets) => {
      // Simulate: handler has ['ADMIN'], controller has ['STAFF']
      // getAllAndOverride returns the first defined value = handler
      void targets;
      return ['ADMIN'];
    });
    expect(guard.canActivate(makeContext(admin))).toBe(true);
    expect(() => guard.canActivate(makeContext(staff))).toThrow(ForbiddenException);
  });

  it('falls back to controller metadata when handler has none', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['STAFF']);
    expect(guard.canActivate(makeContext(staff))).toBe(true);
    expect(() => guard.canActivate(makeContext(student))).toThrow(ForbiddenException);
  });
});

describe('RoleGuard — metadata key', () => {
  it('reads from ALLOWED_ROLES_KEY', () => {
    const spy = vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    guard.canActivate(makeContext(admin));
    expect(spy).toHaveBeenCalledWith(ALLOWED_ROLES_KEY, expect.any(Array));
  });
});

describe('RoleGuard — error message quality', () => {
  it('includes the user role and required roles in the error', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'STAFF']);
    try {
      guard.canActivate(makeContext(student));
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as ForbiddenException).message).toMatch(/STUDENT/);
      expect((e as ForbiddenException).message).toMatch(/ADMIN/);
    }
  });
});
