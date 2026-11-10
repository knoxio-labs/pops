import { unwrap } from '@pops/pillar-sdk/client';

import { eventsList, placesCreate, visitsGet, visitsUpdate } from '../trips-api/sdk.gen';

import type {
  GuardedVisitPatch,
  Place,
  TripEvent,
  Visit,
  VisitPatch,
  VisitWorkspaceProps,
} from './types';

/** Read a visit through its owning trip without supplying neighbouring dates. */
export async function loadVisit({ tripId, visitId, client }: VisitWorkspaceProps): Promise<Visit> {
  return unwrap(await visitsGet({ client, path: { tripId, id: visitId } }));
}
/** Persist explicit visit fields; callers supply the exact confirmed source revision. */
export async function patchVisit(
  props: VisitWorkspaceProps,
  body: GuardedVisitPatch
): Promise<Visit> {
  return unwrap(
    await visitsUpdate({
      client: props.client,
      path: { tripId: props.tripId, id: props.visitId },
      body,
    })
  );
}
/** Read all independent activity sources, preserving Alternative and unplaced records. */
export async function loadEvents({ tripId, client }: VisitWorkspaceProps): Promise<TripEvent[]> {
  return unwrap(await eventsList({ client, path: { tripId } })).events;
}
/** Source cache identity includes the owning trip, literal visit and transport origin. */
export function visitQueryKey({
  tripId,
  visitId,
  client,
}: VisitWorkspaceProps): readonly ['trips', string, number, 'visit', number] {
  return ['trips', client?.getConfig().baseUrl ?? '/trips-api', tripId, 'visit', visitId];
}
/** Mutable source facts for inverse PATCH, excluding identity, audit and revision metadata. */
export function visitSource({ placeId, timing, notes, sourceLinks }: Visit): VisitPatch {
  return { placeId, timing, notes, sourceLinks };
}

/** Capture a reusable manually named place without merging matching labels. */
export async function createVisitPlace(props: VisitWorkspaceProps, name: string): Promise<Place> {
  return unwrap(await placesCreate({ client: props.client, body: { name } }));
}
