/// <reference types="vitest/config" />
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // `app/` is its own workspace member (`@pops/app-bfm`) with a jsdom
    // environment and its own setup file. Without this it would be swept up
    // by the pillar's node-environment run and fail on a missing `document`.
    // `**/*.live-seam.test.ts` spawns real OS processes and is an order of
    // magnitude slower than this suite; run it via `pnpm test:live-seam`.
    exclude: [...configDefaults.exclude, 'app/**', '**/*.live-seam.test.ts'],
    // The default reporter's per-test detail only prints in the final
    // summary, after every file has finished — if the run is ever killed or
    // its output truncated before that (a CI timeout, a piped command that
    // drops early lines) a failure's name and count are the last thing
    // still visible. Verbose prints each test as it completes, so a failure
    // is named the moment it happens rather than only if the run survives
    // to report it.
    reporters: ['verbose'],
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
         * The process entry point. Excluded because importing it binds a port
         * and installs signal handlers, so it can only be driven by spawning a
         * child — which v8 cannot see from this process, making it read as dead
         * code either way.
         *
         * This is honest only because every boot *decision* was moved out of it
         * into `src/api/boot-env.ts`, which is covered. What remains in
         * `server.ts` is wiring. Move logic back in and this exclusion becomes
         * a lie — extend `boot-env.ts` instead.
         */
        'src/api/server.ts',
      ],
    },
  },
});
