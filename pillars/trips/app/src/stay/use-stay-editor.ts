import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { patchStay, stayListQueryKey, stayQueryKey } from './api';
import { staySource } from './model';
import { useStaySource } from './use-stay-source';

import type { QueryClient } from '@tanstack/react-query';

import type { Stay, StayPatch, StayWorkspaceProps } from './types';

/** Persist direct edits serially, retaining failed drafts and successful source snapshots for undo. */
export function useStayEditor(initial: Stay, props: StayWorkspaceProps) {
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
  } = useStaySource(initial);
  const cache = useQueryClient();
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
      refreshStayCache(cache, props, result);
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
    undo: () => previous && commit(staySource(previous), true),
    retry: () => failure && commit(failure.patch, failure.undo),
  };
}

function refreshStayCache(cache: QueryClient, props: StayWorkspaceProps, result: Stay) {
  cache.setQueryData(stayQueryKey(props), result);
  cache.setQueryData<Stay[]>(stayListQueryKey(props), (previous) =>
    previous?.map((stay) => (stay.id === result.id ? result : stay))
  );
  void cache.invalidateQueries({ queryKey: stayListQueryKey(props) });
}
