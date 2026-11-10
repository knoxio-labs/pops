import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { ApiError } from '@pops/pillar-sdk/client';

import { changeJourney, journeyKey } from './api';
import { prepareJourneyChange, legConflict } from './leg-command';
import { nextJourneyHistory } from './leg-history';
import { draftJourney, sameJourney } from './model';

import type { QueryClient } from '@tanstack/react-query';

import type { JourneyWorkspaceProps, JourneyChange, JourneySource } from './types';
import type { JourneyState } from './use-journey-state';

/** Serialize source writes while preserving the exact prepared operation identity and revision on failure. */
export function useJourneyRunner(
  props: JourneyWorkspaceProps,
  state: JourneyState,
  edit: (change: JourneyChange) => void
): (change: JourneyChange, undo?: boolean) => Promise<void> {
  const lock = useRef(false);
  const cache = useQueryClient();
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
    let command = change;
    try {
      const prepared = prepareJourneyChange(state.saved, change);
      command = prepared;
      const result = await changeJourney(props, state.saved, prepared);
      state.setSaved(result.source);
      state.setDraft(result.source);
      state.setHistory((previous) =>
        result.clearHistory ? [] : nextJourneyHistory(previous, result, prepared, undo)
      );
      if (result.clearHistory)
        state.setFailure({
          error: new ApiError({
            code: 'trips.journey_leg.operation_superseded',
            kind: 'client',
            message:
              'This removal lifecycle changed. The current source is loaded; review it before editing again.',
            retryable: false,
          }),
          change: command,
          undo,
        });
      refreshCache(cache, props, result.source);
    } catch (error) {
      if (legConflict(error)) state.setHistory([]);
      state.setFailure({ error, change: command, undo });
    } finally {
      lock.current = false;
      state.setBusy(false);
    }
  };
  return run;
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
