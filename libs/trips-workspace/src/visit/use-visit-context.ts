import { useSourceQuery } from '../shared/use-source-query';
import { loadPlaces, loadStays, loadTrip, loadVisits } from '../stay/api';
import { loadEvents } from './api';

import type { UseQueryResult } from '@tanstack/react-query';

import type { Trip } from '../stay/types';
import type { Place, Stay, TripEvent, Visit, VisitWorkspaceProps } from './types';

/** Independent canonical context reads retained during background failures. */
export interface VisitContext {
  trip: UseQueryResult<Trip>;
  visits: UseQueryResult<Visit[]>;
  places: UseQueryResult<Place[]>;
  stays: UseQueryResult<Stay[]>;
  events: UseQueryResult<TripEvent[]>;
}

/** Independent source context failures do not block direct visit editing. */
export function useVisitContext(props: VisitWorkspaceProps): VisitContext {
  return {
    trip: useSourceQuery(
      { client: props.client, tripId: props.tripId, kind: 'trip-context', sourceId: 0 },
      (owner) => {
        const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
        return {
          queryKey: ['trips', origin, owner.tripId],
          load: () => loadTrip(owner.tripId, owner.client),
        };
      }
    ),
    visits: useSourceQuery(
      { client: props.client, tripId: props.tripId, kind: 'visits-context', sourceId: 0 },
      (owner) => {
        const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
        return {
          queryKey: ['trips', origin, owner.tripId, 'visits'],
          load: () => loadVisits(owner.tripId, owner.client),
        };
      }
    ),
    places: useSourceQuery(
      { client: props.client, tripId: props.tripId, kind: 'places-context', sourceId: 0 },
      (owner) => {
        const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
        return { queryKey: ['trips', origin, 'places'], load: () => loadPlaces(owner.client) };
      }
    ),
    stays: useSourceQuery(
      { client: props.client, tripId: props.tripId, kind: 'stays-context', sourceId: 0 },
      (owner) => {
        const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
        return {
          queryKey: ['trips', origin, owner.tripId, 'stays'],
          load: () => loadStays(owner.tripId, owner.client),
        };
      }
    ),
    events: useSourceQuery(
      { client: props.client, tripId: props.tripId, kind: 'events-context', sourceId: 0 },
      (owner) => {
        const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
        return {
          queryKey: ['trips', origin, owner.tripId, 'events'],
          load: () =>
            loadEvents({ client: owner.client, tripId: owner.tripId, visitId: props.visitId }),
        };
      }
    ),
  };
}
