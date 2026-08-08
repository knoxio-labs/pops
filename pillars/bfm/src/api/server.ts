/**
 * Entry point for the bfm pillar HTTP server.
 *
 * bfm is the Backend-for-Mobile: the single backend the iPhone client talks
 * to. Port 3014 is the next free slot after the existing fleet (see the
 * `Pillars and ports` table in AGENTS.md).
 *
 * The process opens its OWN `bfm.db` connection — each pillar owns its
 * database.
 *
 * When `POPS_REGISTRY_ENABLED=true`, `bootstrapPillar` registers the pillar
 * with the central registry on boot. Registration happens AFTER `app.listen`
 * and never blocks or crashes boot — a registry that is briefly unavailable
 * just means the pillar keeps retrying in the background while already
 * serving traffic. SIGTERM triggers `pillarHandle.stop()` so the heartbeat
 * clears and the registry sees an explicit deregister.
 *
 * Three things take the opposite bargain and are done BEFORE `listen`, all
 * because the container healthcheck cannot see them:
 *
 *   - Outbound cross-pillar auth. A bfm holding no service-account key cannot
 *     do the one thing it exists for, so a missing key crashes here rather
 *     than surfacing later as a failed call on somebody's phone.
 *   - The access-token signing key. The same bargain from the other
 *     direction: without it bfm cannot authenticate the phone asking, and
 *     every `/mobile/*` request would fail on a handset rather than on the
 *     deploy that broke it.
 *   - The database. Migrations run on the way up, and a pillar that answers
 *     `/health` with an unmigrated or unwritable `bfm.db` would pass its
 *     healthcheck and fail every device the moment one paired.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { openBfmDb } from '../db/index.js';
import { createBfmApiApp } from './app.js';
import { resolveAccessTokenSigningKey } from './auth/signing-key.js';
import {
  resolvePort,
  resolvePublicBaseUrl,
  resolveSelfBaseUrl,
  resolveSqlitePath,
  resolveVersion,
  shouldSelfRegister,
} from './boot-env.js';
import { createMobileFinanceClient } from './finance/client.js';
import { buildBfmManifest } from './manifest.js';
import { createPillarGateway } from './pillars/gateway.js';
import { configureBfmServerSdk } from './pillars/sdk-config.js';

const port = resolvePort();
const version = resolveVersion();

// Resolved before `listen` and unconditionally — including when registration
// is disabled — so a misconfigured origin fails the deploy that introduced it
// rather than the later one that flips POPS_REGISTRY_ENABLED on.
const selfBaseUrl = resolveSelfBaseUrl(port);
const publicBaseUrl = resolvePublicBaseUrl(port);

const sdkConfig = configureBfmServerSdk();

const accessTokenSigningKey = resolveAccessTokenSigningKey();

const sqlitePath = resolveSqlitePath();
const bfmDb = openBfmDb(sqlitePath);
console.warn(`[bfm-api] SQLite at ${sqlitePath}`);

// Built after `configureBfmServerSdk()` — the gateway's default handle factory
// is the authenticated `/server` one, which reads that configuration.
const finance = createMobileFinanceClient(createPillarGateway());

const app = createBfmApiApp({
  version,
  db: bfmDb.db,
  accessTokenSigningKey,
  publicBaseUrl,
  internalBaseUrls: sdkConfig.internalBaseUrls,
  finance,
});

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
  // The database closes only once the last request has been answered — an
  // in-flight handler holding the handle would otherwise fail on a closed
  // connection rather than finish. Closing at all is what checkpoints the WAL,
  // so the next boot opens a clean file instead of replaying one.
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      bfmDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
