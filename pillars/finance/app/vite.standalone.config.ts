import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The standalone dev server for `pillars/finance/app` (POPS-4587), the same
 * harness `pillars/purchases/app/vite.standalone.config.ts` is.
 *
 * Separate from `vite.remote.config.ts`, which builds the bundle the shell
 * loads: that one externalises React and emits a library, this one is an
 * ordinary app build that bundles everything, because there is no host to
 * share a runtime with. `src/standalone/main.tsx` imports the whole theme
 * (`@pops/ui/theme`) as well as `remote.css`, since there is no shell sheet.
 *
 * Output goes to `dist/standalone/`, not vite's default `dist/`: the remote
 * build writes `dist/remote/`, and emptying `dist/` would delete the bundle the
 * shell loads.
 *
 * The three proxies serve the `VITE_FINANCE_API=real` mode only, at the ports
 * the shell's own dev server uses. In the default mocked mode nothing reaches
 * them, because the mocks intercept at `fetch` — so a proxy error in the
 * console means the switch is set to `real` and a pillar is not running.
 */
const proxyTo = (prefix: string, port: number) => ({
  target: `http://localhost:${port}`,
  changeOrigin: true,
  rewrite: (path: string) => path.replace(new RegExp(`^${prefix}`), ''),
});

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist/standalone' },
  server: {
    port: 5572,
    strictPort: true,
    proxy: {
      '/finance-api': proxyTo('/finance-api', 3004),
      '/contacts-api': proxyTo('/contacts-api', 3010),
      '/purchases-api': proxyTo('/purchases-api', 3013),
    },
  },
});
