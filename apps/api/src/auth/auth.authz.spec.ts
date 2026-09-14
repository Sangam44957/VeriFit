/**
 * auth.authz.spec.ts
 *
 * Suite D — Authorization / IDOR boundaries.
 *
 * Uses the real AuthorizationService.authorize(user, action, resource) API.
 * No permission-count assertions; every test checks an explicit policy outcome.
 */
import { describe, it, expect } from 'vitest';
import { AuthorizationService } from '@verifit/auth';
import type { ResourceContext } from '@verifit/auth';

const svc = new AuthorizationService();

const org1 = 'org_1';
const org2 = 'org_2';

const student = { id: 'user_student', role: 'STUDENT' as const, organizationId: org1 };
const staff = { id: 'user_staff', role: 'STAFF' as const, organizationId: org1 };
const admin = { id: 'user_admin', role: 'ADMIN' as const, organizationId: org1 };

const studentRes = (o?: Partial<ResourceContext>): ResourceContext => ({
  type: 'STUDENT',
  organizationId: org1,
  ...o,
});

const userRes = (o?: Partial<ResourceContext>): ResourceContext => ({
  type: 'USER',
  organizationId: org1,
  ...o,
});

const orgRes = (o?: Partial<ResourceContext>): ResourceContext => ({
  type: 'ORGANIZATION',
  organizationId: org1,
  ...o,
});

// ---------------------------------------------------------------------------
// STUDENT → own student resource ✅
// ---------------------------------------------------------------------------

