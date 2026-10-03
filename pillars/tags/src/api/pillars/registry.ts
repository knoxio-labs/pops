import { parseBareOrigin } from '@pops/pillar-sdk/pillar-env';

import type { PillarRegistryEntry } from '@pops/types';

/** The tags pillar's stable registry id. */
export const TAGS_PILLAR_ID = 'tags' as const;

/** Build the in-process roster entry for this pillar. */
export function getPillarRegistry(deps: { readonly selfBaseUrl: string }): PillarRegistryEntry[] {
  return [
    {
      id: TAGS_PILLAR_ID,
      baseUrl: parseBareOrigin("tags pillar's selfBaseUrl", deps.selfBaseUrl),
    },
  ];
}
