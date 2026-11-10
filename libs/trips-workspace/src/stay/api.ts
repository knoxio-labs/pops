import { ApiError, unwrap } from '@pops/pillar-sdk/client';

import {
  placesList,
  staysGet,
  staysList,
  staysUpdate,
  tripsGet,
  visitsList,
} from '../trips-api/sdk.gen';

import type { Client } from '../trips-api/client';
import type { Stay, Visit, Place, Trip, StayPatch, StaySourceIdentity } from './types';

/** Load one stay through its owning trip without borrowing context fields. */
export async function loadStay({ tripId, stayId, client }: StaySourceIdentity): Promise<Stay> {
  return unwrap(await staysGet({ client, path: { tripId, id: stayId } }));
}
/** Persist only explicit fields; no external booking or source owner is modified. */
export async function patchStay(props: StaySourceIdentity, body: StayPatch): Promise<Stay> {
  return unwrap(
    await staysUpdate({
      client: props.client,
      path: { tripId: props.tripId, id: props.stayId },
      body,
    })
  );
}
/** Read a trip's independent accommodation sources. */
export async function loadStays(tripId: number, client?: Client): Promise<Stay[]> {
  return unwrap(await staysList({ client, path: { tripId } })).stays;
}
/** Read explicit route visits without deriving stay dates or selection. */
export async function loadVisits(tripId: number, client?: Client): Promise<Visit[]> {
  return unwrap(await visitsList({ client, path: { tripId } })).visits;
}
/** Read reusable source place names for existing visit identities. */
export async function loadPlaces(client?: Client): Promise<Place[]> {
  return unwrap(await placesList({ client })).places;
}
/** Read source trip metadata without inferring a trip title. */
export async function loadTrip(tripId: number, client?: Client): Promise<Trip> {
  return unwrap(await tripsGet({ client, path: { id: tripId } }));
}
/** Present only safe contract diagnostics; unexpected transport errors expose no raw details. */
export function requestProblem(
  error: unknown
): ApiError | { code: string; message: string; retryable: boolean } {
  return error instanceof ApiError
    ? error
    : {
        code: 'web.request.failed',
        message: 'The request could not be completed',
        retryable: true,
      };
}

/** Cache identity for one source stay, scoped to the supplied API origin and owning trip. */
export function stayQueryKey({
  tripId,
  stayId,
  client,
}: StaySourceIdentity): readonly ['trips', string, number, 'stay', number] {
  return ['trips', client?.getConfig().baseUrl ?? '/trips-api', tripId, 'stay', stayId] as const;
}

/** Cache identity for the complete trip-owned accommodation list. */
export function stayListQueryKey({
  tripId,
  client,
}: Pick<StaySourceIdentity, 'tripId' | 'client'>): readonly ['trips', string, number, 'stays'] {
  return ['trips', client?.getConfig().baseUrl ?? '/trips-api', tripId, 'stays'] as const;
}
