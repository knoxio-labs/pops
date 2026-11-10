import { unwrap, ApiError } from '@pops/pillar-sdk/client';

import {
  journeysGet,
  journeysUpdate,
  journeysTiming,
  journeyLegsList,
  journeyGroupsList,
  journeyGroupsSelect,
  journeyGroupsCreate,
  journeyGroupsAddBlank,
} from '../trips-api/sdk.gen';
import { applyLegCommand } from './leg-api';
import { journeySource } from './model';

import type {
  JourneyWorkspaceProps,
  JourneySource,
  JourneyCommand,
  JourneyChangeResult,
  JourneyGroup,
  JourneyTiming,
  Journey,
} from './types';

/** Scope source identity to the actual host transport and owning trip. */
export function journeyKey(
  props: JourneyWorkspaceProps
): readonly ['trips', string, number, 'journey', number] {
  return [
    'trips',
    props.client?.getConfig().baseUrl ?? '/trips-api',
    props.tripId,
    'journey',
    props.journeyId,
  ] as const;
}
/** Read source metadata and ordered legs without deriving placement or clocks. */
export async function loadJourney(props: JourneyWorkspaceProps): Promise<JourneySource> {
  const options = { client: props.client, path: { tripId: props.tripId, id: props.journeyId } };
  const [journey, response] = await Promise.all([
    journeysGet(options).then((response) => unwrap(response)),
    journeyLegsList({
      client: props.client,
      path: { tripId: props.tripId, journeyId: props.journeyId },
    }).then((response) => unwrap(response)),
  ]);
  if (!Number.isSafeInteger(response.revision) || response.revision < 0)
    throw new ApiError({
      code: 'trips.journey_leg.source_invalid',
      kind: 'client',
      message: 'The leg source did not provide a valid revision. Reload before editing.',
      retryable: true,
    });
  return { journey, legs: response.legs, legRevision: response.revision };
}
/** Read signed chronology only from the owning deterministic projection. */
export async function loadTiming(props: JourneyWorkspaceProps): Promise<JourneyTiming> {
  return unwrap(
    await journeysTiming({
      client: props.client,
      path: { tripId: props.tripId, id: props.journeyId },
    })
  );
}
/** Read explicit alternative membership without deriving it from matching endpoints. */
export async function loadGroups(props: JourneyWorkspaceProps): Promise<JourneyGroup[]> {
  return unwrap(await journeyGroupsList({ client: props.client, path: { tripId: props.tripId } }))
    .groups;
}
/** Persist an explicit selection with its optimistic revision precondition. */
export async function selectJourney(
  props: JourneyWorkspaceProps,
  group: Pick<JourneyGroup, 'id' | 'revision'>,
  journeyId: number
): Promise<JourneyGroup> {
  return unwrap(
    await journeyGroupsSelect({
      client: props.client,
      path: { tripId: props.tripId, id: group.id },
      body: { journeyId, expectedRevision: group.revision },
    })
  );
}
/** Create explicit membership for a previously ungrouped source journey. */
export async function createGroup(props: JourneyWorkspaceProps): Promise<JourneyGroup> {
  return unwrap(
    await journeyGroupsCreate({
      client: props.client,
      path: { tripId: props.tripId },
      body: { currentJourneyId: props.journeyId },
    })
  );
}
/** Add a new empty independent source, guarded by the latest grouping revision. */
export async function addAlternative(
  props: JourneyWorkspaceProps,
  group: JourneyGroup
): Promise<{ group: JourneyGroup; journey: Journey }> {
  return unwrap(
    await journeyGroupsAddBlank({
      client: props.client,
      path: { tripId: props.tripId, id: group.id },
      body: { expectedRevision: group.revision },
    })
  );
}
/** Execute a prepared source operation; inverse preconditions come only from confirmed owned writes. */
export async function changeJourney(
  props: JourneyWorkspaceProps,
  source: JourneySource,
  change: JourneyCommand
): Promise<JourneyChangeResult> {
  if (change.kind !== 'journey') return applyLegCommand(props, source, change);
  const journey = unwrap(
    await journeysUpdate({
      client: props.client,
      path: { tripId: props.tripId, id: props.journeyId },
      body: change.patch,
    })
  );
  return {
    source: { ...source, journey },
    inverse: { kind: 'journey', patch: journeySource(source.journey) },
  };
}
