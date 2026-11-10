import { useRef, useState } from 'react';

import { patchRental } from './api';

import type { ArrangementsWorkspaceProps, Rental, RentalPatch } from './types';

type RentalFields = Omit<RentalPatch, 'expectedRevision'>;
/** Confirmed source, retained draft and exact retry intent for one canonical rental identity. */
export interface RentalEditorState {
  confirmed: Rental;
  draft: RentalFields;
  setDraft: (draft: RentalFields) => void;
  failure: { error: unknown; body: RentalPatch } | undefined;
  inverse: RentalFields | undefined;
  busy: boolean;
  dirty: boolean;
  changed: boolean;
  run: (body: RentalPatch) => Promise<void>;
  discard: (source: Rental) => void;
}
function fields(source: Rental): RentalFields {
  const { provider, pickupVisitId, returnVisitId, start, end, status } = source;
  return { provider, pickupVisitId, returnVisitId, start, end, status };
}
/** Guard exact rental writes; a background read cannot silently rebase a pending or failed draft. */
export function useRentalEditor(
  identity: ArrangementsWorkspaceProps,
  source: Rental,
  saved: (rental: Rental) => void
): RentalEditorState {
  const [confirmed, setConfirmed] = useState(source);
  const [draft, setDraft] = useState(fields(source));
  const [failure, setFailure] = useState<{ error: unknown; body: RentalPatch }>();
  const [inverse, setInverse] = useState<Omit<RentalPatch, 'expectedRevision'>>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(fields(confirmed));
  const changed = source.revision !== confirmed.revision;
  async function run(body: RentalPatch): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await patchRental(identity, source.id, body);
      setInverse(fields(confirmed));
      setConfirmed(result);
      setDraft(fields(result));
      setFailure(undefined);
      saved(result);
    } catch (error) {
      setFailure({ error, body });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return {
    confirmed,
    draft,
    setDraft,
    failure,
    inverse,
    busy,
    dirty,
    changed,
    run,
    discard: (current): void => {
      setConfirmed(current);
      setDraft(fields(current));
      setInverse(undefined);
      setFailure(undefined);
    },
  };
}
