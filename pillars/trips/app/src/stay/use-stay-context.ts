import { useQuery } from '@tanstack/react-query';

import { loadPlaces, loadStays, loadTrip, loadVisits } from './api';

import type { StayWorkspaceProps } from './types';

/** Load optional source context independently so its failure never prevents stay editing. */
export function useStayContext({ tripId, client }: StayWorkspaceProps) {
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
    queryKey: ['trips', origin, tripId, 'stays'],
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
