/**
 * Entry point for the design pillar's comment API.
 *
 * The playground itself is a static bundle served by nginx; this process
 * exists only for the comment overlay, and the shell's nginx routes
 * `/design-api/` to it. It does NOT self-register: the pillar publishes no
 * contract and no manifest, and the only client it has reaches it at a fixed
 * path rather than through discovery.
 *
 * The database opens BEFORE `listen` because migrations run on the way up,
 * and a pillar answering `/health` over an unmigrated or unwritable file
 * would pass its container healthcheck and fail every comment.
 */
import { openDesignDb } from '../db/index.js';
import { createDesignApiApp } from './app.js';
import { resolvePort, resolveSqlitePath, resolveVersion } from './boot-env.js';

const port = resolvePort();
const version = resolveVersion();
const sqlitePath = resolveSqlitePath();
const designDb = openDesignDb(sqlitePath);
console.warn(`[design-api] SQLite at ${sqlitePath}`);

const app = createDesignApiApp({ db: designDb.db, version });
const server = app.listen(port, () => {
  console.warn(`[design-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[design-api] Shutting down (${signal})`);
  // The database closes only once the last request has been answered, and
  // closing at all is what checkpoints the WAL — so the next boot opens a
  // clean file rather than replaying one.
  server.close(() => {
    designDb.raw.close();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
