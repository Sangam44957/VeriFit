import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] ?? '' });
  return new PrismaClient({ adapter });
}

let _prisma: PrismaClient | undefined;
export function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = createPrismaClient();
  return _prisma;
}

// Lazily-resolved export so tests can import `prisma` without triggering a connection
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export async function main() {
  await getPrisma().organization.upsert({
    where: { name: 'VeriFit Demo University' },
    update: {},
    create: { name: 'VeriFit Demo University' },
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main()
    .catch((e) => {
      console.error('Seed failed:', e instanceof Error ? e.message : String(e));
      process.exit(1);
    })
    .finally(() => getPrisma().$disconnect());
}
