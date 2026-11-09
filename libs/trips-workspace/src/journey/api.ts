import { unwrap } from '@pops/pillar-sdk/client';

import {
  journeysGet,
  journeysUpdate,
  journeysTiming,
  journeyLegsList,
  journeyLegsUpdate,
  journeyLegsReorder,
  journeyLegsCreate,
  journeyLegsDelete,
  journeyGroupsList,
  journeyGroupsSelect,
  journeyGroupsCreate,
  journeyGroupsAddBlank,
} from '../trips-api/sdk.gen';
import { journeySource, legSource } from './model';

import type {
  JourneyWorkspaceProps,
  JourneySource,
  JourneyChange,
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
  return { journey, legs: response.legs };
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
/** Execute one source operation and return the inverse that preserves existing source identity. */
export async function changeJourney(
  props: JourneyWorkspaceProps,
  source: JourneySource,
  change: JourneyChange
): Promise<{ source: JourneySource; inverse?: JourneyChange }> {
  const common = {
    client: props.client,
    path: { tripId: props.tripId, journeyId: props.journeyId },
  };
  switch (change.kind) {
    case 'journey': {
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
    case 'leg': {
      const previous = source.legs.find((leg) => leg.id === change.id);
      if (!previous) throw new Error('Missing source leg');
      const leg = unwrap(
        await journeyLegsUpdate({
          ...common,
          path: { ...common.path, id: change.id },
          body: change.patch,
        })
      );
      return {
        source: {
          ...source,
          legs: source.legs.map((entry) => (entry.id === leg.id ? leg : entry)),
        },
        inverse: { kind: 'leg', id: leg.id, patch: legSource(previous) },
      };
    }
    case 'order': {
      const result = unwrap(await journeyLegsReorder({ ...common, body: { legIds: change.ids } }));
      return {
        source: { ...source, legs: result.legs },
        inverse: { kind: 'order', ids: source.legs.map((leg) => leg.id) },
      };
    }
    case 'create': {
      const leg = unwrap(await journeyLegsCreate({ ...common, body: change.patch }));
      return {
        source: { ...source, legs: [...source.legs, leg] },
        inverse: { kind: 'remove', id: leg.id },
      };
    }
    case 'remove':
      return removeLeg(props, source, change.id);
  }
}

async function removeLeg(
  props: JourneyWorkspaceProps,
  source: JourneySource,
  id: number
): Promise<{ source: JourneySource }> {
  unwrap(
    await journeyLegsDelete({
      client: props.client,
      path: { tripId: props.tripId, journeyId: props.journeyId, id },
    })
  );
  return { source: { ...source, legs: source.legs.filter((leg) => leg.id !== id) } };
}
