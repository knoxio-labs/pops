/**
 * Entry point for the finance pillar HTTP server.
 *
 * Boots the `/health` + `/pillars` probes and the REST surface, opening
 * its own `finance.db` connection via `openFinanceDb`.
 *
 * When `POPS_REGISTRY_ENABLED=true`, the process registers a finance
 * manifest with the central registry on boot via `bootstrapPillar`.
 * Registration happens AFTER `app.listen` and never blocks or crashes
 * boot — a registry that is briefly unavailable just means the pillar
 * keeps retrying in the background while already serving traffic.
 * SIGTERM triggers `pillarHandle.stop()` so the heartbeat clears and the
 * registry sees an explicit deregister.
 */
import {
  bootstrapPillar,
  shutdownPillar,
  type PillarBootstrapHandle,
} from '@pops/pillar-sdk/bootstrap';
import { resolveSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';

import { openFinanceDb } from '../db/index.js';
import { createFinanceApiApp } from './app.js';
import { createContactsClient } from './contacts/client.js';
import { createPillarOwnerUriLookup } from './cron/pillar-lookup.js';
import { startReconcileContactsOutboxWorker } from './cron/reconcile-contacts-outbox.js';
import { startReconcileCrossPillarWorker } from './cron/reconcile-cross-pillar.js';
import { startReconcileEntityOrphansWorker } from './cron/reconcile-entity-orphans.js';
import { startReconcilePairedTransfersWorker } from './cron/reconcile-paired-transfers.js';
import { resolveFinanceSqlitePath } from './finance-sqlite-path.js';
import { buildFinanceCapabilityReporter, buildFinanceManifest } from './manifest.js';
import { configureFinanceServerSdk } from './pillars/sdk-config.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3004;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[finance-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';

const selfBaseUrl = resolveSelfBaseUrl({
  envVar: 'FINANCE_SELF_BASE_URL',
  port,
  processLabel: 'finance-api',
});

const financeDb = openFinanceDb(resolveFinanceSqlitePath());

// Before anything that can call out. Reports rather than throws when no key
// is available: this pillar's own contract surface needs none, and the legs
// that do each say `no-credential` instead of degrading into `unavailable`.
configureFinanceServerSdk();

const contacts = createContactsClient();
const app = createFinanceApiApp({
  financeDb,
  version,
  selfBaseUrl,
  contacts,
});

const reconcileLogger = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(`[finance-api] ${msg}`, meta ?? {}),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(`[finance-api] ${msg}`, meta ?? {}),
};

// Nightly cross-pillar URI reconciliation. Reads peer pillars over HTTP
// via the pillar SDK proxy — no compile-time coupling.
const reconcileHandle = startReconcileCrossPillarWorker({
  db: financeDb.db,
  lookupOwnerUri: createPillarOwnerUriLookup(),
  logger: reconcileLogger,
});

// Contacts pre-create outbox reconciliation (issue #3683): drains
// `entity_precreate_outbox` on a short interval so a commit that queued a
// pending contact during a contacts outage gets resolved to the real
// contact id as soon as contacts recovers.
const reconcileOutboxHandle = startReconcileContactsOutboxWorker({
  db: financeDb.db,
  contacts,
  logger: reconcileLogger,
});

// Daily detection sweep for orphaned entity_id references (issue #3615): a
// contacts reseed silently dangles the contact ids copied onto finance rows.
// Detection only — the reviewed repair lives in scripts/repair-orphaned-entity-ids.ts.
const reconcileEntityOrphansHandle = startReconcileEntityOrphansWorker({
  db: financeDb.db,
  fetchLiveEntities: async () =>
    (await contacts.fetchAllEntities()).map((e) => ({ id: e.id, name: e.name })),
  logger: reconcileLogger,
});

// Nightly paired-transfer reconciliation (#3607): links inter-account transfers
// whose two legs were imported at different times. Self-gated on
// FINANCE_TRANSFER_PAIR_ENABLED — a no-op tick until the flag is set (and #3608
// ships real per-account values), so it is safe to arm unconditionally.
const reconcilePairedTransfersHandle = startReconcilePairedTransfersWorker({
  db: financeDb.db,
  logger: reconcileLogger,
});

const server = app.listen(port, () => {
  console.warn(`[finance-api] Listening on port ${port}`);
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildFinanceManifest(version),
    baseUrl: selfBaseUrl,
    capabilityReporter: buildFinanceCapabilityReporter(),
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[finance-api] Shutting down (${signal})`);
  reconcileHandle.stop();
  reconcileOutboxHandle.stop();
  reconcileEntityOrphansHandle.stop();
  reconcilePairedTransfersHandle.stop();
  void shutdownPillar({
    label: 'finance-api',
    steps: [{ name: 'deregister', run: () => pillarHandle?.stop() }],
    server,
    closeDb: () => financeDb.raw.close(),
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
