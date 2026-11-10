import { unwrap } from '@pops/pillar-sdk/client';

import { meetingPlansList, meetingPlansOperate } from '../trips-api/sdk.gen';

import type { MeetingOperation, MeetingPlan, MeetingResult, PeopleWorkspaceProps } from './types';

/** Read live meeting sources without deriving Contact or Visit identity from display facts. */
export async function loadMeetingPlans(
  props: Pick<PeopleWorkspaceProps, 'tripId' | 'client'>
): Promise<MeetingPlan[]> {
  return unwrap(await meetingPlansList({ client: props.client, path: { tripId: props.tripId } }))
    .meetingPlans;
}
/** Apply the exact retained operation, including its UUID and original expected revision. */
export async function applyMeetingOperation(
  props: Pick<PeopleWorkspaceProps, 'tripId' | 'client'>,
  body: MeetingOperation
): Promise<MeetingResult> {
  return unwrap(
    await meetingPlansOperate({ client: props.client, path: { tripId: props.tripId }, body })
  );
}
/** Cache source identity includes the owning API origin and trip. */
export function peopleQueryKey(
  props: Pick<PeopleWorkspaceProps, 'tripId' | 'client'>
): readonly ['trips', string, number, 'meeting-plans'] {
  return [
    'trips',
    props.client?.getConfig().baseUrl ?? '/trips-api',
    props.tripId,
    'meeting-plans',
  ] as const;
}
