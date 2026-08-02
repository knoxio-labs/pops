import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

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
import { createPurchasesApiApp } from './app.js';
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
const app = createPurchasesApiApp({ purchasesDb, version, selfBaseUrl });

const server = app.listen(port, () => {
  console.warn(`[purchases-api] Listening on port ${port}`);
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
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      purchasesDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
