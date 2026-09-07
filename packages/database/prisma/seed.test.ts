import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main, prisma } from './seed.js';

describe('seed idempotency', () => {
  beforeAll(async () => {
    await main();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates VeriFit Demo University', async () => {
    const org = await prisma.organization.findUnique({
      where: { name: 'VeriFit Demo University' },
    });
    expect(org).not.toBeNull();
    expect(org?.name).toBe('VeriFit Demo University');
  });

  it('is idempotent — running seed twice leaves exactly one record', async () => {
    await main();
    const count = await prisma.organization.count({
      where: { name: 'VeriFit Demo University' },
    });
    expect(count).toBe(1);
  });
});
