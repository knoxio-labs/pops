/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

/**
 * Config for the durability seam tests — the ones the default
 * `vitest.config.ts` excludes because they start a throwaway Redis container
 * and are an order of magnitude slower than a unit suite. Run via
 * `pnpm test:live-seam`; see `src/__tests__/scheduler.live-seam.test.ts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.live-seam.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
