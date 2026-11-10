import { useQuery } from '@tanstack/react-query';

import { loadPlaces, loadStays, loadTrip, loadVisits, stayListQueryKey } from './api';

import type { UseQueryResult } from '@tanstack/react-query';

import type { Stay, Visit, Place, Trip, StaySourceIdentity } from './types';

/** Load optional source context independently so its failure never prevents stay editing. */
export function useStayContext({ tripId, client }: StaySourceIdentity): StayContext {
  const origin = client?.getConfig().baseUrl ?? '/trips-api';
  const trip = useQuery({
    queryKey: ['trips', origin, tripId],
    queryFn: () => loadTrip(tripId, client),
    retry: false,
  });
  const visits = useQuery({
    queryKey: ['trips', origin, tripId, 'visits'],
    queryFn: () => loadVisits(tripId, client),
    retry: false,
  });
  const stays = useQuery({
    queryKey: stayListQueryKey({ tripId, client }),
    queryFn: () => loadStays(tripId, client),
    retry: false,
  });
  const places = useQuery({
    queryKey: ['trips', origin, 'places'],
    queryFn: () => loadPlaces(client),
    retry: false,
  });
  return { trip, visits, stays, places };
}

/** Independently available source queries; each may fail without blocking edits. */
export interface StayContext {
  trip: UseQueryResult<Trip, Error>;
  visits: UseQueryResult<Visit[], Error>;
  stays: UseQueryResult<Stay[], Error>;
  places: UseQueryResult<Place[], Error>;
}
