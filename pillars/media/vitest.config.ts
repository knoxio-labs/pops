/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * No `testTimeout` and no worker cap, which is a decision rather than an
     * omission — the same one `pillars/purchases/vitest.config.ts` records at
     * length, reached here for the same reason and not restated.
     *
     * This pillar collected its own flake tickets against vitest's 5s default:
     * `discovery.test.ts` timing out mid-run, and the same file's seeding POST
     * answering a 403 no handler in this pillar can produce. Both were the
     * transport rather than the clock. Handed a bare Express app, supertest
     * binds a fresh server per request and superagent dials a fresh connection
     * for each, so a response can outlive the ephemeral server it belonged to.
     * Every API suite here now goes through `src/api/__tests__/test-http.ts` —
     * one pre-listened server per file, one pooled connection — and
     * `test-http.test.ts` pins that mechanically.
     *
     * So the timeout stayed at 5s on purpose: it is what makes a genuine
     * regression visible, and raising it would have hidden the cost that was
     * actually removed. Measured after the change, `discovery.test.ts` runs
     * twelve consecutive times green under eight deliberate spin loops, its
     * assertions taking ~600ms of a 5000ms budget (POPS-1909).
     */
    environment: 'node',
    exclude: [...configDefaults.exclude, 'app/**', 'overlay-ego/**'],
    // Reliability: the many client suites stub `globalThis.fetch` via
    // `vi.stubGlobal`. Auto-restore stubbed globals/mocks after every test,
    // and run test files sequentially, so a fetch stub from one suite can
    // never bleed into a DB-only suite running concurrently (the source of
    // an intermittent cross-file 401 / enrichment flake).
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts'],
    },
  },
});
