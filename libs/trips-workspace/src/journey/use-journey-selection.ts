import { useState } from 'react';

import { selectJourney } from './api';

import type { UseQueryResult } from '@tanstack/react-query';

import type { JourneyGroup, JourneyWorkspaceProps } from './types';
import type { JourneyNavigation } from './use-journey-navigation';
import type { JourneyOperation } from './use-journey-operation';

/** Own inverse identity and exact post-write revision, scoped to this workspace instance. */
export interface JourneySelectionUndo {
  groupId: number;
  previousSelection: number;
  originalViewed: number;
  postWriteRevision: number;
  contextVersion: number;
}
/** Explicit revisioned selection operations without reinterpreting a literal source route. */
export interface JourneySelection {
  undo: JourneySelectionUndo | undefined;
  canUndo: boolean;
  select: (group: JourneyGroup, id: number) => Promise<void>;
  undoSelection: () => Promise<void>;
  clearUndo: () => void;
}
/** Preserve selection history above source editors; unrelated owner revisions are never adopted for Undo. */
export function useJourneySelection({
  identity,
  navigation,
  query,
  actions,
  update,
  collapse,
}: {
  identity: JourneyWorkspaceProps;
  navigation: JourneyNavigation;
  query: UseQueryResult<JourneyGroup[], Error>;
  actions: JourneyOperation;
  update: (group: JourneyGroup) => void;
  collapse: () => void;
}): JourneySelection {
  const [storedUndo, setUndo] = useState<JourneySelectionUndo>();
  const undo = storedUndo?.contextVersion === navigation.contextVersion ? storedUndo : undefined;
  const ownGroup = query.data?.find((group) => group.id === undo?.groupId);
  return {
    undo,
    canUndo:
      undo !== undefined &&
      !query.isError &&
      ownGroup?.revision === undo.postWriteRevision &&
      !(actions.busy || actions.needsReload),
    clearUndo: (): void => setUndo(undefined),
    select: (group, id): Promise<void> => {
      const stamp = navigation.stamp();
      return actions.run(async () => {
        const next = await selectJourney(identity, group, id);
        update(next);
        if (!navigation.isCurrent(stamp)) return;
        setUndo({
          groupId: group.id,
          previousSelection: group.currentJourneyId,
          originalViewed: navigation.viewed,
          postWriteRevision: next.revision,
          contextVersion: navigation.contextVersion,
        });
        collapse();
        navigation.replace(id);
      });
    },
    undoSelection: (): Promise<void> =>
      actions.run(async () => {
        if (!undo) return;
        const stamp = navigation.stamp();
        const next = await selectJourney(
          identity,
          { id: undo.groupId, revision: undo.postWriteRevision },
          undo.previousSelection
        );
        update(next);
        if (!navigation.isCurrent(stamp)) return;
        setUndo(undefined);
        collapse();
        navigation.replace(undo.originalViewed);
      }),
  };
}
