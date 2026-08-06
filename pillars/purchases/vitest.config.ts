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
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        /**
         * The process entry point. It IS tested — `two-process.test.ts`
         * spawns it and drives the real thing over a socket — but v8
         * collects coverage from this process only, so a child's execution
         * is invisible here and the file reads as dead code.
         *
         * Excluded rather than threshold-shaved so the number keeps meaning
         * what it says about the modules it does measure. Logic was moved
         * OUT of this file (`reconcile/config.ts`) precisely so what remains
         * is wiring rather than decisions.
         */
        'src/api/server.ts',
      ],
      /**
       * A ratchet, set just under the level the suite currently reaches, so
       * a change that drops coverage fails rather than being noticed months
       * later. Raise these when the number rises; do not lower them.
       *
       * The global figure sits below the 100% the service layer reaches
       * because of `src/db/schema/*.ts` — drizzle table declarations, whose
       * uncovered lines are the `(t) => [index(...)]` callbacks that only
       * run when drizzle builds DDL. What matters there is that the
       * declarations agree with the hand-written migration, and
       * `schema-migration-drift.test.ts` asserts exactly that by
       * introspecting the migrated database.
       *
       * `src/api/server.ts` used to be the other drag. It is now excluded
       * instead, because it stopped being untested — see the note on that
       * exclusion above.
       */
      thresholds: {
        statements: 95,
        branches: 91,
        functions: 91,
        lines: 96,
      },
    },
  },
});
