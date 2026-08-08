/**
 * The one `configureServerSdk` call in this pillar.
 *
 * `pillar()` from `@pops/pillar-sdk/server` reads a process-wide config: the
 * service-account key it attaches as `X-API-Key`, where to discover peers, and
 * which discovered base URLs to override. Nothing else in bfm may call
 * `configureServerSdk` — repeated calls shallow-merge, so a second one would
 * silently reconfigure every existing handle.
 *
 * `@pops/pillar-sdk/client` exports a `pillar()` of the same name and shape
 * that is UNAUTHENTICATED. A backend import from `/client` compiles, runs, and
 * drops the service-account header, the base-URL overrides and the per-process
 * handle cache without a word. `__tests__/service-account-header.test.ts` is
 * what keeps that honest: it asserts the header reaches the wire, which only
 * holds for the `/server` import.
 */
import { configureServerSdk } from '@pops/pillar-sdk/server';

import { resolveInternalBaseUrls, resolveRegistryUrl } from './env.js';
import { MissingServiceAccountKeyError, resolveServiceAccountKey } from './service-account.js';

/**
 * Bind the process-wide server SDK config from the environment.
 *
 * Called once, before the server listens. Throws
 * {@link MissingServiceAccountKeyError} when no key is available, and the
 * SDK's own parse errors when the registry origin or an override entry is
 * malformed — all fatal, all by design (see `./env.ts` for the reasoning).
 *
 * @param env Process environment to read; injectable for tests.
 */
export function configureBfmServerSdk(env: NodeJS.ProcessEnv = process.env): void {
  const apiKey = resolveServiceAccountKey(env);
  if (apiKey === undefined) throw new MissingServiceAccountKeyError();

  const internalBaseUrls = resolveInternalBaseUrls(env);

  configureServerSdk({
    // Passed explicitly rather than left to the SDK's own env fallback: only
    // this module knows about the file-based secret, and explicit beats env.
    apiKey,
    registry: { registryUrl: resolveRegistryUrl(env) },
    ...(internalBaseUrls === undefined ? {} : { internalBaseUrls }),
  });
}
