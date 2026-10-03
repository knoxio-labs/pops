/**
 * Raw pillar discovery for BFM calls that cannot go through `pillar()` —
 * notably byte streams, which are not one `CallResult`.
 */
import {
  DiscoveryCache,
  HttpDiscoveryTransport,
  type DiscoveryTransport,
} from '@pops/pillar-sdk/client';
import {
  getServerSdkConfig,
  InternalBaseUrlTransport,
  type ServerSdkConfig,
} from '@pops/pillar-sdk/server';

/** Matches `libs/sdk/src/client/factory.ts`'s own default. */
const DEFAULT_DISCOVERY_TTL_MS = 60_000;

/** What a raw lookup needs to answer: enough to build a request, nothing else. */
export interface RawDiscovery {
  lookup(pillarId: string): Promise<{ baseUrl: string } | undefined>;
}

/**
 * Build the raw discovery seam from server SDK config, optionally injecting
 * its sources for consumers and tests that need to control the registry.
 */
export function buildRawDiscovery(
  options: {
    config?: Readonly<ServerSdkConfig>;
    baseTransport?: DiscoveryTransport;
  } = {}
): RawDiscovery {
  const config = options.config ?? getServerSdkConfig();
  const base: DiscoveryTransport =
    options.baseTransport ?? new HttpDiscoveryTransport(config.registry ?? {});
  const overrides = config.internalBaseUrls ?? {};
  const transport: DiscoveryTransport =
    Object.keys(overrides).length === 0 ? base : new InternalBaseUrlTransport(base, overrides);
  const cache = new DiscoveryCache({
    transport,
    ttlMs: config.cacheTtlMs ?? DEFAULT_DISCOVERY_TTL_MS,
  });
  return {
    lookup: async (pillarId) => {
      const entry = await cache.lookup(pillarId);
      return entry === undefined ? undefined : { baseUrl: entry.baseUrl };
    },
  };
}
