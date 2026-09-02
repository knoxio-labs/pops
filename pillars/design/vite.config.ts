import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const SRC = path.resolve(import.meta.dirname, './src');

/**
 * The registry discovers screens and experiments with `import.meta.glob`
 * (see `src/registry/catalog.ts`). The dev watcher only emits add/unlink
 * events for paths it already watches, so without this a long-running dev
 * server never re-evaluates the globs when a screen file is created — the
 * new screen 404s until a manual restart.
 */
function watchDesignSurface(): Plugin {
  return {
    name: 'pops-design-watch-surface',
    configureServer(server) {
      server.watcher.add([
        path.join(SRC, 'screens'),
        path.join(SRC, 'experiments'),
        path.join(SRC, 'fixtures'),
      ]);
    },
  };
}

export default defineConfig({
  // Served behind the shell's nginx at this prefix in production, so the
  // built asset URLs carry it. The dev server honours the same prefix.
  base: '/design/',
  plugins: [react(), tailwindcss(), watchDesignSurface()],
  resolve: {
    alias: { '@': SRC },
  },
  server: {
    port: 5569,
    strictPort: true,
    host: true,
  },
});
