import * as argon2 from 'argon2';

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
export { AuthGuard } from './guards/index.js';
export { RoleGuard } from './guards/index.js';
export { AllowRoles, ALLOW_ROLES_KEY, CurrentUser } from './decorators/index.js';
export { AuthModule } from './auth.module.js';
export type { AuthModuleConfig } from './auth.module.js';

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
