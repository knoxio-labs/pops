/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

/**
 * Config for the live cross-pillar seam tests — the ones the default
 * `vitest.config.ts` excludes because they spawn real OS processes and run
 * an order of magnitude slower than a unit suite. Run via
 * `pnpm test:live-seam`; see `send-to-list/__tests__/lists-client.live-seam.test.ts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.live-seam.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
