/**
 * Auth domain types for VeriFit.
 *
 * Role vocabulary mirrors the `Role` enum in packages/database exactly.
 * Product note: STAFF == TPO (Training & Placement Officer).
 */

/** Canonical role — must stay in sync with the Prisma `Role` enum. */
export type UserRole = 'ADMIN' | 'STAFF' | 'STUDENT';

/** Account lifecycle state — mirrors the `AccountStatus` Prisma enum (Task 1.6). */
export type AccountStatus = 'ACTIVE' | 'LOCKED' | 'SUSPENDED';

/**
 * JWT payload — claims encoded inside every issued token.
 * `sub` is User.id (cuid). `jti` is a server-issued unique identifier
 * used for revocation lookup. `iat`/`exp` are stamped by jsonwebtoken.
 */
export interface JwtPayload {
  sub: string;
  jti: string;
  iss: string;
  aud: string;
  email: string;
  organizationId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Metadata stored server-side for revocation support.
 * Contains the jti identifier — never the raw bearer token.
 */
export interface TokenRecordMetadata {
  jti: string;
  userId: string;
  organizationId: string;
  issuedAt: Date;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Authenticated user — hydrated from the validated JWT and attached to
 * the request context by the auth guard.
 * Contains only claims established by the JWT contract.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string;
  role: UserRole;
}

/** Google OAuth profile shape returned by passport-google-oauth20. */
export interface GoogleOAuthProfile {
  id: string;
  displayName: string;
  emails?: Array<{ value: string; verified: boolean }>;
  photos?: Array<{ value: string }>;
  provider: 'google';
}

/** OAuth provider configuration — sourced from env vars, never the DB. */
export interface OAuthProviderConfig {
  provider: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Token record persisted for revocation support.
 * Stores the jti identifier — never the raw bearer token.
 */
export interface TokenRecord {
  id: string;
  userId: string;
  jti: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Transient OAuth state stored in Redis during the redirect flow.
 * Validated on callback to prevent CSRF.
 */
export interface OAuthState {
  state: string;
  expiresAt: Date;
  createdAt: Date;
}

/** Standard result envelope for auth operations. */
export interface AuthResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  timestamp: Date;
}

/** Returned to the client after a successful login (password or OAuth). */
export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    organizationId: string;
    role: UserRole;
  };
}

/** Metadata attached to an in-flight OAuth state entry. */
export interface OAuthStateMetadata {
  state: string;
  expiresAt: Date;
  organizationId?: string;
}
