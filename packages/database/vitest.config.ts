import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['prisma/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./vitest.setup.ts'],
  },
});
