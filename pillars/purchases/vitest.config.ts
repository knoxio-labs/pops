/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Neither `testTimeout` nor a worker cap is set here, and that is a
     * decision rather than an omission.
     *
     * This pillar accumulated a flake ticket per test: an assortment of
     * supertest files missing vitest's 5s default under load, never
     * reproducing alone, each looking like a contention bug in whatever
     * write path it happened to be exercising. They were one cause, and the
     * cause was the suite's own CPU appetite rather than the clock. Every
     * test opened its own on-disk database and replayed the entire migration
     * journal to do it — ~23ms, over a thousand times a run — and the two
     * heaviest blocks rebuilt an expensive corpus once per test. Those are
     * now built once and copied (see `src/db/__tests__/helpers.ts`), which
     * cut the suite's CPU by a third and took the slowest test from 4.3s to
     * under 1s. The whole suite now sits at least 6x clear of the default.
     *
     * Raising `testTimeout` for the pillar was rejected because it hides
     * exactly what this default is worth having for: a genuine regression
     * that made a 200ms request take six seconds would stop being visible.
     * Capping `maxWorkers`/`fileParallelism` was rejected because it buys
     * the same headroom by making every run slower, CI's included, and it
     * treats the contention as a fact rather than as the removable thing it
     * turned out to be. If a single block is genuinely slow, bound that
     * block where a reader can see the measurement, as `merchant-spend`
     * does for building its corpus.
     */
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
       * later. Raise these when the number rises; do not lower them for
       * convenience — only to correct a threshold that had drifted above
       * what the suite actually reaches, the way `branches` had here.
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
       *
       * `branches` sat below the other three for a while because no CI lane
       * ran this gate for long enough that it rotted unnoticed: three
       * modules (`src/ingest/receipt/anthropic-vision.ts`,
       * `src/api/ai-telemetry-deps.ts`, `src/api/anthropic-key.ts`) had
       * drifted to 0%, which is what actually failed `statements`/
       * `functions`/`lines` too. Covering those three, plus targeted
       * edge-case tests across a dozen adjacent modules, put
       * `statements`/`functions`/`lines` back above their original marks
       * but left `branches` at ~89%, short of the 91% this threshold used
       * to claim. Closing that gap meant a dedicated read for
       * `db/services/reconcile-reads.ts` (the solver's whole view — every
       * scope filter, every eligibility predicate — had no direct test at
       * all), one for `reconcile-links.ts`'s combined-settlement grouping,
       * a unit test for `chargeIdsForPurchases` (exported, never called or
       * tested), the two branches of both error-mapping middlewares, and a
       * currency/name tie-break case in `merchant-spend.ts`. What is left
       * uncovered past that is the genuinely thin edge cases the earlier
       * note describes, plus a handful the ticket that raised this back to
       * 91 flagged as likely unreachable through the public API — those are
       * tracked, not silently accepted.
       */
      thresholds: {
        statements: 95,
        branches: 91,
        functions: 93,
        lines: 96,
      },
    },
  },
});
