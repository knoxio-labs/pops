import { useRef, useState } from 'react';

import { patchStay } from './api';
import { staySource } from './model';

import type { Stay, StayPatch, StayWorkspaceProps } from './types';

interface FailedChange {
  patch: StayPatch;
  undo: boolean;
  error: unknown;
}

/** Persist direct edits serially, retaining failed drafts and successful source snapshots for undo. */
export function useStayEditor(initial: Stay, props: StayWorkspaceProps) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [history, setHistory] = useState<Stay[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FailedChange>();
  const lock = useRef(false);

  const edit = (patch: StayPatch) => setDraft((previous) => ({ ...previous, ...patch }));
  const commit = async (patch: StayPatch, undo = false) => {
    if (lock.current) return;
    const pending = failure ? { ...failure.patch, ...patch } : patch;
    const next = { ...saved, ...pending };
    if (JSON.stringify(staySource(next)) === JSON.stringify(staySource(saved))) {
      setDraft(saved);
      setFailure(undefined);
      return;
    }
    lock.current = true;
    setBusy(true);
    setFailure(undefined);
    edit(pending);
    try {
      const result = await patchStay(props, pending);
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
    dirty: JSON.stringify(staySource(draft)) !== JSON.stringify(staySource(saved)),
    saved,
    edit,
    commit,
    busy,
    failure,
    canUndo: previous !== undefined && !busy && failure === undefined,
    undo: () => previous && commit(staySource(previous), true),
    retry: () => failure && commit(failure.patch, failure.undo),
  };
}
