import { unwrap } from '@pops/pillar-sdk/client';

import { useSourceQuery } from '../shared/use-source-query';
import { loadPlaces, loadStays, loadVisits } from '../stay/api';
import { journeysList } from '../trips-api/sdk.gen';

import type { UseQueryResult } from '@tanstack/react-query';

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
  const visits = useSourceQuery(
    { client: props.client, tripId: props.tripId, kind: 'visits-context', sourceId: 0 },
    (owner) => {
      const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
      return {
        queryKey: ['trips', origin, owner.tripId, 'visits'],
        load: () => loadVisits(owner.tripId, owner.client),
      };
    }
  );
  const stays = useSourceQuery(
    { client: props.client, tripId: props.tripId, kind: 'stays-context', sourceId: 0 },
    (owner) => {
      const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
      return {
        queryKey: ['trips', origin, owner.tripId, 'stays'],
        load: () => loadStays(owner.tripId, owner.client),
      };
    }
  );
  const journeys = useSourceQuery(
    { client: props.client, tripId: props.tripId, kind: 'journeys-context', sourceId: 0 },
    (owner) => {
      const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
      return {
        queryKey: ['trips', origin, owner.tripId, 'journeys'],
        load: () =>
          journeysList({ client: owner.client, path: { tripId: owner.tripId } }).then(
            (response) => unwrap(response).journeys
          ),
      };
    }
  );
  const places = useSourceQuery(
    { client: props.client, tripId: props.tripId, kind: 'places-context', sourceId: 0 },
    (owner) => {
      const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
      return { queryKey: ['trips', origin, 'places'], load: () => loadPlaces(owner.client) };
    }
  );
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
