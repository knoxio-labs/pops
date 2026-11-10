import { useQueries, useQuery } from '@tanstack/react-query';

import { loadPlaces, loadStays, loadTrip, loadVisits } from '../stay/api';
import {
  arrangementsKey,
  loadEvents,
  loadJourneys,
  loadLegs,
  loadRentals,
  loadResponsibilities,
} from './api';

import type { UseQueryResult } from '@tanstack/react-query';

import type { ArrangementSources, ArrangementsWorkspaceProps } from './types';

/** Independent source state, keyed errors and explicit refresh without fabricated empty coverage. */
export interface ArrangementsModel {
  sources: ArrangementSources;
  queries: { id: string; query: UseQueryResult<unknown, Error> }[];
  coverageComplete: boolean;
  complete: boolean;
  pending: boolean;
  refresh: () => Promise<void>;
}
/** Independent source requests preserve cached collections on failure; no failed collection becomes empty coverage. */
export function useArrangements(props: ArrangementsWorkspaceProps): ArrangementsModel {
  const key = arrangementsKey(props);
  const trip = useSource(key, () => loadTrip(props.tripId, props.client));
  const visits = useSource([...key, 'visits'], () => loadVisits(props.tripId, props.client));
  const places = useSource(['trips', key[1], 'places'], () => loadPlaces(props.client));
  const stays = useSource([...key, 'stays'], () => loadStays(props.tripId, props.client));
  const events = useSource([...key, 'events'], () => loadEvents(props));
  const journeys = useSource([...key, 'journeys'], () => loadJourneys(props));
  const rentals = useSource([...key, 'rentals'], () => loadRentals(props));
  const responsibilities = useSource([...key, 'responsibilities'], () =>
    loadResponsibilities(props)
  );
  const legs = useQueries({
    queries: (journeys.data ?? []).map((journey) => ({
      queryKey: [...key, 'journey', journey.id, 'legs'],
      queryFn: () => loadLegs(props, journey.id),
      retry: false,
    })),
  });
  const sources: ArrangementSources = {
    trip: trip.data,
    visits: visits.data,
    places: places.data,
    stays: stays.data,
    events: events.data,
    journeys: journeys.data,
    rentals: rentals.data,
    responsibilities: responsibilities.data,
    legs: new Map((journeys.data ?? []).map((journey, index) => [journey.id, legs[index]?.data])),
  };
  const queries = [
    { id: 'trip', query: trip },
    { id: 'visits', query: visits },
    { id: 'places', query: places },
    { id: 'stays', query: stays },
    { id: 'events', query: events },
    { id: 'journeys', query: journeys },
    { id: 'rentals', query: rentals },
    { id: 'responsibilities', query: responsibilities },
    ...legs.map((query, index) => ({ id: `legs:${journeys.data?.[index]?.id}`, query })),
  ];
  const required = [stays, events, journeys, rentals];
  return {
    sources,
    queries,
    coverageComplete:
      stays.isSuccess && !stays.isFetching && visits.isSuccess && !visits.isFetching,
    complete: required.every((query) => query.isSuccess) && legs.every((query) => query.isSuccess),
    pending: [...required, visits].some((query) => query.isPending),
    refresh: async (): Promise<void> => {
      await Promise.all(queries.map(({ query }) => query.refetch()));
    },
  };
}

function useSource<T>(
  queryKey: readonly (string | number)[],
  queryFn: () => Promise<T>
): UseQueryResult<T, Error> {
  return useQuery({ queryKey, queryFn, retry: false });
}
