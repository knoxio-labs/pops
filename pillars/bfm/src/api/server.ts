/**
 * Entry point for the bfm pillar HTTP server.
 *
 * bfm is the Backend-for-Mobile: the single backend the iPhone client talks
 * to. Port 3014 is the next free slot after the existing fleet (see the
 * `Pillars and ports` table in AGENTS.md).
 *
 * When `POPS_REGISTRY_ENABLED=true`, `bootstrapPillar` registers the pillar
 * with the central registry on boot. Registration happens AFTER `app.listen`
 * and never blocks or crashes boot — a registry that is briefly unavailable
 * just means the pillar keeps retrying in the background while already
 * serving traffic. SIGTERM triggers `pillarHandle.stop()` so the heartbeat
 * clears and the registry sees an explicit deregister.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { createBfmApiApp } from './app.js';
import { buildBfmManifest } from './manifest.js';
import { resolveSelfBaseUrl } from './self-base-url.js';

const DEFAULT_PORT = 3014;

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[bfm-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';
const selfBaseUrl = resolveSelfBaseUrl(port);

const app = createBfmApiApp({ version });

const server = app.listen(port, () => {
  console.warn(`[bfm-api] Listening on port ${port}`);
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildBfmManifest(version),
    baseUrl: selfBaseUrl,
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[bfm-api] Shutting down (${signal})`);
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
