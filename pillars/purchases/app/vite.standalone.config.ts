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
 * Tailwind is included here and deliberately not there. Mounted in the shell
 * this app renders under the stylesheet the shell emits, whose `@source` globs
 * already cover `pillars/**` (`libs/ui/src/theme/globals.css`); standalone
 * there is no shell, so the theme entry has to be compiled here — which is
 * what `@pops/ui/theme` in `src/standalone/main.tsx` asks for.
 *
 * `/purchases-api` is proxied for the `VITE_PURCHASES_API=real` mode only. In
 * the default mocked mode nothing reaches it, because the mock intercepts at
 * `fetch` — so a proxy error in the console means the switch is set to `real`
 * and the pillar is not running.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
