/**
 * Pillar registry view served by purchases-api.
 *
 * Wraps `parsePillarsEnv` with a process-level cache. Adds the synthetic
 * `purchases` entry so the shell sees the host pillar in the `/pillars`
 * listing without having to special-case the call site.
 */
import { parseBareOrigin, parsePillarsEnv } from './env.js';

import type { PillarRegistryEntry } from '@pops/types';

let cached: readonly PillarRegistryEntry[] | undefined;

export interface PillarRegistryOptions {
  /**
   * HTTP origin purchases-api is reachable at. Required — `server.ts`
   * derives it from `PURCHASES_SELF_BASE_URL` (or falls back to
   * `http://localhost:PORT`) before passing it in. The registry returns
   * this as the synthetic `purchases` entry's `baseUrl` after normalising
   * it through `parseBareOrigin` so callers can always append a path
   * without a double-slash or stale prefix.
   */
  readonly selfBaseUrl: string;
}

export function getPillarRegistry(options: PillarRegistryOptions): readonly PillarRegistryEntry[] {
  cached ??= parsePillarsEnv(process.env['POPS_PILLARS']);
  const normalisedSelf = parseBareOrigin('purchases-api selfBaseUrl', options.selfBaseUrl);
  const withoutSelf = cached.filter((p) => p.id !== 'purchases');
  return [{ id: 'purchases', baseUrl: normalisedSelf }, ...withoutSelf];
}

/** Test-only: forget the cached registry so a new `POPS_PILLARS` is re-read. */
export function __resetPillarRegistryCache(): void {
  cached = undefined;
}
