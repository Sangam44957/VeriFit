import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';

export type {
  UserRole,
  AccountStatus,
  JwtPayload,
  TokenRecordMetadata,
  AuthenticatedUser,
  GoogleOAuthProfile,
  OAuthProviderConfig,
  TokenRecord,
  OAuthState,
  AuthResult,
  LoginResponse,
  OAuthStateMetadata,
} from './types/index.js';
export { JwtService } from './services/jwt.service.js';
export type { JwtConfig, TokenSubject } from './services/jwt.service.js';
export { OAuthService, InMemoryOAuthStateStore } from './services/oauth.service.js';
export type { GoogleOAuthConfig, OAuthStateStore } from './services/oauth.service.js';
export { AuthorizationService } from './services/authorization.service.js';
export type {
  ResourceType,
  Action,
  ResourceContext,
  AuthorizationResult,
} from './services/authorization.service.js';

// Keep Role as a convenience alias so existing consumers are unaffected.
export type Role = 'ADMIN' | 'STAFF' | 'STUDENT';

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

export function signJwt(payload: object, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyJwt(token: string, secret: string): object {
  return jwt.verify(token, secret, { algorithms: ['HS256'] }) as object;
}
