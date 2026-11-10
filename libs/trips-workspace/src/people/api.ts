import { unwrap } from '@pops/pillar-sdk/client';

import { sourceOwner } from '../arrangements/source-owner';
import { meetingPlansList, meetingPlansOperate } from '../trips-api/sdk.gen';
import { readPeopleSource } from './source-owner';

import type { SourceOwner } from '../arrangements/source-owner';
import type { MeetingOperation, MeetingPlan, MeetingResult, PeopleWorkspaceProps } from './types';

/** Read live meeting sources without deriving Contact or Visit identity from display facts. */
export async function loadMeetingPlans(
  props: Pick<PeopleWorkspaceProps, 'tripId' | 'client'>
): Promise<MeetingPlan[]> {
  return loadOwnedMeetingPlans(sourceOwner(props));
}
/** Keep a retained query's captured owner through dispatch and result acceptance. */
export async function loadOwnedMeetingPlans(owner: SourceOwner): Promise<MeetingPlan[]> {
  return readPeopleSource(
    owner,
    async () =>
      unwrap(await meetingPlansList({ client: owner.client, path: { tripId: owner.tripId } }))
        .meetingPlans
  );
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
  return peopleOwnerQueryKey(sourceOwner(props));
}
/** Stable query and editor identity from an immutable captured semantic owner. */
export function peopleOwnerQueryKey(
  owner: SourceOwner
): readonly ['trips', string, number, 'meeting-plans'] {
  return ['trips', owner.origin, owner.tripId, 'meeting-plans'] as const;
}
