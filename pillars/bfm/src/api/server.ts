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
 *
 * Outbound cross-pillar auth is the opposite bargain and is configured BEFORE
 * `listen`: a bfm holding no service-account key cannot do the one thing it
 * exists for, so a missing key crashes here rather than surfacing later as a
 * failed call on somebody's phone.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { createBfmApiApp } from './app.js';
import { resolvePort, resolveSelfBaseUrl, resolveVersion, shouldSelfRegister } from './boot-env.js';
import { buildBfmManifest } from './manifest.js';
import { configureBfmServerSdk } from './pillars/sdk-config.js';

const port = resolvePort();
const version = resolveVersion();

// Resolved before `listen` and unconditionally — including when registration
// is disabled — so a misconfigured origin fails the deploy that introduced it
// rather than the later one that flips POPS_REGISTRY_ENABLED on.
const selfBaseUrl = resolveSelfBaseUrl(port);

configureBfmServerSdk();

const app = createBfmApiApp({ version });

const server = app.listen(port, () => {
  console.warn(`[bfm-api] Listening on port ${port}`);
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (shouldSelfRegister()) {
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
