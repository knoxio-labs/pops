import { useState } from 'react';

import { sameJourney } from './model';

import type { Dispatch, SetStateAction } from 'react';

import type { JourneyChange, JourneySource } from './types';

/** Failed explicit operation retained without replacing its source draft. */
export interface JourneyFailure {
  error: unknown;
  change: JourneyChange;
  undo: boolean;
}
/** Canonical/draft state with serial source history and explicitly retained failure. */
export interface JourneyState {
  saved: JourneySource;
  setSaved: Dispatch<SetStateAction<JourneySource>>;
  draft: JourneySource;
  setDraft: Dispatch<SetStateAction<JourneySource>>;
  history: JourneyChange[];
  setHistory: Dispatch<SetStateAction<JourneyChange[]>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  failure: JourneyFailure | undefined;
  setFailure: Dispatch<SetStateAction<JourneyFailure | undefined>>;
  dirty: boolean;
}
/** Adopt fresh source reads only while no pending, failed or unsaved editor action exists. */
export function useJourneyState(initial: JourneySource): JourneyState {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [observed, setObserved] = useState(initial);
  const [history, setHistory] = useState<JourneyChange[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<JourneyFailure>();
  const dirty = !sameJourney(saved, draft);
  if (observed !== initial && !busy && !failure && !dirty) {
    setObserved(initial);
    if (saved.legRevision !== initial.legRevision || !sameJourney(saved, initial)) {
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
