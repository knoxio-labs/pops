import { config } from 'dotenv';

// Load .env from CWD (apps/pops-api/ when run via mise/pnpm, or repo root)
// Also check repo root .env as fallback for monorepo setups
config(); // loads apps/pops-api/.env if it exists
config({ path: '../../.env', override: false }); // loads root .env without overriding

import { createApp } from './app.js';
import { closeDb } from './db.js';
import { startupCleanup } from './modules/core/envs/registry.js';
import { startTtlWatcher } from './modules/core/envs/ttl-watcher.js';
import { resumeSchedulerIfEnabled, stopScheduler } from './modules/media/plex/scheduler.js';
import {
  resumeRotationSchedulerIfEnabled,
  setupGracefulShutdown,
} from './modules/media/rotation/scheduler.js';

const port = Number(process.env['PORT'] ?? 3000);
const app = createApp();

// Clean up expired and orphaned env DBs left over from any previous crash
const { expired, orphaned } = startupCleanup();
if (expired.length > 0)
  console.warn(`[pops-api] Cleaned up ${expired.length} expired env(s): ${expired.join(', ')}`);
if (orphaned.length > 0)
  console.warn(`[pops-api] Removed ${orphaned.length} orphaned env DB(s): ${orphaned.join(', ')}`);

const server = app.listen(port, () => {
  console.warn(`[pops-api] Listening on port ${port}`);
});

// Auto-resume Plex sync scheduler if it was previously running
const resumedScheduler = resumeSchedulerIfEnabled();
if (resumedScheduler) {
  console.warn(`[pops-api] Plex scheduler resumed (interval: ${resumedScheduler.intervalMs}ms)`);
}

// Auto-resume rotation scheduler if it was previously running
const resumedRotation = resumeRotationSchedulerIfEnabled();
if (resumedRotation) {
  console.warn(`[pops-api] Rotation scheduler resumed (cron: ${resumedRotation.cronExpression})`);
}

// Register SIGTERM/SIGINT handlers: stops the rotation scheduler and waits for
// any in-progress cycle to complete before exiting.
setupGracefulShutdown();

// Periodically purge expired named environments
const ttlWatcher = startTtlWatcher();

// Synchronous cleanup on every process exit (including process.exit(0) triggered
// by setupGracefulShutdown). server.close() stops accepting new connections;
// closeDb() flushes and releases the SQLite handle.
process.on('exit', () => {
  stopScheduler();
  clearInterval(ttlWatcher);
  server.close();
  closeDb();
});
