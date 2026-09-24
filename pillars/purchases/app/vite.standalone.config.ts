import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The standalone dev server for `pillars/purchases/app` (POPS-3218).
 *
 * Separate from `vite.remote.config.ts`, which builds the bundle the shell
 * loads: that one externalises React and emits a library, this one is an
 * ordinary app build that bundles everything, because there is no host to
 * share a runtime with. Same source either way — the difference is only what
 * is around it.
 *
 * Mounted in the shell this app gets preflight, the tokens and the kit's
 * utilities from the shell's stylesheet and only its own utilities from
 * `remote.css`. Standalone there is no shell, so `src/standalone/main.tsx`
 * imports the whole theme (`@pops/ui/theme`) as well as `remote.css`.
 *
 * `/purchases-api` is proxied for the `VITE_PURCHASES_API=real` mode only. In
 * the default mocked mode nothing reaches it, because the mock intercepts at
 * `fetch` — so a proxy error in the console means the switch is set to `real`
 * and the pillar is not running.
 *
 * Output goes to `dist/standalone/`, not vite's default `dist/`: the remote
 * build writes `dist/remote/`, and emptying `dist/` would delete the bundle the
 * shell loads.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist/standalone' },
  server: {
    port: 5570,
    strictPort: true,
    proxy: {
      '/purchases-api': {
        target: 'http://localhost:3013',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/purchases-api/, ''),
      },
    },
  },
});
