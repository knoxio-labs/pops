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

import { DEFAULT_PAIRING_CODE_TTL_MS } from '../db/index.js';
import { PAIRING_CODE_RATE_LIMIT } from './rate-limit.js';

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
 * The origin the PHONE dials — bfm's own Cloudflare Tunnel hostname, the one
 * with Access bypassed (POPS-1389). It is baked into the pairing QR, so a
 * wrong value produces a code that scans and then goes nowhere.
 *
 * Distinct from `BFM_SELF_BASE_URL`, which is the in-cluster origin bfm
 * advertises to the registry. Those are the same host only in dev, and
 * conflating them would publish a `pops-backend`-internal URL to a handset on
 * cellular. Falls back to the self base URL for exactly that dev case, where
 * `http://localhost:3014` is genuinely what a simulator on the same machine
 * should dial.
 *
 * Runs through the fleet's parser, so it inherits the bare-origin rule: a
 * value carrying a path crashes boot rather than producing a pairing URL with
 * a doubled prefix.
 */
export function resolvePublicBaseUrl(port: number, env: NodeJS.ProcessEnv = process.env): string {
  if (env['BFM_PUBLIC_BASE_URL'] === undefined || env['BFM_PUBLIC_BASE_URL'] === '') {
    return resolveSelfBaseUrl(port, env);
  }
  return resolveFleetSelfBaseUrl({
    envVar: 'BFM_PUBLIC_BASE_URL',
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

/**
 * Resolve the pairing-code issuance budget from `BFM_PAIRING_CODE_ISSUANCE_LIMIT`,
 * defaulting to {@link PAIRING_CODE_RATE_LIMIT}.
 *
 * The default is a security control — `rate-limit.ts` states why 5 per
 * operator per window is "enough to cover a pairing that goes wrong twice" —
 * and this exists to raise it for exactly one caller: `scripts/ios-e2e/run.mjs`,
 * which runs every UI flow against ONE long-lived BFM process under ONE
 * operator identity (`NODE_ENV=test`'s dev-fallback), so the budget that
 * bounds a human mistyping a code also bounds how many flows a single test
 * run may pair in fifteen minutes. Unset in every real deployment, where the
 * default stands.
 */
export function resolvePairingCodeIssuanceLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['BFM_PAIRING_CODE_ISSUANCE_LIMIT'];
  if (raw === undefined || raw === '') return PAIRING_CODE_RATE_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BootEnvError(
      `[bfm-api] BFM_PAIRING_CODE_ISSUANCE_LIMIT must be a positive integer; got '${raw}'`
    );
  }
  return parsed;
}

/**
 * Resolve how long a minted pairing code stays redeemable, from
 * `BFM_PAIRING_CODE_TTL_MS`, defaulting to {@link DEFAULT_PAIRING_CODE_TTL_MS}.
 *
 * The default is a security control — `pairing-codes.ts`'s header sizes it as
 * "the window an unredeemed code is worth guessing in" for a human who scans a
 * QR or types twelve characters within seconds of it appearing. This exists to
 * raise it for exactly one caller: `scripts/ios-e2e/run.mjs`, which mints a
 * code and then hands it to a *fresh* `maestro test` invocation — installing
 * Maestro's own XCTest driver and booting the simulator both happen after the
 * code exists and before the flow's first step runs, so a slow CI host can
 * spend the whole five-minute default before the app ever submits the code.
 * `redeemPairingCode` cannot tell that apart from a wrong one, so the failure
 * reads as a rejected pairing rather than as what it is. Unset in every real
 * deployment, where the default stands.
 */
export function resolvePairingCodeTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['BFM_PAIRING_CODE_TTL_MS'];
  if (raw === undefined || raw === '') return DEFAULT_PAIRING_CODE_TTL_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BootEnvError(
      `[bfm-api] BFM_PAIRING_CODE_TTL_MS must be a positive integer; got '${raw}'`
    );
  }
  return parsed;
}
