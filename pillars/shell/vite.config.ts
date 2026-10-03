import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

import { createDevApiProxy } from './dev-api-proxy.ts';
import { pillarUiDevPlugin } from './vite-plugin-pillar-ui-dev';
import { sharedRuntimePlugin } from './vite-plugin-shared-runtime';

/**
 * When `POPS_REGISTRY_SNAPSHOT` is set, alias `@pops/module-registry` to the
 * snapshot file so the shell consumes a build-specific install set. Unset in
 * production and default dev builds.
 */
const registrySnapshot = process.env.POPS_REGISTRY_SNAPSHOT;

const usingSnapshot = registrySnapshot !== undefined && registrySnapshot.length > 0;

const registryAlias = usingSnapshot
  ? { '@pops/module-registry': path.resolve(registrySnapshot) }
  : {};

/**
 * Per-variant Vite dep-bundle cache. Each `POPS_REGISTRY_SNAPSHOT`
 * value gets its own `node_modules/.vite-<slug>` directory derived from
 * the snapshot file's basename so concurrent shell servers built from
 * different snapshots never share a pre-bundled `@pops/module-registry`.
 */
const snapshotSlug = usingSnapshot
  ? path.basename(registrySnapshot, path.extname(registrySnapshot)).replace(/[^a-zA-Z0-9_-]+/g, '-')
  : undefined;

const cacheDir = snapshotSlug
  ? path.resolve(__dirname, `node_modules/.vite-${snapshotSlug}`)
  : undefined;

export default defineConfig({
  cacheDir,
  define: {
    __BUILD_VERSION__: JSON.stringify(
      process.env.BUILD_VERSION && process.env.BUILD_VERSION !== 'dev'
        ? `f${process.env.BUILD_VERSION}`
        : 'dev'
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    sharedRuntimePlugin(),
    pillarUiDevPlugin(path.resolve(__dirname, '../..')),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...registryAlias,
    },
  },
  server: {
    port: 5568,
    strictPort: true,
    host: true,
    clearScreen: false,
    hmr: {
      host: 'localhost',
    },
    proxy: {
      // The registry pillar (formerly named `core`, port 3001) serves a REST
      // contract. The shell's generated registry Hey API client and the boot
      // install-set resolver both target the shell's `/registry-api` path (see
      // `src/registry-api-runtime-config.ts`); the boot fetch hits
      // `GET /registry-api/registry/pillars` before first render. Local targets
      // strip the prefix; a remote target keeps it for the live shell proxy.
      // Without this proxy the dev boot fetch 404s and the shell silently falls
      // through to the static floor — masking the registry-driven branch.
      // Mirrors `/media-api`.
      '/registry-api': createDevApiProxy('http://localhost:3001', '/registry-api'),
      '/lists-api': createDevApiProxy('http://localhost:3006', '/lists-api'),
      '/inventory-api': createDevApiProxy('http://localhost:3002', '/inventory-api'),
      '/finance-api': createDevApiProxy('http://localhost:3004', '/finance-api'),
      '/food-api': createDevApiProxy('http://localhost:3005', '/food-api'),
      '/media-api': createDevApiProxy('http://localhost:3003', '/media-api'),
      '/cerebrum-api': createDevApiProxy('http://localhost:3007', '/cerebrum-api'),
      '/ai-api': createDevApiProxy('http://localhost:3008', '/ai-api'),
      '/contacts-api': createDevApiProxy('http://localhost:3010', '/contacts-api'),
      '/purchases-api': createDevApiProxy('http://localhost:3013', '/purchases-api'),
      '/bfm-api': createDevApiProxy('http://localhost:3014', '/bfm-api'),
      '/barcode-api': createDevApiProxy('http://localhost:3016', '/barcode-api'),
      // The design playground's comment API. The shell itself never calls it —
      // the playground does — but nginx routes the prefix, and the drift test
      // holds this file to routing every prefix nginx does.
      '/design-api': createDevApiProxy('http://localhost:3015', '/design-api'),
      // The orchestrator (ADR-029, epic 06) federates search over the pillars
      // and serves `POST /search` at root. The shell's global search panel
      // (`@pops/navigation` useSearchInputData) posts to `/orchestrator-api/search`;
      // strip the prefix so the orchestrator router sees its natural `/search`.
      // Mirrors the `/<pillar>-api` proxies above.
      '/orchestrator-api': createDevApiProxy('http://localhost:3009', '/orchestrator-api'),
      // The cerebrum query stream uses `/api/cerebrum`. This MUST precede
      // the bare `/api` rule below, which otherwise sends its request to the
      // legacy monolith upstream (3000).
      '/api/cerebrum': createDevApiProxy('http://localhost:3007', undefined),
      '/media/images': createDevApiProxy('http://localhost:3003', undefined),
      '/inventory/documents': createDevApiProxy('http://localhost:3000', undefined),
      // ADR-026 P3: shell-side pillar boot calls GET /pillars and
      // GET /pillars/health on the legacy monolith upstream.
      '/pillars': createDevApiProxy('http://localhost:3000', undefined),
      '/api': createDevApiProxy('http://localhost:3000', undefined),
    },
  },
});
