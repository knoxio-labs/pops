import { useQuery } from '@tanstack/react-query';

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
  const origin = props.client?.getConfig().baseUrl ?? '/trips-api';
  const base = ['trips', origin, props.tripId];
  return {
    trip: useQuery({
      queryKey: base,
      queryFn: () => loadTrip(props.tripId, props.client),
      retry: false,
    }),
    visits: useQuery({
      queryKey: [...base, 'visits'],
      queryFn: () => loadVisits(props.tripId, props.client),
      retry: false,
    }),
    places: useQuery({
      queryKey: ['trips', origin, 'places'],
      queryFn: () => loadPlaces(props.client),
      retry: false,
    }),
    stays: useQuery({
      queryKey: [...base, 'stays'],
      queryFn: () => loadStays(props.tripId, props.client),
      retry: false,
    }),
    events: useQuery({
      queryKey: [...base, 'events'],
      queryFn: () => loadEvents(props),
      retry: false,
    }),
  };
}
