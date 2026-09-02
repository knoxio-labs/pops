import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';

import { sourcePlugin } from './source-plugin';

const SRC = path.resolve(import.meta.dirname, './src');
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * Local dev reaches a DEPLOYED comment API through this proxy, with the
 * Cloudflare Access service token from the repo-root `.env` attached
 * server-side so it never reaches the browser.
 *
 * No token means no proxy: `/design-api` then 404s, the overlay's identity
 * call fails, and comment mode hides itself. That is the intended state of a
 * plain checkout — the playground itself needs none of this.
 *
 * Point `POPS_DESIGN_FEEDBACK_URL` at a locally-running `design-api` instead
 * to work against your own database; a localhost target ignores the headers.
 */
function commentsProxy(mode: string): Record<string, ProxyOptions> | undefined {
  const env = loadEnv(mode, REPO_ROOT, '');
  const target = env['POPS_DESIGN_FEEDBACK_URL'];
  if (target === undefined || target === '') return undefined;
  const clientId = env['CF_ACCESS_CLIENT_ID'];
  const clientSecret = env['CF_ACCESS_CLIENT_SECRET'];
  return {
    '/design-api': {
      target,
      changeOrigin: true,
      rewrite: (requestPath) => requestPath.replace(/^\/design-api/u, ''),
      ...(clientId === undefined || clientSecret === undefined
        ? {}
        : {
            headers: {
              'CF-Access-Client-Id': clientId,
              'CF-Access-Client-Secret': clientSecret,
            },
          }),
    },
  };
}

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

export default defineConfig(({ mode }) => ({
  // Served behind the shell's nginx at this prefix in production, so the
  // built asset URLs carry it. The dev server honours the same prefix.
  base: '/design/',
  // A subdirectory of `dist/`, not a sibling: `tsc -b tsconfig.build.json`
  // compiles the comment API into `dist/api` and `dist/db`, and vite empties
  // its own output directory on every build — so the two artifacts need
  // separate directories. Nesting rather than a `dist-web/` sibling keeps
  // both under the one path every guard already skips as build output.
  build: { outDir: 'dist/web' },
  plugins: [sourcePlugin(REPO_ROOT), react(), tailwindcss(), watchDesignSurface()],
  resolve: {
    alias: { '@': SRC },
  },
  server: {
    port: 5569,
    strictPort: true,
    host: true,
    proxy: commentsProxy(mode),
  },
}));
