import { ApiError } from '@pops/pillar-sdk/client';

import { changeJourney } from './api';
import { prepareJourneyChange, legConflict } from './leg-command';
import { nextJourneyHistory } from './leg-history';
import { canRetryJourneyChange, draftJourney, sameJourney } from './model';

import type { SourceSessionView } from '../shared/retained-session-store';
import type { JourneyChange, JourneySource } from './types';
import type { JourneyEditSession, JourneyState } from './use-journey-state';

/** Serialize source writes on the retained session, preserving exact prepared identities on failure. */
export function useJourneyRunner(
  session: JourneyEditSession,
  view: SourceSessionView
): (change: JourneyChange, undo?: boolean) => Promise<void> {
  const { owner } = view;
  const identity = { client: owner.client, tripId: owner.tripId, journeyId: owner.sourceId };
  const key = ['trips', owner.origin, owner.tripId, 'journey', owner.sourceId] as const;
  return async (change, undo = false): Promise<void> => {
    const state = session.getState();
    if (!view.isActive() || blocksJourneyWrite(state)) return;
    if (
      (change.kind === 'leg' || change.kind === 'journey') &&
      sameJourney(state.saved, draftJourney(state.saved, change))
    )
      return;
    let command = change;
    try {
      view.assertCurrent();
      const prepared = prepareJourneyChange(state.saved, change);
      command = prepared;
      session.update({ busy: true, failure: undefined, draft: draftJourney(state.draft, change) });
      view.assertCurrent();
      const result = await changeJourney(identity, state.saved, prepared);
      session.confirm(result.source);
      session.update({
        saved: result.source,
        draft: result.source,
        history: result.clearHistory
          ? []
          : nextJourneyHistory(session.getState().history, result, prepared, undo),
        failure: result.clearHistory
          ? {
              error: new ApiError({
                code: 'trips.journey_leg.operation_superseded',
                kind: 'client',
                message:
                  'This removal lifecycle changed. The current source is loaded; review it before editing again.',
                retryable: false,
              }),
              change: command,
              undo,
            }
          : undefined,
      });
      refreshCache(view, key, result.source);
    } catch (error) {
      session.update({
        failure: { error, change: command, undo },
        ...(legConflict(error) ? { history: [] } : {}),
      });
    } finally {
      session.update({ busy: false });
    }
  };
}

function refreshCache(
  view: SourceSessionView,
  key: readonly unknown[],
  source: JourneySource
): void {
  const { owner } = view;
  owner.scope.setQueryData(key, source);
  void owner.scope.invalidateQueries({ queryKey: [...key, 'timing'] });
  void owner.scope.invalidateQueries({
    queryKey: ['trips', owner.origin, owner.tripId, 'journeys'],
  });
}

function blocksJourneyWrite(state: JourneyState): boolean {
  return (
    state.busy || (state.failure !== undefined && !canRetryJourneyChange(state.failure.change))
  );
}
