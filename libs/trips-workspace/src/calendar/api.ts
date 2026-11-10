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

/** Load complete source collections; preserve cancellation and recheck an optional owner fence before dependent reads. */
export async function loadCalendar(
  props: Pick<CalendarWorkspaceProps, 'tripId' | 'client'>,
  signal?: AbortSignal,
  assertCurrent?: () => void
): Promise<CalendarSnapshot> {
  assertCurrent?.();
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
        assertCurrent?.();
        const snapshot = unwrap(
          await journeysWorkspace({ ...options, path: { ...options.path, id: journey.id } })
        );
        return requireJourneySnapshot(snapshot, props.tripId, journey.id);
      })
    ),
  };
}
