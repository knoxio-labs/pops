/**
 * Pillar registry view served by documents-api.
 *
 * Wraps `parsePillarsEnv` with a process-level cache. Adds the
 * synthetic `documents` entry so consumers see the host pillar in the
 * `/pillars` listing without having to special-case the call site.
 */
import { parseBareOrigin, parsePillarsEnv } from '@pops/pillar-sdk/pillar-env';

import type { PillarRegistryEntry } from '@pops/types';

let cached: readonly PillarRegistryEntry[] | undefined;

export interface PillarRegistryOptions {
  /**
   * HTTP origin documents-api is reachable at. Required — `server.ts`
   * derives it from `DOCUMENTS_SELF_BASE_URL` (or falls back to
   * `http://localhost:PORT`) before passing it in. The registry
   * returns this as the synthetic `documents` entry's `baseUrl` after
   * normalising it through `parseBareOrigin` so callers can always
   * append URL paths without a double-slash or stale path prefix.
   */
  readonly selfBaseUrl: string;
}

export function getPillarRegistry(options: PillarRegistryOptions): readonly PillarRegistryEntry[] {
  cached ??= parsePillarsEnv(process.env['POPS_PILLARS']);
  const normalisedSelf = parseBareOrigin('documents-api selfBaseUrl', options.selfBaseUrl);
  const withoutSelf = cached.filter((p) => p.id !== 'documents');
  return [{ id: 'documents', baseUrl: normalisedSelf }, ...withoutSelf];
}

/** Test-only: forget the cached registry so a new `POPS_PILLARS` is re-read. */
export function __resetPillarRegistryCache(): void {
  cached = undefined;
}
