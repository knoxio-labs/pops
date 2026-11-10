import { unwrap } from '@pops/pillar-sdk/client';

import { loadRentals } from '../arrangements/api';
import { loadCaptureSource } from '../capture/api';
import { loadMeetingPlans } from '../people/api';
import {
  decisionsList,
  documentAssociationsList,
  eventsList,
  journeyGroupsList,
  journeysList,
  placesList,
  staysList,
  visitsList,
} from '../trips-api/sdk.gen';

import type { TripOverviewProps, OverviewSources } from './types';

/** Complete collection shapes indexed by their source names. */
type Collections = Required<OverviewSources>;
/** Independently invocable source loaders. */
export type OverviewLoaders = { [K in keyof Collections]: () => Promise<Collections[K]> };

/** Read each collection independently through the owning generated Trips transport. */
export function overviewLoaders({ tripId, client }: TripOverviewProps): OverviewLoaders {
  const options = { client, path: { tripId } };
  return {
    visits: async (): Promise<Collections['visits']> => unwrap(await visitsList(options)).visits,
    places: async (): Promise<Collections['places']> => unwrap(await placesList({ client })).places,
    stays: async (): Promise<Collections['stays']> => unwrap(await staysList(options)).stays,
    events: async (): Promise<Collections['events']> => unwrap(await eventsList(options)).events,
    journeys: async (): Promise<Collections['journeys']> =>
      unwrap(await journeysList(options)).journeys,
    groups: async (): Promise<Collections['groups']> =>
      unwrap(await journeyGroupsList(options)).groups,
    decisions: async (): Promise<Collections['decisions']> =>
      unwrap(await decisionsList(options)).decisions,
    documents: async (): Promise<Collections['documents']> =>
      unwrap(await documentAssociationsList(options)).associations,
    meetings: () => loadMeetingPlans({ tripId, client }),
    capture: () => loadCaptureSource({ tripId, client }),
    rentals: () => loadRentals({ tripId, client }),
  };
}
