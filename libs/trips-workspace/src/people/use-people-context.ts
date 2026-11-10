import { useQuery } from '@tanstack/react-query';

import { loadPlaces, loadTrip, loadVisits } from '../stay/api';
import { readPeopleSource } from './source-owner';

import type { UseQueryResult } from '@tanstack/react-query';

import type { SourceOwner } from '../arrangements/source-owner';
import type { Visit, Place, Trip } from '../stay/types';
/** Independent source query results preserve cached data through optional context failures. */
export interface PeopleContext {
  owner: SourceOwner;
  visits: UseQueryResult<Visit[], Error>;
  places: UseQueryResult<Place[], Error>;
  trip: UseQueryResult<Trip, Error>;
}
/** Read route context under the view's captured owner; optional failures do not block meeting edits. */
export function usePeopleContext(owner: SourceOwner): PeopleContext {
  const { origin, tripId, client } = owner;
  const visits = useQuery({
    queryKey: ['trips', origin, tripId, 'visits'],
    queryFn: () => readPeopleSource(owner, () => loadVisits(tripId, client)),
    retry: false,
  });
  const places = useQuery({
    queryKey: ['trips', origin, 'places'],
    queryFn: () => readPeopleSource(owner, () => loadPlaces(client)),
    retry: false,
  });
  const trip = useQuery({
    queryKey: ['trips', origin, tripId],
    queryFn: () => readPeopleSource(owner, () => loadTrip(tripId, client)),
    retry: false,
  });
  return { owner, visits, places, trip };
}
