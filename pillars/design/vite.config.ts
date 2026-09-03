import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';

import { sourcePlugin } from './source-plugin';
import { resolveDesignApiProxyConfig } from './src/dev-proxy';

const SRC = path.resolve(import.meta.dirname, './src');
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * Local dev reaches the comment API through this proxy. With no
 * `POPS_DESIGN_FEEDBACK_URL` in the repo-root `.env` it targets a
 * locally-running `design-api` (`pnpm --filter @pops/design dev:api`), which
 * trusts any caller outside production — no credentials needed. If that API
 * is not running, the proxy simply fails to connect, the overlay's identity
 * call fails the same way it always has, and comment mode hides itself.
 *
 * Set `POPS_DESIGN_FEEDBACK_URL` to work against a DEPLOYED API instead; the
 * Cloudflare Access service token from `.env` is then attached server-side so
 * it never reaches the browser.
 */
function commentsProxy(mode: string): Record<string, ProxyOptions> {
  const env = loadEnv(mode, REPO_ROOT, '');
  const { target, headers } = resolveDesignApiProxyConfig(env);
  return {
    '/design-api': {
      target,
      changeOrigin: true,
      rewrite: (requestPath) => requestPath.replace(/^\/design-api/u, ''),
      ...(headers === undefined ? {} : { headers }),
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
