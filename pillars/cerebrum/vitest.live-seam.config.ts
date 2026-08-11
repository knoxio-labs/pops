/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

/**
 * Config for the live cross-pillar seam tests — the ones the default
 * `vitest.config.ts` excludes because they spawn real OS processes and run
 * an order of magnitude slower than a unit suite. Run via
 * `pnpm test:live-seam`; see
 * `retrieval/__tests__/peer-clients.live-seam.test.ts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.live-seam.test.ts'],
    testTimeout: 45_000,
    hookTimeout: 45_000,
  },
});
