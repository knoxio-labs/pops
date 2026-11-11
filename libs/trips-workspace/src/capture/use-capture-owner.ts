import { useMemo } from 'react';

import { sourceOwner } from '../arrangements/source-owner';

import type { SourceOwner } from '../arrangements/source-owner';
import type { CaptureIdentity } from './types';

/** Reevaluate cache selection when an effective origin changes without changing the client instance. */
export function useCaptureQueryOwner(identity: CaptureIdentity): SourceOwner {
  const { client, origin, tripId } = sourceOwner(identity);
  return useMemo(() => Object.freeze({ client, origin, tripId }), [client, origin, tripId]);
}
