/**
 * Entry point for the documents pillar HTTP server.
 *
 * The documents pillar owns no domain DB — it bridges paperless-ngx
 * (ADR-035 bridge kind, ADR-039 workstream 13). Port 3012 is the next
 * free slot after the existing fleet (see the `Pillars and ports` table
 * in AGENTS.md).
 *
 * When `POPS_REGISTRY_ENABLED=true`, `bootstrapPillar` registers the
 * pillar with the central registry on boot. Registration happens AFTER
 * `app.listen` and never blocks or crashes boot — a registry that is
 * briefly unavailable just means the pillar keeps retrying in the
 * background while already serving traffic. SIGTERM triggers
 * `pillarHandle.stop()` so the heartbeat clears and the registry sees an
 * explicit deregister.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';
import { resolveSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';

import { createDocumentsApiApp } from './app.js';
import { buildDocumentsManifest } from './manifest.js';

const DEFAULT_PORT = 3012;

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[documents-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';

const selfBaseUrl = resolveSelfBaseUrl({
  envVar: 'DOCUMENTS_SELF_BASE_URL',
  port,
  processLabel: 'documents-api',
});

const app = createDocumentsApiApp({ version, selfBaseUrl });

const server = app.listen(port, () => {
  console.warn(`[documents-api] Listening on port ${port}`);
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildDocumentsManifest(version),
    baseUrl: selfBaseUrl,
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[documents-api] Shutting down (${signal})`);
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
