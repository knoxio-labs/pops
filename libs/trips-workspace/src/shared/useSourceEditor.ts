import { useRef, useState } from 'react';

import type { Dispatch, SetStateAction } from 'react';

/** Failed explicit source action, retained for correction or exact retry. */
export interface FailedSourceChange<Patch> {
  patch: Patch;
  undo: boolean;
  error: unknown;
}

/** Fresh source reads reset an untouched editor's history; pending drafts survive background reads. */
export function useSourceState<Source, Patch>(
  initial: Source,
  source: (value: Source) => Patch
): SourceState<Source, Patch> {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [history, setHistory] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FailedSourceChange<Patch>>();
  const [observed, setObserved] = useState(initial);
  const dirty = JSON.stringify(source(draft)) !== JSON.stringify(source(saved));
  if (observed !== initial) {
    setObserved(initial);
    if (!busy && !failure && !dirty && JSON.stringify(initial) !== JSON.stringify(saved)) {
      setSaved(initial);
      setDraft(initial);
      setHistory([]);
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
}

/** Source projection and persistence supplied by the owning domain; hosts remount at identity/origin boundaries. */
export interface SourceEditorOptions<Source, Patch> {
  source: (value: Source) => Patch;
  save: (patch: Patch) => Promise<Source>;
  onSaved: (value: Source) => void;
}

/** Persist direct edits serially, retaining failed drafts and successful source snapshots for undo. */
export function useSourceEditor<Source extends object, Patch extends Partial<Source>>(
  initial: Source,
  options: SourceEditorOptions<Source, Patch>
): SourceEditor<Source, Patch> {
  const {
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
  } = useSourceState(initial, options.source);
  const lock = useRef(false);

  const edit = (patch: Patch): void => setDraft((previous) => ({ ...previous, ...patch }));
  const commit = async (patch: Patch, undo = false): Promise<void> => {
    if (lock.current) return;
    const pending = failure ? { ...failure.patch, ...patch } : patch;
    const next = { ...saved, ...pending };
    if (JSON.stringify(options.source(next)) === JSON.stringify(options.source(saved))) {
      setDraft(saved);
      setFailure(undefined);
      return;
    }
    lock.current = true;
    setBusy(true);
    setFailure(undefined);
    edit(pending);
    try {
      const result = await options.save(pending);
      options.onSaved(result);
      setHistory((previous) => (undo ? previous.slice(0, -1) : [...previous, saved]));
      setSaved(result);
      setDraft(result);
    } catch (error) {
      setFailure({ patch: pending, undo, error });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const previous = history.at(-1);
  return {
    draft,
    dirty,
    saved,
    edit,
    commit,
    busy,
    failure,
    canUndo: previous !== undefined && !busy && failure === undefined,
    undo: (): Promise<void> | undefined => previous && commit(options.source(previous), true),
    retry: (): Promise<void> | undefined => failure && commit(failure.patch, failure.undo),
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
  canUndo: boolean;
  undo: () => Promise<void> | undefined;
  retry: () => Promise<void> | undefined;
}
