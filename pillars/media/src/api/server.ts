/**
 * Entry point for the media pillar HTTP server.
 *
 * Boots the process with the `/health` + `/pillars` probes and the REST
 * surface generated from `src/contract/rest.ts`. The process opens its own
 * `media.db` connection via `openMediaDb`.
 *
 * When `POPS_REGISTRY_ENABLED=true`, the process registers a media manifest
 * with the central registry on boot via `bootstrapPillar`. Registration
 * happens AFTER `app.listen` and never blocks or crashes boot — a registry
 * that is briefly unavailable just means the pillar keeps retrying in the
 * background while already serving traffic. SIGTERM triggers
 * `pillarHandle.stop()` so the heartbeat clears and the registry sees an
 * explicit deregister.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';
import { resolveSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';

import { openMediaDb } from '../db/index.js';
import { createMediaApiApp } from './app.js';
import { plexScheduler } from './cron/plex-scheduler.js';
import { rotationScheduler } from './cron/rotation-scheduler.js';
import { buildMediaCapabilityReporter, buildMediaManifest } from './manifest.js';
import { resolveMediaSqlitePath } from './media-sqlite-path.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3003;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[media-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';

const selfBaseUrl = resolveSelfBaseUrl({
  envVar: 'MEDIA_SELF_BASE_URL',
  port,
  processLabel: 'media-api',
});

const mediaDb = openMediaDb(resolveMediaSqlitePath());
const app = createMediaApiApp({ mediaDb, version, selfBaseUrl });

// Periodic Plex sync scheduler. When PLEX_SCHEDULER_ENABLED is set,
// force-start with the PLEX_SCHEDULER_INTERVAL_MS interval; otherwise
// auto-resume from the persisted `plex_scheduler_enabled` flag in
// plex_settings. The controller is a module-level singleton so the REST
// start/stop handlers drive the same timer.
function resolveSchedulerIntervalMs(): number | undefined {
  const raw = process.env['PLEX_SCHEDULER_INTERVAL_MS'];
  if (raw === undefined || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

if (process.env['PLEX_SCHEDULER_ENABLED'] === 'true') {
  plexScheduler.start({ db: mediaDb.db, intervalMs: resolveSchedulerIntervalMs() });
} else {
  plexScheduler.resumeIfEnabled(mediaDb.db);
}

// Rotation-cycle scheduler. Mirror of the Plex scheduler:
// MEDIA_ROTATION_SCHEDULER_ENABLED force-starts; otherwise auto-resume from
// the persisted `rotation_enabled` flag. The controller is a module-level
// singleton so the REST toggle/run-now handlers drive the same timer.
if (process.env['MEDIA_ROTATION_SCHEDULER_ENABLED'] === 'true') {
  rotationScheduler.start({ db: mediaDb.db });
} else {
  rotationScheduler.resumeIfEnabled(mediaDb.db);
}

const server = app.listen(port, () => {
  console.warn(`[media-api] Listening on port ${port}`);
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildMediaManifest(version),
    baseUrl: selfBaseUrl,
    capabilityReporter: buildMediaCapabilityReporter(),
  });
}

// A rotation cycle mid-flight is deleting from and adding to Radarr; cutting
// the process off leaves that half-applied. Disarm the timer, then give the
// in-flight cycle a bounded window to settle before the server closes.
const ROTATION_DRAIN_TIMEOUT_MS = 30_000;

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[media-api] Shutting down (${signal})`);
  plexScheduler.stop();
  rotationScheduler.stopForShutdown();
  void rotationScheduler
    .waitForCycleEnd(ROTATION_DRAIN_TIMEOUT_MS)
    .then((drained) => {
      if (!drained) {
        console.warn(
          `[media-api] rotation cycle did not settle within ${ROTATION_DRAIN_TIMEOUT_MS}ms; closing anyway`
        );
      }
      return pillarHandle?.stop();
    })
    .finally(() => {
      server.close(() => {
        mediaDb.raw.close();
      });
    });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
