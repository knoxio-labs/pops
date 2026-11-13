import type { Client as TagsClient } from '../tags-api/client';
import type { TagsListResponses } from '../tags-api/types.gen';
import type { Client } from '../trips-api/client';
import type {
  PlacesListResponses,
  TripsGetResponses,
  TripsCreateData,
  TripsCreateOperationData,
  TripsCreateOperationResponses,
  VisitsListResponses,
} from '../trips-api/types.gen';

/** Trips-owned metadata projected from its canonical OpenAPI contract. */
export type Trip = TripsGetResponses[200];
/** Explicit trip metadata writes; omitted source links remain untouched. */
export type TripInput = NonNullable<TripsCreateData['body']>;
/** One durable creation command; retries preserve its UUID and exact explicit input. */
export type TripCreateRequest = NonNullable<TripsCreateOperationData['body']>;
/** Original creation receipt and current source are separate producer-owned facts. */
export type TripCreateResult = TripsCreateOperationResponses[201];
/** One ordered source visit, independent of trip planning text. */
export type Visit = VisitsListResponses[200]['visits'][number];
/** Reusable Trips-owned source place. */
export type Place = PlacesListResponses[200]['places'][number];
/** Shared vocabulary remains owned by Tags, including archive and merge state. */
export type Tag = TagsListResponses[200]['tags'][number];
/** Optional explicit transports for a host or integration harness. */
export interface ApiClients {
  tripClient?: Client;
  tagsClient?: TagsClient;
}

/** Stable default transport selection; generated clients retain their configured same-origin proxies. */
export const defaultClients: ApiClients = Object.freeze({});
