import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './index.js';

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
