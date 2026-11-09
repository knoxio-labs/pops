import { useQueries, useQuery } from '@tanstack/react-query';

import { loadPlaces, loadTrips, loadVisits, tripKeys } from '../api/source';

import type { ApiClients } from '../api/types';

/** Independent source queries preserve trip browsing when optional route context is unavailable. */
export function useHomeSources(clients: ApiClients) {
  const keys = tripKeys(clients);
  const trips = useQuery({ queryKey: keys.all, queryFn: () => loadTrips(clients), retry: false });
  const places = useQuery({
    queryKey: keys.places,
    queryFn: () => loadPlaces(clients),
    retry: false,
  });
  const visits = useQueries({
    queries: (trips.data ?? []).map((trip) => ({
      queryKey: keys.visits(trip.id),
      queryFn: () => loadVisits(trip.id, clients),
      retry: false,
    })),
  });
  const retryContext = (): void => {
    void places.refetch();
    visits.forEach((visit) => {
      if (visit.isError) void visit.refetch();
    });
  };
  return { trips, places, visits, retryContext };
}
