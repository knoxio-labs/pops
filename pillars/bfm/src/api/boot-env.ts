/**
 * The environment `server.ts` reads to stand up its own HTTP surface, and the
 * validation each variable gets. The variables the cross-pillar SDK needs live
 * next door in `pillars/env.ts`; both defer to `@pops/pillar-sdk/pillar-env`
 * for the fleet's base-URL rules.
 *
 * They live here rather than inline in the entrypoint so the decisions are
 * testable in-process: `server.ts` binds a port and installs signal handlers
 * the moment it is imported, so anything left in it can only be exercised by
 * spawning a child.
 *
 * The bias throughout is to crash at boot. A pillar that starts with a
 * misconfigured value and registers it is discovered days later as a 404 from
 * a sibling; one that refuses to start is discovered immediately.
 */

import { dirname, join } from 'node:path';

import { resolveSelfBaseUrl as resolveFleetSelfBaseUrl } from '@pops/pillar-sdk/pillar-env';

export const DEFAULT_PORT = 3014;

/** Where `bfm.db` lands when neither env var says otherwise. */
export const DEFAULT_SQLITE_PATH = './data/bfm.db';

export class BootEnvError extends Error {
  override readonly name = 'BootEnvError' as const;
}

/**
 * Resolve the listen port from `PORT`, defaulting to {@link DEFAULT_PORT}.
 *
 * Rejects anything outside 1-65535 and anything non-integer, including the
 * values `Number` would otherwise accept silently — `'3014.5'`, `'0x1'`,
 * `' '` (which coerces to 0), and `''`/absent (which take the default).
 */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['PORT'];
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new BootEnvError(`[bfm-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

/**
 * Whether to self-register with the `registry` pillar.
 *
 * Opt-in on the exact string `true`: registration is a side effect on shared
 * fleet state, so a typo'd or half-set value must mean "no" rather than
 * "probably yes". Matches the gate every other pillar's entrypoint uses.
 */
export function shouldSelfRegister(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['POPS_REGISTRY_ENABLED'] === 'true';
}

/**
 * The build identifier reported on `/health` and carried in the manifest.
 *
 * Returned verbatim. `bootstrapPillar` coerces a non-semver value to
 * `0.0.0-sha.<short>` for the manifest only, so the default `dev` build
 * registers as `0.0.0-sha.dev` while `/health` still says `dev` — see the
 * pillar README.
 */
export function resolveVersion(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env['BUILD_VERSION'];
  return raw === undefined || raw === '' ? 'dev' : raw;
}

/**
 * Resolve `BFM_SELF_BASE_URL`, falling back to the loopback origin for the
 * port the process is listening on.
 *
 * The bare-origin rule it enforces is the fleet's, not bfm's — every pillar
 * advertises a `PillarRegistryEntry.baseUrl` through the same parser.
 */
export function resolveSelfBaseUrl(port: number, env: NodeJS.ProcessEnv = process.env): string {
  return resolveFleetSelfBaseUrl({
    envVar: 'BFM_SELF_BASE_URL',
    port,
    processLabel: 'bfm-api',
    env,
  });
}

/**
 * Resolve the on-disk location of `bfm.db`.
 *
 * Resolution order, matching every other SQLite pillar's resolver:
 *   1. `BFM_SQLITE_PATH`, absolute or relative.
 *   2. `<dirname(SQLITE_PATH)>/bfm.db`, so a deployer who sets only the shared
 *      path still lands this pillar's database in that directory.
 *   3. {@link DEFAULT_SQLITE_PATH}.
 *
 * Unlike the other resolvers here this one validates nothing beyond
 * emptiness. A path is only wrong once the filesystem says so, and
 * `openBfmDb` creates the parent directory — so the failure that matters
 * (unwritable location) surfaces from the open, with the OS error attached,
 * which is more informative than anything this function could assert.
 */
export function resolveSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  const own = env['BFM_SQLITE_PATH'];
  if (own !== undefined && own.trim() !== '') return own;
  const shared = env['SQLITE_PATH'];
  if (shared !== undefined && shared.trim() !== '') return join(dirname(shared), 'bfm.db');
  return DEFAULT_SQLITE_PATH;
}
