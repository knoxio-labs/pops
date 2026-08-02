/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'app/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts'],
      /**
       * A ratchet, set just under the level the suite currently reaches, so
       * a change that drops coverage fails rather than being noticed months
       * later. Raise these when the number rises; do not lower them.
       *
       * The global figure is dragged down by two things that are not worth
       * chasing with tests, which is why it sits below the 100% the service
       * layer actually reaches:
       *
       *   `src/api/server.ts` — the process entry point. Covering it means
       *   binding a port and registering with a live registry, which is an
       *   integration concern rather than a unit one.
       *
       *   `src/db/schema/*.ts` — drizzle table declarations. The uncovered
       *   lines are the `(t) => [index(...)]` callbacks, which only run when
       *   drizzle builds DDL. What actually matters there is that the
       *   declarations agree with the hand-written migration, and
       *   `schema-migration-drift.test.ts` asserts exactly that by
       *   introspecting the migrated database.
       */
      thresholds: {
        statements: 85,
        branches: 82,
        functions: 80,
        lines: 85,
      },
    },
  },
});
