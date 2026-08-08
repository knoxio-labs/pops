import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';
import { resolveSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';

import { DEFAULT_SETTLEMENT_WINDOW_DAYS } from '../contract/constants.js';
/**
 * Entry point for the purchases pillar HTTP server.
 *
 * The process opens its OWN `purchases.db` connection via
 * `openPurchasesDb` rather than sharing one — each pillar owns its
 * database.
 *
 * When `POPS_REGISTRY_ENABLED=true`, `bootstrapPillar` registers the pillar
 * with the central registry on boot. Registration happens AFTER
 * `app.listen` and never blocks or crashes boot — a registry that is
 * briefly unavailable just means the pillar keeps retrying in the
 * background while already serving traffic. SIGTERM triggers
 * `pillarHandle.stop()` so the heartbeat clears and the registry sees an
 * explicit deregister.
 */
import { openPurchasesDb } from '../db/index.js';
import { createAnthropicVision } from '../ingest/receipt/anthropic-vision.js';
import { optionalIntervalMs, resolveSweepIntervals } from '../reconcile/config.js';
import { createSweepRunner } from '../reconcile/runner.js';
import { createPurchasesApiApp } from './app.js';
import { createDocumentLookup, createInventoryItemLookup } from './cron/pillar-lookup.js';
import { startReconcileCrossPillarWorker } from './cron/reconcile-cross-pillar.js';
import { createFinanceClient } from './finance/client.js';
import { buildPurchasesManifest } from './manifest.js';
import { resolvePurchasesSqlitePath } from './purchases-sqlite-path.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3013;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[purchases-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';

const selfBaseUrl = resolveSelfBaseUrl({
  envVar: 'PURCHASES_SELF_BASE_URL',
  port,
  processLabel: 'purchases-api',
});

const purchasesDb = openPurchasesDb(resolvePurchasesSqlitePath());

/**
 * The reconciliation triggers.
 *
 * Started unconditionally: a sweep with an unreachable finance is a no-op
 * that writes nothing (see `reconcile/sweep.ts`), so a deployment without
 * finance costs a log line per tick rather than misbehaving. Gating it on
 * an env var would instead mean a silently un-reconciled deployment, which
 * looks identical to one where nothing has settled yet.
 */
const sweepRunner = createSweepRunner({
  db: purchasesDb.db,
  finance: createFinanceClient(),
  defaultWindowDays: DEFAULT_SETTLEMENT_WINDOW_DAYS,
  // Overridable so a smoke test does not wait a quarter of an hour for the
  // first tick. Absent in production, where the module defaults apply.
  ...resolveSweepIntervals(),
  logger: {
    info: (message, context) => {
      console.warn(`[purchases-api] ${message}`, context ?? {});
    },
    warn: (message, context) => {
      console.error(`[purchases-api] ${message}`, context ?? {});
    },
  },
});

/**
 * The soft-URI reconciliation cron (ADR-042).
 *
 * Also unconditional, and for the same reason as the sweep: a tick with an
 * unreachable inventory or documents pillar writes nothing — `unavailable`
 * leaves every flag as it was. Gating it would instead produce a
 * deployment whose `staleAt` columns are permanently null, which reads as
 * "every reference resolves" and is the failure this cron exists to end.
 */
const reconcileUriWorker = startReconcileCrossPillarWorker({
  db: purchasesDb.db,
  lookups: {
    inventoryItem: createInventoryItemLookup(),
    document: createDocumentLookup(),
  },
  // Overridable so a smoke test does not wait a day for the second tick.
  intervalMs: optionalIntervalMs('PURCHASES_RECONCILE_URI_INTERVAL_MS'),
  logger: {
    info: (message, context) => {
      console.warn(`[purchases-api] ${message}`, context ?? {});
    },
    warn: (message, context) => {
      console.error(`[purchases-api] ${message}`, context ?? {});
    },
  },
});

const app = createPurchasesApiApp({
  purchasesDb,
  version,
  selfBaseUrl,
  // Null when no API key is configured, which the drop-zone reports as a
  // 503 at the edge rather than accepting uploads it cannot read.
  vision: createAnthropicVision(),
  onIngest: () => {
    sweepRunner.request();
  },
  // The explicit trigger. Shares the runner's gate, so a manual sweep
  // cannot run alongside a scheduled one and tear down its work.
  sweep: () => sweepRunner.runOnce(),
});

const server = app.listen(port, () => {
  console.warn(`[purchases-api] Listening on port ${port}`);
  // After listen: the first tick must not delay serving traffic.
  sweepRunner.start();
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildPurchasesManifest(version),
    baseUrl: selfBaseUrl,
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[purchases-api] Shutting down (${signal})`);
  // Cancel the timers, then WAIT for a sweep that is already running. A
  // sweep awaits finance between its reads and its writes, so closing the
  // database here would fail those writes mid-transaction on the way out.
  //
  // The URI cron needs no drain: its unit of work is one row update between
  // two awaits, so the worst a shutdown mid-tick costs is one URI rechecked
  // on the next boot.
  reconcileUriWorker.stop();
  sweepRunner.stop();
  void sweepRunner
    .drain()
    .catch(() => undefined)
    .then(() => pillarHandle?.stop() ?? Promise.resolve())
    .catch(() => undefined)
    .finally(() => {
      server.close(() => {
        purchasesDb.raw.close();
      });
    });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