describe('STUDENT → own student resource', () => {
  it('grants READ_STUDENT when ownerUserId matches', () => {
    const r = svc.authorize(student, 'READ_STUDENT', studentRes({ ownerUserId: student.id }));
    expect(r.granted).toBe(true);
  });

  it('grants UPDATE_STUDENT when ownerUserId matches', () => {
    const r = svc.authorize(student, 'UPDATE_STUDENT', studentRes({ ownerUserId: student.id }));
    expect(r.granted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STUDENT → another student ❌
// ---------------------------------------------------------------------------

describe('STUDENT → another student (IDOR)', () => {
  it('denies READ_STUDENT when ownerUserId belongs to another user', () => {
    const r = svc.authorize(
      student,
      'READ_STUDENT',
      studentRes({ resourceId: 'student_other', ownerUserId: 'user_other' }),
    );
    expect(r.granted).toBe(false);
  });

  it('denies UPDATE_STUDENT on another student record', () => {
    const r = svc.authorize(
      student,
      'UPDATE_STUDENT',
      studentRes({ resourceId: 'student_other', ownerUserId: 'user_other' }),
    );
    expect(r.granted).toBe(false);
  });

  it('denies DELETE_STUDENT — not in STUDENT policy at all', () => {
    const r = svc.authorize(student, 'DELETE_STUDENT', studentRes({ ownerUserId: student.id }));
    expect(r.granted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// STAFF → own org ✅
// ---------------------------------------------------------------------------

describe('STAFF → own org', () => {
  it('grants READ_STUDENT in own org', () => {
    expect(svc.authorize(staff, 'READ_STUDENT', studentRes()).granted).toBe(true);
  });

  it('grants LIST_STUDENTS in own org', () => {
    expect(svc.authorize(staff, 'LIST_STUDENTS', studentRes()).granted).toBe(true);
  });

  it('grants UPDATE_STUDENT in own org', () => {
    expect(svc.authorize(staff, 'UPDATE_STUDENT', studentRes()).granted).toBe(true);
  });

  it('grants READ_USER in own org', () => {
    expect(svc.authorize(staff, 'READ_USER', userRes()).granted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STAFF → another org ❌
// ---------------------------------------------------------------------------

describe('STAFF → another org (cross-org IDOR)', () => {
  it('denies LIST_STUDENTS in a different org', () => {
    const r = svc.authorize(staff, 'LIST_STUDENTS', studentRes({ organizationId: org2 }));
    expect(r.granted).toBe(false);
  });

  it('denies READ_STUDENT in a different org', () => {
    const r = svc.authorize(staff, 'READ_STUDENT', studentRes({ organizationId: org2 }));
    expect(r.granted).toBe(false);
  });

  it('denies UPDATE_STUDENT in a different org', () => {
    const r = svc.authorize(staff, 'UPDATE_STUDENT', studentRes({ organizationId: org2 }));
    expect(r.granted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ADMIN → permitted global resource ✅
// ---------------------------------------------------------------------------

describe('ADMIN → permitted global resource', () => {
  it('grants DELETE_STUDENT globally (different org)', () => {
    const r = svc.authorize(admin, 'DELETE_STUDENT', studentRes({ organizationId: org2 }));
    expect(r.granted).toBe(true);
  });

  it('grants UPDATE_ORGANIZATION globally', () => {
    const r = svc.authorize(admin, 'UPDATE_ORGANIZATION', orgRes({ organizationId: org2 }));
    expect(r.granted).toBe(true);
  });

  it('grants LIST_ORGANIZATIONS globally', () => {
    expect(svc.authorize(admin, 'LIST_ORGANIZATIONS', orgRes()).granted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Insufficient role ❌
// ---------------------------------------------------------------------------

describe('insufficient role', () => {
  it('denies STAFF DELETE_STUDENT — not in STAFF policy', () => {
    expect(svc.authorize(staff, 'DELETE_STUDENT', studentRes()).granted).toBe(false);
  });

  it('denies STAFF UPDATE_ORGANIZATION — ADMIN-only', () => {
    expect(svc.authorize(staff, 'UPDATE_ORGANIZATION', orgRes()).granted).toBe(false);
  });

  it('denies STUDENT LIST_STUDENTS — not in STUDENT policy', () => {
    expect(svc.authorize(student, 'LIST_STUDENTS', studentRes()).granted).toBe(false);
  });

  it('denies STUDENT DELETE_USER — not in STUDENT policy', () => {
    expect(svc.authorize(student, 'DELETE_USER', userRes({ resourceId: student.id })).granted).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Unknown resource / action ❌
// ---------------------------------------------------------------------------

describe('unknown resource or action → default-deny', () => {
  it('denies any role on an unknown resource type', () => {
    const r = svc.authorize(admin, 'READ_USER', {
      type: 'PLACEMENT_DRIVE' as never,
      organizationId: org1,
    });
    expect(r.granted).toBe(false);
  });

  it('denies any role on an unknown action', () => {
    expect(svc.authorize(admin, 'EXPORT_ALL_DATA' as never, userRes()).granted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Missing resource context ❌
// ---------------------------------------------------------------------------

describe('missing resource context', () => {
  it('denies when organizationId is empty string', () => {
    // An empty organizationId cannot match any user's org
    const r = svc.authorize(staff, 'LIST_STUDENTS', studentRes({ organizationId: '' }));
    expect(r.granted).toBe(false);
  });

  it('denies STUDENT when ownerUserId is present but belongs to another user', () => {
    const r = svc.authorize(
      student,
      'READ_STUDENT',
      studentRes({ ownerUserId: 'user_someone_else' }),
    );
    expect(r.granted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// No implicit role hierarchy — explicit policy only
// ---------------------------------------------------------------------------

describe('no implicit role hierarchy', () => {
  it('STAFF cannot do what only ADMIN can — UPDATE_ORGANIZATION', () => {
    expect(svc.authorize(staff, 'UPDATE_ORGANIZATION', orgRes()).granted).toBe(false);
    expect(svc.authorize(admin, 'UPDATE_ORGANIZATION', orgRes()).granted).toBe(true);
  });

  it('STUDENT cannot do what STAFF can — LIST_STUDENTS', () => {
    expect(svc.authorize(student, 'LIST_STUDENTS', studentRes()).granted).toBe(false);
    expect(svc.authorize(staff, 'LIST_STUDENTS', studentRes()).granted).toBe(true);
  });

  it('ADMIN global scope does not bleed to unknown resources', () => {
    expect(
      svc.authorize(admin, 'READ_USER', { type: 'EVIDENCE' as never, organizationId: org1 })
        .granted,
    ).toBe(false);
  });
});
