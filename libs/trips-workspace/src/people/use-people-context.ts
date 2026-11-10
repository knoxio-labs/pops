import { useQuery } from '@tanstack/react-query';

import { sourceOwner } from '../arrangements/source-owner';
import { loadPlaces, loadTrip, loadVisits } from '../stay/api';

import type { UseQueryResult } from '@tanstack/react-query';

import type { Visit, Place, Trip } from '../stay/types';
import type { PeopleWorkspaceProps } from './types';
/** Independent source query results preserve cached data through optional context failures. */
export interface PeopleContext {
  visits: UseQueryResult<Visit[], Error>;
  places: UseQueryResult<Place[], Error>;
  trip: UseQueryResult<Trip, Error>;
}
/** Read independent route context without blocking meeting edits when a catalogue fails. */
export function usePeopleContext(props: PeopleWorkspaceProps): PeopleContext {
  const origin = sourceOwner(props).origin;
  const visits = useQuery({
    queryKey: ['trips', origin, props.tripId, 'visits'],
    queryFn: () => loadVisits(props.tripId, props.client),
    retry: false,
  });
  const places = useQuery({
    queryKey: ['trips', origin, 'places'],
    queryFn: () => loadPlaces(props.client),
    retry: false,
  });
  const trip = useQuery({
    queryKey: ['trips', origin, props.tripId],
    queryFn: () => loadTrip(props.tripId, props.client),
    retry: false,
  });
  return { visits, places, trip };
}
