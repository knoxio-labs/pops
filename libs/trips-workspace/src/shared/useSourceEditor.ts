import { useState } from 'react';

import { refreshSource, sameSourceValue } from './source-refresh';
import { useSourceActions } from './use-source-actions';

import type { Dispatch, SetStateAction } from 'react';

/** Failed explicit source action, retained for correction or exact retry. */
export interface FailedSourceChange<Patch> {
  patch: Patch;
  undo: boolean;
  error: unknown;
}

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

/** Editable source state, retaining drafts while fresh canonical reads arrive. */
export interface SourceState<Source, Patch> {
  saved: Source;
  setSaved: Dispatch<SetStateAction<Source>>;
  draft: Source;
  setDraft: Dispatch<SetStateAction<Source>>;
  history: Source[];
  setHistory: Dispatch<SetStateAction<Source[]>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  failure: FailedSourceChange<Patch> | undefined;
  setFailure: Dispatch<SetStateAction<FailedSourceChange<Patch> | undefined>>;
  dirty: boolean;
  conflict: boolean;
  conflicts: (keyof Patch)[];
  setConflicts: Dispatch<SetStateAction<(keyof Patch)[]>>;
  acknowledgeRead: Dispatch<SetStateAction<Source>>;
}

/** Source projection and persistence supplied by the owning domain; hosts remount at identity/origin boundaries. */
export interface SourceEditorOptions<Source, Patch> {
  source: (value: Source) => Patch;
  /** Persist against the captured confirmed source, including inverse and retry operations. */
  save: (patch: Patch, saved: Source) => Promise<Source>;
  onSaved: (value: Source) => void;
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

/** Serialized source editor with retained failures and successful undo snapshots. */
export interface SourceEditor<Source, Patch> {
  draft: Source;
  dirty: boolean;
  saved: Source;
  edit: (patch: Patch) => void;
  commit: (patch: Patch, undo?: boolean) => Promise<void>;
  busy: boolean;
  failure: FailedSourceChange<Patch> | undefined;
  /** An observed canonical update overlapped a pending field; writes require an explicit reset. */
  conflict: boolean;
  /** Discard only conflicted draft fields against canonical values, retaining unrelated edits and retry baselines. */
  reset: () => void;
  canUndo: boolean;
  undo: () => Promise<void> | undefined;
  retry: () => Promise<void> | undefined;
}
