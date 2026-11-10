import { useQuery } from '@tanstack/react-query';

import { loadTrip } from '../stay/api';
import { overviewLoaders } from './api';

import type { UseQueryResult } from '@tanstack/react-query';

import type { Trip } from '../stay/types';
import type { TripOverviewProps, OverviewSources } from './types';

/** Query states preserve availability separately for each source collection. */
export type OverviewQueries = { trip: UseQueryResult<Trip, Error> } & {
  [K in keyof Required<OverviewSources>]: UseQueryResult<Required<OverviewSources>[K], Error>;
};

/** Independent cached reads keep successful facts visible during optional source failures. */
export function useOverviewSources(props: TripOverviewProps): OverviewQueries {
  const origin = props.client?.getConfig().baseUrl ?? '/trips-api';
  const key = ['trips', origin, props.tripId];
  const loaders = overviewLoaders(props);
  const trip = useQuery({
    queryKey: key,
    queryFn: () => loadTrip(props.tripId, props.client),
    retry: false,
  });
  const visits = useQuery({ queryKey: [...key, 'visits'], queryFn: loaders.visits, retry: false });
  const places = useQuery({
    queryKey: ['trips', origin, 'places'],
    queryFn: loaders.places,
    retry: false,
  });
  const stays = useQuery({ queryKey: [...key, 'stays'], queryFn: loaders.stays, retry: false });
  const events = useQuery({ queryKey: [...key, 'events'], queryFn: loaders.events, retry: false });
  const journeys = useQuery({
    queryKey: [...key, 'journeys'],
    queryFn: loaders.journeys,
    retry: false,
  });
  const groups = useQuery({ queryKey: [...key, 'groups'], queryFn: loaders.groups, retry: false });
  const decisions = useQuery({
    queryKey: [...key, 'decisions'],
    queryFn: loaders.decisions,
    retry: false,
  });
  const documents = useQuery({
    queryKey: [...key, 'documents'],
    queryFn: loaders.documents,
    retry: false,
  });
  return { trip, visits, places, stays, events, journeys, groups, decisions, documents };
}
