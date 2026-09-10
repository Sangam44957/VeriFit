import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { JwtService } from './jwt.service.js';
import type { LoginResponse, OAuthStateMetadata, UserRole } from '../types/index.js';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// ---------------------------------------------------------------------------
// OAuthStateStore — interface + in-memory default
// ---------------------------------------------------------------------------

export interface OAuthStateStore {
  /** Store state; implementation must enforce TTL. */
  set(state: string, meta: { expiresAt: Date; organizationId?: string }): void;
  /**
   * Atomically consume a state entry.
   * Returns the metadata if valid and not expired, then removes it.
   * Throws if the state is unknown or expired.
   */
  consume(state: string): { expiresAt: Date; organizationId?: string };
}

export class InMemoryOAuthStateStore implements OAuthStateStore {
  readonly #states = new Map<string, { expiresAt: Date; organizationId?: string }>();

  set(state: string, meta: { expiresAt: Date; organizationId?: string }): void {
    this.#states.set(state, meta);
    this.#cleanExpired();
  }

  consume(state: string): { expiresAt: Date; organizationId?: string } {
    const stored = this.#states.get(state);
    if (!stored) throw new Error('Invalid state parameter (CSRF protection)');
    this.#states.delete(state); // delete before expiry check — single-use regardless
    if (stored.expiresAt < new Date())
      throw new Error('State parameter expired. Please restart login.');
    return stored;
  }

  #cleanExpired(): void {
    const now = new Date();
    for (const [key, val] of this.#states) {
      if (val.expiresAt < now) this.#states.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Zod schemas for Google external responses
// ---------------------------------------------------------------------------

const GoogleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  id_token: z.string().optional(),
});

const GoogleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
});

type GoogleTokenResponse = z.infer<typeof GoogleTokenResponseSchema>;
type GoogleUserInfo = z.infer<typeof GoogleUserInfoSchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const SCOPE = 'openid email profile';
const STATE_TTL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// OAuthService
// ---------------------------------------------------------------------------

export class OAuthService {
  readonly #jwtService: JwtService;
  readonly #config: GoogleOAuthConfig;
  readonly #stateStore: OAuthStateStore;

  constructor(
    jwtService: JwtService,
    config: GoogleOAuthConfig,
    stateStore: OAuthStateStore = new InMemoryOAuthStateStore(),
  ) {
    if (!config.clientId || !config.clientSecret || !config.redirectUri) {
      throw new Error('Google OAuth requires clientId, clientSecret, and redirectUri');
    }
    new URL(config.redirectUri); // throws if invalid
    this.#jwtService = jwtService;
    this.#config = config;
    this.#stateStore = stateStore;
  }

  generateAuthorizationUrl(organizationId?: string): {
    authorizationUrl: string;
    state: string;
    expiresAt: Date;
  } {
    const state = randomUUID();
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    this.#stateStore.set(state, { expiresAt, organizationId });

    const params = new URLSearchParams({
      client_id: this.#config.clientId,
      redirect_uri: this.#config.redirectUri,
      response_type: 'code',
      scope: SCOPE,
      state,
    });

    return { authorizationUrl: `${GOOGLE_AUTH_URL}?${params}`, state, expiresAt };
  }

  verifyOAuthState(state: string): OAuthStateMetadata {
    const stored = this.#stateStore.consume(state);
    return { state, expiresAt: stored.expiresAt, organizationId: stored.organizationId };
  }

  async exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.#config.clientId,
        client_secret: this.#config.clientSecret,
        redirect_uri: this.#config.redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
    return GoogleTokenResponseSchema.parse(await res.json());
  }

  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`UserInfo request failed: ${res.status}`);
    return GoogleUserInfoSchema.parse(await res.json());
  }

  async handleCallback(
    code: string,
    state: string,
    resolveUser: (
      googleSub: string,
      email: string,
      organizationId?: string,
    ) => Promise<{ id: string; email: string; organizationId: string; role: UserRole }>,
  ): Promise<LoginResponse> {
    const oauthState = this.verifyOAuthState(state);
    const tokens = await this.exchangeCodeForToken(code);
    const profile = await this.getUserInfo(tokens.access_token);

    if (!profile.email_verified) throw new Error('Google account email is not verified');

    const user = await resolveUser(profile.sub, profile.email, oauthState.organizationId);
    const accessToken = this.#jwtService.generateToken({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    });

    return { accessToken, user };
  }
}
