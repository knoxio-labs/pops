import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';

import {
  attachPublishedReleaseReload,
  parseUiRequest,
  publishedBundleFile,
  releaseFor,
  releasePathFor,
  releaseUrl,
  sourceEntry,
  sourceModuleId,
  sourceModuleSource,
  sourcePillarsFrom,
} from './pillar-ui-dev-paths.js';

import type { ServerResponse } from 'node:http';

import type { Plugin, ViteDevServer } from 'vite';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.js': 'application/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function serveSourceEntry(server: ViteDevServer, pillarId: string, res: ServerResponse): void {
  void server
    .transformRequest(sourceModuleId(pillarId))
    .then((result) => {
      if (result === null) throw new Error(`could not transform source entry for '${pillarId}'`);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.end(result.code);
    })
    .catch((error: unknown) => {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(
        `Could not load the source UI for '${pillarId}': ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
    });
}

function configureUiAssets(
  server: ViteDevServer,
  repoRoot: string,
  sourcePillars: ReadonlySet<string>
): void {
  server.watcher.add(path.join(repoRoot, 'pillars'));
  attachPublishedReleaseReload(server.watcher, repoRoot, () =>
    server.ws.send({ type: 'full-reload' })
  );
  server.middlewares.use((req, res, next) => {
    const request = req.url === undefined ? undefined : parseUiRequest(req.url);
    if (request === undefined) return next();
    if (sourcePillars.has(request.pillarId) && request.file === `${request.pillarId}.js`) {
      serveSourceEntry(server, request.pillarId, res);
      return;
    }
    if (sourcePillars.has(request.pillarId) && request.file === `${request.pillarId}.css`) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.end();
      return;
    }
    const file = publishedBundleFile(repoRoot, request);
    if (file === undefined) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(
        `No completed UI bundle for '${request.pillarId}'.\n` +
          `Start its watcher with: pnpm dev:ui -- --pillar ${request.pillarId}\n`
      );
      return;
    }
    if (releasePathFor(request) === undefined) {
      const release = releaseFor(path.join(repoRoot, 'pillars', request.pillarId, 'app'));
      if (release !== undefined) {
        res.statusCode = 302;
        res.setHeader('Location', releaseUrl(request, release));
        res.end();
        return;
      }
    }
    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    createReadStream(file).pipe(res);
  });
}

/**
 * Serve completed pillar remote bundles in shell development and optionally
 * compile selected pillars from source inside the shell's Vite module graph.
 *
 * `POPS_PILLAR_UI_SOURCE=inventory,media` maps only those remote entries and
 * stylesheets to their source files, while retaining the normal registry URL
 * and external loader contract.
 */
export function pillarUiDevPlugin(repoRoot: string): Plugin {
  const sourcePillars = sourcePillarsFrom(process.env.POPS_PILLAR_UI_SOURCE);
  return {
    name: 'pops-pillar-ui-dev',
    apply: 'serve',
    resolveId(id) {
      if (!id.startsWith('\0pops-pillar-ui-source:')) return undefined;
      const pillarId = id.slice('\0pops-pillar-ui-source:'.length);
      return sourcePillars.has(pillarId) ? id : undefined;
    },
    load(id) {
      if (!id.startsWith('\0pops-pillar-ui-source:')) return undefined;
      const pillarId = id.slice('\0pops-pillar-ui-source:'.length);
      const entry = sourceEntry(repoRoot, pillarId);
      if (!existsSync(entry)) throw new Error(`no source remote entry for '${pillarId}'`);
      return sourceModuleSource(repoRoot, pillarId);
    },
    configureServer(server) {
      configureUiAssets(server, repoRoot, sourcePillars);
    },
  };
}

/** Test-only internals; not part of the Vite plugin API. */
export {
  attachPublishedReleaseReload,
  isPublishedReleasePointer,
  parseUiRequest,
  publishedBundleFile,
  releasePathFor,
  releaseUrl,
  reloadForPublishedRelease,
  sourceModuleId,
  sourceModuleSource,
  sourcePillarsFrom,
} from './pillar-ui-dev-paths.js';
