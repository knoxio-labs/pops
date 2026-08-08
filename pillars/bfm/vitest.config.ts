/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
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
