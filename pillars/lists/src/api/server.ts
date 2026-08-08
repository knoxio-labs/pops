import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';
import { resolveSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';

/**
 * Entry point for the lists pillar HTTP server.
 *
 * The process opens its OWN `lists.db` connection via `openListsDb`
 * rather than sharing one — each pillar owns its database.
 *
 * When `POPS_REGISTRY_ENABLED=true`, `bootstrapPillar` registers the
 * pillar with the central registry on boot. Registration happens AFTER
 * `app.listen` and never blocks or crashes boot — a registry that is
 * briefly unavailable just means the pillar keeps retrying in the
 * background while already serving traffic. SIGTERM triggers
 * `pillarHandle.stop()` so the heartbeat clears and the registry sees an
 * explicit deregister.
 */
import { openListsDb } from '../db/index.js';
import { createListsApiApp } from './app.js';
import { resolveListsSqlitePath } from './lists-sqlite-path.js';
import { buildListsManifest } from './manifest.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3006;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[lists-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';
const selfBaseUrl = resolveSelfBaseUrl({
  envVar: 'LISTS_SELF_BASE_URL',
  port,
  processLabel: 'lists-api',
});

const listsDb = openListsDb(resolveListsSqlitePath());
const app = createListsApiApp({ listsDb, version, selfBaseUrl });

const server = app.listen(port, () => {
  console.warn(`[lists-api] Listening on port ${port}`);
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildListsManifest(version),
    baseUrl: selfBaseUrl,
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[lists-api] Shutting down (${signal})`);
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      listsDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
