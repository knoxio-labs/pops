import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'vite';

/**
 * Serves a pillar's built UI bundle in dev, at the same path production does.
 *
 * A pillar the shell mounts through its runtime loader advertises a
 * root-relative `assetsBaseUrl` — `/purchases-ui/purchases.js` — which in
 * production is an nginx location proxying to that pillar's static image. The
 * dev server has neither, so without this the one pillar not in the bundle map
 * is the one pillar that does not appear while developing, and the loader path
 * would be exercised by nobody until it reached a deployment.
 *
 * `/<pillar>-ui/<file>` maps to `pillars/<pillar>/app/dist/remote/<file>`,
 * which is what `pnpm --filter @pops/app-<pillar> build` writes. Derived from
 * the request path rather than from a list of which pillars have a UI: a list
 * here is the central enumeration the federation model removes, and it would
 * need an edit for each of the eight pillars still to move.
 *
 * A pillar whose bundle has not been built yet answers 404 with a line saying
 * which command produces it — the shell's `<ErrorBoundary>` then renders its
 * "could not be loaded" placeholder, which is the same degradation a missing
 * bundle produces in production, reached the same way.
 */

/** `/<pillar>-ui/<file>` → the pillar id and the file it names. */
function parseUiRequest(url: string): { pillarId: string; file: string } | undefined {
  const [pathname] = url.split('?');
  if (pathname === undefined) return undefined;
  const match = /^\/([a-z][a-z0-9-]*)-ui\/(.+)$/.exec(pathname);
  const pillarId = match?.[1];
  const encoded = match?.[2];
  if (pillarId === undefined || encoded === undefined) return undefined;

  // Decoded BEFORE the traversal check, not after. `req.url` arrives
  // percent-encoded, so a check on the raw segment reads `%2e%2e%2f` as an
  // ordinary filename and lets it through — and whether that then escapes the
  // directory depends on how the filesystem call decodes it, which is not a
  // property to leave to chance. A segment that will not decode is refused
  // outright rather than passed on in whatever form it arrived.
  let file: string;
  try {
    file = decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
  if (file.includes('\0')) return undefined;
  if (path.posix.normalize(file).startsWith('..')) return undefined;
  return { pillarId, file };
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.js': 'application/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

export function pillarUiDevPlugin(repoRoot: string): Plugin {
  return {
    name: 'pops-pillar-ui-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parsed = req.url === undefined ? undefined : parseUiRequest(req.url);
        if (parsed === undefined) {
          next();
          return;
        }

        const bundleDir = path.join(repoRoot, 'pillars', parsed.pillarId, 'app/dist/remote');
        const file = path.join(bundleDir, parsed.file);
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(
            `No built UI bundle for '${parsed.pillarId}' at ${path.relative(repoRoot, file)}.\n` +
              `Build it with: pnpm --filter @pops/app-${parsed.pillarId} build\n`
          );
          return;
        }

        res.setHeader(
          'Content-Type',
          CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream'
        );
        // Nothing here is hashed from the dev server's point of view and a
        // rebuild replaces the files in place, so every response revalidates.
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        createReadStream(file).pipe(res);
      });
    },
  };
}

/** Exposed for `vite-plugin-pillar-ui-dev.test.ts`; not part of the plugin. */
export const pillarUiDevInternals = { parseUiRequest };
