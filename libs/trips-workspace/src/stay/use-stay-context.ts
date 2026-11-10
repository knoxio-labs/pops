import { useSourceQuery } from '../shared/use-source-query';
import { loadPlaces, loadStays, loadTrip, loadVisits, stayListQueryKey } from './api';

import type { UseQueryResult } from '@tanstack/react-query';

import type { Stay, Visit, Place, Trip, StaySourceIdentity } from './types';

/** Load optional source context independently so its failure never prevents stay editing. */
export function useStayContext({ tripId, client }: StaySourceIdentity): StayContext {
  const trip = useSourceQuery({ client, tripId, kind: 'trip-context', sourceId: 0 }, (owner) => {
    const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
    return {
      queryKey: ['trips', origin, owner.tripId],
      load: () => loadTrip(owner.tripId, owner.client),
    };
  });
  const visits = useSourceQuery(
    { client, tripId, kind: 'visits-context', sourceId: 0 },
    (owner) => {
      const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
      return {
        queryKey: ['trips', origin, owner.tripId, 'visits'],
        load: () => loadVisits(owner.tripId, owner.client),
      };
    }
  );
  const stays = useSourceQuery({ client, tripId, kind: 'stays-context', sourceId: 0 }, (owner) => {
    return {
      queryKey: stayListQueryKey({ tripId: owner.tripId, client: owner.client }),
      load: () => loadStays(owner.tripId, owner.client),
    };
  });
  const places = useSourceQuery(
    { client, tripId, kind: 'places-context', sourceId: 0 },
    (owner) => {
      const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
      return { queryKey: ['trips', origin, 'places'], load: () => loadPlaces(owner.client) };
    }
  );
  return { trip, visits, stays, places };
}

/** Independently available source queries; each may fail without blocking edits. */
export interface StayContext {
  trip: UseQueryResult<Trip, Error>;
  visits: UseQueryResult<Visit[], Error>;
  stays: UseQueryResult<Stay[], Error>;
  places: UseQueryResult<Place[], Error>;
}
