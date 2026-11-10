import { useLayoutEffect, useRef } from 'react';

import { selectJourney } from './api';

import type { UseQueryResult } from '@tanstack/react-query';

import type { JourneyGroup } from './types';
import type { JourneyNavigation } from './use-journey-navigation';
import type { JourneyOperation } from './use-journey-operation';

/** Own inverse identity and exact post-write revision, retained for the original trip grouping owner. */
export interface JourneySelectionUndo {
  groupId: number;
  previousSelection: number;
  originalViewed: number;
  postWriteRevision: number;
}
/** Explicit revisioned selection operations without reinterpreting a literal source route. */
export interface JourneySelection {
  undo: JourneySelectionUndo | undefined;
  canUndo: boolean;
  select: (group: JourneyGroup, id: number) => Promise<void>;
  undoSelection: () => Promise<void>;
  clearUndo: () => void;
}
/** Preserve confirmed grouping history through closure; unrelated owner revisions never lend Undo a guard. */
export function useJourneySelection({
  navigation,
  query,
  actions,
  update,
  collapse,
}: {
  navigation: JourneyNavigation;
  query: UseQueryResult<JourneyGroup[], Error>;
  actions: JourneyOperation;
  update: (group: JourneyGroup) => void;
  collapse: () => void;
}): JourneySelection {
  const context = useSelectionContext(navigation.contextVersion, actions);
  const undo = actions.selectionUndo;
  const canUndo = canUndoSelection(actions, query, undo);
  const { owner } = actions;
  const identity = { client: owner.client, tripId: owner.tripId, journeyId: navigation.viewed };
  return {
    undo,
    canUndo,
    clearUndo: (): void => actions.setSelectionUndo(undefined),
    select: (group, id): Promise<void> => {
      const stamp = navigation.stamp();
      return actions.run(async () => {
        actions.assertCurrent();
        const next = await selectJourney(identity, group, id);
        update(next);
        if (context.current === navigation.contextVersion)
          actions.setSelectionUndo({
            groupId: group.id,
            previousSelection: group.currentJourneyId,
            originalViewed: navigation.viewed,
            postWriteRevision: next.revision,
          });
        if (!navigation.isCurrent(stamp)) return;
        collapse();
        navigation.replace(id);
      });
    },
    undoSelection: (): Promise<void> => {
      if (!canUndo) return Promise.resolve();
      return actions.run(async () => {
        if (!undo) return;
        const stamp = navigation.stamp();
        actions.assertCurrent();
        const next = await selectJourney(
          identity,
          { id: undo.groupId, revision: undo.postWriteRevision },
          undo.previousSelection
        );
        update(next);
        actions.setSelectionUndo(undefined);
        if (!navigation.isCurrent(stamp)) return;
        collapse();
        navigation.replace(undo.originalViewed);
      });
    },
  };
}

function useSelectionContext(version: number, actions: JourneyOperation): { current: number } {
  const context = useRef(version);
  useLayoutEffect(() => {
    if (context.current !== version) {
      context.current = version;
      actions.setSelectionUndo(undefined);
    }
  }, [actions, version]);
  return context;
}

function canUndoSelection(
  actions: JourneyOperation,
  query: UseQueryResult<JourneyGroup[], Error>,
  undo: JourneySelectionUndo | undefined
): boolean {
  const group = query.data?.find((entry) => entry.id === undo?.groupId);
  return (
    undo !== undefined &&
    !query.isError &&
    group?.revision === undo.postWriteRevision &&
    !(actions.busy || actions.needsReload)
  );
}
