import { unwrap } from '@pops/pillar-sdk/client';

import {
  eventsList,
  journeysList,
  journeyGroupsList,
  journeysWorkspace,
  staysList,
} from '../trips-api/sdk.gen';
import { requireJourneySnapshot } from './snapshot';

import type { CalendarSnapshot, CalendarWorkspaceProps } from './types';

/** Load complete published collections and owning journey projections; abort obsolete reads. */
export async function loadCalendar(
  props: Pick<CalendarWorkspaceProps, 'tripId' | 'client'>,
  signal?: AbortSignal
): Promise<CalendarSnapshot> {
  const options = { client: props.client, path: { tripId: props.tripId }, signal };
  const [journeys, groups, stays, events] = await Promise.all([
    journeysList(options).then((response) => unwrap(response)),
    journeyGroupsList(options).then((response) => unwrap(response)),
    staysList(options).then((response) => unwrap(response)),
    eventsList(options).then((response) => unwrap(response)),
  ]);
  return {
    groups: groups.groups,
    stays: stays.stays,
    events: events.events,
    journeys: await Promise.all(
      journeys.journeys.map(async (journey) => {
        const snapshot = unwrap(
          await journeysWorkspace({ ...options, path: { ...options.path, id: journey.id } })
        );
        return requireJourneySnapshot(snapshot, props.tripId, journey.id);
      })
    ),
  };
}
