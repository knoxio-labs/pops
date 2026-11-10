import { RetainedSessionStore } from '../shared/retained-session-store';
import { useRetainedSession } from '../shared/use-retained-session';
import { useSessionView } from '../shared/use-session-view';
import { canRetryJourneyChange, draftJourney } from './model';
import { useJourneyRunner } from './use-journey-runner';
import { JourneyEditSession, useJourneyState } from './use-journey-state';

import type { JourneySource, JourneyChange, JourneyWorkspaceProps } from './types';
import type { JourneyFailure } from './use-journey-state';

const sessions = new RetainedSessionStore<JourneyEditSession>();

/** Serialize explicit writes and inverse operations; view closure retains drafts and exact retry intent. */
export function useJourneyEditor(
  initial: JourneySource,
  props: JourneyWorkspaceProps
): JourneyEditor {
  const { owner, session } = useRetainedSession(
    sessions,
    { ...props, kind: 'journey', sourceId: props.journeyId },
    () => new JourneyEditSession(initial)
  );
  const view = useSessionView(owner);
  const state = useJourneyState(initial, session, owner);
  const run = useJourneyRunner(session, view);
  return {
    draft: state.draft,
    busy: state.busy,
    failure: state.failure,
    dirty: state.dirty,
    edit: (change): void => {
      if (!view.isActive() || session.getState().busy) return;
      view.assertCurrent();
      session.update({ draft: draftJourney(session.getState().draft, change) });
    },
    run,
    canUndo: state.history.length > 0 && !state.busy && !state.failure && !state.dirty,
    undo: (): void => {
      const current = session.getState();
      const change = current.history.at(-1);
      if (change && !current.failure && !current.dirty) void run(change, true);
    },
    retry: (): void => {
      const { failure } = session.getState();
      if (failure && canRetryJourneyChange(failure.change)) void run(failure.change, failure.undo);
    },
    discard: (): void => {
      if (!view.isActive() || session.getState().busy) return;
      view.assertCurrent();
      session.discard();
    },
  };
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
