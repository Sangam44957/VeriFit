import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] ?? '' });
const prisma = new PrismaClient({ adapter });

export async function main() {
  await prisma.organization.upsert({
    where: { name: 'VeriFit Demo University' },
    update: {},
    create: { name: 'VeriFit Demo University' },
  });
}

export { prisma };

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main()
    .catch((e) => {
      console.error('Seed failed:', e instanceof Error ? e.message : String(e));
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
