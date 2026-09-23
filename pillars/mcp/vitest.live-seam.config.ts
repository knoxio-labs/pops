/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

/**
 * Config for the live cross-pillar seam tests — the ones the default
 * `vitest.config.ts` excludes because they spawn real registry + inventory
 * OS processes over loopback HTTP and run an order of magnitude slower than
 * the mocked-`pillar-client` unit suite. Run via `pnpm test:live-seam`; see
 * `src/tools/__tests__/live-seam-harness.ts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.live-seam.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
