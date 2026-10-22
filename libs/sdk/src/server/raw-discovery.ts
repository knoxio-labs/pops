import {
  DiscoveryCache,
  HttpDiscoveryTransport,
  type DiscoveryTransport,
} from '../client/index.js';
import { getServerSdkConfig, type ServerSdkConfig } from './config.js';
import { InternalBaseUrlTransport } from './transport.js';

/** Matches `../client/factory.ts`'s own default. */
const DEFAULT_DISCOVERY_TTL_MS = 60_000;

/** What a raw lookup needs to answer: enough to build a request, nothing else. */
export interface RawDiscovery {
  lookup(pillarId: string): Promise<{ baseUrl: string } | undefined>;
}

/**
 * Resolve a pillar's base URL for a call that cannot go through `pillar()`,
 * such as a raw byte route with no OpenAPI operation. Applies the same
 * registry discovery and `internalBaseUrls` overrides `pillar()` does, but
 * attaches no credential: the caller adds `SERVICE_ACCOUNT_HEADER` itself.
 *
 * Reads the server SDK config when called, so build it after
 * `configureServerSdk`. Both sources are injectable for tests.
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
