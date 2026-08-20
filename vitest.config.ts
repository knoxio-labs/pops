import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['scripts/**/*.test.ts'],
    globalSetup: ['./scripts/ci/__tests__/global-setup.ts'],
  },
});
