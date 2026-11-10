import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { addAlternative, createGroup, loadGroups } from './api';
import { useJourneyOperation } from './use-journey-operation';
import { useJourneySelection } from './use-journey-selection';

import type { UseQueryResult } from '@tanstack/react-query';

import type { JourneyGroup, JourneyWorkspaceProps } from './types';
import type { JourneyNavigation } from './use-journey-navigation';
import type { JourneySelection } from './use-journey-selection';

/** Explicit membership and independent source identity of the expanded editor. */
export interface ExpandedJourneyOption {
  groupId: number;
  journeyId: number;
}

/** Explicit memberships and source expansion, sharing workspace-local selection history. */
export interface JourneyAlternativesModel extends JourneySelection {
  query: UseQueryResult<JourneyGroup[], Error>;
  groups: JourneyGroup[];
  expanded: ExpandedJourneyOption | undefined;
  setExpanded: (id: ExpandedJourneyOption | undefined) => void;
  busy: boolean;
  needsReload: boolean;
  failure: unknown;
  add: (group?: JourneyGroup) => Promise<void>;
  reload: () => void;
}
/** Operate only on an explicit group; a literal source can participate in several memberships. */
export function useJourneyAlternatives(
  identity: JourneyWorkspaceProps,
  navigation: JourneyNavigation
): JourneyAlternativesModel {
  const key = [
    'trips',
    identity.client?.getConfig().baseUrl ?? '/trips-api',
    identity.tripId,
    'journey-groups',
  ] as const;
  const query = useQuery({ queryKey: key, queryFn: () => loadGroups(identity), retry: false });
  const cache = useQueryClient();
  const [expanded, setExpanded] = useState<ExpandedJourneyOption>();
  const actions = useJourneyOperation(navigation);
  const groups =
    query.data?.filter(
      (entry) =>
        entry.currentJourneyId === identity.journeyId ||
        entry.alternativeJourneyIds.includes(identity.journeyId)
    ) ?? [];
  const update = (next: JourneyGroup): void => {
    cache.setQueryData<JourneyGroup[]>(key, (previous) => [
      ...(previous ?? []).filter((entry) => entry.id !== next.id),
      next,
    ]);
  };
  const selection = useJourneySelection({
    identity,
    navigation,
    query,
    actions,
    update,
    collapse: (): void => setExpanded(undefined),
  });
  return {
    ...selection,
    query,
    groups,
    expanded,
    setExpanded,
    busy: actions.busy,
    needsReload: actions.needsReload,
    failure: actions.failure,
    reload: (): void => {
      void actions.reload(async () => (await query.refetch()).isSuccess);
    },
    add: (group): Promise<void> =>
      actions.run(async () => {
        const stamp = navigation.stamp();
        const current = group ?? (await createGroup(identity));
        update(current);
        const result = await addAlternative(identity, current);
        update(result.group);
        if (navigation.isCurrent(stamp)) {
          setExpanded({ groupId: current.id, journeyId: result.journey.id });
          selection.clearUndo();
        }
      }),
  };
}
