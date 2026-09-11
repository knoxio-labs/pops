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
        '**/*.d.ts',
        'src/test-setup.ts',
        'src/**/*.stories.{ts,tsx}',
      ],
      /**
       * A ratchet, set just under the level the suite currently reaches
       * (measured statements 62.00%, branches 60.96%, functions 62.86%,
       * lines 64.32%), so a regression fails the gate instead of surfacing
       * months later. Raise these when the number rises; do not lower them
       * for convenience.
       */
      thresholds: {
        lines: 64,
        functions: 62,
        branches: 60,
        statements: 62,
      },
    },
  },
});
