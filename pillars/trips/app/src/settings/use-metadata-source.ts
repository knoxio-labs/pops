import { useState } from 'react';

import { tripDraft } from './model';

import type { Trip } from '../api/types';

/** A failed save/Undo keeps the previous successful source and the user's current editable draft. */
export interface MetadataFailure {
  error: unknown;
  undo?: Trip;
}
/** Reset untouched metadata on fresh canonical reads while retaining pending edits and failures. */
export function useMetadataSource(initial: Trip) {
  const [saved, setSaved] = useState(initial);
  const [observed, setObserved] = useState(initial);
  const [draft, setDraft] = useState(() => tripDraft(initial));
  const [history, setHistory] = useState<Trip[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MetadataFailure>();
  const dirty = JSON.stringify(draft) !== JSON.stringify(tripDraft(saved));
  if (observed !== initial && !busy && !failure && !dirty) {
    setObserved(initial);
    if (JSON.stringify(initial) !== JSON.stringify(saved)) {
      setSaved(initial);
      setDraft(tripDraft(initial));
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
