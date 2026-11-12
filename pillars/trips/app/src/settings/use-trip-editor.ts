import { isSourceOwnerCurrent, sourceOwnerProblem } from '@pops/trips-workspace';

import { tripDraft } from './model';
import { useMetadataSource } from './use-metadata-source';

import type { ApiClients, Trip } from '../api/types';
import type { TripDraft } from './model';

/** The existing metadata editor API backed by one retained, serialized save/Undo session. */
export function useTripEditor(initial: Trip, clients: ApiClients) {
  const { owner, view, session, state } = useMetadataSource(initial, clients);
  const dirty = JSON.stringify(state.draft) !== JSON.stringify(tripDraft(state.saved));
  const failure = isSourceOwnerCurrent(owner) ? state.failure : { error: sourceOwnerProblem() };
  const run = (action: () => Promise<void>): Promise<void> =>
    view.isCurrent() ? action() : Promise.resolve();
  return {
    draft: state.draft,
    previous: tripDraft(state.saved),
    dirty,
    busy: state.busy,
    failure,
    canUndo: state.history.length > 0 && !dirty && !state.busy && !failure,
    change: (next: TripDraft): void => {
      if (view.isCurrent()) session.change(next);
    },
    save: (): Promise<void> => run(session.save),
    undo: (): Promise<void> => run(session.undo),
    discard: (): void => {
      if (view.isCurrent()) session.discard();
    },
    retry: (): Promise<void> => run(session.retry),
  };
}
