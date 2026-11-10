import { canRetryJourneyChange, draftJourney } from './model';
import { useJourneyRunner } from './use-journey-runner';
import { useJourneyState } from './use-journey-state';

import type { JourneySource, JourneyChange, JourneyWorkspaceProps } from './types';
import type { JourneyFailure } from './use-journey-state';

/** Serialize explicit writes and inverse operations; failures preserve drafts and exact retry intent. */
export function useJourneyEditor(
  initial: JourneySource,
  props: JourneyWorkspaceProps
): JourneyEditor {
  const state = useJourneyState(initial);
  const edit = (change: JourneyChange): void =>
    state.setDraft((value) => draftJourney(value, change));
  const run = useJourneyRunner(props, state, edit);
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
} /** Source editor operations consumed by presentational journey sections. */
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
