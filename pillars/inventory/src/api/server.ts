/**
 * Entry point for the inventory pillar HTTP server.
 *
 * The process opens its OWN `inventory.db` connection via
 * `openInventoryDb`.
 *
 * Registry handshake is opt-in via `bootstrapPillar`: when
 * `POPS_REGISTRY_ENABLED=true`, the process builds the inventory
 * manifest and registers with the central registry on boot. Registration
 * happens AFTER `app.listen` and never blocks or crashes boot — a registry
 * that is briefly unavailable just means the pillar keeps retrying in the
 * background while already serving traffic. SIGTERM triggers
 * `pillarHandle.stop()` so the heartbeat clears and the registry sees an
 * explicit deregister.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';
import { resolveSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';
import { resolveApiKey, SERVER_SDK_API_KEY_ENV } from '@pops/pillar-sdk/server';

import { openInventoryDb } from '../db/index.js';
import { createInventoryApiApp } from './app.js';
import { startCrossPillarReconciliationWorker } from './cron/reconcile-cross-pillar.js';
import { resolveReconcileIntervalMs } from './cron/reconcile-interval.js';
import { createDocumentsClient } from './documents/client.js';
import { resolveInventorySqlitePath } from './inventory-sqlite-path.js';
import { buildInventoryCapabilityReporter, buildInventoryManifest } from './manifest.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3002;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[inventory-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';
const selfBaseUrl = resolveSelfBaseUrl({
  envVar: 'INVENTORY_SELF_BASE_URL',
  port,
  processLabel: 'inventory-api',
});

const inventoryDb = openInventoryDb(resolveInventorySqlitePath());
const app = createInventoryApiApp({
  inventoryDb,
  version,
  selfBaseUrl,
  documents: createDocumentsClient(),
});

const server = app.listen(port, () => {
  console.warn(`[inventory-api] Listening on port ${port}`);
});

const reconcileIntervalMs = resolveReconcileIntervalMs();

// The reconciler reaches finance and the registry through the server SDK,
// which authenticates every outbound call with a service-account key. Without
// one it can still run, but every probe fails to authenticate and no column is
// ever stamped — silence that would otherwise read as "every reference
// resolves". Say so once, loudly, at boot.
if (resolveApiKey() === undefined) {
  console.error(
    `[inventory-api] no ${SERVER_SDK_API_KEY_ENV} configured: cross-pillar reconciliation cannot authenticate, so every *_stale_at column stays null until a service-account key is provisioned`
  );
}

/**
 * Soft-URI reconciliation cron: resolves `home_inventory.purchase_transaction_uri`
 * and `home_inventory.owner_uri` against their owning pillars and stamps the
 * matching `*_stale_at` column when the owner answers 404.
 *
 * Started unconditionally. A tick that cannot reach finance or the registry
 * writes nothing — only a 404 stamps, everything else is left for the next
 * tick — whereas gating the worker would leave every `stale_at` permanently
 * null, which reads as "every reference resolves" and is the exact failure
 * this cron exists to end.
 */
const reconcileUriWorker = startCrossPillarReconciliationWorker({
  db: inventoryDb.db,
  // Overridable so a smoke test does not wait a day for the second tick.
  ...(reconcileIntervalMs === undefined ? {} : { intervalMs: reconcileIntervalMs }),
  logger: {
    info: (message, context) => {
      console.warn(`[inventory-api] ${message}`, context ?? {});
    },
    warn: (message, context) => {
      console.error(`[inventory-api] ${message}`, context ?? {});
    },
  },
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildInventoryManifest(version),
    baseUrl: selfBaseUrl,
    capabilityReporter: buildInventoryCapabilityReporter(),
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[inventory-api] Shutting down (${signal})`);
  reconcileUriWorker.stop();
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      inventoryDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
