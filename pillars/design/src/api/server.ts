/**
 * Entry point for the design pillar's comment API.
 *
 * The playground itself is a static bundle served by nginx; this process
 * exists only for the comment overlay, and the shell's nginx routes
 * `/design-api/` to it.
 *
 * When `POPS_REGISTRY_ENABLED=true` it registers with the `registry` pillar,
 * and that is not about discovery — its clients reach it at a fixed path.
 * It registers because **the shell renders its production nginx conf from the
 * live registry** and emits one `/<id>-api/` block per registered pillar. The
 * first version of this pillar did not register, so `/design-api/` existed in
 * the committed conf, in the drift test and in the fallback the shell only
 * uses when the registry is unreachable — and nowhere on the running host
 * (POPS-2793). Registration happens AFTER `listen` and never blocks boot.
 *
 * The database opens BEFORE `listen` because migrations run on the way up,
 * and a pillar answering `/health` over an unmigrated or unwritable file
 * would pass its container healthcheck and fail every comment.
 */
import { openDesignDb } from '../db/index.js';
import { createDesignApiApp } from './app.js';
import { resolvePort, resolveSqlitePath, resolveVersion, shouldSelfRegister } from './boot-env.js';
import { registerDesignPillar } from './register.js';

const port = resolvePort();
const version = resolveVersion();
const sqlitePath = resolveSqlitePath();
const designDb = openDesignDb(sqlitePath);
console.warn(`[design-api] SQLite at ${sqlitePath}`);

const app = createDesignApiApp({ db: designDb.db, version });
let pillarHandle: Awaited<ReturnType<typeof registerDesignPillar>>;

const server = app.listen(port, () => {
  console.warn(`[design-api] Listening on port ${port}`);
  // `registerDesignPillar` resolves rather than rejects, on every path it
  // knows about. The `.catch` is the backstop for the ones it does not: this
  // promise is not awaited by anything, so a rejection escaping it would be
  // unhandled and would kill a process that is already serving comments.
  if (shouldSelfRegister()) void register().catch(onRegistrationCrash);
});

async function register(): Promise<void> {
  pillarHandle = await registerDesignPillar(version, port);
}

function onRegistrationCrash(err: unknown): void {
  console.error('[design-api] Registration crashed; serving unregistered', err);
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[design-api] Shutting down (${signal})`);
  // Deregister first so the registry stops advertising a pillar that is on
  // its way out, then close: the database closes only once the last request
  // has been answered, and closing at all is what checkpoints the WAL, so the
  // next boot opens a clean file rather than replaying one.
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      designDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
