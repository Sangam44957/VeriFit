import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signJwt, verifyJwt, type JwtPayload } from './index.js';

const SECRET = 'test-secret';
const PAYLOAD: JwtPayload = {
  sub: 'user_1',
  jti: 'test-jti',
  iss: 'verifit',
  aud: 'verifit-api',
  email: 'a@example.com',
  role: 'ADMIN',
  organizationId: 'org_1',
};

describe('hashPassword', () => {
  it('returns a hash different from the plain text', async () => {
    const hash = await hashPassword('hunter2');
    expect(hash).not.toBe('hunter2');
  });

  it('produces a different hash on each call (random salt)', async () => {
    const [h1, h2] = await Promise.all([hashPassword('hunter2'), hashPassword('hunter2')]);
    expect(h1).not.toBe(h2);
  });
});

describe('verifyPassword', () => {
  it('returns true for the correct password', async () => {
    const hash = await hashPassword('correct');
    expect(await verifyPassword('correct', hash)).toBe(true);
  });

  it('returns false for a wrong password', async () => {
    const hash = await hashPassword('correct');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('signJwt / verifyJwt', () => {
  it('round-trips a payload', () => {
    const token = signJwt(PAYLOAD, SECRET, '1h');
    const decoded = verifyJwt(token, SECRET) as JwtPayload;
    expect(decoded.sub).toBe(PAYLOAD.sub);
    expect(decoded.email).toBe(PAYLOAD.email);
    expect(decoded.role).toBe(PAYLOAD.role);
  });

  it('throws on a tampered token', () => {
    const token = signJwt(PAYLOAD, SECRET, '1h');
    expect(() => verifyJwt(token + 'x', SECRET)).toThrow();
  });

  it('throws on wrong secret', () => {
    const token = signJwt(PAYLOAD, SECRET, '1h');
    expect(() => verifyJwt(token, 'wrong-secret')).toThrow();
  });

  it('throws on an expired token', async () => {
    const token = signJwt(PAYLOAD, SECRET, '1ms');
    await new Promise((r) => setTimeout(r, 10));
    expect(() => verifyJwt(token, SECRET)).toThrow();
  });
});
