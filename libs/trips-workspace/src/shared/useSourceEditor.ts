import { useState } from 'react';

import { refreshSource, sameSourceValue } from './source-refresh';
import { useSourceActions } from './use-source-actions';

import type {
  FailedSourceChange,
  SourceEditor,
  SourceEditorOptions,
  SourceState,
} from './source-editor-types';

export type {
  FailedSourceChange,
  SourceEditor,
  SourceEditorOptions,
  SourceState,
} from './source-editor-types';

/** Canonical reads refresh untouched fields, preserve pending fields and invalidate stale inverse history. */
export function useSourceState<Source extends object, Patch extends Partial<Source>>(
  initial: Source,
  source: (value: Source) => Patch
): SourceState<Source, Patch> {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [history, setHistory] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FailedSourceChange<Patch>>();
  const [observed, setObserved] = useState(initial);
  const [conflicts, setConflicts] = useState<(keyof Patch)[]>([]);
  const dirty = !sameSourceValue(source(draft), source(saved));
  if (observed !== initial && !busy) {
    setObserved(initial);
    if (!sameSourceValue(initial, saved)) {
      const refreshed = refreshSource({ saved, draft, initial, failed: failure?.patch }, source);
      setSaved(initial);
      setDraft(refreshed.draft);
      setHistory([]);
      setConflicts([...new Set([...conflicts, ...refreshed.conflicts])]);
    }
  }
  return {
    saved,
    setSaved,
    draft,
    setDraft,
    history,
    setHistory,
    busy,
    setBusy,
    failure,
    setFailure,
    dirty,
    conflict: conflicts.length > 0,
    conflicts,
    setConflicts,
    acknowledgeRead: setObserved,
  };
}

/** Persist direct edits serially, retaining failed drafts and successful source snapshots for undo. */
export function useSourceEditor<Source extends object, Patch extends Partial<Source>>(
  initial: Source,
  options: SourceEditorOptions<Source, Patch>
): SourceEditor<Source, Patch> {
  const state = useSourceState(initial, options.source);
  const actions = useSourceActions(state, options, initial);
  return {
    draft: state.draft,
    dirty: state.dirty,
    saved: state.saved,
    busy: state.busy,
    failure: state.failure,
    conflict: state.conflict,
    canUndo:
      state.history.length > 0 && !state.busy && !state.failure && !state.conflict && !state.dirty,
    ...actions,
  };
}
