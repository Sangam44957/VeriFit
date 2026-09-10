import { describe, it, expect, beforeEach } from 'vitest';
import { JwtService, type JwtConfig, type TokenSubject } from './jwt.service.js';

const config: JwtConfig = {
  secret: 'test-secret-32-chars-minimum-ok!',
  expiresIn: '1h',
  issuer: 'verifit',
  audience: 'verifit-api',
};

const subject: TokenSubject = {
  sub: 'user_cuid_01',
  email: 'test@example.com',
  organizationId: 'org_cuid_01',
  role: 'STUDENT',
};

let svc: JwtService;

beforeEach(() => {
  svc = new JwtService(config);
});

describe('constructor', () => {
  it('throws when secret is empty', () => {
    expect(() => new JwtService({ ...config, secret: '' })).toThrow('JWT_SECRET');
  });

  it('throws when expiresIn is empty', () => {
    expect(() => new JwtService({ ...config, expiresIn: '' })).toThrow('JWT_EXPIRATION');
  });

  it('throws when issuer is empty', () => {
    expect(() => new JwtService({ ...config, issuer: '' })).toThrow('JWT_ISSUER');
  });

  it('throws when audience is empty', () => {
    expect(() => new JwtService({ ...config, audience: '' })).toThrow('JWT_AUDIENCE');
  });
});

describe('generateToken', () => {
  it('returns a three-part JWT string', () => {
    const token = svc.generateToken(subject);
    expect(token.split('.')).toHaveLength(3);
  });

  it('preserves all subject claims', () => {
    const token = svc.generateToken(subject);
    const payload = svc.verifyToken(token);
    expect(payload.sub).toBe(subject.sub);
    expect(payload.email).toBe(subject.email);
    expect(payload.organizationId).toBe(subject.organizationId);
    expect(payload.role).toBe(subject.role);
  });

  it('stamps iss and aud', () => {
    const token = svc.generateToken(subject);
    const payload = svc.verifyToken(token);
    expect(payload.iss).toBe(config.issuer);
    expect(payload.aud).toBe(config.audience);
  });

  it('stamps iat and exp', () => {
    const token = svc.generateToken(subject);
    const payload = svc.verifyToken(token);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp).toBeGreaterThan(payload.iat ?? 0);
  });

  it('includes a jti claim', () => {
    const token = svc.generateToken(subject);
    const payload = svc.verifyToken(token);
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti.length).toBeGreaterThan(0);
  });

  it('produces a unique jti for every call', () => {
    const t1 = svc.generateToken(subject);
    const t2 = svc.generateToken(subject);
    expect(svc.verifyToken(t1).jti).not.toBe(svc.verifyToken(t2).jti);
  });
});

describe('verifyToken', () => {
  it('throws on wrong secret', () => {
    const token = svc.generateToken(subject);
    const other = new JwtService({ ...config, secret: 'completely-different-secret!!' });
    expect(() => other.verifyToken(token)).toThrow();
  });

  it('throws on wrong issuer', () => {
    const token = svc.generateToken(subject);
    const other = new JwtService({ ...config, issuer: 'attacker' });
    expect(() => other.verifyToken(token)).toThrow();
  });

  it('throws on wrong audience', () => {
    const token = svc.generateToken(subject);
    const other = new JwtService({ ...config, audience: 'wrong-audience' });
    expect(() => other.verifyToken(token)).toThrow();
  });

  it('throws on expired token', async () => {
    const shortSvc = new JwtService({ ...config, expiresIn: '1ms' });
    const token = shortSvc.generateToken(subject);
    await new Promise((r) => setTimeout(r, 20));
    expect(() => shortSvc.verifyToken(token)).toThrow();
  });

  it('throws on malformed token', () => {
    expect(() => svc.verifyToken('not.a.jwt')).toThrow();
    expect(() => svc.verifyToken('totally-invalid')).toThrow();
  });

  it('throws on tampered signature', () => {
    const token = svc.generateToken(subject);
    const parts = token.split('.');
    expect(() => svc.verifyToken(`${parts[0]}.${parts[1]}.invalidsig`)).toThrow();
  });

  it('rejects a token signed with none algorithm', () => {
    // Craft a header claiming alg:none
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: 'x', jti: 'y', iss: config.issuer, aud: config.audience }),
    ).toString('base64url');
    const noneToken = `${header}.${body}.`;
    expect(() => svc.verifyToken(noneToken)).toThrow();
  });
});

describe('createTokenRecordMetadata', () => {
  it('returns jti, userId, organizationId, issuedAt, expiresAt', () => {
    const token = svc.generateToken(subject);
    const meta = svc.createTokenRecordMetadata(token);
    expect(meta.jti).toBe(svc.verifyToken(token).jti);
    expect(meta.userId).toBe(subject.sub);
    expect(meta.organizationId).toBe(subject.organizationId);
    expect(meta.issuedAt).toBeInstanceOf(Date);
    expect(meta.expiresAt).toBeInstanceOf(Date);
    expect(meta.expiresAt.getTime()).toBeGreaterThan(meta.issuedAt.getTime());
  });

  it('does not contain the raw token string', () => {
    const token = svc.generateToken(subject);
    const meta = svc.createTokenRecordMetadata(token);
    const serialised = JSON.stringify(meta);
    expect(serialised).not.toContain(token);
  });

  it('accepts optional userAgent and ipAddress', () => {
    const token = svc.generateToken(subject);
    const meta = svc.createTokenRecordMetadata(token, {
      userAgent: 'Mozilla/5.0',
      ipAddress: '127.0.0.1',
    });
    expect(meta.userAgent).toBe('Mozilla/5.0');
    expect(meta.ipAddress).toBe('127.0.0.1');
  });
});

describe('getExpirationDate / getTokenTTL', () => {
  it('getExpirationDate returns a future Date for a fresh token', () => {
    const token = svc.generateToken(subject);
    const exp = svc.getExpirationDate(token);
    expect(exp).toBeInstanceOf(Date);
    expect(exp?.getTime()).toBeGreaterThan(Date.now());
  });

  it('getTokenTTL returns a positive number for a fresh token', () => {
    const token = svc.generateToken(subject);
    expect(svc.getTokenTTL(token)).toBeGreaterThan(0);
  });
});

describe('100 concurrent tokens — all jti unique', () => {
  it('generates 100 tokens with 100 distinct jti values', () => {
    const tokens = Array.from({ length: 100 }, () => svc.generateToken(subject));
    const jtis = new Set(tokens.map((t) => svc.verifyToken(t).jti));
    expect(jtis.size).toBe(100);
  });
});
