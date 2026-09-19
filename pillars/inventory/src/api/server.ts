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
import {
  bootstrapPillar,
  shutdownPillar,
  type PillarBootstrapHandle,
} from '@pops/pillar-sdk/bootstrap';
import { assertSecretFilesReadable, resolveSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';

import { backfillPhotoMedia, openInventoryDb } from '../db/index.js';
import { createInventoryApiApp } from './app.js';
import { startCrossPillarReconciliationWorker } from './cron/reconcile-cross-pillar.js';
import { resolveReconcileIntervalMs } from './cron/reconcile-interval.js';
import { createDocumentsClient } from './documents/client.js';
import { resolveInventorySqlitePath } from './inventory-sqlite-path.js';
import { buildInventoryCapabilityReporter, buildInventoryManifest } from './manifest.js';
import { getInventoryImagesDir } from './modules/photos/paths.js';
import { configureInventoryServerSdk } from './pillars/sdk-config.js';

// Before the port, the database, or anything that resolves a credential. A
// `*_FILE` variable pointing at a file this process cannot open makes the
// outbound leg to `ai` authenticate as though nothing had been configured,
// reported only in a startup log line — see the incident
// `assertSecretFilesReadable`'s own doc comment describes (POPS-3315). An
// unset variable is a supported configuration; a set one naming an
// unreadable path is not, so this refuses to boot.
assertSecretFilesReadable();

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

const reconcileIntervalMs = resolveReconcileIntervalMs();

configureInventoryServerSdk();

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

// Off the boot path: it reads every legacy photo file, and nothing served
// before it finishes depends on the hashes it adds.
backfillPhotoMedia(inventoryDb.db, getInventoryImagesDir()).then(
  (result) => {
    if (result.missing.length > 0 || result.unreadable.length > 0) {
      console.error('[inventory-api] Photo media backfill skipped files', result);
    } else if (result.hashed > 0) {
      console.warn('[inventory-api] Photo media backfill', result);
    }
  },
  (err: unknown) => {
    console.error('[inventory-api] Photo media backfill failed', err);
  }
);

/**
 * Soft-URI reconciliation cron: resolves `items.purchase_transaction_uri`
 * against finance and stamps `purchase_transaction_stale_at` when finance
 * answers 404.
 *
 * Started unconditionally. A tick that cannot reach finance writes nothing —
 * only a 404 stamps, everything else is left for the next tick — whereas
 * gating the worker would leave every `stale_at` permanently null, which reads
 * as "every reference resolves" and is the exact failure this cron exists to
 * end. A tick with no URIs to resolve is silent and calls nobody, except to
 * warn when rows name a transaction whose URI was never derived.
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
  void shutdownPillar({
    label: 'inventory-api',
    steps: [{ name: 'deregister', run: () => pillarHandle?.stop() }],
    server,
    closeDb: () => inventoryDb.raw.close(),
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
