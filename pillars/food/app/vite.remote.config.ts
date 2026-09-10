import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { isSharedRuntimeSpecifier, REMOTE_BUILD_DEFINE } from '@pops/pillar-sdk/remote-build';

/**
 * Remote-bundle build for `@pops/app-food`.
 *
 * Produces the single ESM entry the shell's runtime loader imports at the URL
 * the pillar advertises as `assetsBaseUrl`, plus one lazy chunk per page (the
 * `React.lazy` boundaries in `src/routes.tsx` survive the build, so a pillar
 * mounted this way still fetches a page's code on first navigation to it).
 *
 * The package itself stays source-only — `@pops/app-food` resolves to
 * `src/index.ts` for the shell's static bundle map and for every in-repo
 * consumer. This build exists alongside that, not instead of it.
 *
 * Two deliberate absences:
 *
 *   - **No Tailwind plugin.** A loader-mounted pillar renders inside the
 *     shell's document, under the stylesheet the shell already emits, whose
 *     `@source` globs (`libs/ui/src/theme/globals.css`) cover this app's
 *     `src/`. Emitting a second stylesheet here would ship the same rules
 *     twice and give the pillar its own cascade order. A pillar built to run
 *     standalone needs its own theme entry; that is a separate build target,
 *     not this one.
 *   - **No `react` in the output.** Everything on the shared-runtime list is
 *     external, for the reasons `@pops/pillar-sdk/remote-build` documents.
 *     `scripts/build-remote.ts` fails the build if any of it slips in, so the
 *     rule is enforced by the build rather than by review.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/remote',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/remote-entry.ts'),
      formats: ['es'],
      // A stable filename, because it is half of `assetsBaseUrl`: the URL the
      // registry advertises has to survive a rebuild. Cache correctness comes
      // from the entry being served `no-cache` while the hashed chunks beside
      // it stay immutable — the split the shell's own nginx config already
      // runs for `index.html` and `/assets/`.
      fileName: () => 'food.js',
    },
    rollupOptions: {
      external: isSharedRuntimeSpecifier,
    },
  },
  define: {
    ...REMOTE_BUILD_DEFINE,
  },
});
