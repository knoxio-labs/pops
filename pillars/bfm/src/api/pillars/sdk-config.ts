/**
 * The one place this pillar binds SDK configuration from the environment.
 *
 * Two SDK surfaces read a registry origin and they do not share one. The
 * server `pillar()` factory gets its own through `configureServerSdk`; the
 * discovery cache behind `pillarRegistry()` — what the mobile bootstrap route
 * reads the pillar roster from — keeps a separate module-level one. Both are
 * set here from the SAME resolved value, because a deployment that discovered
 * the roster from one registry and called pillars discovered by another would
 * report a federation it cannot reach.
 *
 * `pillar()` from `@pops/pillar-sdk/server` reads a process-wide config: the
 * service-account key it attaches as `X-API-Key`, where to discover peers, and
 * which discovered base URLs to override.
 *
 * Nothing else in bfm may call `configureServerSdk`, because a second call
 * lands unevenly rather than cleanly. It shallow-merges into the process
 * config, and the SDK reads the key through a closure evaluated per request —
 * so an already-built handle starts sending the NEW key while still using the
 * transport, base-URL overrides and TTL captured when it was built. Nothing
 * reports that split. bfm's gateway resolves its handle through `pillar()` on
 * every call, so it would pick the rebuilt one up; anything that holds a
 * handle across calls would not.
 *
 * `@pops/pillar-sdk/client` exports a `pillar()` of the same name and shape
 * that is UNAUTHENTICATED. A backend import from `/client` compiles, runs, and
 * drops the service-account header, the base-URL overrides and the per-process
 * handle cache without a word. `__tests__/service-account-header.test.ts` is
 * what keeps that honest: it asserts the header reaches the wire, which only
 * holds for the `/server` import.
 */
import { setRegistryUrl } from '@pops/pillar-sdk/discovery';
import { configureServerSdk } from '@pops/pillar-sdk/server';

import { resolveInternalBaseUrls, resolveRegistryUrl } from './env.js';
import { MissingServiceAccountKeyError, resolveServiceAccountKey } from './service-account.js';

/**
 * What the SDK was configured with, for the parts of bfm that need the same
 * values but are not the SDK — today the mobile bootstrap route's reachability
 * probe, which must aim at the hosts outbound calls will actually use.
 *
 * Returned rather than re-resolved by each consumer so the environment is
 * parsed exactly once and there is no second reading of it to disagree with.
 */
export interface BfmSdkConfig {
  registryUrl: string;
  /** Empty when nothing is configured — the "no overrides" case, unwrapped. */
  internalBaseUrls: Readonly<Record<string, string>>;
}

/**
 * Bind the process-wide server SDK config from the environment.
 *
 * Called once, before the server listens. Throws
 * {@link MissingServiceAccountKeyError} when no key is available,
 * `BareOriginParseError` on a malformed registry origin, and `BootEnvError` on
 * a malformed override entry — all fatal, all by design (see `./env.ts` for
 * the reasoning).
 *
 * @param env Process environment to read; injectable for tests.
 */
export function configureBfmServerSdk(env: NodeJS.ProcessEnv = process.env): BfmSdkConfig {
  const apiKey = resolveServiceAccountKey(env);
  if (apiKey === undefined) throw new MissingServiceAccountKeyError();

  const internalBaseUrls = resolveInternalBaseUrls(env);
  const registryUrl = resolveRegistryUrl(env);

  configureServerSdk({
    // Passed explicitly rather than left to the SDK's own env fallback: only
    // this module knows about the file-based secret, and explicit beats env.
    apiKey,
    registry: { registryUrl },
    ...(internalBaseUrls === undefined ? {} : { internalBaseUrls }),
  });

  // The discovery cache defaults to the same in-cluster origin, so this is a
  // no-op in Compose and load-bearing everywhere else — a laptop pointing
  // POPS_REGISTRY_URL at a tunnel would otherwise still read its roster from
  // `registry-api`, a hostname that does not resolve there.
  setRegistryUrl(registryUrl);

  return { registryUrl, internalBaseUrls: internalBaseUrls ?? {} };
}
