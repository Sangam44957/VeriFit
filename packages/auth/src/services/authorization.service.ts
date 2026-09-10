import type { UserRole } from '../types/index.js';

// ---------------------------------------------------------------------------
// Resource & Action vocabulary — only currently-established resources
// ---------------------------------------------------------------------------

export type ResourceType = 'USER' | 'STUDENT' | 'ORGANIZATION';

export type Action =
  | 'READ_USER'
  | 'UPDATE_USER'
  | 'DELETE_USER'
  | 'LIST_USERS'
  | 'READ_STUDENT'
  | 'UPDATE_STUDENT'
  | 'DELETE_STUDENT'
  | 'LIST_STUDENTS'
  | 'READ_ORGANIZATION'
  | 'UPDATE_ORGANIZATION'
  | 'LIST_ORGANIZATIONS';

// ---------------------------------------------------------------------------
// Authorization context
//
// resourceOrgId MUST come from trusted server-side resource data.
// It must never be a client-supplied organization identifier.
//
// For STUDENT resources, ownership is established through the trusted
// student.userId relationship — not by comparing resourceId to user.id.
// ---------------------------------------------------------------------------

export interface ResourceContext {
  type: ResourceType;
  /** Trusted server-side organization that owns this resource. */
  organizationId: string;
  /** The resource's own id (e.g. User.id or Student.id). */
  resourceId?: string;
  /**
   * For STUDENT resources only: the User.id that owns this student record.
   * Must be populated from trusted server-side data (student.userId).
   */
  ownerUserId?: string;
}

export interface AuthorizationResult {
  granted: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Permission matrix — explicit per role/resource/action, no hierarchy
// ---------------------------------------------------------------------------

interface Permission {
  role: UserRole;
  resource: ResourceType;
  actions: ReadonlyArray<Action>;
  /** true = any org; false = same org as authenticated user only */
  global: boolean;
}

const POLICY: ReadonlyArray<Permission> = Object.freeze([
  // ADMIN — explicit global permissions; unknown resource/action still denies
  {
    role: 'ADMIN',
    resource: 'USER',
    actions: Object.freeze(['READ_USER', 'UPDATE_USER', 'DELETE_USER', 'LIST_USERS'] as const),
    global: true,
  },
  {
    role: 'ADMIN',
    resource: 'STUDENT',
    actions: Object.freeze([
      'READ_STUDENT',
      'UPDATE_STUDENT',
      'DELETE_STUDENT',
      'LIST_STUDENTS',
    ] as const),
    global: true,
  },
  {
    role: 'ADMIN',
    resource: 'ORGANIZATION',
    actions: Object.freeze([
      'READ_ORGANIZATION',
      'UPDATE_ORGANIZATION',
      'LIST_ORGANIZATIONS',
    ] as const),
    global: true,
  },

  // STAFF — org-scoped operational permissions
  {
    role: 'STAFF',
    resource: 'USER',
    actions: Object.freeze(['READ_USER', 'LIST_USERS'] as const),
    global: false,
  },
  {
    role: 'STAFF',
    resource: 'STUDENT',
    actions: Object.freeze([
      'READ_STUDENT',
      'UPDATE_STUDENT',
      'LIST_STUDENTS',
    ] as const),
    global: false,
  },
  {
    role: 'STAFF',
    resource: 'ORGANIZATION',
    actions: Object.freeze(['READ_ORGANIZATION'] as const),
    global: false,
  },

  // STUDENT — self-scoped permissions only
  {
    role: 'STUDENT',
    resource: 'USER',
    actions: Object.freeze(['READ_USER'] as const),
    global: false,
  },
  {
    role: 'STUDENT',
    resource: 'STUDENT',
    actions: Object.freeze(['READ_STUDENT', 'UPDATE_STUDENT'] as const),
    global: false,
  },
  {
    role: 'STUDENT',
    resource: 'ORGANIZATION',
    actions: Object.freeze(['READ_ORGANIZATION'] as const),
    global: false,
  },
]);

// ---------------------------------------------------------------------------
// AuthorizationService
// ---------------------------------------------------------------------------

/**
 * AuthorizationService does not own durable audit persistence.
 * Audit integration is handled through the audit layer.
 */
export class AuthorizationService {
  /**
   * Evaluate whether the authenticated user may perform `action` on `resource`.
   *
   * Default-deny: any unknown role, resource, or action returns granted=false.
   * Never throws — callers receive a typed result and decide how to surface it.
   */
  authorize(
    user: { id: string; role: UserRole; organizationId: string },
    action: Action,
    resource: ResourceContext,
  ): AuthorizationResult {
    const entry = POLICY.find((p) => p.role === user.role && p.resource === resource.type);

    if (!entry) {
      return { granted: false, reason: `No policy for role=${user.role} resource=${resource.type}` };
    }

    if (!(entry.actions as ReadonlyArray<string>).includes(action)) {
      return { granted: false, reason: `Action ${action} not permitted for role=${user.role}` };
    }

    if (!entry.global && resource.organizationId !== user.organizationId) {
      return { granted: false, reason: 'Cross-organization access denied' };
    }

    // STUDENT self-scope checks
    if (user.role === 'STUDENT') {
      if (resource.type === 'USER') {
        // A student may only read their own user record
        if (resource.resourceId !== undefined && resource.resourceId !== user.id) {
          return { granted: false, reason: 'Students may only access their own user record' };
        }
      }

      if (resource.type === 'STUDENT') {
        // Ownership is established through student.userId, not student.id === user.id
        if (resource.ownerUserId !== undefined && resource.ownerUserId !== user.id) {
          return { granted: false, reason: 'Students may only access their own student record' };
        }
      }
    }

    return { granted: true, reason: 'Permitted' };
  }
}
