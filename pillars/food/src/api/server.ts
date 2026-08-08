import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';
import { resolveSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';

/**
 * Entry point for the food pillar HTTP server.
 *
 * The process opens its OWN `food.db` connection via `openFoodDb`.
 *
 * When `POPS_REGISTRY_ENABLED=true`, `bootstrapPillar` registers the
 * pillar with the central registry on boot. Registration happens AFTER
 * `app.listen` and never blocks or crashes boot — a registry that is
 * briefly unavailable just means the pillar keeps retrying in the
 * background while already serving traffic. SIGTERM triggers
 * `pillarHandle.stop()` so the heartbeat clears and the registry sees an
 * explicit deregister.
 */
import { openFoodDb } from '../db/index.js';
import { createFoodApiApp } from './app.js';
import { resolveFoodSqlitePath } from './food-sqlite-path.js';
import { buildFoodManifest } from './manifest.js';
import { closeFoodIngestQueue } from './queue.js';

function resolvePort(): number {
  // 3001 is registry, 3002 is inventory, 3003 is media,
  // 3004 is finance, 3005 is food, 3007 is cerebrum.
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3005;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[food-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';
const selfBaseUrl = resolveSelfBaseUrl({
  envVar: 'FOOD_SELF_BASE_URL',
  port,
  processLabel: 'food-api',
});

const foodDb = openFoodDb(resolveFoodSqlitePath());
const app = createFoodApiApp({ foodDb, version, selfBaseUrl });

const server = app.listen(port, () => {
  console.warn(`[food-api] Listening on port ${port}`);
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildFoodManifest(version),
    baseUrl: selfBaseUrl,
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[food-api] Shutting down (${signal})`);
  void (pillarHandle?.stop() ?? Promise.resolve())
    .finally(() => closeFoodIngestQueue())
    .finally(() => {
      server.close(() => {
        foodDb.raw.close();
      });
    });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
