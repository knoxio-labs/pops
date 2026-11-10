import { unwrap } from '@pops/pillar-sdk/client';

import { eventsGet, eventsUpdate } from '../trips-api/sdk.gen';

import type { EventPatch, EventWorkspaceProps, TripEvent } from './types';

/** Read the exact trip-owned event, without deriving route association. */
export async function loadEvent(props: EventWorkspaceProps): Promise<TripEvent> {
  return unwrap(
    await eventsGet({ client: props.client, path: { tripId: props.tripId, id: props.eventId } })
  );
}
/** Persist explicit source changes without changing bookings or reference owners. */
export async function patchEvent(props: EventWorkspaceProps, body: EventPatch): Promise<TripEvent> {
  return unwrap(
    await eventsUpdate({
      client: props.client,
      path: { tripId: props.tripId, id: props.eventId },
      body,
    })
  );
}
/** Scope source cache entries to transport origin, owning trip and event identity. */
export function eventQueryKey(
  props: EventWorkspaceProps
): readonly ['trips', string, number, 'event', number] {
  return [
    'trips',
    props.client?.getConfig().baseUrl ?? '/trips-api',
    props.tripId,
    'event',
    props.eventId,
  ] as const;
}
