import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

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
import { resolveSweepIntervals } from '../reconcile/config.js';
import { createSweepRunner } from '../reconcile/runner.js';
import { createPurchasesApiApp } from './app.js';
import { createFinanceClient } from './finance/client.js';
import { buildPurchasesManifest } from './manifest.js';
import { parseBareOrigin } from './pillars/env.js';
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

// Normalise PURCHASES_SELF_BASE_URL (or the localhost fallback) through the
// shared bare-origin parser so a misconfigured env crashes boot loudly
// instead of publishing an invalid PillarRegistryEntry.baseUrl. The
// parser's own error is prefixed `POPS_PILLARS:`, which misleads when the
// failing env is PURCHASES_SELF_BASE_URL — wrap + rethrow with a
// purchases-api-scoped message so operators look at the right env var.
function resolveSelfBaseUrl(): string {
  const raw = process.env['PURCHASES_SELF_BASE_URL'] ?? `http://localhost:${port}`;
  try {
    return parseBareOrigin('PURCHASES_SELF_BASE_URL', raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[purchases-api] PURCHASES_SELF_BASE_URL ${raw} is invalid — ${message}`, {
      cause: err,
    });
  }
}
const selfBaseUrl = resolveSelfBaseUrl();

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

const app = createPurchasesApiApp({
  purchasesDb,
  version,
  selfBaseUrl,
  onIngest: () => {
    sweepRunner.request();
  },
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
