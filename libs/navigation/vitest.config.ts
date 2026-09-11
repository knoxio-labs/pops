/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.{ts,tsx}',
        'src/test-setup.ts',
        'src/**/*.stories.{ts,tsx}',
      ],
      /**
       * A ratchet, set just under the level the suite currently reaches
       * (measured statements 92.07%, branches 86.58%, functions 95.65%,
       * lines 93.33%), so a regression fails the gate instead of surfacing
       * months later. Raise these when the number rises; do not lower them
       * for convenience.
       */
      thresholds: {
        lines: 93,
        functions: 95,
        branches: 86,
        statements: 92,
      },
    },
  },
});
