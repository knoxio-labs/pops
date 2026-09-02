import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = { '@': path.resolve(import.meta.dirname, './src') };

/**
 * Two projects, because this pillar has two halves that cannot share an
 * environment. The playground's registry and render tests need jsdom and the
 * React plugin; the comment API and its database run in node against real
 * SQLite files, and loading them under jsdom would give `better-sqlite3` a
 * DOM-shimmed global scope for no reason.
 *
 * Separate from `vite.config.ts` on purpose: the registry tests drive
 * `import.meta.glob` over the real `src/screens` tree, so they need the React
 * plugin and the `@` alias but none of the build's base path or Tailwind.
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'playground',
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/api/**', 'src/db/**', 'node_modules/**', 'dist/**'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'api',
          environment: 'node',
          include: ['src/api/**/*.test.ts', 'src/db/**/*.test.ts'],
        },
      },
    ],
  },
});
