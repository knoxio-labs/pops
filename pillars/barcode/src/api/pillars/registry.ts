import { parseBareOrigin, parsePillarsEnv } from '@pops/pillar-sdk/pillar-env';

import type { PillarRegistryEntry } from '@pops/types';

let cached: readonly PillarRegistryEntry[] | undefined;

/** Input required to build the barcode pillar registry view. */
export interface PillarRegistryOptions {
  readonly selfBaseUrl: string;
}

/** Return the configured sibling roster with a synthetic barcode entry. */
export function getPillarRegistry(options: PillarRegistryOptions): readonly PillarRegistryEntry[] {
  cached ??= parsePillarsEnv(process.env['POPS_PILLARS']);
  const self = parseBareOrigin('barcode-api selfBaseUrl', options.selfBaseUrl);
  return [{ id: 'barcode', baseUrl: self }, ...cached.filter((pillar) => pillar.id !== 'barcode')];
}

/** Clear the process-local roster cache for isolated tests. */
export function resetPillarRegistryCache(): void {
  cached = undefined;
}
