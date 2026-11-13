import { ApiError, unwrap } from '@pops/pillar-sdk/client';
import { ErrorBodySchema } from '@pops/types';

import { client as defaultTagsClient } from '../tags-api/client.gen';
import { tagsList } from '../tags-api/sdk.gen';
import { client as defaultTripClient } from '../trips-api/client.gen';
import {
  placesList,
  tripsCreateOperation,
  tripsGet,
  tripsList,
  tripsUpdate,
  visitsList,
} from '../trips-api/sdk.gen';

import type {
  ApiClients,
  Trip,
  TripInput,
  TripCreateRequest,
  TripCreateResult,
  Visit,
  Place,
  Tag,
} from './types';

/** Read source trips without treating identity order as calendar order. */
export async function loadTrips(clients: ApiClients = {}): Promise<Trip[]> {
  return unwrap(await tripsList({ client: clients.tripClient })).trips;
}
/** Read a selected source trip through its actual identity. */
export async function loadTrip(id: number, clients: ApiClients = {}): Promise<Trip> {
  const result = await tripsGet({ client: clients.tripClient, path: { id } });
  if (result.response?.ok && result.response.status !== 200)
    throw new Error('Unexpected Trip read status');
  return unwrap(result);
}
/** A validated producer rejection proves that this command did not create a Trip. */
export class TripCreationRejection extends ApiError {}

/** Submit the exact durable command once; unsupported capability never falls back to plain POST. */
export async function createTripOperation(
  body: TripCreateRequest,
  clients: ApiClients = {}
): Promise<TripCreateResult> {
  const result = await tripsCreateOperation({ client: clients.tripClient, body });
  const failure = ErrorBodySchema.safeParse(result.error);
  if (
    result.response?.status === 400 &&
    failure.success &&
    !failure.data.retryable &&
    (failure.data.code === 'trips.trip.parent_invalid' ||
      failure.data.code === 'trips.trip.tag_unknown')
  )
    throw new TripCreationRejection({ ...failure.data, kind: 'client', status: 400 });
  const value = unwrap(result);
  if (result.response?.status !== 201) throw new Error('Unexpected Trip creation status');
  return value;
}
/** Change only supplied source metadata, preserving unrelated references. */
export async function updateTrip(
  id: number,
  body: TripInput,
  clients: ApiClients = {}
): Promise<Trip> {
  const result = await tripsUpdate({ client: clients.tripClient, path: { id }, body });
  if (result.response?.ok && result.response.status !== 200)
    throw new Error('Unexpected Trip update status');
  return unwrap(result);
}
/** Read visits in their published explicit route order. */
export async function loadVisits(tripId: number, clients: ApiClients = {}): Promise<Visit[]> {
  return unwrap(await visitsList({ client: clients.tripClient, path: { tripId } })).visits;
}
/** Read actual reusable place labels without inventing resolution. */
export async function loadPlaces(clients: ApiClients = {}): Promise<Place[]> {
  return unwrap(await placesList({ client: clients.tripClient })).places;
}
/** Read canonical available shared-tag choices; no vocabulary is cloned or written. */
export async function loadTags(clients: ApiClients = {}): Promise<Tag[]> {
  return unwrap(await tagsList({ client: clients.tagsClient })).tags;
}
/** Safe diagnostics retain contract codes while hiding unexpected transport details. */
export function sourceProblem(
  error: unknown
): ApiError | { code: string; message: string; retryable: boolean } {
  return error instanceof ApiError
    ? error
    : {
        code: 'trips.web.request_failed',
        message: 'The request could not be completed',
        retryable: true,
      };
}
/** Scope caches by API origin and owning source identity. */
export function tripKeys(clients: ApiClients = {}): {
  all: readonly ['trips', string, 'list'];
  places: readonly ['trips', string, 'places'];
  one: (id: number) => readonly ['trips', string, number];
  visits: (id: number) => readonly ['trips', string, number, 'visits'];
  tags: readonly ['tags', string, 'list'];
} {
  const origin = (clients.tripClient ?? defaultTripClient).getConfig().baseUrl ?? '';
  return {
    all: ['trips', origin, 'list'],
    places: ['trips', origin, 'places'],
    one: (id) => ['trips', origin, id],
    visits: (id) => ['trips', origin, id, 'visits'],
    tags: ['tags', (clients.tagsClient ?? defaultTagsClient).getConfig().baseUrl ?? '', 'list'],
  };
}
