import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@pops/pillar-sdk/client';

import { loadPlaces, loadStays, loadVisits } from '../stay/api';
import { journeysList } from '../trips-api/sdk.gen';

import type { JourneysListResponses } from '../trips-api/types.gen';
import type { AffectedSource, DecisionWorkspaceProps } from './types';

/** A selectable live source identity, with a nullable source-provided display fact. */
export interface DecisionPlan extends AffectedSource {
  name?: string | null;
}
/** Optional source catalogue query states and their explicit live identities. */
export interface DecisionContext {
  plans: DecisionPlan[];
  queries: {
    visits: UseQueryResult<Awaited<ReturnType<typeof loadVisits>>, Error>;
    stays: UseQueryResult<Awaited<ReturnType<typeof loadStays>>, Error>;
    places: UseQueryResult<Awaited<ReturnType<typeof loadPlaces>>, Error>;
    journeys: UseQueryResult<JourneysListResponses[200]['journeys'], Error>;
  };
}
/** Independently load optional context; unavailable catalogues never replace or block decision facts. */
export function useDecisionContext(props: DecisionWorkspaceProps): DecisionContext {
  const origin = props.client?.getConfig().baseUrl ?? '/trips-api';
  const prefix = ['trips', origin, props.tripId];
  const visits = useQuery({
    queryKey: [...prefix, 'visits'],
    queryFn: () => loadVisits(props.tripId, props.client),
    retry: false,
  });
  const stays = useQuery({
    queryKey: [...prefix, 'stays'],
    queryFn: () => loadStays(props.tripId, props.client),
    retry: false,
  });
  const journeys = useQuery({
    queryKey: [...prefix, 'journeys'],
    queryFn: async () =>
      unwrap(await journeysList({ client: props.client, path: { tripId: props.tripId } })).journeys,
    retry: false,
  });
  const places = useQuery({
    queryKey: ['trips', origin, 'places'],
    queryFn: () => loadPlaces(props.client),
    retry: false,
  });
  const plans: DecisionPlan[] = [
    ...(visits.data ?? []).map((visit) => ({
      kind: 'visit' as const,
      id: visit.id,
      name: places.data?.find((place) => place.id === visit.placeId)?.name,
    })),
    ...(journeys.data ?? []).map((journey) => ({
      kind: 'journey' as const,
      id: journey.id,
      name: journey.name,
    })),
    ...(stays.data ?? []).map((stay) => ({ kind: 'stay' as const, id: stay.id, name: stay.name })),
  ];
  return { plans, queries: { visits, stays, journeys, places } };
}
/** Explicit arrangement identity stays visible even when its source or name is unavailable. */
export function planLabel(source: AffectedSource, plans: readonly DecisionPlan[]): string {
  const plan = plans.find(
    (candidate) => candidate.kind === source.kind && candidate.id === source.id
  );
  const identity = `${source.kind} ${source.id}`;
  return plan?.name ? `${identity}: ${plan.name}` : identity;
}
