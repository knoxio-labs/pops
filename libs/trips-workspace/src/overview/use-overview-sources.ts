import { captureQueryKey } from '../capture/api';
import { peopleQueryKey } from '../people/api';
import { useSourceQuery } from '../shared/use-source-query';
import { loadTrip } from '../stay/api';
import { overviewLoaders } from './api';
import { readOverviewSource } from './source-read';

import type { SourceQuery } from '../shared/use-source-query';
import type { Trip } from '../stay/types';
import type { TripOverviewProps, OverviewSources } from './types';

type Collections = Required<OverviewSources>;
type Identity = Pick<TripOverviewProps, 'client' | 'tripId'>;

/** Query states retain their captured owners as well as independent source availability. */
export type OverviewQueries = { trip: SourceQuery<Trip> } & {
  [K in keyof Collections]: SourceQuery<Collections[K]>;
};

/** Independent cached reads preserve successful facts without admitting another transport's responses. */
export function useOverviewSources(props: TripOverviewProps): OverviewQueries {
  const trip = useSourceQuery({ ...props, kind: 'overview-trip', sourceId: 0 }, (owner) => ({
    queryKey: ['trips', owner.client.getConfig().baseUrl ?? '/trips-api', owner.tripId],
    load: () => readOverviewSource(owner, () => loadTrip(owner.tripId, owner.client)),
  }));
  const visits = useOverviewCollection(props, 'visits');
  const places = useOverviewCollection(props, 'places');
  const stays = useOverviewCollection(props, 'stays');
  const events = useOverviewCollection(props, 'events');
  const journeys = useOverviewCollection(props, 'journeys');
  const groups = useOverviewCollection(props, 'groups');
  const decisions = useOverviewCollection(props, 'decisions');
  const documents = useOverviewCollection(props, 'documents');
  const meetings = useOverviewCollection(props, 'meetings');
  const capture = useOverviewCollection(props, 'capture');
  const rentals = useOverviewCollection(props, 'rentals');
  return {
    trip,
    visits,
    places,
    stays,
    events,
    journeys,
    groups,
    decisions,
    documents,
    meetings,
    capture,
    rentals,
  };
}

function useOverviewCollection<Kind extends keyof Collections>(
  props: Identity,
  kind: Kind
): SourceQuery<Collections[Kind]> {
  return useSourceQuery({ ...props, kind: `overview-${kind}`, sourceId: 0 }, (owner) => {
    const identity = { tripId: owner.tripId, client: owner.client };
    const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
    const loaders = overviewLoaders(identity);
    let queryKey: readonly (string | number)[] = ['trips', origin, owner.tripId, kind];
    if (kind === 'places') queryKey = ['trips', origin, kind];
    if (kind === 'meetings') queryKey = peopleQueryKey(identity);
    if (kind === 'capture') queryKey = captureQueryKey(identity);
    return { queryKey, load: () => readOverviewSource(owner, loaders[kind]) };
  });
}
