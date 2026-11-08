import { parseBareOrigin } from '@pops/pillar-sdk/pillar-env';

import type { PillarRegistryEntry } from '@pops/types';

/** The trips pillar's stable registry id. */
export const TRIPS_PILLAR_ID = 'trips' as const;

/** Build the in-process roster entry for this pillar. */
export function getPillarRegistry(deps: { readonly selfBaseUrl: string }): PillarRegistryEntry[] {
  return [
    {
      id: TRIPS_PILLAR_ID,
      baseUrl: parseBareOrigin("trips pillar's selfBaseUrl", deps.selfBaseUrl),
    },
  ];
}
