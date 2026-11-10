import { RetainedSessionStore } from '../shared/retained-session-store';

import type { RetainedSourceOwner } from '../shared/retained-session-store';

const keys = new RetainedSessionStore<readonly (string | number)[]>();

/** Resolve the same source cache key only for this exact host, client, origin, trip and Rental. */
export function rentalCacheKey(owner: RetainedSourceOwner): readonly (string | number)[] {
  return keys.retain(
    owner.scope,
    {
      client: owner.client,
      tripId: owner.tripId,
      kind: 'rental',
      sourceId: owner.sourceId,
    },
    () =>
      Object.freeze([
        'trips',
        owner.origin,
        owner.tripId,
        'rental',
        owner.sourceId,
        crypto.randomUUID(),
      ])
  ).session;
}
