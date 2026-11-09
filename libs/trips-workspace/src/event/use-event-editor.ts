import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { eventQueryKey, patchEvent } from './api';
import { eventSource } from './model';

import type { EventPatch, EventWorkspaceProps, TripEvent } from './types';

interface Failure {
  patch: EventPatch;
  undo: boolean;
  error: unknown;
}
interface SourceState {
  saved: TripEvent;
  draft: TripEvent;
  history: TripEvent[];
  failure?: Failure;
}

/** Serial direct edits retain failed drafts; Undo sends the last successful source snapshot to the server. */
export function useEventEditor(initial: TripEvent, props: EventWorkspaceProps): EventEditor {
  const [state, setState] = useState<SourceState>({ saved: initial, draft: initial, history: [] });
  const [observed, setObserved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const cache = useQueryClient();
  const dirty =
    JSON.stringify(eventSource(state.draft)) !== JSON.stringify(eventSource(state.saved));
  if (initial !== observed && !busy && !state.failure && !dirty) {
    setObserved(initial);
    if (JSON.stringify(initial) !== JSON.stringify(state.saved))
      setState({ saved: initial, draft: initial, history: [] });
  }
  const edit = (patch: EventPatch): void =>
    setState((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  const commit = async (patch: EventPatch, undo = false): Promise<void> => {
    if (lock.current) return;
    const pending = { ...state.failure?.patch, ...patch };
    const next = { ...state.saved, ...pending };
    if (JSON.stringify(eventSource(next)) === JSON.stringify(eventSource(state.saved))) {
      setState((current) => ({ ...current, draft: current.saved, failure: undefined }));
      return;
    }
    lock.current = true;
    setBusy(true);
    edit(pending);
    try {
      const result = await patchEvent(props, pending);
      setState((current) => ({
        saved: result,
        draft: result,
        history: undo ? current.history.slice(0, -1) : [...current.history, current.saved],
      }));
      cache.setQueryData(eventQueryKey(props), result);
      void cache.invalidateQueries({ queryKey: eventQueryKey(props).slice(0, 3).concat('events') });
    } catch (error) {
      setState((current) => ({ ...current, failure: { patch: pending, undo, error } }));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const previous = state.history.at(-1);
  return {
    ...state,
    busy,
    dirty,
    edit,
    commit,
    canUndo: previous !== undefined && !busy && !state.failure,
    undo: (): Promise<void> | undefined => previous && commit(eventSource(previous), true),
    retry: (): Promise<void> | undefined =>
      state.failure && commit(state.failure.patch, state.failure.undo),
  };
}

/** Source editor with serial writes, retained failure drafts and persisted Undo. */
export interface EventEditor extends SourceState {
  busy: boolean;
  dirty: boolean;
  canUndo: boolean;
  edit: (patch: EventPatch) => void;
  commit: (patch: EventPatch, undo?: boolean) => Promise<void>;
  undo: () => Promise<void> | undefined;
  retry: () => Promise<void> | undefined;
}
