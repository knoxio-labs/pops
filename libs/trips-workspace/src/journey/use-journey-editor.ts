import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { changeJourney, journeyKey } from './api';
import { canRetryJourneyChange, draftJourney, sameJourney } from './model';
import { useJourneyState } from './use-journey-state';

import type { QueryClient } from '@tanstack/react-query';

import type { JourneySource, JourneyChange, JourneyWorkspaceProps } from './types';
import type { JourneyFailure } from './use-journey-state';

/** Serialize explicit writes and inverse operations; failures preserve drafts and exact retry intent. */
export function useJourneyEditor(
  initial: JourneySource,
  props: JourneyWorkspaceProps
): JourneyEditor {
  const state = useJourneyState(initial);
  const lock = useRef(false);
  const cache = useQueryClient();
  const edit = (change: JourneyChange): void =>
    state.setDraft((value) => draftJourney(value, change));
  const run = async (change: JourneyChange, undo = false): Promise<void> => {
    if (lock.current) return;
    if (
      (change.kind === 'leg' || change.kind === 'journey') &&
      sameJourney(state.saved, draftJourney(state.saved, change))
    )
      return;
    lock.current = true;
    state.setBusy(true);
    state.setFailure(undefined);
    edit(change);
    try {
      const result = await changeJourney(props, state.saved, change);
      state.setSaved(result.source);
      state.setDraft(result.source);
      state.setHistory((previous) => nextHistory(previous, result.inverse, undo));
      refreshCache(cache, props, result.source);
    } catch (error) {
      state.setFailure({ error, change, undo });
    } finally {
      lock.current = false;
      state.setBusy(false);
    }
  };
  return {
    draft: state.draft,
    busy: state.busy,
    failure: state.failure,
    dirty: state.dirty,
    edit,
    run,
    canUndo: state.history.length > 0 && !state.busy && !state.failure && !state.dirty,
    undo: (): void => {
      const change = state.history.at(-1);
      if (change) void run(change, true);
    },
    retry: (): void => {
      if (state.failure && canRetryJourneyChange(state.failure.change))
        void run(state.failure.change, state.failure.undo);
    },
    discard: (): void => {
      state.setDraft(state.saved);
      state.setFailure(undefined);
    },
  };
}
function nextHistory(
  history: JourneyChange[],
  inverse: JourneyChange | undefined,
  undo: boolean
): JourneyChange[] {
  if (undo) return history.slice(0, -1);
  return inverse ? [...history, inverse] : history;
}
function refreshCache(
  cache: QueryClient,
  props: JourneyWorkspaceProps,
  source: JourneySource
): void {
  cache.setQueryData(journeyKey(props), source);
  void cache.invalidateQueries({ queryKey: [...journeyKey(props), 'timing'] });
  void cache.invalidateQueries({
    queryKey: [
      'trips',
      props.client?.getConfig().baseUrl ?? '/trips-api',
      props.tripId,
      'journeys',
    ],
  });
}
/** Source editor operations consumed by presentational journey sections. */
export interface JourneyEditor {
  draft: JourneySource;
  busy: boolean;
  failure: JourneyFailure | undefined;
  dirty: boolean;
  edit: (change: JourneyChange) => void;
  run: (change: JourneyChange, undo?: boolean) => Promise<void>;
  canUndo: boolean;
  undo: () => void;
  retry: () => void;
  discard: () => void;
}
