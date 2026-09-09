import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { JwtPayload, TokenRecordMetadata, UserRole } from '../types/index.js';

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  issuer: string;
  audience: string;
}

export interface TokenSubject {
  sub: string;
  email: string;
  organizationId: string;
  role: UserRole;
}

export class JwtService {
  readonly #config: JwtConfig;

  constructor(config: JwtConfig) {
    if (!config.secret) throw new Error('JWT_SECRET is required');
    if (!config.expiresIn) throw new Error('JWT_EXPIRATION is required');
    if (!config.issuer) throw new Error('JWT_ISSUER is required');
    if (!config.audience) throw new Error('JWT_AUDIENCE is required');
    this.#config = config;
  }

  generateToken(subject: TokenSubject): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: subject.sub,
      jti: randomUUID(),
      iss: this.#config.issuer,
      aud: this.#config.audience,
      email: subject.email,
      organizationId: subject.organizationId,
      role: subject.role,
    };
    return jwt.sign(payload, this.#config.secret, {
      algorithm: 'HS256',
      expiresIn: this.#config.expiresIn,
    } as jwt.SignOptions);
  }

  verifyToken(token: string): JwtPayload {
    const decoded = jwt.verify(token, this.#config.secret, {
      algorithms: ['HS256'],
      issuer: this.#config.issuer,
      audience: this.#config.audience,
    });
    return decoded as JwtPayload;
  }

  /** For internal audit/logging only — never use for authorization. */
  decodeUnverifiedClaims(token: string): JwtPayload | null {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded === 'string') return null;
    return decoded as JwtPayload;
  }

  getExpirationDate(token: string): Date | null {
    const claims = this.decodeUnverifiedClaims(token);
    if (!claims?.exp) return null;
    return new Date(claims.exp * 1000);
  }

  getTokenTTL(token: string): number {
    const exp = this.getExpirationDate(token);
    if (!exp) return 0;
    return Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000));
  }

  createTokenRecordMetadata(
    token: string,
    opts?: { userAgent?: string; ipAddress?: string },
  ): TokenRecordMetadata {
    const claims = this.verifyToken(token);
    return {
      jti: claims.jti,
      userId: claims.sub,
      organizationId: claims.organizationId,
      issuedAt: new Date((claims.iat ?? 0) * 1000),
      expiresAt: new Date((claims.exp ?? 0) * 1000),
      ...(opts?.userAgent !== undefined && { userAgent: opts.userAgent }),
      ...(opts?.ipAddress !== undefined && { ipAddress: opts.ipAddress }),
    };
  }
}
