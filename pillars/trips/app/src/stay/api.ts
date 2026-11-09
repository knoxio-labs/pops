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
import type { StayPatch, StayWorkspaceProps } from './types';

/** Load one stay through its owning trip without borrowing context fields. */
export async function loadStay({ tripId, stayId, client }: StayWorkspaceProps) {
  return unwrap(await staysGet({ client, path: { tripId, id: stayId } }));
}
/** Persist only explicit fields; no external booking or source owner is modified. */
export async function patchStay(props: StayWorkspaceProps, body: StayPatch) {
  return unwrap(
    await staysUpdate({
      client: props.client,
      path: { tripId: props.tripId, id: props.stayId },
      body,
    })
  );
}
/** Read a trip's independent accommodation sources. */
export async function loadStays(tripId: number, client?: Client) {
  return unwrap(await staysList({ client, path: { tripId } })).stays;
}
/** Read explicit route visits without deriving stay dates or selection. */
export async function loadVisits(tripId: number, client?: Client) {
  return unwrap(await visitsList({ client, path: { tripId } })).visits;
}
/** Read reusable source place names for existing visit identities. */
export async function loadPlaces(client?: Client) {
  return unwrap(await placesList({ client })).places;
}
/** Read source trip metadata without inferring a trip title. */
export async function loadTrip(tripId: number, client?: Client) {
  return unwrap(await tripsGet({ client, path: { id: tripId } }));
}
/** Present only safe contract diagnostics; unexpected transport errors expose no raw details. */
export function requestProblem(error: unknown) {
  return error instanceof ApiError
    ? error
    : {
        code: 'web.request.failed',
        message: 'The request could not be completed',
        retryable: true,
      };
}
