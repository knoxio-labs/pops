import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

import { SourceEditSession } from './source-edit-session';

import type {
  SourceEditor,
  SourceEditorOptions,
  SourceEditorView,
  SourceState,
} from './source-editor-types';

export type {
  FailedSourceChange,
  SourceEditor,
  SourceEditorOptions,
  SourceState,
} from './source-editor-types';

/** Canonical reads refresh untouched fields while preserving pending drafts and invalidating stale inverses. */
export function useSourceState<Source extends object, Patch extends Partial<Source>>(
  initial: Source,
  source: (value: Source) => Patch
): SourceState<Source, Patch> {
  const [session] = useState(
    () =>
      new SourceEditSession(initial, {
        source,
        save: () => Promise.reject(new Error('Source state has no persistence binding.')),
        onSaved: () => {},
      })
  );
  return useSourceSession(initial, session);
}

/** Subscribe a mounted view to an existing controller without taking ownership of its lifetime. */
export function useSourceSession<Source extends object, Patch extends Partial<Source>>(
  initial: Source,
  session: SourceEditSession<Source, Patch>,
  canReceive?: () => boolean
): SourceState<Source, Patch> {
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  useLayoutEffect(() => {
    if (canReceive === undefined || canReceive()) session.receive(initial);
  }, [initial, session, canReceive]);
  return state;
}

/** Persist direct edits serially; supplying a retained session preserves state across view remounts. */
export function useSourceEditor<Source extends object, Patch extends Partial<Source>>(
  initial: Source,
  options: SourceEditorOptions<Source, Patch>,
  retained?: SourceEditSession<Source, Patch>,
  view?: SourceEditorView
): SourceEditor<Source, Patch> {
  const [local] = useState(() => new SourceEditSession(initial, options));
  const session = retained ?? local;
  useLayoutEffect(() => {
    if (!retained) session.bind(options);
  });
  const state = useSourceSession(initial, session, view?.isCurrent);
  return {
    draft: state.draft,
    dirty: state.dirty,
    saved: state.saved,
    busy: state.busy,
    failure: state.failure,
    conflict: state.conflict,
    canUndo:
      state.history.length > 0 && !state.busy && !state.failure && !state.conflict && !state.dirty,
    ...session.actions(view === undefined ? undefined : () => view.assertCurrent()),
  };
}
