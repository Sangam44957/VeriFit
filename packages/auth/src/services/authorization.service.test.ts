import { describe, it, expect } from 'vitest';
import { AuthorizationService } from './authorization.service.js';
import type { ResourceContext } from './authorization.service.js';

const svc = new AuthorizationService();

const admin = { id: 'user_admin', role: 'ADMIN' as const, organizationId: 'org_a' };
const staff = { id: 'user_staff', role: 'STAFF' as const, organizationId: 'org_a' };
const student = { id: 'user_student', role: 'STUDENT' as const, organizationId: 'org_a' };

const userRes = (overrides?: Partial<ResourceContext>): ResourceContext => ({
  type: 'USER',
  organizationId: 'org_a',
  ...overrides,
});

const studentRes = (overrides?: Partial<ResourceContext>): ResourceContext => ({
  type: 'STUDENT',
  organizationId: 'org_a',
  ...overrides,
});

const orgRes = (overrides?: Partial<ResourceContext>): ResourceContext => ({
  type: 'ORGANIZATION',
  organizationId: 'org_a',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Default-deny invariants
// ---------------------------------------------------------------------------

describe('default-deny', () => {
  it('denies unknown role', () => {
    const result = svc.authorize(
      { id: 'x', role: 'UNKNOWN' as never, organizationId: 'org_a' },
      'READ_USER',
      userRes(),
    );
    expect(result.granted).toBe(false);
  });

  it('denies unknown resource type', () => {
    const result = svc.authorize(admin, 'READ_USER', {
      type: 'PLACEMENT_DRIVE' as never,
      organizationId: 'org_a',
    });
    expect(result.granted).toBe(false);
  });

  it('denies unknown action', () => {
    const result = svc.authorize(admin, 'NUKE_EVERYTHING' as never, userRes());
    expect(result.granted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-organization access (IDOR via org)
// ---------------------------------------------------------------------------

describe('cross-org access', () => {
  it('denies STAFF accessing resource in a different org', () => {
    const result = svc.authorize(staff, 'READ_USER', userRes({ organizationId: 'org_b' }));
    expect(result.granted).toBe(false);
  });

  it('denies STUDENT accessing resource in a different org', () => {
    const result = svc.authorize(student, 'READ_STUDENT', studentRes({ organizationId: 'org_b' }));
    expect(result.granted).toBe(false);
  });

  it('allows ADMIN to access resource in a different org (global scope)', () => {
    const result = svc.authorize(admin, 'READ_USER', userRes({ organizationId: 'org_b' }));
    expect(result.granted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STUDENT self-scope — USER resource
// ---------------------------------------------------------------------------

describe('student USER self-scope', () => {
  it('allows student to read their own user record', () => {
    const result = svc.authorize(student, 'READ_USER', userRes({ resourceId: student.id }));
    expect(result.granted).toBe(true);
  });

  it('denies student reading another user record (IDOR)', () => {
    const result = svc.authorize(student, 'READ_USER', userRes({ resourceId: 'user_other' }));
    expect(result.granted).toBe(false);
  });

  it('denies student who keeps same org but changes resourceId to another user (IDOR — org unchanged)', () => {
    // org matches, but resourceId is a different user — org match alone must not grant access
    const result = svc.authorize(
      student,
      'READ_USER',
      userRes({ organizationId: student.organizationId, resourceId: 'user_other' }),
    );
    expect(result.granted).toBe(false);
  });

  it('allows student READ_USER when resourceId is absent (e.g. resolving own profile)', () => {
    const result = svc.authorize(student, 'READ_USER', userRes());
    expect(result.granted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STUDENT self-scope — STUDENT resource
// Student.id !== User.id; ownership via ownerUserId (student.userId)
// ---------------------------------------------------------------------------

describe('student STUDENT self-scope', () => {
  it('allows student to read their own student record via ownerUserId', () => {
    const result = svc.authorize(
      student,
      'READ_STUDENT',
      studentRes({ resourceId: 'student_abc', ownerUserId: student.id }),
    );
    expect(result.granted).toBe(true);
  });

  it('denies student reading another student record (IDOR via student.id)', () => {
    // resourceId is a different student's id; ownerUserId belongs to someone else
    const result = svc.authorize(
      student,
      'READ_STUDENT',
      studentRes({ resourceId: 'student_other', ownerUserId: 'user_other' }),
    );
    expect(result.granted).toBe(false);
  });

  it('denies student updating another student record', () => {
    const result = svc.authorize(
      student,
      'UPDATE_STUDENT',
      studentRes({ resourceId: 'student_other', ownerUserId: 'user_other' }),
    );
    expect(result.granted).toBe(false);
  });

  it('does NOT assume student.id === user.id — resourceId alone cannot grant access', () => {
    // resourceId happens to equal user.id but ownerUserId is someone else
    const result = svc.authorize(
      student,
      'READ_STUDENT',
      studentRes({ resourceId: student.id, ownerUserId: 'user_other' }),
    );
    expect(result.granted).toBe(false);
  });

  it('allows when ownerUserId is absent (ownership not yet resolved — caller responsibility)', () => {
    // When ownerUserId is not provided, the service cannot deny on that basis
    const result = svc.authorize(student, 'READ_STUDENT', studentRes());
    expect(result.granted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Role-specific action restrictions
// ---------------------------------------------------------------------------

describe('role action restrictions', () => {
  it('denies STUDENT deleting a user', () => {
    const result = svc.authorize(student, 'DELETE_USER', userRes({ resourceId: student.id }));
    expect(result.granted).toBe(false);
  });

  it('denies STUDENT listing users', () => {
    const result = svc.authorize(student, 'LIST_USERS', userRes());
    expect(result.granted).toBe(false);
  });

  it('denies STAFF deleting a student', () => {
    const result = svc.authorize(staff, 'DELETE_STUDENT', studentRes());
    expect(result.granted).toBe(false);
  });

  it('denies STAFF updating an organization', () => {
    const result = svc.authorize(staff, 'UPDATE_ORGANIZATION', orgRes());
    expect(result.granted).toBe(false);
  });

  it('allows ADMIN to delete a student globally', () => {
    const result = svc.authorize(admin, 'DELETE_STUDENT', studentRes({ organizationId: 'org_z' }));
    expect(result.granted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Policy immutability — returned data must not mutate internal policy
// ---------------------------------------------------------------------------

describe('policy immutability', () => {
  it('authorize result cannot mutate internal policy', () => {
    // Call authorize twice; result is a plain object — no shared mutable reference
    const r1 = svc.authorize(staff, 'READ_USER', userRes());
    const r2 = svc.authorize(staff, 'READ_USER', userRes());
    expect(r1.granted).toBe(true);
    expect(r2.granted).toBe(true);
    // Mutating the result object has no effect on subsequent calls
    (r1 as unknown as Record<string, unknown>)['granted'] = false;
    const r3 = svc.authorize(staff, 'READ_USER', userRes());
    expect(r3.granted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Forged organization context
// ---------------------------------------------------------------------------

describe('forged organization context', () => {
  it('denies when resource.organizationId is a client-forged value for a different org', () => {
    // Simulates a client claiming their resource belongs to org_a when it actually belongs to org_b
    // The caller must supply trusted server-side organizationId; here we test the boundary
    const result = svc.authorize(
      { ...staff, organizationId: 'org_b' },
      'READ_USER',
      userRes({ organizationId: 'org_a' }), // resource is in org_a, staff is in org_b
    );
    expect(result.granted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Issue 5 — No implicit role hierarchy
// Permissions are explicit per role/resource/action.
// STAFF does not inherit STUDENT permissions; STUDENT does not inherit from STAFF.
// Each role's policy is fully independent.
// ---------------------------------------------------------------------------

describe('no implicit role hierarchy', () => {
  it('STAFF can LIST_STUDENTS — STUDENT cannot (not inherited downward)', () => {
    expect(svc.authorize(staff, 'LIST_STUDENTS', studentRes()).granted).toBe(true);
    expect(svc.authorize(student, 'LIST_STUDENTS', studentRes()).granted).toBe(false);
  });

  it('STUDENT can UPDATE_STUDENT on own record — STAFF cannot delete (not inherited upward)', () => {
    // STUDENT has UPDATE_STUDENT; STAFF does not have DELETE_STUDENT
    expect(
      svc.authorize(student, 'UPDATE_STUDENT', studentRes({ ownerUserId: student.id })).granted,
    ).toBe(true);
    expect(svc.authorize(staff, 'DELETE_STUDENT', studentRes()).granted).toBe(false);
  });

  it('STAFF cannot do everything ADMIN can — UPDATE_ORGANIZATION is ADMIN-only', () => {
    expect(svc.authorize(admin, 'UPDATE_ORGANIZATION', orgRes()).granted).toBe(true);
    expect(svc.authorize(staff, 'UPDATE_ORGANIZATION', orgRes()).granted).toBe(false);
  });

  it('each role is evaluated independently — no permission bleeds between roles', () => {
    // LIST_ORGANIZATIONS: only ADMIN has it
    expect(svc.authorize(admin, 'LIST_ORGANIZATIONS', orgRes()).granted).toBe(true);
    expect(svc.authorize(staff, 'LIST_ORGANIZATIONS', orgRes()).granted).toBe(false);
    expect(svc.authorize(student, 'LIST_ORGANIZATIONS', orgRes()).granted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Issue 6 — ADMIN is not a bypass; unknown resource/action → DENY for all roles
// ADMIN has explicitly defined global permissions.
// Hitting an unknown resource or action denies even for ADMIN.
// ---------------------------------------------------------------------------

describe('ADMIN is not a bypass — explicit permissions only', () => {
  it('denies ADMIN on a Phase-2 resource type (PLACEMENT_DRIVE) — not in policy', () => {
    const result = svc.authorize(admin, 'READ_USER', {
      type: 'PLACEMENT_DRIVE' as never,
      organizationId: 'org_a',
    });
    expect(result.granted).toBe(false);
  });

  it('denies ADMIN on an unknown action — default-deny applies to ADMIN too', () => {
    const result = svc.authorize(admin, 'EXPORT_ALL_DATA' as never, userRes());
    expect(result.granted).toBe(false);
  });

  it('denies ADMIN on EVIDENCE resource — not in policy', () => {
    const result = svc.authorize(admin, 'READ_USER', {
      type: 'EVIDENCE' as never,
      organizationId: 'org_a',
    });
    expect(result.granted).toBe(false);
  });

  it('denies ADMIN on RANKING resource — not in policy', () => {
    const result = svc.authorize(admin, 'READ_USER', {
      type: 'RANKING' as never,
      organizationId: 'org_a',
    });
    expect(result.granted).toBe(false);
  });

  it('ADMIN global scope only applies to explicitly permitted resource+action pairs', () => {
    // Permitted: READ_USER on any org
    expect(svc.authorize(admin, 'READ_USER', userRes({ organizationId: 'org_z' })).granted).toBe(
      true,
    );
    // Not permitted: unknown action on a known resource
    expect(svc.authorize(admin, 'IMPERSONATE_USER' as never, userRes()).granted).toBe(false);
  });
});
