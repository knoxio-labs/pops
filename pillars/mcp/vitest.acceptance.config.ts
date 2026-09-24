/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

/**
 * Config for the inventory-types acceptance suite (POPS-4354): one file per
 * scenario under `src/acceptance/`, each booting its own real registry +
 * inventory (and, where the scenario crosses the phone boundary, a paired
 * bfm) over loopback HTTP. Excluded from the default and live-seam configs;
 * run through `pnpm test:acceptance`, or with evidence packets through
 * `mise run inventory:acceptance` at the repo root.
 *
 * Files run one at a time: every scenario spawns up to three OS processes,
 * and running several stacks at once measures the machine, not the product.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/acceptance/**/*.acceptance.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 90_000,
  },
});
