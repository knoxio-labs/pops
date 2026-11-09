import { useState } from 'react';

import { staySource } from './model';

import type { Dispatch, SetStateAction } from 'react';

import type { Stay, StayPatch } from './types';

/** Failed explicit source action, retained for correction or exact retry. */
export interface FailedStayChange {
  patch: StayPatch;
  undo: boolean;
  error: unknown;
}

/** Fresh source reads reset an untouched editor's history; pending drafts survive background reads. */
export function useStaySource(initial: Stay): StaySourceState {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [history, setHistory] = useState<Stay[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FailedStayChange>();
  const [observed, setObserved] = useState(initial);
  const dirty = JSON.stringify(staySource(draft)) !== JSON.stringify(staySource(saved));
  if (observed !== initial && !busy && !failure && !dirty) {
    setObserved(initial);
    if (JSON.stringify(initial) !== JSON.stringify(saved)) {
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
export interface StaySourceState {
  saved: Stay;
  setSaved: Dispatch<SetStateAction<Stay>>;
  draft: Stay;
  setDraft: Dispatch<SetStateAction<Stay>>;
  history: Stay[];
  setHistory: Dispatch<SetStateAction<Stay[]>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  failure: FailedStayChange | undefined;
  setFailure: Dispatch<SetStateAction<FailedStayChange | undefined>>;
  dirty: boolean;
}
